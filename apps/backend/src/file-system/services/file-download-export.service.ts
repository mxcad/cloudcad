///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { FileSystemNode as PrismaFileSystemNode } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
import { StorageManager } from '../../common/services/storage-manager.service';
import { ConfigService } from '@nestjs/config';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { CadDownloadFormat } from '../dto/download-node.dto';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import * as archiver from 'archiver';
import { PassThrough } from 'stream';

// 延迟导入 MxCadService，避免循环依赖
import type { MxCadService } from '../../mxcad/mxcad.service';

@Injectable()
export class FileDownloadExportService {
  private readonly logger = new Logger(FileDownloadExportService.name);
  private mxCadService: MxCadService | null = null;

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
    private readonly storage: LocalStorageProvider,
    private readonly storageManager: StorageManager,
    private readonly configService: ConfigService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly moduleRef: ModuleRef
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

  private async getMxCadServiceInstance(): Promise<MxCadService> {
    if (!this.mxCadService) {
      const { MxCadService } = await import('../../mxcad/mxcad.service');
      this.mxCadService = this.moduleRef.get(MxCadService, { strict: false });
    }
    return this.mxCadService;
  }

  private sanitizeFileName(fileName: string): string {
    let sanitized = fileName.replace(/[\/\\]/g, '_');
    // eslint-disable-next-line no-control-regex
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
      throw new NotFoundException('文件路径不存在');
    }
    return this.storageManager.getFullPath(node.path);
  }

  private async getFileStream(filePath: string): Promise<NodeJS.ReadableStream> {
    try {
      return await this.storage.getFileStream(filePath);
    } catch (error) {
      this.logger.error(`获取文件流失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  async checkFileAccess(nodeId: string, userId: string): Promise<boolean> {
    try {
      const role = await this.permissionService.getNodeAccessRole(
        userId,
        nodeId
      );
      return role !== null;
    } catch (error) {
      this.logger.error(`检查文件访问权限失败: ${error.message}`, error.stack);
      return false;
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
      const hasAccess = await this.checkFileAccess(nodeId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('无权访问该文件');
      }

      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      if (!node.isFolder) {
        const filename = node.originalName || node.name;
        let actualFilename = filename;

        const ext = path.extname(filename).toLowerCase();
        if (['.dwg', '.dxf'].includes(ext)) {
          actualFilename = `${filename}.mxweb`;
        }

        const stream = await this.getFileStream(node.path);
        const mimeType = this.getMimeType(actualFilename);

        this.logger.log(`文件下载: ${filename} (${nodeId}) by user ${userId}`);
        return { stream, filename, mimeType };
      }

      const zipResult = await this.downloadNodeAsZip(nodeId, userId);
      this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);
      return zipResult;
    } catch (error) {
      this.logger.error(`节点下载失败: ${error.message}`, error.stack);
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
    }
  ): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
    mimeType: string;
  }> {
    try {
      const hasAccess = await this.checkFileAccess(nodeId, userId);
      if (!hasAccess) {
        throw new ForbiddenException('无权访问该文件');
      }

      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      if (node.isFolder) {
        const zipResult = await this.downloadNodeAsZip(nodeId, userId);
        this.logger.log(`目录下载: ${node.name} (${nodeId}) by user ${userId}`);
        return zipResult;
      }

      const originalFilename = node.originalName || node.name;
      const ext = path.extname(originalFilename).toLowerCase();
      const isCadFile = ['.dwg', '.dxf'].includes(ext);

      if (!isCadFile) {
        const storageDir = this.getStoragePath(node);
        const fullPath = path.join(storageDir, originalFilename);
        const stream = await this.getFileStream(fullPath);
        const mimeType = this.getMimeType(originalFilename);

        this.logger.log(
          `文件下载（非CAD）: ${originalFilename} (${nodeId}) by user ${userId}`
        );
        return { stream, filename: originalFilename, mimeType };
      }

      if (!node.path) {
        throw new NotFoundException('文件路径不存在');
      }
      const mxwebPath = node.path;

      const mxwebFullPath = this.storageManager.getFullPath(mxwebPath);
      const mxwebExists = await fsPromises
        .access(mxwebFullPath)
        .then(() => true)
        .catch(() => false);

      if (!mxwebExists) {
        throw new NotFoundException('MXWEB 文件不存在，请确认文件已转换完成');
      }

      switch (format) {
        case CadDownloadFormat.MXWEB: {
          const stream = await this.getFileStream(mxwebPath);
          const mxwebFilename = `${originalFilename}.mxweb`;
          const mimeType = this.getMimeType(mxwebFilename);
          this.logger.log(
            `文件下载（MXWEB）: ${originalFilename} -> ${mxwebFilename} (${nodeId}) by user ${userId}`
          );
          return { stream, filename: mxwebFilename, mimeType };
        }

        case CadDownloadFormat.DWG:
        case CadDownloadFormat.DXF:
        case CadDownloadFormat.PDF: {
          let targetExt: string;
          if (format === CadDownloadFormat.DWG) {
            targetExt = '.dwg';
          } else if (format === CadDownloadFormat.DXF) {
            targetExt = '.dxf';
          } else {
            targetExt = '.pdf';
          }
          const targetFilename = `${path.basename(originalFilename, ext)}${targetExt}`;

          const conversionOptions: any = {
            srcpath: mxwebFullPath.replace(/\\/g, '/'),
            src_file_md5: node.fileHash || '',
            outname: targetFilename,
            create_preloading_data: false,
          };

          if (format === CadDownloadFormat.PDF) {
            conversionOptions.width = pdfParams?.width || '2000';
            conversionOptions.height = pdfParams?.height || '2000';
            conversionOptions.colorPolicy = pdfParams?.colorPolicy || 'mono';
          }

          this.logger.log(
            `开始转换文件: ${originalFilename} -> ${targetFilename}`
          );
          const mxCadService = await this.getMxCadServiceInstance();
          const result = await mxCadService.convertServerFile(conversionOptions);

          const resultObj = result as { code?: number; message?: string };
          if (resultObj.code !== 0) {
            this.logger.error(`文件转换失败: ${resultObj.message}`);
            throw new BadRequestException(`文件转换失败: ${resultObj.message}`);
          }

          const mxwebDir = path.dirname(node.path);
          const targetRelativePath = `${mxwebDir}/${targetFilename}`;
          const targetFullPath =
            this.storageManager.getFullPath(targetRelativePath);

          const targetExists = await fsPromises
            .access(targetFullPath)
            .then(() => true)
            .catch(() => false);

          if (!targetExists) {
            throw new NotFoundException(
              `转换后的文件不存在: ${targetFilename}`
            );
          }

          const convertedStream = await this.getFileStream(targetRelativePath);
          const convertedMimeType = this.getMimeType(targetFilename);

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
          return {
            stream: convertedStream,
            filename: targetFilename,
            mimeType: convertedMimeType,
          };
        }

        default:
          throw new BadRequestException(`不支持的下载格式: ${format}`);
      }
    } catch (error) {
      this.logger.error(`多格式下载失败: ${error.message}`, error.stack);
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
        throw new NotFoundException('节点不存在');
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

      return { stream: output, filename, mimeType };
    } catch (error) {
      this.logger.error(`目录压缩下载失败: ${error.message}`, error.stack);
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
      throw new BadRequestException('目录深度超过限制');
    }

    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      return { totalSize: currentTotalSize, fileCount: currentFileCount };
    }

    if (!node.isFolder && node.path) {
      if (node.size && node.size > this.fileLimits.zipMaxSingleFileSize) {
        this.logger.warn(`文件大小超过限制: ${node.name} (${node.size} bytes)`);
        throw new BadRequestException(`文件大小超过限制: ${node.name}`);
      }

      const storageDir = this.getStoragePath(node);
      const filename = node.originalName || node.name;
      let actualFilename = filename;

      const ext = path.extname(filename).toLowerCase();
      if (['.dwg', '.dxf'].includes(ext)) {
        actualFilename = `${filename}.mxweb`;
      }

      const fullPath = path.join(storageDir, actualFilename);
      let stream: NodeJS.ReadableStream | null = null;

      try {
        stream = await this.getFileStream(fullPath);
        const sanitizedFileName = this.sanitizeFileName(filename);
        archive.append(stream as any, { name: sanitizedFileName });

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
        if (stream && typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
        throw error;
      }
    }

    if (node.isFolder) {
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
          throw new BadRequestException('压缩包总大小超过限制');
        }
        if (currentFileCount > this.fileLimits.zipMaxFileCount) {
          this.logger.warn(`文件数量超过限制: ${currentFileCount}`);
          throw new BadRequestException('文件数量超过限制');
        }
      }
    }

    return { totalSize: currentTotalSize, fileCount: currentFileCount };
  }

  getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      dwg: 'application/acad',
      dxf: 'application/dxf',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain; charset=utf-8',
      rtf: 'application/rtf',
      odt: 'application/vnd.oasis.opendocument.text',
      ods: 'application/vnd.oasis.opendocument.spreadsheet',
      odp: 'application/vnd.oasis.opendocument.presentation',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      flac: 'audio/flac',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      wmv: 'video/x-ms-wmv',
      mkv: 'video/x-matroska',
      webm: 'video/webm',
      zip: 'application/zip',
      rar: 'application/vnd.rar',
      '7z': 'application/x-7z-compressed',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      bz2: 'application/x-bzip2',
      json: 'application/json',
      xml: 'application/xml',
      yaml: 'application/x-yaml',
      yml: 'application/x-yaml',
      csv: 'text/csv',
      sql: 'application/sql',
      js: 'application/javascript',
      ts: 'application/typescript',
      html: 'text/html',
      css: 'text/css',
      md: 'text/markdown',
      py: 'text/x-python',
      java: 'text/x-java-source',
      c: 'text/x-c',
      cpp: 'text/x-c++',
      h: 'text/x-c',
      hpp: 'text/x-c++',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
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
      throw new NotFoundException('文件路径不存在');
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
