import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { MXCAD_CONVERSION_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';
import type { IMxcadConversionService } from '../mxcad/interfaces/mxcad-conversion.interface';
import type { ConvertServerFileParam } from '../mxcad/types/mxcad-context.types';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { QuotaExceededException } from '../vip/errors/quota-exceeded.error';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { PublicFileService } from '../public-file/public-file.service';
import { CadDownloadFormat } from '../file-system/dto/download-node.dto';
import {
  IFunctionExecutor,
  type BatchConversionTask,
} from '../function-executor/function-executor.interface';
import {
  formatUnsupportedMessage,
  resolveOutputFormat,
} from '../file-system/file-download/format-policy';
import * as path from 'path';
import * as fs from 'fs';

class Semaphore {
  private current = 0;
  private queue: (() => void)[] = [];

  constructor(private maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.maxConcurrency) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  async runWithLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export interface ConversionResult {
  filePath: string;
  format: string;
  success: boolean;
  error?: string;
}

export interface ConvertRequest {
  node: {
    id: string;
    fileHash?: string;
    path?: string;
    name: string;
  };
  format: string;
  pdfParams?: {
    width?: string;
    height?: string;
    colorPolicy?: string;
    dwgVersion?: number;
  };
}

@Injectable()
export class ConversionRunner {
  private readonly logger = new Logger(ConversionRunner.name);
  private mxCadConversionService: IMxcadConversionService | null = null;
  private semaphore: Semaphore;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly configService: ConfigService,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly publicFileService: PublicFileService,
    // 统一任务层 seam：注入的执行器带可选批量原语（submitBatch/waitBatch，
    // BATCH_DOWNLOAD_DELEGATE_WORKFLOW 时由 FunctionExecutorModule 包装）则批量
    // 委托 conversion-service；否则逐项进程内转换。
    @Inject(IFunctionExecutor)
    private readonly executor: IFunctionExecutor
  ) {
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    const maxConcurrency = batchConfig?.maxConcurrency || 3;
    this.semaphore = new Semaphore(maxConcurrency);
  }

  /**
   * 解析转换源文件（内容寻址快照）：
   * - node.path 存在：快照工作副本到 uploads/{hash}.mxweb（既有行为）
   * - 否则 node.fileHash 存在（CAD 编辑器内存导出上传的临时文件）：按 fileHash 在 uploads
   *   目录定位（源文件已内容寻址 uploads/{fileHash}.mxweb，无需再快照）
   * - 都无返回 null（调用方记错）
   */
  private async resolveSource(
    node: ConvertRequest['node']
  ): Promise<{ snapshotPath: string; hash: string } | null> {
    if (node.path) {
      return this.fileDownloadExportService.snapshotMxweb(node);
    }
    if (node.fileHash) {
      const resolvedPath = await this.publicFileService.findMxwebFile(
        node.fileHash
      );
      return resolvedPath
        ? { snapshotPath: resolvedPath, hash: node.fileHash }
        : null;
    }
    return null;
  }

  /**
   * 目标格式派生：输出扩展名、下载格式枚举、引擎参数。
   *
   * 单一事实源在 FormatPolicy.resolveOutputFormat（委托路径 buildBatchTask 与
   * 进程内路径 convertInProcess 共用，默认值与格式分支不再各写一份——漏抄即
   * 静默丢参数，368ca55 漏抄 6 个裁剪框字段即此类）。直取格式（mxweb/original）
   * 与未知格式显式报错，不再静默当成 PDF 产出错误内容。
   */
  private resolveTarget(
    format: string,
    pdfParams?: ConvertRequest['pdfParams']
  ): {
    targetExt: string;
    cadFormat: CadDownloadFormat;
    params: {
      width?: string;
      height?: string;
      colorPolicy?: string;
      dwgVersion?: number;
    };
  } {
    const resolved = resolveOutputFormat(format, pdfParams);
    if (!resolved.needsConversion || !resolved.cadFormat) {
      throw new Error(formatUnsupportedMessage(format));
    }
    return {
      targetExt: resolved.targetExt,
      cadFormat: resolved.cadFormat,
      params: resolved.engineParams ?? {},
    };
  }

  /**
   * 注入的执行器是否带批量原语（BATCH_DOWNLOAD_DELEGATE_WORKFLOW 包装出的
   * 委托能力）。批量下载编排层据此选择批量路径；本类据此选择委托或逐项进程内。
   */
  hasBatchDelegate(): boolean {
    return (
      typeof this.executor?.submitBatch === 'function' &&
      typeof this.executor?.waitBatch === 'function'
    );
  }

  private async getConversionService(): Promise<IMxcadConversionService> {
    if (!this.mxCadConversionService) {
      this.mxCadConversionService = this.moduleRef.get<IMxcadConversionService>(
        MXCAD_CONVERSION_SERVICE,
        { strict: false }
      );
    }
    return this.mxCadConversionService;
  }

  /**
   * 转换单个文件。
   * - 注入的执行器带批量原语时提交单个任务给 conversion-service（batchConvert 支持单任务），
   *   workflow 不可达自动回退进程内转换。
   * - 否则进程内调用 mxcad conversionService（Semaphore 限流）。
   * @param userId 批量下载发起用户（ADR-0043：转换频率限制在转换执行点占位；超限返回失败结果）
   */
  async convertFile(
    node: ConvertRequest['node'],
    format: string,
    pdfParams?: ConvertRequest['pdfParams'],
    userId?: string
  ): Promise<ConversionResult> {
    const [result] = await this.convertMany(
      [{ node, format, pdfParams }],
      userId
    );
    return result;
  }

  /**
   * 批量转换：
   * - 执行器带批量原语时，一次性提交所有任务到 conversion-service
   *   （POST /v1/conversions/batchConvert，经 executor.submitBatch/waitBatch），
   *   收集 results 中 success=true 的 outputPath 并按入参顺序映射为 ConversionResult；
   *   服务不可达/熔断时记录错误并逐任务回退进程内转换。
   * - 否则逐任务进程内转换。
   * @param userId 批量下载发起用户（ADR-0043：每个转换任务占位一次，失败任务释放）
   */
  async convertMany(
    requests: ConvertRequest[],
    userId?: string
  ): Promise<ConversionResult[]> {
    if (requests.length === 0) return [];

    // 导出下载方向会员门控（mxweb → 其他格式）：批量下载即导出下载，请求级检查一次。
    // 必须在此显式检查——批量转换可能走 workflow 远程委托（conversion-service 进程），
    // 不经 FileConversionService.convertFile 的转换级门控；此检查覆盖两条路径。
    await this.restrictionEngine.assertExportDownloadAllowed(userId);

    // ADR-0043：转换频率占位——每个转换任务 1 次；超限任务返回失败结果，其余继续。
    // 无 userId（内部调用）不占位也不限制。
    const reserved = new Array<boolean>(requests.length).fill(!userId);
    const quotaMessages = new Array<string | null>(requests.length).fill(null);
    try {
      for (let i = 0; i < requests.length; i++) {
        if (!userId) continue;
        try {
          await this.restrictionEngine.reserveConversionCountOrThrow(userId);
          reserved[i] = true;
        } catch (error) {
          if (!(error instanceof QuotaExceededException)) throw error;
          quotaMessages[i] = error.message;
        }
      }
    } catch (error) {
      // 占位循环中途异常：释放已占位的额度再向上抛（避免残留）
      await Promise.all(
        reserved.map((r, i) =>
          r && userId
            ? this.restrictionEngine
                .releaseConversionCount(userId)
                .catch(() => undefined)
            : undefined
        )
      );
      throw error;
    }

    const releaseIfReserved = async (index: number, success: boolean) => {
      if (success || !reserved[index] || !userId) return;
      await this.restrictionEngine
        .releaseConversionCount(userId)
        .catch(() => undefined);
    };

    const quotaFailure = (i: number): ConversionResult => ({
      filePath: '',
      format: requests[i]!.format,
      success: false,
      error: quotaMessages[i] ?? '图纸转换过于频繁，请稍后再试',
    });

    // 执行器无批量原语（或执行器未接线）：直接走进程内转换
    if (!this.hasBatchDelegate()) {
      const results = await Promise.all(
        requests.map((r, i) => {
          if (!reserved[i]) {
            return quotaFailure(i);
          }
          return this.convertInProcess(r.node, r.format, r.pdfParams, userId);
        })
      );
      await Promise.all(results.map((r, i) => releaseIfReserved(i, r.success)));
      return results;
    }

    const results: ConversionResult[] = new Array(requests.length);
    const valid: Array<{
      index: number;
      request: ConvertRequest;
      snapshot: { snapshotPath: string; hash: string };
    }> = [];

    // 步骤 1：提交时快照工作副本到 uploads/{hash}.mxweb（内容寻址、不可变），转换读快照而非可变工作副本
    for (let index = 0; index < requests.length; index++) {
      const request = requests[index]!;
      if (!reserved[index]) {
        results[index] = quotaFailure(index);
        continue;
      }
      // 直取格式（mxweb/original）/未知格式不进转换层：显式报错而非静默当 PDF
      // 产出错误内容（fileHash-only 项请求直取格式时源无法直取，同样报错）
      const resolved = resolveOutputFormat(request.format, request.pdfParams);
      if (!resolved.needsConversion || !resolved.cadFormat) {
        results[index] = {
          filePath: '',
          format: request.format,
          success: false,
          error: formatUnsupportedMessage(request.format),
        };
        continue;
      }
      // 源文件解析：node.path 走快照；fileHash-only（内存导出）按 fileHash 定位
      const snapshot = await this.resolveSource(request.node);
      if (!snapshot) {
        results[index] = {
          filePath: '',
          format: request.format,
          success: false,
          error: 'Source file not found',
        };
        continue;
      }
      // 转换缓存命中（同 hash+格式参数）：直接复用新鲜产物，不提交转换服务
      // （与进程内 convertInProcess 路径一致，ADR-0060；配额随 success 在尾部释放）
      const cachedPath =
        this.fileDownloadExportService.getFreshConversionCachePath(
          snapshot.hash,
          resolved.cadFormat,
          request.pdfParams
        );
      if (cachedPath) {
        this.logger.log(
          `批量转换缓存命中: ${request.node.name} -> ${cachedPath}`
        );
        results[index] = {
          filePath: cachedPath,
          format: request.format,
          success: true,
        };
        continue;
      }
      valid.push({ index, request, snapshot });
    }

    if (valid.length === 0) {
      await Promise.all(results.map((r, i) => releaseIfReserved(i, r.success)));
      return results;
    }

    try {
      const tasks = valid.map((v) =>
        this.buildBatchTask(v.request, v.snapshot)
      );
      const { batchId } = await this.executor.submitBatch!(tasks);
      const terminal = await this.executor.waitBatch!(batchId);
      const byId = new Map(terminal.results.map((r) => [r.id, r]));

      valid.forEach((v) => {
        const out = byId.get(`${v.request.node.id}:${v.request.format}`);
        if (!out) {
          results[v.index] = {
            filePath: '',
            format: v.request.format,
            success: false,
            error: 'Workflow returned no result for task',
          };
          return;
        }
        if (!out.success) {
          results[v.index] = {
            filePath: '',
            format: v.request.format,
            success: false,
            error: out.error || 'Conversion failed',
          };
          return;
        }
        if (!out.outputPath) {
          results[v.index] = {
            filePath: '',
            format: v.request.format,
            success: false,
            error: 'Converted file not found',
          };
          return;
        }
        results[v.index] = {
          filePath: out.outputPath,
          format: v.request.format,
          success: true,
        };
      });

      await Promise.all(results.map((r, i) => releaseIfReserved(i, r.success)));
      return results;
    } catch (err) {
      this.logger.warn(
        `Workflow conversion unavailable (${(err as Error).message}), falling back to in-process for ${valid.length} task(s)`
      );
      const fallback = await Promise.all(
        valid.map((v) =>
          this.convertInProcess(
            v.request.node,
            v.request.format,
            v.request.pdfParams,
            userId
          )
        )
      );
      fallback.forEach((r, i) => {
        results[valid[i].index] = r;
      });
      await Promise.all(results.map((r, i) => releaseIfReserved(i, r.success)));
      return results;
    }
  }

  private buildBatchTask(
    request: ConvertRequest,
    snapshot: { snapshotPath: string; hash: string }
  ): BatchConversionTask {
    const node = request.node;
    const { targetExt, cadFormat, params } = this.resolveTarget(
      request.format,
      request.pdfParams
    );
    const paramKey = this.fileDownloadExportService.buildParamKey(
      cadFormat,
      request.pdfParams
    );
    return {
      id: `${node.id}:${request.format}`,
      // 步骤 2：srcPath 指内容寻址快照（uploads/{hash}.mxweb）；outname 版本绑定（{hash}-{paramKey}{targetExt}）
      // → 产物落 uploads/{hash}-{paramKey}{targetExt}（= 缓存路径，内容寻址）；ZIP 条目名仍用原文件名（sanitized，独立计算）
      srcPath: snapshot.snapshotPath.replace(/\\/g, '/'),
      fileHash: node.fileHash || '',
      outname: `${snapshot.hash}-${paramKey}${targetExt}`,
      ...params,
    };
  }

  private async convertInProcess(
    node: ConvertRequest['node'],
    format: string,
    pdfParams?: ConvertRequest['pdfParams'],
    userId?: string
  ): Promise<ConversionResult> {
    return this.semaphore.runWithLock(async () => {
      try {
        // 步骤 1：解析源文件——node.path 走工作副本快照；fileHash-only（内存导出）按 fileHash 定位
        const snapshot = await this.resolveSource(node);
        if (!snapshot) {
          return {
            filePath: '',
            format,
            success: false,
            error: 'Source file not found',
          };
        }

        const { targetExt, cadFormat, params } = this.resolveTarget(
          format,
          pdfParams
        );
        const paramKey = this.fileDownloadExportService.buildParamKey(
          cadFormat,
          pdfParams
        );
        // 产物版本绑定：outname = {hash}-{paramKey}{targetExt}，产物落 srcPath 同目录（uploads/{hash}-{paramKey}{targetExt} = 缓存路径）
        const outname = `${snapshot.hash}-${paramKey}${targetExt}`;

        // 转换缓存命中（同 hash+格式参数）：直接复用缓存产物，不再起 mxcadassembly（ADR-0060）
        const cachedPath =
          this.fileDownloadExportService.getFreshConversionCachePath(
            snapshot.hash,
            cadFormat,
            pdfParams
          );
        if (cachedPath) {
          this.logger.log(`批量转换缓存命中: ${node.name} -> ${outname}`);
          return { filePath: cachedPath, format, success: true };
        }

        const conversionOptions: ConvertServerFileParam = {
          srcPath: snapshot.snapshotPath.replace(/\\/g, '/'),
          fileHash: node.fileHash || '',
          nodeId: node.id,
          userId,
          outname,
          createPreloadingData: false,
          priority: 'low',
          ...params,
        };

        const conversionService = await this.getConversionService();
        const result =
          await conversionService.convertServerFile(conversionOptions);

        if (result.code !== 0) {
          const errMsg = result.message || 'Conversion failed';
          return { filePath: '', format, success: false, error: errMsg };
        }

        // 引擎把 outname 写到 srcPath 同目录（uploads/）：产物 = uploads/{hash}{targetExt}
        const targetFullPath = path.join(
          path.dirname(snapshot.snapshotPath),
          outname
        );

        if (!fs.existsSync(targetFullPath)) {
          return {
            filePath: '',
            format,
            success: false,
            error: `Converted file not found: ${outname}`,
          };
        }

        // 转换产物写入缓存目录复用（copy 而非 rename，ZIP 装配仍需原文件；ADR-0060）
        this.fileDownloadExportService.storeConversionCache(
          snapshot.hash,
          cadFormat,
          targetFullPath,
          pdfParams
        );

        return { filePath: targetFullPath, format, success: true };
      } catch (err) {
        this.logger.error(
          `Conversion failed for ${node.name} to ${format}: ${err.message}`
        );
        return { filePath: '', format, success: false, error: err.message };
      }
    });
  }

  async cleanupConvertedFile(filePath: string): Promise<void> {
    // 步骤 1：跳过 uploads/ 下内容寻址条目（共享快照/产物缓存，不能被首个任务 unlink）
    const mxcadUploadPath =
      this.configService.get<string>('mxcadUploadPath') || '';
    if (mxcadUploadPath) {
      const uploadsRoot = mxcadUploadPath.replace(/\\/g, '/');
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.startsWith(`${uploadsRoot}/`)) {
        return;
      }
    }
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to clean up converted file: ${filePath} - ${err.message}`
      );
    }
  }
}
