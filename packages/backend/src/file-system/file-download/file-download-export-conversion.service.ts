///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import * as crypto from 'crypto';

import { MXCAD_CONVERSION_SERVICE } from '../../common/di-tokens';
import type { IMxcadConversionService } from '../../mxcad/interfaces/mxcad-conversion.interface';

import { I18nContext } from 'nestjs-i18n';
import { FileUtils } from '../../common/utils/file-utils';
import { resolveMxcadUploadDir } from '../../common/utils/mxcad-upload-dir';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import {
  conversionTargetExt,
  formatUnsupportedMessage,
  isConvertibleSourceExt,
  resolveOutputFormat,
} from './format-policy';
import {
  ConversionCoreError,
  runConversionCore,
} from './conversion-core';

/**
 * 转换产物缓存文件名判据：`{hash}-{paramKey}{ext}`。
 * hash = 32 位 md5 hex；paramKey 与 buildParamKey 同形（pdf-{w}x{h}-{color} /
 * dwg[-vN] / dxf[-vN]，参数段为 safe() 后的 ≤8 位字母数字）；ext 与
 * conversionTargetExt 一致（.pdf/.dwg/.dxf）。
 * 清理 cron 用它在缓存目录中只删转换产物，不误删同目录的内容寻址快照
 * （{hash}.mxweb）与其他文件。
 */
const CONVERSION_CACHE_ENTRY_RE =
  /^[0-9a-f]{32}-(?:pdf-[a-zA-Z0-9]{0,8}x[a-zA-Z0-9]{0,8}-[a-zA-Z0-9]{0,8}\.pdf|dwg(?:-v\d+)?\.dwg|dxf(?:-v\d+)?\.dxf)$/;

export function isConversionCacheEntry(entryName: string): boolean {
  return CONVERSION_CACHE_ENTRY_RE.test(entryName);
}

/**
 * 导出/下载的「转换产物缓存 + 预转换」职责（从 FileDownloadExportService 拆出）。
 *
 * 只做与转换产物（快照/缓存 key/产物名/缓存读写/后台预转换）有关的纯计算与
 * 落盘——不产生响应流、不做审计、不打包 ZIP。共享转换核心与格式策略继续复用
 * conversion-core / format-policy（单一事实源不变）。
 *
 * 单文件 downloadNodeWithFormat 的 E2b-E2f（缓存查找→转换→缓存落位）与本服务的
 * precomputeExport 是近重复：两边都经本服务的缓存 helper 与 runConversionCore，
 * 差异仅在「是否产流 + 是否审计」。本服务只收敛共享的缓存/快照/预转换逻辑，
 * 不做两处转换流的合并（保持 downloadNodeWithFormat 的流所有权与临时文件清理语义）。
 */
@Injectable()
export class FileDownloadExportConversionService {
  private readonly logger = new Logger(
    FileDownloadExportConversionService.name
  );
  private mxCadConversionService: IMxcadConversionService | null = null;

  private readonly fileLimits: {
    maxFilenameLength: number;
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
    private readonly moduleRef: ModuleRef,
    private readonly restrictionEngine: RestrictionEngine
  ) {
    const limits = this.configService.get('fileLimits', { infer: true });
    this.fileLimits = {
      maxFilenameLength: limits.maxFilenameLength,
    };
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    this.mxcadUploadPath = resolveMxcadUploadDir(this.configService);
    this.conversionCacheDir =
      this.mxcadUploadPath || batchConfig?.conversionCacheDir || '';
    this.conversionCacheTtlMs =
      (batchConfig?.conversionCacheTtlHours || 0) * 60 * 60 * 1000;
  }

