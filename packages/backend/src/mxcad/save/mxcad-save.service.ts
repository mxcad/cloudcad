import {
  Inject,
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemNodeService } from '../node/filesystem-node.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import {
  IVersionControl,
  VERSION_CONTROL_TOKEN,
} from '../../version-control/interfaces/version-control.interface';
import { DatabaseService } from '../../database/database.service';
import { NodeType } from '@cloudcad/db';
import { MXCAD_CONVERSION_SERVICE } from '../interfaces/mxcad-service-tokens';
import { IMxcadConversionService } from '../interfaces/mxcad-conversion.interface';
import { IMxcadSaveService } from '../interfaces/mxcad-save.interface';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';
import { AppConfig } from '../../config/app.config';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';
import { I18nContext } from 'nestjs-i18n';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { NodeSizeResolverService } from '../../file-system/storage-quota/node-size-resolver.service';

@Injectable()
export class MxcadSaveService implements IMxcadSaveService {
  private readonly logger = new Logger(MxcadSaveService.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly storageManager: StorageManager,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    private readonly prisma: DatabaseService,
    @Inject(MXCAD_CONVERSION_SERVICE)
    private readonly mxcadConversionService: IMxcadConversionService,
    private readonly nodeMutationGuard: NodeMutationGuard,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly nodeSizeResolver: NodeSizeResolverService
  ) {
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', {
      infer: true,
    });
  }

  async saveMxwebFile(
    nodeId: string,
    file: Express.Multer.File,
    userId?: string,
    userName?: string,
    commitMessage?: string,
    skipBinGeneration = false,
    expectedTimestamp?: string,
    keepSourceFile = false
  ): Promise<{ success: boolean; message: string; path?: string }> {
    // 保存频率占位标记（函数级声明以便 catch 回补访问）：占位成功置 true，保存失败回补额度
    let saveReserved = false;
    try {
      this.logger.log(
        `[saveMxwebFile] 开始保存: nodeId=${nodeId}, file=${file?.originalname}`
      );

      // 游客不支持保存/转 bin：即使绕过控制器守卫漏入，服务层显式兜底拒绝。
      if (!userId) {
        this.logger.warn(`[saveMxwebFile] 游客保存被拒绝: nodeId=${nodeId}`);
        throw new UnauthorizedException(
          I18nContext.current()?.t('error.auth_extra.user_not_logged_in') ??
            '用户未登录',
        );
      }

      if (!file || !file.path) {
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.file.missing_file') ?? '缺少文件',
        };
      }

      const node = await this.fileSystemNodeService.findById(nodeId);

      if (!node) {
        this.logger.error(`[saveMxwebFile] 节点不存在: nodeId=${nodeId}`);
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.node.not_found') ?? '节点不存在',
        };
      }

      const fullNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: {
          nodeType: true,
          name: true,
          path: true,
          updatedAt: true,
          size: true,
        },
      });

      if (!fullNode) {
        this.logger.error(`[saveMxwebFile] 节点不存在: nodeId=${nodeId}`);
        return {
          success: false,
          message:
            I18nContext.current()?.t('error.node.not_found') ?? '节点不存在',
        };
      }

      if (userId && file?.size) {
        // 覆盖保存时 DB 聚合已含旧节点 size，仅按增量计费，避免重复累加提前触顶
        // 当 fullNode.size 为 null 时，读取实际文件大小作为旧值，防止 null 被当作 0
        const oldSize = fullNode.size ?? await this.nodeSizeResolver.resolveFileSize(
          { size: fullNode.size, path: fullNode.path },
          nodeId
        );
        const incrementBytes = Math.max(0, file.size - oldSize);
        await this.nodeMutationGuard.assertByteQuota(
          { node: { id: nodeId }, incrementBytes },
          userId
        );
      }

      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.mxweb') {
        return {
          success: false,
          message:
            I18nContext.current()?.t(
              'error.mxcad_extra.format_unsupported_mxweb',
              { args: { ext } }
            ) ?? `不支持的文件格式: ${ext}，仅支持 .mxweb 文件`,
        };
      }

      // 转 bin（覆盖保存）频率限制：所有用户（VIP0 与 VIP）统一限频，
      // 次数配额独立（quota.save_window_count），窗口小时数复用转换窗口。
      // 放在基础校验（文件/节点/格式）之后、写文件之前：仅真正执行保存时占位，
      // 超限直接拒绝（QuotaExceededException），不落任何文件。
      await this.restrictionEngine.reserveSaveCountOrThrow(userId);
      // 占位成功即标记，后续保存失败（乐观锁冲突/转 bin/版本控制异常）时回补额度，
      // 避免失败任务耗尽窗口次数；游客拒绝/超限本身不占位，无需回补。
      saveReserved = true;

      if (expectedTimestamp && fullNode.updatedAt) {
        const expectedTime = new Date(expectedTimestamp).getTime();
        const actualTime = fullNode.updatedAt.getTime();
        if (expectedTime !== actualTime) {
          this.logger.warn(
            `[saveMxwebFile] 乐观锁冲突: nodeId=${nodeId}, expected=${expectedTimestamp}, actual=${fullNode.updatedAt.toISOString()}`
          );
          throw new ConflictException(
            I18nContext.current()?.t('error.file.already_modified') ??
              '文件已被他人修改，请刷新后重试'
          );
        }
      }

      const nodeFullPath = this.storageManager.getFullPath(node.path);
      const nodeDir = path.dirname(nodeFullPath);

      if (!fs.existsSync(nodeDir)) {
        await fsPromises.mkdir(nodeDir, { recursive: true });
        this.logger.log(`[saveMxwebFile] 创建目录: ${nodeDir}`);
      }

      const targetPath = nodeFullPath;

      const mxwebBaseName = path.basename(targetPath);
      const initialMxwebName = mxwebBaseName.replace(
        /\.mxweb$/,
        '_initial.mxweb'
      );
      const initialMxwebPath = path.join(nodeDir, initialMxwebName);

      if (fs.existsSync(targetPath) && !fs.existsSync(initialMxwebPath)) {
        this.logger.log(
          `[saveMxwebFile] 备份初始版本: ${targetPath} -> ${initialMxwebPath}`
        );
        await fsPromises.copyFile(targetPath, initialMxwebPath);
      }

      await fsPromises.copyFile(file.path, targetPath);
      this.logger.log(
        `[saveMxwebFile] 文件保存成功: ${file.path} -> ${targetPath}`
      );

      await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: { updatedAt: new Date(), size: file.size },
      });
      this.logger.log(`[saveMxwebFile] 更新节点时间戳: ${nodeId}`);

      if (!skipBinGeneration) {
        await this.mxcadConversionService.generateBinFiles(
          targetPath,
          node.name
        );
      } else {
        this.logger.log(`[saveMxwebFile] 跳过生成 bin 文件: ${node.name}`);
      }

      if (
        fullNode.nodeType !== NodeType.LIBRARY_DRAWING &&
        fullNode.nodeType !== NodeType.LIBRARY_BLOCK
      ) {
        const nodeDirectory = path.dirname(targetPath);
        const message = commitMessage
          ? `Save: ${node.name} - ${commitMessage}`
          : `Save: ${node.name}`;

        this.logger.log(
          `[saveMxwebFile] 提交到 MX: ${nodeDirectory}, 消息: ${message}`
        );

        const isFirstCommit =
          await this.versionControlService.isFirstCommit(nodeDirectory);
        this.logger.log(
          `[saveMxwebFile] 目录 ${nodeDirectory} 首次提交: ${isFirstCommit}`
        );

        const commitResult =
          await this.versionControlService.commitNodeDirectory(
            nodeDirectory,
            message,
            userId,
            userName
          );
        if (commitResult.success) {
          this.logger.log(
            `${isFirstCommit ? '首次' : '后续'}提交成功: ${node.name}`
          );
        } else {
          this.logger.warn(
            `${isFirstCommit ? '首次' : '后续'}提交失败: ${node.name}, 原因: ${commitResult.message}`
          );
        }
      } else {
        this.logger.log(
          `[saveMxwebFile] 跳过 MX 提交: ${fullNode.name} (公共资源库: ${fullNode.nodeType})`
        );
      }

      if (!keepSourceFile) {
        try {
          await fsPromises.unlink(file.path);
          this.logger.log(`[saveMxwebFile] 删除临时文件: ${file.path}`);
        } catch (error) {
          this.logger.warn(
            `[saveMxwebFile] 删除临时文件失败: ${error.message}`
          );
        }
      } else {
        this.logger.log(
          `[saveMxwebFile] 保留源文件（hash 模式）: ${file.path}`
        );
      }

      return {
        success: true,
        message: I18nContext.current()?.t('success.saved') ?? '保存成功',
        path: node.path,
      };
    } catch (error) {
      // 已占位但保存失败（转 bin/版本控制等异常）：回补窗口额度。
      // 未占位（游客拒绝 Unauthorized / 超限 QuotaExceeded）或乐观锁冲突（ConflictException）不回补。
      if (saveReserved) {
        try {
          await this.restrictionEngine.releaseSaveCount(userId as string);
        } catch (releaseErr) {
          this.logger.warn(
            `[saveMxwebFile] 回补保存次数失败: ${releaseErr.message}`
          );
        }
      }
      if (
        error instanceof ConflictException ||
        error instanceof QuotaExceededException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      this.logger.error(
        `[saveMxwebFile] 保存失败: ${error.message}`,
        error.stack
      );
      return {
        success: false,
        message:
          I18nContext.current()?.t('error.mxcad_extra.save_failed_detail', {
            args: { error: error.message },
          }) ?? `保存失败: ${error.message}`,
      };
    }
  }

  async saveMxwebFileByHash(
    nodeId: string,
    fileHash: string,
    userId?: string,
    userName?: string,
    commitMessage?: string,
    skipBinGeneration = false,
    expectedTimestamp?: string
  ): Promise<{ success: boolean; message: string; path?: string }> {
    try {
      this.logger.log(
        `[saveMxwebFileByHash] 开始保存: nodeId=${nodeId}, hash=${fileHash}`
      );

      const uploadsDir =
        this.mxcadUploadPath || path.join(process.cwd(), 'uploads');
      const files = await fsPromises.readdir(uploadsDir);
      const mxwebFile = files.find(
        (f) => f.startsWith(fileHash) && f.endsWith('.mxweb')
      );
      if (!mxwebFile) {
        return {
          success: false,
          message:
            I18nContext.current()?.t(
              'error.mxcad_extra.upload_file_not_found_detail',
              { args: { hash: fileHash } }
            ) ?? `上传文件不存在: ${fileHash}`,
        };
      }

      const mxwebSourcePath = path.join(uploadsDir, mxwebFile);

      const fileProxy: Express.Multer.File = {
        fieldname: 'file',
        originalname: mxwebFile,
        encoding: '7bit',
        mimetype: 'application/octet-stream',
        destination: uploadsDir,
        filename: mxwebFile,
        path: mxwebSourcePath,
        size: (await fsPromises.stat(mxwebSourcePath)).size,
        stream: null as any,
        buffer: null as any,
      };

      return this.saveMxwebFile(
        nodeId,
        fileProxy,
        userId,
        userName,
        commitMessage,
        skipBinGeneration,
        expectedTimestamp,
        true
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof QuotaExceededException
      ) {
        throw error;
      }
      this.logger.error(
        `[saveMxwebFileByHash] 保存失败: ${error.message}`,
        error.stack
      );
      return {
        success: false,
        message: `保存失败: ${error.message}`,
      };
    }
  }
}
