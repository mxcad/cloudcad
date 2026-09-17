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
import * as crypto from 'crypto';
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
  /** 内容寻址存储目录（uploads/），转换快照和产物统一落此目录 */
  private readonly mxcadUploadPath: string;

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
    this.mxcadUploadPath = this.configService.get<string>('mxcadUploadPath') || '';
    this.conversionCacheDir = this.mxcadUploadPath || batchConfig?.conversionCacheDir || '';
    this.conversionCacheTtlMs = (batchConfig?.conversionCacheTtlHours || 0) * 60 * 60 * 1000;
  }

  /**
   * 快照工作副本到 uploads/{hash}.mxweb（内容寻址、不可变、天然去重）。
   * 转换读快照而非可变工作副本，避免执行时读到被覆盖的版本。
   * hash = md5(工作副本内容)，与 version-history 缓存一致；快照已存在则复用。
   * 返回 null 表示无法快照（路径缺失 / 工作副本不存在 / 未配置 uploads 目录）。
   */
  async snapshotMxweb(node: { path?: string }): Promise<{ snapshotPath: string; hash: string } | null> {
    if (!node.path || !this.mxcadUploadPath) return null;
    const workingCopyFullPath = this.storageManager.getFullPath(node.path);
    if (!fs.existsSync(workingCopyFullPath)) return null;
    const content = await fsPromises.readFile(workingCopyFullPath);
    const hash = crypto.createHash('md5').update(content).digest('hex');
    const snapshotPath = path.join(this.mxcadUploadPath, `${hash}.mxweb`);
    if (!fs.existsSync(snapshotPath)) {
      await fsPromises.copyFile(workingCopyFullPath, snapshotPath);
    }
    return { snapshotPath, hash };
  }

  /** 构造格式参数键（pdf 尺寸/颜色、dwg/dxf 版本），不同参数互不污染 */
  buildParamKey(
    format: CadDownloadFormat,
    pdfParams?: { width?: string; height?: string; colorPolicy?: string; dwgVersion?: number }
  ): string {
    const safe = (v: string | undefined) => (v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    if (format === CadDownloadFormat.PDF) {
      return `pdf-${safe(pdfParams?.width) || '2000'}x${safe(pdfParams?.height) || '2000'}-${safe(pdfParams?.colorPolicy) || 'mono'}`;
    } else if (format === CadDownloadFormat.DWG) {
      return pdfParams?.dwgVersion ? `dwg-v${pdfParams.dwgVersion}` : 'dwg';
    } else {
      return pdfParams?.dwgVersion ? `dxf-v${pdfParams.dwgVersion}` : 'dxf';
    }
  }

  /**
   * 构造转换产物缓存 key：`{hash}-{paramKey}`（内容寻址）。
   * - hash = md5(工作副本内容)，内容变更自动失效；
   * - pdf 尺寸/颜色、dwg/dxf 版本等参数参与 key，不同参数互不污染；
   * - 同内容不同参数 → 不同 key（互不覆盖）；同内容同参数 → 同 key（复用缓存）。
   * 返回 null 表示不启用缓存（未启用或无 hash）。
   */
  buildConversionCacheKey(
    hash: string,
    format: CadDownloadFormat,
    pdfParams?: { width?: string; height?: string; colorPolicy?: string; dwgVersion?: number }
  ): string | null {
    if (!this.conversionCacheDir || !this.conversionCacheTtlMs) return null;
    if (!hash) return null;
    return `${hash}-${this.buildParamKey(format, pdfParams)}`;
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

  /** 转换目标扩展名（dwg/dxf/pdf）：缓存文件名后缀与转换产物一致 */
  private conversionTargetExt(format: CadDownloadFormat): string {
    if (format === CadDownloadFormat.DWG) return '.dwg';
    if (format === CadDownloadFormat.DXF) return '.dxf';
    return '.pdf';
  }

  /**
   * 查转换缓存：同 hash+格式参数 命中且未过 TTL 返回缓存文件绝对路径，否则 null。
   * 供批量下载路径复用（与单文件 downloadNodeWithFormat 共享同一缓存目录与 key），
   * 让「重文件反复重提交」命中缓存秒回、不再重复起 mxcadassembly（ADR-0060）。
   */
  getFreshConversionCachePath(
    hash: string,
    format: CadDownloadFormat,
    pdfParams?: { width?: string; height?: string; colorPolicy?: string; dwgVersion?: number }
  ): string | null {
    const cacheKey = this.buildConversionCacheKey(hash, format, pdfParams);
    if (!cacheKey) return null;
    const cachePath = path.join(
      this.conversionCacheDir,
      `${cacheKey}${this.conversionTargetExt(format)}`
    );
    return this.isConversionCacheFresh(cachePath) ? cachePath : null;
  }

  /**
   * 写转换缓存：把转换产物 copy 到缓存目录（同 key 覆盖，产物内容等价）。
   * 用 copy 而非 rename——批量路径装配 ZIP 仍需原文件，不能移走；失败仅告警、不阻断下载（ADR-0060）。
   * 内容寻址时产物已在缓存位置（同路径），跳过 copy。
   */
  storeConversionCache(
    hash: string,
    format: CadDownloadFormat,
    srcFilePath: string,
    pdfParams?: { width?: string; height?: string; colorPolicy?: string; dwgVersion?: number }
  ): void {
    const cacheKey = this.buildConversionCacheKey(hash, format, pdfParams);
    if (!cacheKey) return;
    const cachePath = path.join(
      this.conversionCacheDir,
      `${cacheKey}${this.conversionTargetExt(format)}`
    );
    if (srcFilePath === cachePath) return;
    try {
      fs.mkdirSync(this.conversionCacheDir, { recursive: true });
      fs.copyFileSync(srcFilePath, cachePath);
    } catch (error) {
      this.logger.warn(
        `转换缓存写入失败（忽略，不影响本次下载）: ${(error as Error).message}`
      );
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

  /**
   * 后台预转换（#474 导出/下载接入统一队列）：把节点 mxweb 转成目标格式并放入转换产物缓存，
   * 供后续 downloadNodeWithFormat 命中新鲜缓存秒回。
   *
   * 复用 downloadNodeWithFormat 的 DWG/DXF/PDF 转换逻辑（convertServerFile + 缓存目录），
   * 但不产生响应流——只确保目标格式产物已就绪。可被 AsyncConversionService 后台 fire-and-forget 调用，
   * 使统一提交端点立即返回 202 + taskId，前端轮询队列状态到完成后再取文件。
   *
   * @returns { alreadyCached, cacheKey }：alreadyCached=true 表示无需真实转换
   *   （缓存命中 / mxweb 直下 / 非 CAD 文件 / 目录节点）；cacheKey 为转换产物缓存 key（未启用缓存时为 null）。
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
    }
  ): Promise<{ alreadyCached: boolean; cacheKey: string | null }> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) {
      throw new NotFoundException(I18nContext.current()?.t('error.node.not_found') ?? '节点不存在');
    }
    if (node.nodeType !== NodeType.FILE) {
      // 目录/非文件节点无格式转换可预计算
      return { alreadyCached: false, cacheKey: null };
    }

    const originalFilename = node.originalName || node.name;
    const ext = path.extname(originalFilename).toLowerCase();
    // mxweb 直下：无需转换
    if (format === CadDownloadFormat.MXWEB) {
      return { alreadyCached: true, cacheKey: null };
    }
    // 非 CAD 文件：无格式转换
    if (!['.dwg', '.dxf', '.mxweb'].includes(ext)) {
      return { alreadyCached: false, cacheKey: null };
    }
    if (!node.path) {
      throw new NotFoundException(I18nContext.current()?.t('error.file_extra.path_not_exist') ?? '文件路径不存在');
    }
    const mxwebPath = node.path;
    if (!(await this.storageService.fileExists(mxwebPath))) {
      throw new NotFoundException(I18nContext.current()?.t('error.file.mxweb_not_found') ?? 'MXWEB 文件不存在，请确认文件已转换完成');
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

    // 步骤 2：快照工作副本到 uploads/{hash}.mxweb（内容寻址），缓存键 {hash}-{paramKey}
    const snapshot = await this.snapshotMxweb(node);
    const hash = snapshot?.hash;
    const cacheKey = hash ? this.buildConversionCacheKey(hash, format, pdfParams) : null;
    const cachePath = cacheKey
      ? path.join(this.conversionCacheDir, `${cacheKey}${targetExt}`)
      : null;
    if (cachePath && this.isConversionCacheFresh(cachePath)) {
      return { alreadyCached: true, cacheKey };
    }

    // 频率占位（与同步下载路径一致）；缓存命中已在上方提前返回，此处必发生真实转换
    if (userId) {
      await this.restrictionEngine.reserveConversionCountOrThrow(userId);
    }

    const srcPath = (snapshot?.snapshotPath || this.storageManager.getFullPath(mxwebPath)).replace(/\\/g, '/');
    const outname = cacheKey ? `${cacheKey}${targetExt}` : targetFilename;

    const conversionOptions: ConvertServerFileParam = {
      srcPath,
      fileHash: node.fileHash || '',
      nodeId: node.id,
      userId,
      outname,
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

    const mxCadConversionService = await this.getMxCadConversionService();
    const result = await mxCadConversionService.convertServerFile(conversionOptions);
    const resultObj = result as Record<string, unknown>;
    if (!resultObj || typeof resultObj.code !== 'number' || resultObj.code !== 0) {
      const errMsg = resultObj?.message || '文件转换失败';
      if (userId) {
        await this.restrictionEngine.releaseConversionCount(userId);
      }
      throw new BadRequestException(I18nContext.current()?.t('error.file_extra.conversion_failed_detail', { args: { error: errMsg } }) ?? `文件转换失败: ${errMsg}`);
    }

    // 引擎把 outname 写到 srcPath 同目录：产物 = dirname(srcPath)/outname
    const targetFullPath = path.join(path.dirname(srcPath), outname);
    if (!fs.existsSync(targetFullPath)) {
      if (userId) {
        await this.restrictionEngine.releaseConversionCount(userId);
      }
      throw new NotFoundException(I18nContext.current()?.t('error.file_extra.converted_file_not_exist', { args: { path: outname } }) ?? `转换后的文件不存在: ${outname}`);
    }
    // 产物移入缓存目录（内容寻址时产物已在缓存位置，无需移动）
    if (cachePath && targetFullPath !== cachePath) {
      try {
        fs.mkdirSync(this.conversionCacheDir, { recursive: true });
        fs.renameSync(targetFullPath, cachePath);
      } catch (moveErr) {
        // 缓存目录不可写时降级：产物留在原路径，后续 downloadNodeWithFormat 直读
        this.logger.warn(`预转换缓存写入失败，产物留在原路径直读: ${(moveErr as Error).message}`);
      }
    }

    this.logger.log(`预转换完成: ${originalFilename} -> ${outname} (${nodeId}) by user ${userId}`);
    return { alreadyCached: false, cacheKey };
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

          // ── 步骤 2：快照工作副本到 uploads/{hash}.mxweb（内容寻址、不可变），缓存键 {hash}-{paramKey} ──
          // 转换读快照而非可变工作副本，避免执行时读到被覆盖的版本。
          // 产物落 uploads/{hash}-{paramKey}{ext}（内容寻址），与缓存文件同路径，无需移动。
          // 注意：命中检查必须先于转换配额占位——缓存命中不发生真实转换，不应扣次数。
          const snapshot = await this.snapshotMxweb(node);
          const hash = snapshot?.hash;
          const cacheKey = hash ? this.buildConversionCacheKey(hash, format, pdfParams) : null;
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

          const srcPath = (snapshot?.snapshotPath || this.storageManager.getFullPath(mxwebPath)).replace(/\\/g, '/');
          const outname = cacheKey ? `${cacheKey}${targetExt}` : targetFilename;

          const conversionOptions: ConvertServerFileParam = {
            srcPath,
            fileHash: node.fileHash || '',
            nodeId: node.id,
            userId,
            outname,
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
            `开始转换文件: ${originalFilename} -> ${outname}`
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

          // 引擎把 outname 写到 srcPath 同目录：产物 = dirname(srcPath)/outname
          const targetFullPath = path.join(path.dirname(srcPath), outname);

          if (!fs.existsSync(targetFullPath)) {
            throw new NotFoundException(I18nContext.current()?.t('error.file_extra.converted_file_not_exist', { args: { path: outname } }) ?? `转换后的文件不存在: ${outname}`);
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