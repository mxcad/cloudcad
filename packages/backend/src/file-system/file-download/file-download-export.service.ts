///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import { CadDownloadFormat } from '../dto/download-node.dto';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

import { MXCAD_CONVERSION_SERVICE } from '../../common/di-tokens';
import type { IMxcadConversionService } from '../../mxcad/interfaces/mxcad-conversion.interface';

import { I18nContext } from 'nestjs-i18n';
import { AuditLogger } from '../../audit/audit-logger.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { NodeUtils } from '../../common/utils/node-utils';
import { FileUtils } from '../../common/utils/file-utils';
import { resolveMxcadUploadDir } from '../../common/utils/mxcad-upload-dir';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import {
  formatUnsupportedMessage,
  isConvertibleSourceExt,
  resolveOutputFormat,
} from './format-policy';
import {
  ConversionCoreError,
  runConversionCore,
} from './conversion-core';
import { FileDownloadExportConversionService } from './file-download-export-conversion.service';
import { FileDownloadArchiveService } from './file-download-archive.service';

// 清理 cron 的缓存产物判据随缓存实现走（FileDownloadExportConversionService），
// 这里 re-export 保持既有消费方（batch-download-cleanup）的导入路径稳定。
export { isConversionCacheEntry } from './file-download-export-conversion.service';

@Injectable()
export class FileDownloadExportService {
  private readonly logger = new Logger(FileDownloadExportService.name);
  private mxCadConversionService: IMxcadConversionService | null = null;

  private readonly fileLimits: {
    zipMaxTotalSize: number;
    zipMaxFileCount: number;
    zipMaxDepth: number;
    zipMaxSingleFileSize: number;
    maxFilenameLength: number;
    maxRecursionDepth: number;
  };

  /** 转换产物缓存目录（空字符串表示未启用缓存），与转换服务共用同一配置 */
  private readonly conversionCacheDir: string;

  constructor(
    private readonly prisma: DatabaseService,
    @Inject(IStorageService) private readonly storageService: IStorageService,
    private readonly storageManager: StorageManager,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly auditLogger: AuditLogger,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly exportConversionService: FileDownloadExportConversionService,
    private readonly archiveService: FileDownloadArchiveService
  ) {
    const limits = this.configService.get('fileLimits', { infer: true });
    this.fileLimits = {
      zipMaxTotalSize: limits.zipMaxTotalSize,
      zipMaxFileCount: limits.zipMaxFileCount,
      zipMaxDepth: limits.zipMaxDepth,
      zipMaxSingleFileSize: limits.zipMaxSingleFileSize,
      maxFilenameLength: limits.maxFilenameLength,
      maxRecursionDepth: limits.maxRecursionDepth,
    };
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    this.conversionCacheDir =
      resolveMxcadUploadDir(this.configService) ||
      batchConfig?.conversionCacheDir ||
      '';
  }

  /** 快照工作副本到 uploads/{hash}.mxweb（委托转换服务） */
  async snapshotMxweb(node: {
    path?: string;
  }): Promise<{ snapshotPath: string; hash: string } | null> {
    return this.exportConversionService.snapshotMxweb(node);
  }

  /** 构造格式参数键（pdf 尺寸/颜色、dwg/dxf 版本），不同参数互不污染（委托转换服务） */
  buildParamKey(
    format: CadDownloadFormat,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): string {
    return this.exportConversionService.buildParamKey(format, pdfParams);
  }

  /**
   * 构造转换产物缓存 key：`{hash}-{paramKey}`（内容寻址）。
   * 委托转换服务（内容变更自动失效 / 参数参与 key / 未启用或无 hash 返回 null）。
   */
  buildConversionCacheKey(
    hash: string,
    format: CadDownloadFormat,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): string | null {
    return this.exportConversionService.buildConversionCacheKey(
      hash,
      format,
      pdfParams
    );
  }

  /** 转换产物名（内容寻址）的单一出口（委托转换服务） */
  buildConversionArtifactName(
    hash: string,
    format: CadDownloadFormat,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): string {
    return this.exportConversionService.buildConversionArtifactName(
      hash,
      format,
      pdfParams
    );
  }

  /** 查转换缓存：命中且未过 TTL 返回缓存文件绝对路径，否则 null（委托转换服务） */
  getFreshConversionCachePath(
    hash: string,
    format: CadDownloadFormat,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): string | null {
    return this.exportConversionService.getFreshConversionCachePath(
      hash,
      format,
      pdfParams
    );
  }

