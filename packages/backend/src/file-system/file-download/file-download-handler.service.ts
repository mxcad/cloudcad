///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileSystemService } from '../file-system.service';

/**
 * 文件下载处理服务
 *
 * 统一处理项目文件、公共资源库文件的下载响应
 * 支持 ETag 缓存、流式传输、错误处理和日志记录
 */
@Injectable()
export class FileDownloadHandlerService {
  private readonly logger = new Logger(FileDownloadHandlerService.name);

  constructor(private readonly fileSystemService: FileSystemService) {}

  /**
   * 统一处理下载响应
   * @param nodeId 节点 ID
   * @param userId 用户 ID
   * @param res Express Response 对象
   * @param options 可选配置
   */
  async handleDownload(
    nodeId: string,
    userId: string,
    res: Response,
    options?: {
      clientIp?: string;
    }
  ): Promise<void> {
    const clientIp = options?.clientIp || 'unknown';

    try {
      // 1. 调用 Service 获取文件流
      const { stream, filename, mimeType } =
        await this.fileSystemService.downloadNode(nodeId, userId);

      // 2. 设置 Content-Type
      res.setHeader('Content-Type', mimeType);

      // 3. 设置 Content-Disposition（支持中文文件名）
      const encodedFilename = encodeURIComponent(filename);
      // eslint-disable-next-line no-control-regex
      const fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      // 4. 设置 ETag 和 Cache-Control
      const node = await this.fileSystemService.getNode(nodeId);
      if (node && !node.isFolder && (node.fileHash || node.id)) {
        const etag = `"${node.fileHash || node.id}"`;
        res.setHeader('ETag', etag);

        // 检查 If-None-Match（304 缓存命中）
        const ifNoneMatch = res.req?.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          if (
            typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
              .destroy === 'function'
          ) {
            (
              stream as NodeJS.ReadableStream & { destroy: () => void }
            ).destroy();
          }
          res.status(304).end();
          this.logger.log(
            `缓存命中: ${filename} (${nodeId}) by user ${userId}`
          );
          return;
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else {
        // 对于动态生成的 ZIP，禁用缓存
        res.setHeader('Cache-Control', 'no-cache');
      }

      // 5. 记录下载开始
      this.logger.log(
        `下载开始: ${filename} (${nodeId}) by user ${userId} from IP ${clientIp}`
      );

      // 6. 开始流式传输
      stream.pipe(res);

      // 7. 错误处理
      stream.on('error', (error: Error) => {
        this.logger.error(`文件流传输错误: ${error.message}`, error.stack);

        // 清理资源
        if (
          typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
            .destroy === 'function'
        ) {
          (stream as NodeJS.ReadableStream & { destroy: () => void }).destroy();
        }

        if (!res.headersSent) {
          res.status(500).json({ message: '文件下载失败' });
        } else if (!res.writableEnded) {
          // 如果响应已发送但未结束，尝试结束响应
          res.end();
        }
      });

      // 8. 记录下载完成
      stream.on('finish', () => {
        this.logger.log(
          `下载完成: ${filename} (${nodeId}) by user ${userId}, size: ${node?.size || 0} bytes`
        );
      });
    } catch (error: unknown) {
      this.logger.error(
        `下载失败: ${nodeId} by user ${userId} - ${(error as Error).message}`,
        (error as Error).stack
      );

      if (!res.headersSent) {
        const status =
          error instanceof NotFoundException
            ? 404
            : error instanceof ForbiddenException
              ? 403
              : 500;
        const errorMessage =
          error instanceof Error ? error.message : '文件下载失败';
        res.status(status).json({
          message: errorMessage,
        });
      }
    }
  }
}
