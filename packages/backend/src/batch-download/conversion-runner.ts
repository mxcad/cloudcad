import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { IStorageService } from '../storage/interfaces/storage-service.interface';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { MXCAD_CONVERSION_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';
import type { IMxcadConversionService } from '../mxcad/interfaces/mxcad-conversion.interface';
import type { ConvertServerFileParam } from '../mxcad/types/mxcad-context.types';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { QuotaExceededException } from '../vip/errors/quota-exceeded.error';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { PublicFileService } from '../public-file/public-file.service';
import { CadDownloadFormat } from '../file-system/dto/download-node.dto';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { internalServiceSecretHeader } from '../common/utils';

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

export interface WorkflowConvertTask {
  id: string;
  srcPath: string;
  fileHash: string;
  outname: string;
  width?: string;
  height?: string;
  colorPolicy?: string;
  dwgVersion?: number;
}

export interface ConvertRequest {
  node: {
    id: string;
    fileHash?: string;
    path?: string;
    name: string;
    /** 节点 updatedAt：转换缓存 key 的失效维度（节点更新→key 变→旧缓存失效，ADR-0060） */
    updatedAt?: Date;
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
  private readonly delegateWorkflow: boolean;
  private readonly conversionServiceUrl: string;
  private readonly conversionServiceSecret: string;
  private readonly internalSecretHeaders: Record<string, string>;
  private readonly workflowPollIntervalMs: number;
  private readonly workflowTimeoutMs: number;
  private readonly workflowHttpTimeoutMs: number;
  private workflowCooldownUntil = 0;
  private static readonly WORKFLOW_COOLDOWN_MS = 60_000;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(IStorageService) private readonly storageService: any,
    private readonly storageManager: StorageManager,
    private readonly configService: ConfigService,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly publicFileService: PublicFileService
  ) {
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    const maxConcurrency = batchConfig?.maxConcurrency || 3;
    this.semaphore = new Semaphore(maxConcurrency);
    this.delegateWorkflow = !!batchConfig?.delegateWorkflow;
    const workflowUrl = batchConfig?.conversionServiceUrl;
    const envWorkflowUrl = this.configService.get<string>(
      'CONVERSION_SERVICE_URL'
    );
    this.conversionServiceUrl =
      typeof workflowUrl === 'string' && workflowUrl
        ? workflowUrl
        : typeof envWorkflowUrl === 'string' && envWorkflowUrl
          ? envWorkflowUrl
          : 'http://localhost:3100';
    const envSecret = this.configService.get<string>(
      'CONVERSION_SERVICE_SECRET'
    );
    this.conversionServiceSecret =
      typeof envSecret === 'string' && envSecret ? envSecret : '';
    // #419：统一内网共享密钥 header（与旧 X-Conversion-Service-Secret 并存，服务端任一匹配即放行）
    this.internalSecretHeaders = internalServiceSecretHeader(
      this.configService.get<string>('INTERNAL_SERVICE_SECRET')
    );
    this.workflowPollIntervalMs = batchConfig?.workflowPollIntervalMs || 1500;
    this.workflowTimeoutMs = batchConfig?.workflowTimeoutMs || 10 * 60 * 1000;
    this.workflowHttpTimeoutMs = Math.min(this.workflowTimeoutMs, 60_000);
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
   * 是否委托 conversion-service 服务（与熔断状态无关的开关）
   */
  isDelegated(): boolean {
    return this.delegateWorkflow;
  }

  private shouldDelegateWorkflow(): boolean {
    if (!this.delegateWorkflow) return false;
    if (Date.now() < this.workflowCooldownUntil) return false;
    return true;
  }

  private markWorkflowUnavailable(): void {
    this.workflowCooldownUntil =
      Date.now() + ConversionRunner.WORKFLOW_COOLDOWN_MS;
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
   * - 委托开启时提交单个任务给 conversion-service（batchConvert 支持单任务），workflow 不可达自动回退进程内转换。
   * - 委托关闭时进程内调用 mxcad conversionService（Semaphore 限流）。
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
   * 批量转换（委托 conversion-service）：
   * 一次性提交所有任务到 POST /v1/conversions/batchConvert，轮询 GET /v1/conversions/tasks/:taskId 直至终态，
   * 收集 results 中 success=true 的 outputPath 并按入参顺序映射为 ConversionResult。
   * workflow 服务不可达时记录错误并逐任务回退进程内转换。
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

    // 开关关闭或处于 workflow 熔断期：直接走进程内转换
    if (!this.shouldDelegateWorkflow()) {
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
      valid.push({ index, request, snapshot });
    }

    if (valid.length === 0) {
      await Promise.all(results.map((r, i) => releaseIfReserved(i, r.success)));
      return results;
    }

    try {
      const tasks = valid.map((v) =>
        this.buildWorkflowTask(v.request, v.snapshot)
      );
      const { taskId } = await this.submitBatch(tasks);
      const terminal = await this.pollTask(taskId);
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
      this.markWorkflowUnavailable();
      this.logger.warn(
        `Workflow conversion unavailable (${err.message}), falling back to in-process for ${valid.length} task(s)`
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

  private buildWorkflowTask(
    request: ConvertRequest,
    snapshot: { snapshotPath: string; hash: string }
  ): WorkflowConvertTask {
    const node = request.node;
    const targetExt =
      request.format === 'dwg'
        ? '.dwg'
        : request.format === 'dxf'
          ? '.dxf'
          : '.pdf';
    const cadFormat =
      request.format === 'dwg'
        ? CadDownloadFormat.DWG
        : request.format === 'dxf'
          ? CadDownloadFormat.DXF
          : CadDownloadFormat.PDF;
    const paramKey = this.fileDownloadExportService.buildParamKey(
      cadFormat,
      request.pdfParams
    );
    const task: WorkflowConvertTask = {
      id: `${node.id}:${request.format}`,
      // 步骤 2：srcPath 指内容寻址快照（uploads/{hash}.mxweb）；outname 版本绑定（{hash}-{paramKey}{targetExt}）
      // → 产物落 uploads/{hash}-{paramKey}{targetExt}（= 缓存路径，内容寻址）；ZIP 条目名仍用原文件名（sanitized，独立计算）
      srcPath: snapshot.snapshotPath.replace(/\\/g, '/'),
      fileHash: node.fileHash || '',
      outname: `${snapshot.hash}-${paramKey}${targetExt}`,
    };

    if (request.format === 'pdf') {
      task.width = request.pdfParams?.width || '2000';
      task.height = request.pdfParams?.height || '2000';
      task.colorPolicy = request.pdfParams?.colorPolicy || 'mono';
    }

    if (
      (request.format === 'dwg' || request.format === 'dxf') &&
      request.pdfParams?.dwgVersion
    ) {
      task.dwgVersion = request.pdfParams.dwgVersion;
    }

    return task;
  }

  private async submitBatch(
    tasks: WorkflowConvertTask[]
  ): Promise<{ taskId: string }> {
    const result = await this.httpRequest(
      '/v1/conversions/batchConvert',
      'POST',
      { tasks }
    );
    if (!result?.taskId) {
      throw new Error('Workflow batchConvert returned no taskId');
    }
    return { taskId: result.taskId };
  }

  private async pollTask(taskId: string): Promise<{
    results: Array<{
      id: string;
      success: boolean;
      outputPath?: string;
      error?: string;
    }>;
  }> {
    const activeStates = new Set([
      'PENDING',
      'PROCESSING',
      'RUNNING',
      'QUEUED',
      'ACCEPTED',
    ]);
    const deadline = Date.now() + this.workflowTimeoutMs;

    for (;;) {
      const result = await this.httpRequest(
        `/v1/conversions/tasks/${encodeURIComponent(taskId)}`,
        'GET'
      );
      const status = (result as { status?: string })?.status as
        string | undefined;
      const results =
        (result as any)?.result?.results || (result as any)?.results;

      if (Array.isArray(results)) {
        return { results };
      }
      if (status && !activeStates.has(status)) {
        return { results: (result as any)?.result?.results || [] };
      }
      if (Date.now() >= deadline) {
        throw new Error(`Workflow task ${taskId} timed out`);
      }
      await new Promise((r) => setTimeout(r, this.workflowPollIntervalMs));
    }
  }

  private httpRequest(
    requestPath: string,
    method: string,
    body?: unknown
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(requestPath, this.conversionServiceUrl);
      const useHttps = url.protocol === 'https:';
      const mod = useHttps ? https : http;
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (useHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.internalSecretHeaders,
        },
        timeout: this.workflowHttpTimeoutMs,
      };
      if (this.conversionServiceSecret) {
        options.headers!['X-Conversion-Service-Secret'] =
          this.conversionServiceSecret;
      }
      if (payload)
        options.headers!['Content-Length'] = Buffer.byteLength(payload);

      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `Workflow HTTP ${res.statusCode} for ${method} ${requestPath}: ${data.substring(0, 200)}`
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Workflow invalid JSON: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Workflow timeout: ${method} ${requestPath}`));
      });
      if (payload) req.write(payload);
      req.end();
    });
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

        const targetExt =
          format === 'dwg' ? '.dwg' : format === 'dxf' ? '.dxf' : '.pdf';
        const paramKey = this.fileDownloadExportService.buildParamKey(
          format as CadDownloadFormat,
          pdfParams
        );
        // 产物版本绑定：outname = {hash}-{paramKey}{targetExt}，产物落 srcPath 同目录（uploads/{hash}-{paramKey}{targetExt} = 缓存路径）
        const outname = `${snapshot.hash}-${paramKey}${targetExt}`;

        // 转换缓存命中（同 hash+格式参数）：直接复用缓存产物，不再起 mxcadassembly（ADR-0060）
        const cachedPath =
          this.fileDownloadExportService.getFreshConversionCachePath(
            snapshot.hash,
            format as CadDownloadFormat,
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
        };

        if (format === 'pdf') {
          conversionOptions.width = pdfParams?.width || '2000';
          conversionOptions.height = pdfParams?.height || '2000';
          conversionOptions.colorPolicy = pdfParams?.colorPolicy || 'mono';
        }

        if ((format === 'dwg' || format === 'dxf') && pdfParams?.dwgVersion) {
          conversionOptions.dwgVersion = pdfParams.dwgVersion;
        }

        const conversionService = await this.getConversionService();
        const result =
          await conversionService.convertServerFile(conversionOptions);
        const resultObj = result as Record<string, unknown>;

        if (!resultObj || resultObj.code !== 0) {
          const errMsg = (resultObj?.message as string) || 'Conversion failed';
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
          format as CadDownloadFormat,
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
    const mxcadUploadPath = this.configService.get<string>('mxcadUploadPath') || '';
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
