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
import { FileSystemNode as PrismaFileSystemNode, NodeType } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { IStorageService } from '../../storage/interfaces/storage-service.interface';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { CadDownloadFormat } from '../dto/download-node.dto';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';

import { MXCAD_CONVERSION_SERVICE } from '../../mxcad/interfaces/mxcad-service-tokens';
import type { IMxcadConversionService } from '../../mxcad/interfaces/mxcad-conversion.interface';
import type { ConvertServerFileParam } from '../../mxcad/types/mxcad-context.types';

import { I18nContext } from 'nestjs-i18n';
import { AuditLogger } from '../../audit/audit-logger.service';
import { AuditAction, ResourceType } from '../../common/enums/audit.enum';
import { NodeUtils } from '../../common/utils/node-utils';
import { ClsService } from 'nestjs-cls';
import { RestrictionEngine } from '../../vip/restriction-engine.service';

@Injectable()
export class FileDownloadExportService {
  private readonly logger = new Logger(FileDownloadExportService.name);
  private mxCadConversionService: IMxcadConversionService | null = null;

  private readonly fileLimits: {
    zipMaxTotalSize: number;
    zipMaxFileCount: number;
    zipMaxDepth: number;
    zipMaxSingleFileSize: number;
    zipCompressionLevel: number;
    maxFilenameLength: number;
    maxRecursionDepth: number;
  };

  constructor(
    private readonly prisma: DatabaseService,
    @Inject(IStorageService) private readonly storageService: IStorageService,
    private readonly storageManager: StorageManager,
    private readonly configService: ConfigService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly moduleRef: ModuleRef,
    private readonly auditLogger: AuditLogger,
    private readonly cls: ClsService,
    private readonly restrictionEngine: RestrictionEngine,
  ) {
    const limits = this.configService.get('fileLimits', { infer: true });
    this.fileLimits = {
      zipMaxTotalSize: limits.zipMaxTotalSize,
      zipMaxFileCount: limits.zipMaxFileCount,
      zipMaxDepth: limits.zipMaxDepth,
      zipMaxSingleFileSize: limits.zipMaxSingleFileSize,
      zipCompressionLevel: limits.zipCompressionLevel,
      maxFilenameLength: limits.maxFilenameLength,
      maxRecursionDepth: limits.maxRecursionDepth,
    };
  }

  private async getMxCadConversionService(): Promise<IMxcadConversionService> {
    if (!this.mxCadConversionService) {
      this.mxCadConversionService = this.moduleRef.get<IMxcadConversionService>(MXCAD_CONVERSION_SERVICE, { strict: false });
    }
    return this.mxCadConversionService;
  }

  private sanitizeFileName(fileName: string): string {
    let sanitized = fileName.replace(/[\/\\]/g, '_');
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '_');

    if (sanitized.length > this.fileLimits.maxFilenameLength) {
      const ext = path.extname(sanitized);
      const nameWithoutExt = path.basename(sanitized, ext);
      const maxNameLength = this.fileLimits.maxFilenameLength - ext.length;
      sanitized = nameWithoutExt.substring(0, maxNameLength) + ext;
    }

    if (sanitized.trim() === '' || sanitized === '.') {
      sanitized = 'unnamed';
    }

