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

  /** 转换产物缓存目录（空字符串表示未启用缓存） */
  private readonly conversionCacheDir: string;
  /** 缓存 TTL（毫秒），0 = 未启用 */
  private readonly conversionCacheTtlMs: number;

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
    const batchConfig = this.configService.get('batchDownload', { infer: true });
    this.conversionCacheDir = batchConfig?.conversionCacheDir || '';
    this.conversionCacheTtlMs = (batchConfig?.conversionCacheTtlHours || 0) * 60 * 60 * 1000;
  }

  /**
   * 构造转换产物缓存 key：`{nodeId}-{updatedAtMs}-{格式参数}`。
   * - ⚠️ 不能用 fileHash：编辑器保存（saveMxwebFile）覆盖 node.path 文件时只更新
   *   updatedAt/size，fileHash 保持上传时源文件的 md5 不变——用它做 key 会脏读旧缓存；
   * - updatedAt 由 Prisma @updatedAt 自动维护，任何节点更新（编辑器保存/重命名/新版本上传）
   *   都会刷新 → key 变化 → 旧缓存自然失效；
   * - pdf 尺寸/颜色、dwg/dxf 版本等参数参与 key，不同参数互不污染。
   * 返回 null 表示不启用缓存（未启用或节点缺 updatedAt）。
   */
  private buildConversionCacheKey(
    node: PrismaFileSystemNode,
    format: CadDownloadFormat,
    pdfParams?: { width?: string; height?: string; colorPolicy?: string; dwgVersion?: number }
  ): string | null {
    if (!this.conversionCacheDir || !this.conversionCacheTtlMs) return null;
    if (!node.updatedAt) return null;
    const safe = (v: string | undefined) => (v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    let paramKey: string;
    if (format === CadDownloadFormat.PDF) {
      paramKey = `pdf-${safe(pdfParams?.width) || '2000'}x${safe(pdfParams?.height) || '2000'}-${safe(pdfParams?.colorPolicy) || 'mono'}`;
    } else if (format === CadDownloadFormat.DWG) {
      paramKey = pdfParams?.dwgVersion ? `dwg-v${pdfParams.dwgVersion}` : 'dwg';
    } else {
      paramKey = pdfParams?.dwgVersion ? `dxf-v${pdfParams.dwgVersion}` : 'dxf';
    }
    return `${node.id}-${node.updatedAt.getTime()}-${paramKey}`;
  }

  /** 缓存命中且未过 TTL（mtime 惰性检查）；过期文件顺带删除 */
  private isConversionCacheFresh(cachePath: string): boolean {
    try {
      if (!fs.existsSync(cachePath)) return false;
      if (!this.conversionCacheTtlMs) return false;
      const stat = fs.statSync(cachePath);
      if (Date.now() - stat.mtimeMs > this.conversionCacheTtlMs) {
        // 同步删除：异步 unlink 与紧随其后的重转换 rename 存在竞态，可能误删新缓存
        try {
          fs.unlinkSync(cachePath);
        } catch {
          // 忽略：文件被并发请求抢先删除/替换均无害
        }
        this.logger.log(`转换缓存已过期，删除: ${cachePath}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** 旧路径降级清理：删除转换临时文件（失败仅告警） */
  private async cleanupConvertedTempFile(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
      this.logger.log(`临时转换文件已删除: ${filePath}`);
    } catch (error) {
      this.logger.warn(`删除临时文件失败: ${filePath}, error: ${(error as Error).message}`);
    }
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
    /** 转换产物缓存 key（含格式参数），Controller 用于构造 ETag；非转换格式为 undefined */
    cacheKey?: string;
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
          let targetExt: string;
          if (format === CadDownloadFormat.DWG) {
            targetExt = '.dwg';
          } else if (format === CadDownloadFormat.DXF) {
            targetExt = '.dxf';
          } else {
            targetExt = '.pdf';
          }
          const targetFilename = `${path.basename(originalFilename, ext).replace(/[<>:"|?*]/g, '_').replace(/\.\./g, '_').replace(/~/g, '_')}${targetExt}`;

          // ── 转换产物缓存：同文件同格式同参数直接复用，避免每次下载重新转换 ──
          // 历史行为是转换完立即删除临时文件，重复下载永远慢（超过反向代理超时即 524）。
          // 缓存 key 含 fileHash（内容变更自动失效）与格式参数（pdf 尺寸/颜色、dwg 版本）。
          // 注意：命中检查必须先于转换配额占位——缓存命中不发生真实转换，不应扣次数。
          const cacheKey = this.buildConversionCacheKey(node, format, pdfParams);
          const cachePath = cacheKey
            ? path.join(this.conversionCacheDir, `${cacheKey}${targetExt}`)
            : null;
          if (cachePath && this.isConversionCacheFresh(cachePath)) {
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
              details: { filename: originalFilename, format: format.toLowerCase(), cacheHit: true },
            });

            return {
              stream: cachedStream,
              filename: targetFilename,
              mimeType: NodeUtils.getMimeType(targetFilename),
              cacheKey,
            };
          }

          // 频率占位（打开/导出共用窗口）；导出下载方向会员门控由转换服务按源文件类型自动执行
          if (userId) {
            await this.restrictionEngine.reserveConversionCountOrThrow(userId);
          }

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

          // 转换产物移入缓存目录复用（不再用完即删；TTL 由 isConversionCacheFresh 惰性管理）
          const mxwebDir = path.dirname(node.path);
          const targetRelativePath = `${mxwebDir}/${targetFilename}`;
          const targetFullPath = this.storageManager.getFullPath(targetRelativePath);

          if (!fs.existsSync(targetFullPath)) {
            throw new NotFoundException(I18nContext.current()?.t('error.file_extra.converted_file_not_exist', { args: { path: targetFilename } }) ?? `转换后的文件不存在: ${targetFilename}`);
          }

          let convertedStream: fs.ReadStream;
          if (cachePath) {
            try {
              fs.mkdirSync(this.conversionCacheDir, { recursive: true });
              // 同 key 并发转换时后者覆盖前者，产物内容等价，无一致性问题
              fs.renameSync(targetFullPath, cachePath);
              convertedStream = fs.createReadStream(cachePath);
            } catch (moveErr) {
              // 缓存目录不可写时降级为旧行为：直接回传并删除临时文件
              this.logger.warn(`转换缓存写入失败，降级直传: ${(moveErr as Error).message}`);
              convertedStream = fs.createReadStream(targetFullPath);
              convertedStream.on('end', async () => {
                await this.cleanupConvertedTempFile(targetFullPath);
              });
              convertedStream.on('error', async () => {
                await this.cleanupConvertedTempFile(targetFullPath);
              });
            }
          } else {
            // 缓存未启用（TTL=0）：保持旧行为
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
            details: { filename: originalFilename, format: format.toLowerCase() },
          });
          
          return {
            stream: convertedStream,
            filename: targetFilename,
            mimeType: convertedMimeType,
            cacheKey: cacheKey ?? undefined,
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