  /**
   * 快照工作副本到 uploads/{hash}.mxweb（内容寻址、不可变、天然去重）。
   * 转换读快照而非可变工作副本，避免执行时读到被覆盖的版本。
   * hash = md5(工作副本内容)，与 version-history 缓存一致；快照已存在则复用。
   * 返回 null 表示无法快照（路径缺失 / 工作副本不存在 / 未配置 uploads 目录）。
   */
  async snapshotMxweb(node: {
    path?: string;
  }): Promise<{ snapshotPath: string; hash: string } | null> {
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
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): string {
    const safe = (v: string | undefined) =>
      (v || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    // 引擎参数默认值单一出口（FormatPolicy）：缓存 key 从与转换同一份
    // resolved 参数派生，避免第二份默认值副本与实际转换参数漂移
    const engineParams = resolveOutputFormat(format, pdfParams).engineParams;
    if (format === CadDownloadFormat.PDF) {
      return `pdf-${safe(engineParams?.width)}x${safe(engineParams?.height)}-${safe(engineParams?.colorPolicy)}`;
    } else if (format === CadDownloadFormat.DWG) {
      return engineParams?.dwgVersion ? `dwg-v${engineParams.dwgVersion}` : 'dwg';
    } else {
      return engineParams?.dwgVersion ? `dxf-v${engineParams.dwgVersion}` : 'dxf';
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
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): string | null {
    if (!this.conversionCacheDir || !this.conversionCacheTtlMs) return null;
    if (!hash) return null;
    return `${hash}-${this.buildParamKey(format, pdfParams)}`;
  }

  /**
   * 转换产物名（内容寻址）的单一出口：`{hash}-{paramKey}{targetExt}`。
   *
   * 与缓存启用与否无关（缓存路径 = 本名 join 缓存目录），单文件导出（outname/cachePath）
   * 与批量下载（conversion-runner 的 outname）共用同一实现，保证两侧产物名字节一致、
   * 缓存双向命中。扩展名统一取自 resolveOutputFormat（经 conversionTargetExt），
   * 不再让各调用点分别拼 `${cacheKey}${conversionTargetExt(format)}` /
   * `${cacheKey}${resolved.targetExt}` / runner 手拼 `${hash}-${paramKey}${targetExt}`。
   * 无 hash 返回空串。
   */
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
    if (!hash) return '';
    return `${hash}-${this.buildParamKey(format, pdfParams)}${conversionTargetExt(format)}`;
  }

  /** 缓存命中且未过 TTL（mtime 惰性检查）；过期文件顺带删除 */
  isConversionCacheFresh(cachePath: string): boolean {
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

  /**
   * 查转换缓存：同 hash+格式参数 命中且未过 TTL 返回缓存文件绝对路径，否则 null。
   * 供批量下载路径复用（与单文件 downloadNodeWithFormat 共享同一缓存目录与 key），
   * 让「重文件反复重提交」命中缓存秒回、不再重复起 mxcadassembly（ADR-0060）。
   */
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
    const cacheKey = this.buildConversionCacheKey(hash, format, pdfParams);
    if (!cacheKey) return null;
    const cachePath = path.join(
      this.conversionCacheDir,
      this.buildConversionArtifactName(hash, format, pdfParams)
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
    pdfParams?: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    }
  ): void {
    const cacheKey = this.buildConversionCacheKey(hash, format, pdfParams);
    if (!cacheKey) return;
    const cachePath = path.join(
      this.conversionCacheDir,
      this.buildConversionArtifactName(hash, format, pdfParams)
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

  private async getMxcadConversionService(): Promise<IMxcadConversionService> {
    if (!this.mxCadConversionService) {
      this.mxCadConversionService = this.moduleRef.get<IMxcadConversionService>(
        MXCAD_CONVERSION_SERVICE,
        { strict: false }
      );
    }
    return this.mxCadConversionService;
  }

  private sanitizeFileName(fileName: string): string {
    return FileUtils.sanitizeDownloadFilename(
      fileName,
      this.fileLimits.maxFilenameLength
    );
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
    },
    // 后台预转换（convertNodeForExport）透传：priority 进内层限流器队列档位，
    // taskId（node.taskId）远端模式按 clientTaskId 别名登记
    priority?: 'high' | 'low',
    taskId?: string
  ): Promise<{ alreadyCached: boolean; cacheKey: string | null }> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
    });
    if (!node) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.node.not_found') ?? '节点不存在'
      );
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
    // 非 CAD 文件：无格式转换（可转换源扩展名单一事实源在 FormatPolicy）
    if (!isConvertibleSourceExt(ext)) {
      return { alreadyCached: false, cacheKey: null };
    }
    if (!node.path) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file_extra.path_not_exist') ??
          '文件路径不存在'
      );
    }
    const mxwebPath = node.path;
    if (!(await this.storageService.fileExists(mxwebPath))) {
      throw new NotFoundException(
        I18nContext.current()?.t('error.file.mxweb_not_found') ??
          'MXWEB 文件不存在，请确认文件已转换完成'
      );
    }

    // 格式决策单一出口（FormatPolicy）：targetExt/引擎参数默认值由此派生；
    // 未知格式在此显式抛错，不再静默当 PDF 产出错误内容
    const resolved = resolveOutputFormat(format, pdfParams);
    if (!resolved.needsConversion) {
      // 直取格式（original/mxweb）没有可预转换的产物：显式报错，
      // 与 conversion-runner 的直取格式守卫同文案（否则会产出无扩展名垃圾文件）
      throw new BadRequestException(formatUnsupportedMessage(format));
    }
    const targetExt = resolved.targetExt;
    const targetFilename = `${this.sanitizeFileName(
      path.basename(originalFilename, ext)
    )}${targetExt}`;

    // 步骤 2：快照工作副本到 uploads/{hash}.mxweb（内容寻址），缓存键 {hash}-{paramKey}
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
    if (cachePath && this.isConversionCacheFresh(cachePath)) {
      return { alreadyCached: true, cacheKey };
    }

    const srcPath = (
      snapshot?.snapshotPath || this.storageManager.getFullPath(mxwebPath)
    ).replace(/\\/g, '/');
    const outname = cacheKey ? artifactName : targetFilename;

    // 共享转换核心（构造参数 → 调引擎 → 校验产物）。占位/释放走 withConversionQuota
    // 单点（缓存命中已在上方提前返回，此处必发生真实转换）：成功消耗占位，
    // 任何失败（含引擎原始异常 spawn 失败 / VIP 门控拒绝）保证释放；
    // 调用点只负责按本地化文案翻译错误。
    let targetFullPath: string;
    try {
      targetFullPath = await this.restrictionEngine.withConversionQuota(
        { userId },
        async () => {
          const mxCadConversionService = await this.getMxcadConversionService();
          const { artifactPath } = await runConversionCore({
            conversionService: mxCadConversionService,
            srcPath,
            fileHash: node.fileHash || '',
            nodeId: node.id,
            userId,
            outname,
            engineParams: resolved.engineParams,
            ...(priority ? { priority } : {}),
            ...(taskId ? { taskId } : {}),
          });
          return artifactPath;
        }
      );
    } catch (error) {
      if (error instanceof ConversionCoreError) {
        if (error.kind === 'engine-failed') {
          const errMsg = error.detail || '文件转换失败';
          throw new BadRequestException(
            I18nContext.current()?.t('error.file_extra.conversion_failed_detail', {
              args: { error: errMsg },
            }) ?? `文件转换失败: ${errMsg}`
          );
        }
        throw new NotFoundException(
          I18nContext.current()?.t('error.file_extra.converted_file_not_exist', {
            args: { path: error.detail },
          }) ?? `转换后的文件不存在: ${error.detail}`
        );
      }
      throw error;
    }
    // 产物移入缓存目录（内容寻址时产物已在缓存位置，无需移动）
    if (cachePath && targetFullPath !== cachePath) {
      try {
        fs.mkdirSync(this.conversionCacheDir, { recursive: true });
        fs.renameSync(targetFullPath, cachePath);
      } catch (moveErr) {
        // 缓存目录不可写时降级：产物留在原路径，后续 downloadNodeWithFormat 直读
        this.logger.warn(
          `预转换缓存写入失败，产物留在原路径直读: ${(moveErr as Error).message}`
        );
      }
    }

    this.logger.log(
      `预转换完成: ${originalFilename} -> ${outname} (${nodeId}) by user ${userId}`
    );
    return { alreadyCached: false, cacheKey };
  }
}
