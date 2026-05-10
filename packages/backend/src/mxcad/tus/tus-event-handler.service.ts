///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileMergeService } from '../upload/file-merge.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import { FileSystemPermissionService } from '../../file-system/file-permission/file-system-permission.service';
import { ProjectPermission } from '../../common/enums/permissions.enum';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig } from '../../config/app.config';

/**
 * Tus 事件处理器
 *
 * 处理 @tus/server 的上传完成事件（finish）。
 * 在文件上传完成后调用 FileMergeService 进行文件转换和节点创建。
 *
 * 职责：
 * 1. 监听 tus onUploadFinish 事件
 * 2. 获取上传文件信息（文件路径、元数据等）
 * 3. 调用文件转换服务进行格式转换
 * 4. 创建文件系统节点
 * 5. 清理临时文件
 */
@Injectable()
export class TusEventHandler {
  private readonly logger = new Logger(TusEventHandler.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileMergeService: FileMergeService,
    private readonly fileConversionService: FileConversionService,
    private readonly filePermissionService: FileSystemPermissionService,
  ) {
    this.logger.log('TusEventHandler 已初始化');
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath', { infer: true }) || path.join(process.cwd(), 'uploads');
  }

  /**
   * 处理上传完成事件
   * @param uploadId tus 上传 ID
   * @param filePath 上传文件路径
   * @param metadata 上传元数据（文件名、哈希等）
   * @param userId 用户 ID（可选）
   */
  async handleUploadFinish(
    uploadId: string,
    filePath: string,
    metadata: Record<string, string>,
    userId?: string,
    userRole?: string
  ): Promise<{ nodeId?: string }> {
    const filename = metadata.filename || 'unknown';
    const fileHash = metadata.fileHash;
    const nodeId = metadata.nodeId;
    const fileSize = metadata.fileSize ? parseInt(metadata.fileSize, 10) : 0;

    this.logger.log(`处理上传完成事件: uploadId=${uploadId}, filename=${filename}, fileHash=${fileHash}, nodeId=${nodeId}, userId=${userId}`);

    try {
      // Tus FileStore 直接将文件存储在 uploads 目录下，无需从 temp 复制
      let actualFilePath = path.join(this.mxcadUploadPath, uploadId);

      if (!fs.existsSync(actualFilePath)) {
        this.logger.error(`上传文件不存在: ${actualFilePath}`);
        return {};
      }

      this.logger.log(`上传文件路径: ${actualFilePath}`);
      this.logger.log(`上传元数据: ${JSON.stringify(metadata)}`);

      // 重命名为 fileHash + 扩展名（同目录下 rename 是原子操作，避免 race condition）
      let targetFilePath = '';
      if (fileHash) {
        const ext = path.extname(filename);
        targetFilePath = path.join(this.mxcadUploadPath, `${fileHash}${ext}`);
        await fs.promises.rename(actualFilePath, targetFilePath);
        actualFilePath = targetFilePath;
        this.logger.log(`文件已重命名为: ${targetFilePath}`);
      } else {
        targetFilePath = actualFilePath;
      }

      // 匿名用户（无 userId）：只上传文件到 uploads 目录，不创建节点
      if (!userId) {
        this.logger.log('匿名上传：仅进行文件存储和转换');

        if (targetFilePath && this.fileConversionService.needsConversion(filename)) {
          try {
            const { isOk } = await this.fileConversionService.convertFile({
              srcPath: targetFilePath,
              fileHash: fileHash || uploadId,
              createPreloadingData: true,
            });

            if (isOk) {
              this.logger.log(`匿名上传文件转换成功: ${filename}`);
            } else {
              this.logger.warn(`匿名上传文件转换失败: ${filename}`);
            }
          } catch (convertError) {
            this.logger.warn(`匿名上传文件转换异常: ${(convertError as Error).message}`);
          }
        }

        // 返回 hash，供前端构造访问 URL：/api/v1/public-file/access/{hash}/{hash}.dwg.mxweb
        return { nodeId: fileHash } as { nodeId?: string };
      }

      // 有 userId 但没有 nodeId：无法确定目标位置
      if (!nodeId) {
        this.logger.warn('缺少 nodeId，无法创建文件节点');
        return {};
      }

      // 已登录用户：检查目标节点的写权限
      const hasPermission = await this.filePermissionService.checkNodePermission(
        userId,
        nodeId,
        ProjectPermission.FILE_CREATE,
      );
      if (!hasPermission) {
        this.logger.warn(
          `权限不足：用户 ${userId} 无权在节点 ${nodeId} 创建文件`,
        );
        return {};
      }

      // 直接调用 processUploadedFile（Tus 已完成分片合并，无需模拟 chunk 流程）
      // 秒传检查已移至前端: POST /mxcad/files/fileisExist (performFileExistenceCheck)
      // 主分支流程: 前端预检查秒传 → 秒传成功直接返回节点 ID, 失败则启动 Tus 上传 → 此处处理
      const result = await this.fileMergeService.processUploadedFile({
        fileHash: fileHash || filename,
        fileName: filename,
        fileSize,
        context: {
          userId,
          nodeId,
          userRole: userRole || '',
          fileSize,
          conflictStrategy: (metadata.conflictStrategy as 'skip' | 'rename' | 'overwrite') || 'rename'
        },
      });

      this.logger.log(`上传完成处理成功: uploadId=${uploadId}, result=${JSON.stringify(result)}`);

      return { nodeId: result.nodeId };

    } catch (error) {
      this.logger.error(
        `处理上传完成事件失败: uploadId=${uploadId}, error=${(error as Error).message}`,
        (error as Error).stack,
      );
      return {};
    }
  }
}