    return sanitized;
  }

  private getStoragePath(node: PrismaFileSystemNode): string {
    if (!node.path) {
      throw new NotFoundException(I18nContext.current()?.t('error.file_extra.path_not_exist') ?? '文件路径不存在');
    }
    return this.storageManager.getFullPath(node.path);
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
        throw new NotFoundException(I18nContext.current()?.t('error.node.not_found') ?? '节点不存在');
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

      const zipResult = await this.downloadNodeAsZip(nodeId, userId);
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
  }> {
    try {
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException(I18nContext.current()?.t('error.node.not_found') ?? '节点不存在');
      }

      if (node.nodeType !== NodeType.FILE) {
        const zipResult = await this.downloadNodeAsZip(nodeId, userId);
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
      const isCadFile = ['.dwg', '.dxf', '.mxweb'].includes(ext);

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
        throw new NotFoundException(I18nContext.current()?.t('error.file_extra.path_not_exist') ?? '文件路径不存在');
      }
      const mxwebPath = node.path;

      const mxwebExists = await this.storageService.fileExists(mxwebPath);

      if (!mxwebExists) {
        throw new NotFoundException(I18nContext.current()?.t('error.file.mxweb_not_found') ?? 'MXWEB 文件不存在，请确认文件已转换完成');
      }

      switch (format) {
        case CadDownloadFormat.MXWEB: {
          const stream = await this.getFileStream(mxwebPath);
          const mxwebFilename = ext === '.mxweb' ? originalFilename : `${originalFilename}.mxweb`;
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
          // 频率占位（打开/导出共用窗口）；导出下载方向会员门控由转换服务按源文件类型自动执行
          if (userId) {
            await this.restrictionEngine.reserveConversionCountOrThrow(userId);
          }

          let targetExt: string;
          if (format === CadDownloadFormat.DWG) {
            targetExt = '.dwg';
          } else if (format === CadDownloadFormat.DXF) {
            targetExt = '.dxf';
          } else {
            targetExt = '.pdf';
          }
          const targetFilename = `${path.basename(originalFilename, ext).replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '_').replace(/~/g, '_')}${targetExt}`;

          const conversionOptions: ConvertServerFileParam = {
            srcPath: this.storageManager.getFullPath(mxwebPath).replace(/\\/g, '/'),
            fileHash: node.fileHash || '',
            nodeId: node.id,
            userId,
            outname: targetFilename,
            createPreloadingData: false,
          };

          if (format === CadDownloadFormat.PDF) {
            conversionOptions.width = pdfParams?.width || '2000';
            conversionOptions.height = pdfParams?.height || '2000';
            conversionOptions.colorPolicy = pdfParams?.colorPolicy || 'mono';
          }

          if (
            (format === CadDownloadFormat.DWG || format === CadDownloadFormat.DXF) &&
            pdfParams?.dwgVersion
          ) {
            conversionOptions.dwgVersion = pdfParams.dwgVersion;
          }

          this.logger.log(
            `开始转换文件: ${originalFilename} -> ${targetFilename}`
          );
          let result;
          try {
            const mxCadConversionService = await this.getMxCadConversionService();
            result = await mxCadConversionService.convertServerFile(conversionOptions);
          } catch (error) {
            if (userId) {
              await this.restrictionEngine.releaseConversionCount(userId);
            }
            throw error;
          }

          const resultObj = result as Record<string, unknown>;
          if (!resultObj || typeof resultObj.code !== 'number' || resultObj.code !== 0) {
            const errMsg = resultObj?.message || '文件转换失败';
            this.logger.error(`文件转换失败: ${errMsg}`);
            if (userId) {
              await this.restrictionEngine.releaseConversionCount(userId);
            }
            throw new BadRequestException(I18nContext.current()?.t('error.file_extra.conversion_failed_detail', { args: { error: errMsg } }) ?? `文件转换失败: ${errMsg}`);
          }

          const mxwebDir = path.dirname(node.path);
          const targetRelativePath = `${mxwebDir}/${targetFilename}`;
          const targetFullPath = this.storageManager.getFullPath(targetRelativePath);

          let convertedStream: fs.ReadStream;
          try {
            convertedStream = fs.createReadStream(targetFullPath);
          } catch (streamErr) {
            throw new NotFoundException(I18nContext.current()?.t('error.file_extra.converted_file_not_exist', { args: { path: targetFilename } }) ?? `转换后的文件不存在: ${targetFilename}`);
          }

          const convertedMimeType = NodeUtils.getMimeType(targetFilename);

          convertedStream.on('end', async () => {
            try {
              await fsPromises.unlink(targetFullPath);
              this.logger.log(`临时转换文件已删除: ${targetFullPath}`);
            } catch (error) {
              this.logger.warn(
                `删除临时文件失败: ${targetFullPath}, error: ${error.message}`
              );
            }
          });

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
            details: { filename: originalFilename, format: format.toLowerCase() },
          });
          
          return {
            stream: convertedStream,
            filename: targetFilename,
            mimeType: convertedMimeType,
          };
        }

        default:
          throw new BadRequestException(I18nContext.current()?.t('error.file_extra.download_format_unsupported_detail', { args: { format } }) ?? `不支持的下载格式: ${format}`);
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

  private async downloadNodeAsZip(
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
        throw new NotFoundException(I18nContext.current()?.t('error.node.not_found') ?? '节点不存在');
      }

      const output = new PassThrough();
      const archive = archiver.create('zip', {
        zlib: { level: this.fileLimits.zipCompressionLevel },
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
        details: { folderName: node.name, fileCount: result.fileCount, totalSize: result.totalSize, format: 'zip' },
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
      throw new BadRequestException(I18nContext.current()?.t('error.file.directory_not_exist') ?? '目录深度超过限制');
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
        throw new BadRequestException(I18nContext.current()?.t('error.file_extra.size_exceeded_with_name', { args: { name: node.name } }) ?? `文件大小超过限制: ${node.name}`);
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
        if (stream && typeof (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy === 'function') {
          (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy();
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
          throw new BadRequestException(I18nContext.current()?.t('error.file.total_size_exceeded') ?? '压缩包总大小超过限制');
        }
        if (currentFileCount > this.fileLimits.zipMaxFileCount) {
          this.logger.warn(`文件数量超过限制: ${currentFileCount}`);
          throw new BadRequestException(I18nContext.current()?.t('error.file.count_exceeded') ?? '文件数量超过限制');
        }
      }
    }

    return { totalSize: currentTotalSize, fileCount: currentFileCount };
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取节点的完整存储路径（公共方法）
   * @param nodePath 节点的相对路径
   * @returns 本地存储的完整路径
   */
  getFullPath(nodePath: string): string {
    if (!nodePath) {
      throw new NotFoundException(I18nContext.current()?.t('error.file_extra.path_not_exist') ?? '文件路径不存在');
    }
    return this.storageManager.getFullPath(nodePath);
  }

  /**
   * 检查节点是否属于图书馆节点（公共方法）
   * @param nodeId 节点 ID
   * @returns 是否为图书馆节点
   */
  async isLibraryNode(nodeId: string): Promise<boolean> {
    return await this.permissionService.isLibraryNode(nodeId);
  }

}