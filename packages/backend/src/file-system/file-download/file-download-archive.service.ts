///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';

import { I18nContext } from 'nestjs-i18n';
import { AuditLogger } from '../../audit/audit-logger.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { FileUtils } from '../../common/utils/file-utils';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';

/**
 * 目录 ZIP 打包职责（从 FileDownloadExportService 拆出）。
 *
 * 只做「目录 → ZIP 压缩流」的构建与审计：递归收集子节点（深度/单文件/总量/数量
 * 限制）、压缩级别每次下载读运行时配置、产物经 PassThrough 以流式返回。
 * 不涉及 CAD 格式转换与转换产物缓存。
 */
@Injectable()
export class FileDownloadArchiveService {
  private readonly logger = new Logger(FileDownloadArchiveService.name);

  private readonly fileLimits: {
    zipMaxTotalSize: number;
    zipMaxFileCount: number;
    zipMaxDepth: number;
    zipMaxSingleFileSize: number;
    maxFilenameLength: number;
  };

  constructor(
    private readonly prisma: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly auditLogger: AuditLogger,
    private readonly configService: ConfigService
  ) {
    const limits = this.configService.get('fileLimits', { infer: true });
    this.fileLimits = {
      zipMaxTotalSize: limits.zipMaxTotalSize,
      zipMaxFileCount: limits.zipMaxFileCount,
      zipMaxDepth: limits.zipMaxDepth,
      zipMaxSingleFileSize: limits.zipMaxSingleFileSize,
      maxFilenameLength: limits.maxFilenameLength,
    };
  }

  /**
   * 构建目录节点的 ZIP 压缩下载流。
   * 目录审计（成功/失败）在此完成，调用方（downloadNode / downloadNodeWithFormat）
   * 各自再记一条目录下载审计（fileCount/totalSize 明细与目录级记录并存）。
   */
  async buildZip(
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

      const output = new PassThrough();
      const archive = archiver.create('zip', {
        zlib: { level: await this.resolveZipCompressionLevel() },
      });

      archive.on('error', (error) => {
        this.logger.error(`ZIP 压缩失败: ${error.message}`, error.stack);
        output.emit('error', error);
      });

      archive.pipe(output);

      const result = await this.addFilesToArchive(
        nodeId,
        archive,
        node.name,
        0,
        0,
        0
      );

      await archive.finalize();

      const filename = `${node.name}.zip`;
      const mimeType = 'application/zip';

      this.logger.log(
        `目录压缩下载: ${node.name} (${nodeId}), files: ${result.fileCount}, size: ${result.totalSize} bytes by user ${userId}`
      );

      await this.auditLogger.audit({
        action: AuditAction.FILE_DOWNLOAD,
        resourceType: ResourceType.FOLDER,
        resourceId: nodeId,
        userId,
        success: true,
        details: {
          folderName: node.name,
          fileCount: result.fileCount,
          totalSize: result.totalSize,
          format: 'zip',
        },
      });

      return { stream: output, filename, mimeType };
    } catch (error) {
      this.logger.error(`目录压缩下载失败: ${error.message}`, error.stack);

      await this.auditLogger.audit({
        action: AuditAction.FILE_DOWNLOAD,
        resourceType: ResourceType.FOLDER,
        resourceId: nodeId,
        userId,
        success: false,
        errorMessage: error.message,
      });

      throw error;
    }
  }

  private async addFilesToArchive(
    nodeId: string,
    archive: archiver.Archiver,
    basePath: string,
    depth: number = 0,
    currentTotalSize: number = 0,
    currentFileCount: number = 0
  ): Promise<{ totalSize: number; fileCount: number }> {
    if (depth > this.fileLimits.zipMaxDepth) {
      this.logger.warn(`目录深度超过限制: ${depth}`);
      throw new BadRequestException(
        I18nContext.current()?.t('error.file.directory_not_exist') ??
          '目录深度超过限制'
      );
    }

    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      return { totalSize: currentTotalSize, fileCount: currentFileCount };
    }

    if (node.nodeType === NodeType.FILE && node.path) {
      if (node.size && node.size > this.fileLimits.zipMaxSingleFileSize) {
        this.logger.warn(`文件大小超过限制: ${node.name} (${node.size} bytes)`);
        throw new BadRequestException(
          I18nContext.current()?.t('error.file_extra.size_exceeded_with_name', {
            args: { name: node.name },
          }) ?? `文件大小超过限制: ${node.name}`
        );
      }

      const filename = node.originalName || node.name;
      const ext = path.extname(filename).toLowerCase();
      const isCadFile = ['.dwg', '.dxf'].includes(ext);

      const relativePath = isCadFile
        ? `${path.dirname(node.path)}/${filename}.mxweb`
        : node.path;
      const fullPath = this.storageManager.getFullPath(relativePath);
      let stream: NodeJS.ReadableStream | null = null;

      try {
        stream = fs.createReadStream(fullPath);
        const sanitizedFileName = this.sanitizeFileName(filename);
        // @ts-expect-error - NodeJS.ReadableStream and archiver's ReadableStream type mismatch, but runtime compatible
        archive.append(stream, { name: sanitizedFileName });

        stream.on('close', () => {
          this.logger.debug(`文件流已关闭: ${filename}`);
        });

        const fileSize = node.size || 0;
        currentTotalSize += fileSize;
        currentFileCount++;

        return { totalSize: currentTotalSize, fileCount: currentFileCount };
      } catch (error) {
        this.logger.warn(
          `添加文件到压缩包失败: ${node.name} - ${error.message}`
        );
        if (
          stream &&
          typeof (stream as NodeJS.ReadableStream & { destroy?: () => void })
            .destroy === 'function'
        ) {
          (
            stream as NodeJS.ReadableStream & { destroy?: () => void }
          ).destroy();
        }
        throw error;
      }
    }

    if (node.nodeType !== NodeType.FILE) {
      const children = await this.prisma.fileSystemNode.findMany({
        where: {
          parentId: nodeId,
          deletedAt: null,
        },
      });

      for (const child of children) {
        const sanitizedChildName = this.sanitizeFileName(child.name);
        const childPath = path.join(basePath, sanitizedChildName);

        const result = await this.addFilesToArchive(
          child.id,
          archive,
          childPath,
          depth + 1,
          currentTotalSize,
          currentFileCount
        );

        currentTotalSize = result.totalSize;
        currentFileCount = result.fileCount;

        if (currentTotalSize > this.fileLimits.zipMaxTotalSize) {
          this.logger.warn(`压缩包总大小超过限制: ${currentTotalSize} bytes`);
          throw new BadRequestException(
            I18nContext.current()?.t('error.file.total_size_exceeded') ??
              '压缩包总大小超过限制'
          );
        }
        if (currentFileCount > this.fileLimits.zipMaxFileCount) {
          this.logger.warn(`文件数量超过限制: ${currentFileCount}`);
          throw new BadRequestException(
            I18nContext.current()?.t('error.file.count_exceeded') ??
              '文件数量超过限制'
          );
        }
      }
    }

    return { totalSize: currentTotalSize, fileCount: currentFileCount };
  }

  /**
   * ZIP 压缩级别每次下载时读取运行时配置。构造期固化会让配置页改级别后
   * 单节点/目录下载永不生效（批量下载那条链路本来就是每次读）。
   */
  private async resolveZipCompressionLevel(): Promise<number> {
    return this.runtimeConfigService.getValue<number>(
      'fileZipCompressionLevel'
    );
  }

  private sanitizeFileName(fileName: string): string {
    return FileUtils.sanitizeDownloadFilename(
      fileName,
      this.fileLimits.maxFilenameLength
    );
  }
}