  /** 写转换缓存：把转换产物 copy 到缓存目录（委托转换服务） */
  storeConversionCache(
    hash: string,
    format: CadDownloadFormat,
    srcFilePath: string,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): void {
    this.exportConversionService.storeConversionCache(
      hash,
      format,
      srcFilePath,
      pdfParams
    );
  }

  /** 旧路径降级清理：删除转换临时文件（失败仅告警） */
  private async cleanupConvertedTempFile(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
      this.logger.log(`临时转换文件已删除: ${filePath}`);
    } catch (error) {
      this.logger.warn(
        `删除临时文件失败: ${filePath}, error: ${(error as Error).message}`
      );
    }
  }

  private async getMxCadConversionService(): Promise<IMxcadConversionService> {
    if (!this.mxCadConversionService) {
      this.mxCadConversionService = this.moduleRef.get<IMxcadConversionService>(
        MXCAD_CONVERSION_SERVICE,
        { strict: false }
      );
    }
    return this.mxCadConversionService;
  }

  /**
   * 后台预转换（#474 导出/下载接入统一队列）：把节点 mxweb 转成目标格式并放入转换产物缓存，
   * 供后续 downloadNodeWithFormat 命中新鲜缓存秒回。实现已拆至转换服务（委托）。
   */
  async precomputeExport(
    nodeId: string,
    userId: string,
    format: CadDownloadFormat,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    },
    priority?: 'high' | 'low',
    taskId?: string
  ): Promise<{ alreadyCached: boolean; cacheKey: string | null }> {
    return this.exportConversionService.precomputeExport(
      nodeId,
      userId,
      format,
      pdfParams,
      priority,
      taskId
    );
  }

  private sanitizeFileName(fileName: string): string {
    return FileUtils.sanitizeDownloadFilename(
      fileName,
      this.fileLimits.maxFilenameLength
    );
  }

  private async getFileStream(
    filePath: string
  ): Promise<NodeJS.ReadableStream> {
    try {
      return await this.storageService.getFileStream(filePath);
    } catch (error) {
      this.logger.error(`获取文件流失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async downloadNode(
    nodeId: string,
    userId: string
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string;
  }> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      if (node.nodeType === NodeType.FILE) {
        const filename = node.originalName || node.name;
        let actualFilename = filename;

        const ext = path.extname(filename).toLowerCase();
        if (['.dwg', '.dxf'].includes(ext)) {
          actualFilename = `${filename}.mxweb`;
        }

        const stream = await this.getFileStream(node.path);
        const mimeType = NodeUtils.getMimeType(actualFilename);

        this.logger.log(`文件下载: ${filename} (${nodeId}) by user ${userId}`);

        // 审计日志
        await this.auditLogger.audit({
          action: AuditAction.FILE_DOWNLOAD,
          resourceType: ResourceType.FILE,
          resourceId: nodeId,
          userId,
          success: true,
          details: { filename, nodeType: node.nodeType },
        });

        return { stream, filename, mimeType };
      }

      const zipResult = await this.archiveService.buildZip(nodeId, userId);
      this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);

      await this.auditLogger.audit({
        action: AuditAction.FILE_DOWNLOAD,
        resourceType: ResourceType.FOLDER,
        resourceId: nodeId,
        userId,
        success: true,
        details: { folderName: node.name, nodeType: node.nodeType },
      });

      return zipResult;
    } catch (error) {
      this.logger.error(`节点下载失败: ${error.message}`, error.stack);

      await this.auditLogger.audit({
        action: AuditAction.FILE_DOWNLOAD,
        resourceType: ResourceType.FILE,
        resourceId: nodeId,
        userId,
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  async downloadNodeWithFormat(
    nodeId: string,
    userId: string,
    format: CadDownloadFormat = CadDownloadFormat.MXWEB,
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string;
    /** 转换产物缓存 key（含格式参数），Controller 用于构造 ETag；非转换格式为 undefined */
    cacheKey?: string;
  }> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
        );
      }

      if (node.nodeType !== NodeType.FILE) {
        const zipResult = await this.archiveService.buildZip(nodeId, userId);
        this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);

        await this.auditLogger.audit({
          action: AuditAction.FILE_DOWNLOAD,
          resourceType: ResourceType.FOLDER,
          resourceId: nodeId,
          userId,
          success: true,
          details: { folderName: node.name, format: 'zip' },
        });

        return zipResult;
      }

      const originalFilename = node.originalName || node.name;
      const ext = path.extname(originalFilename).toLowerCase();
      // 可转换源扩展名判断单一事实源在 FormatPolicy（isConvertibleSourceExt）
      const isCadFile = isConvertibleSourceExt(ext);

      if (!isCadFile) {
        const stream = await this.getFileStream(node.path);
        const mimeType = NodeUtils.getMimeType(originalFilename);

        this.logger.log(
          `文件下载（非CAD）: ${originalFilename} (${nodeId}) by user ${userId}`
        );

        await this.auditLogger.audit({
          action: AuditAction.FILE_DOWNLOAD,
          resourceType: ResourceType.FILE,
          resourceId: nodeId,
          userId,
          success: true,
          details: { filename: originalFilename, format: 'original' },
        });

        return { stream, filename: originalFilename, mimeType };
      }

      if (!node.path) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file_extra.path_not_exist') ??
            '文件路径不存在'
        );
      }
      const mxwebPath = node.path;

      const mxwebExists = await this.storageService.fileExists(mxwebPath);

      if (!mxwebExists) {
        throw new NotFoundException(
          I18nContext.current()?.t('error.file.mxweb_not_found') ??
            'MXWEB 文件不存在，请确认文件已转换完成'
        );
      }

      switch (format) {
        case CadDownloadFormat.MXWEB: {
          const stream = await this.getFileStream(mxwebPath);
          const mxwebFilename =
            ext === '.mxweb' ? originalFilename : `${originalFilename}.mxweb`;
          const mimeType = NodeUtils.getMimeType(mxwebFilename);
          this.logger.log(
            `文件下载（MXWEB）: ${originalFilename} -> ${mxwebFilename} (${nodeId}) by user ${userId}`
          );

          await this.auditLogger.audit({
            action: AuditAction.FILE_DOWNLOAD,
            resourceType: ResourceType.FILE,
            resourceId: nodeId,
            userId,
            success: true,
            details: { filename: originalFilename, format: 'mxweb' },
          });

          return { stream, filename: mxwebFilename, mimeType };
        }

        case CadDownloadFormat.DWG:
        case CadDownloadFormat.DXF:
        case CadDownloadFormat.PDF: {
          // 格式决策单一出口（FormatPolicy）：targetExt/引擎参数默认值由此派生
          const resolved = resolveOutputFormat(format, pdfParams);
          const targetExt = resolved.targetExt;
          const targetFilename = `${this.sanitizeFileName(
            path.basename(originalFilename, ext)
          )}${targetExt}`;

          // ── 步骤 2：快照工作副本到 uploads/{hash}.mxweb（内容寻址、不可变），缓存键 {hash}-{paramKey} ──
          // 转换读快照而非可变工作副本，避免执行时读到被覆盖的版本。
          // 产物落 uploads/{hash}-{paramKey}{ext}（内容寻址），与缓存文件同路径，无需移动。
          // 注意：命中检查必须先于转换配额占位——缓存命中不发生真实转换，不应扣次数。
          const snapshot = await this.snapshotMxweb(node);
          const hash = snapshot?.hash;
          const cacheKey = hash
            ? this.buildConversionCacheKey(hash, format, pdfParams)
            : null;
          const artifactName = this.buildConversionArtifactName(
            hash ?? '',
            format,
            pdfParams
          );
          const cachePath = cacheKey
            ? path.join(this.conversionCacheDir, artifactName)
            : null;
          if (cachePath && this.exportConversionService.isConversionCacheFresh(cachePath)) {
            const cachedStream = fs.createReadStream(cachePath);
            this.logger.log(
              `转换缓存命中: ${originalFilename} -> ${targetFilename} (cache: ${path.basename(cachePath)})`
            );

            await this.auditLogger.audit({
              action: AuditAction.FILE_DOWNLOAD,
              resourceType: ResourceType.FILE,
              resourceId: nodeId,
              userId,
              success: true,
              details: {
                filename: originalFilename,
                format: format.toLowerCase(),
                cacheHit: true,
              },
            });

            return {
              stream: cachedStream,
              filename: targetFilename,
              mimeType: NodeUtils.getMimeType(targetFilename),
              cacheKey,
            };
          }

          const srcPath = (
            snapshot?.snapshotPath || this.storageManager.getFullPath(mxwebPath)
          ).replace(/\\/g, '/');
          const outname = cacheKey ? artifactName : targetFilename;

          this.logger.log(`开始转换文件: ${originalFilename} -> ${outname}`);
          // 共享转换核心（构造参数 → 调引擎 → 校验产物）。占位/释放走 withConversionQuota
          // 单点（打开/导出共用窗口；导出下载方向会员门控由转换服务按源文件类型自动执行）：
          // 成功消耗占位，任何失败（引擎失败 code≠0 / 产物缺失 / 引擎原始异常
          // spawn/VIP 门控）保证释放——失败转换不消耗窗口额度，与 precomputeExport 统一。
          let targetFullPath: string;
          try {
            targetFullPath = await this.restrictionEngine.withConversionQuota(
              { userId },
              async () => {
                const mxCadConversionService =
                  await this.getMxCadConversionService();
                const { artifactPath } = await runConversionCore({
                  conversionService: mxCadConversionService,
                  srcPath,
                  fileHash: node.fileHash || '',
                  nodeId: node.id,
                  userId,
                  outname,
                  engineParams: resolved.engineParams,
                });
                return artifactPath;
              }
            );
          } catch (error) {
            if (error instanceof ConversionCoreError) {
              if (error.kind === 'engine-failed') {
                const errMsg = error.detail || '文件转换失败';
                this.logger.error(`文件转换失败: ${errMsg}`);
                throw new BadRequestException(
                  I18nContext.current()?.t(
                    'error.file_extra.conversion_failed_detail',
                    { args: { error: errMsg } }
                  ) ?? `文件转换失败: ${errMsg}`
                );
              }
              throw new NotFoundException(
                I18nContext.current()?.t(
                  'error.file_extra.converted_file_not_exist',
                  { args: { path: error.detail } }
                ) ?? `转换后的文件不存在: ${error.detail}`
              );
            }
            throw error;
          }

          let convertedStream: fs.ReadStream;
          if (cachePath && targetFullPath === cachePath) {
            // 产物已在缓存位置（内容寻址），无需移动
            convertedStream = fs.createReadStream(targetFullPath);
          } else if (cachePath) {
            try {
              fs.mkdirSync(this.conversionCacheDir, { recursive: true });
              fs.renameSync(targetFullPath, cachePath);
              convertedStream = fs.createReadStream(cachePath);
            } catch (moveErr) {
              this.logger.warn(
                `转换缓存写入失败，降级直传: ${(moveErr as Error).message}`
              );
              convertedStream = fs.createReadStream(targetFullPath);
              convertedStream.on('end', async () => {
                await this.cleanupConvertedTempFile(targetFullPath);
              });
              convertedStream.on('error', async () => {
                await this.cleanupConvertedTempFile(targetFullPath);
              });
            }
          } else {
            convertedStream = fs.createReadStream(targetFullPath);
            convertedStream.on('end', async () => {
              await this.cleanupConvertedTempFile(targetFullPath);
            });
            convertedStream.on('error', async () => {
              await this.cleanupConvertedTempFile(targetFullPath);
            });
          }

          const convertedMimeType = NodeUtils.getMimeType(targetFilename);

          convertedStream.on('error', async () => {
            try {
              await fsPromises.unlink(targetFullPath);
              this.logger.log(`流出错时删除临时文件: ${targetFullPath}`);
            } catch (error) {
              this.logger.warn(
                `删除临时文件失败: ${targetFullPath}, error: ${error.message}`
              );
            }
          });

          this.logger.log(
            `文件下载（${format.toUpperCase()}）: ${originalFilename} -> ${targetFilename} (${nodeId}) by user ${userId}`
          );

          await this.auditLogger.audit({
            action: AuditAction.FILE_DOWNLOAD,
            resourceType: ResourceType.FILE,
            resourceId: nodeId,
            userId,
            success: true,
            details: {
              filename: originalFilename,
              format: format.toLowerCase(),
            },
          });

          return {
            stream: convertedStream,
            filename: targetFilename,
            mimeType: convertedMimeType,
            cacheKey: cacheKey ?? undefined,
          };
        }

        default:
          throw new BadRequestException(formatUnsupportedMessage(format));
      }
    } catch (error) {
      this.logger.error(`多格式下载失败: ${error.message}`, error.stack);

      await this.auditLogger.audit({
        action: AuditAction.FILE_DOWNLOAD,
        resourceType: ResourceType.FILE,
        resourceId: nodeId,
        userId,
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * 获取节点的完整存储路径（公共方法）
   * @param nodePath 节点的相对路径
   * @returns 本地存储的完整路径
   */
  getFullPath(nodePath: string): string {
    if (!nodePath) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file_extra.path_not_exist') ??
          '文件路径不存在'
      );
    }
    return this.storageManager.getFullPath(nodePath);
  }
}
