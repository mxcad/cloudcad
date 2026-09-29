import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversionServiceClient } from '../common/utils/conversion-service-client';
import { internalServiceSecretHeader } from '../common/utils/internal-service-auth';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
  BatchConversionTask,
  BatchConversionResult,
  ExecutorQueueStats,
  ExecutorDurationStats,
} from './function-executor.interface';

/**
 * 批量委托装饰器执行器（BATCH_DOWNLOAD_DELEGATE_WORKFLOW）。
 *
 * 该开关是既有 TOB 部署能力：FUNCTION_EXECUTOR 仍选嵌入式引擎（进程内转换），
 * 但批量下载的转换任务外包给独立 conversion-service 批量执行。此前这套能力
 * （client 装配、双密钥 header、轮询参数、60s 熔断、submit+poll 循环）长在
 * batch-download/ConversionRunner 深处、与 FUNCTION_EXECUTOR 完全平行；收编后
 * 它只在本 adapter 一个 seam 上起作用：批量原语（submitBatch/waitBatch）走
 * conversion-service HTTP，其余原语透传被包装的 base 执行器。
 *
 * 熔断：提交/等待失败后 60s 内 submitBatch 直接抛错（不发请求），调用方据此
 * 回退进程内转换，不再反复撞不可达的服务。
 */
export class BatchDelegateConversionExecutor implements IFunctionExecutor {
  private readonly logger = new Logger(BatchDelegateConversionExecutor.name);
  private readonly client: ConversionServiceClient;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private cooldownUntil = 0;
  private static readonly COOLDOWN_MS = 60_000;

  /**
   * invoke 的转发安全性随 base：base 本地（invoke 回调本进程）则本执行器同样
   * 不可被转发——批量原语虽走远端，但不改变 invoke 的能力声明。
   */
  readonly isRemote: boolean;

  /** 可选原语透传：base 实现了才暴露（调用方按 undefined 判断能力） */
  cancelTask?: IFunctionExecutor['cancelTask'];
  listTasks?: IFunctionExecutor['listTasks'];
  clearQueue?: IFunctionExecutor['clearQueue'];

  constructor(
    private readonly base: IFunctionExecutor,
    configService: ConfigService
  ) {
    this.isRemote = base.isRemote === true;
    if (base.cancelTask) this.cancelTask = base.cancelTask.bind(base);
    if (base.listTasks) this.listTasks = base.listTasks.bind(base);
    if (base.clearQueue) this.clearQueue = base.clearQueue.bind(base);

    const batchConfig = configService.get('batchDownload', { infer: true });
    const workflowUrl = batchConfig?.conversionServiceUrl;
    const envWorkflowUrl = configService.get<string>('CONVERSION_SERVICE_URL');
    const baseUrl =
      typeof workflowUrl === 'string' && workflowUrl
        ? workflowUrl
        : typeof envWorkflowUrl === 'string' && envWorkflowUrl
          ? envWorkflowUrl
          : 'http://localhost:3100';
    const envSecret = configService.get<string>('CONVERSION_SERVICE_SECRET');
    const conversionServiceSecret =
      typeof envSecret === 'string' && envSecret ? envSecret : '';

    this.pollTimeoutMs = batchConfig?.workflowTimeoutMs || 10 * 60 * 1000;
    this.pollIntervalMs = batchConfig?.workflowPollIntervalMs || 1500;
    // 单请求超时取轮询总超时的较小值与 60s 的下限：轮询超时负责整体兜底，
    // 单请求超时只防一个连接挂住
    this.client = new ConversionServiceClient({
      baseUrl,
      timeoutMs: Math.min(this.pollTimeoutMs, 60_000),
      // #419：统一内网共享密钥 header（与旧 X-Conversion-Service-Secret 并存，
      // 服务端任一匹配即放行）
      headers: {
        'Content-Type': 'application/json',
        ...internalServiceSecretHeader(
          configService.get<string>('INTERNAL_SERVICE_SECRET')
        ),
        ...(conversionServiceSecret
          ? { 'X-Conversion-Service-Secret': conversionServiceSecret }
          : {}),
      },
    });
  }

  invoke(task: ConversionTask): Promise<ConversionResult> {
    return this.base.invoke(task);
  }

  getTaskStatus(taskId: string): Promise<TaskStatus> {
    return this.base.getTaskStatus(taskId);
  }

  queueStats(): Promise<ExecutorQueueStats | null> {
    return this.base.queueStats();
  }

  durationStats(): Promise<ExecutorDurationStats | null> {
    return this.base.durationStats();
  }

  async submitBatch(
    tasks: BatchConversionTask[]
  ): Promise<{ batchId: string }> {
    if (Date.now() < this.cooldownUntil) {
      throw new Error('Conversion service batch delegate is in cooldown');
    }
    try {
      const result = await this.client.request<{ taskId?: string }>(
        '/v1/conversions/batchConvert',
        'POST',
        { tasks }
      );
      if (!result?.taskId) {
        throw new Error('Workflow batchConvert returned no taskId');
      }
      return { batchId: result.taskId };
    } catch (err) {
      this.markUnavailable(err as Error);
      throw err;
    }
  }

  async waitBatch(batchId: string): Promise<BatchConversionResult> {
    const activeStates = new Set([
      'PENDING',
      'PROCESSING',
      'RUNNING',
      'QUEUED',
      'ACCEPTED',
    ]);
    const deadline = Date.now() + this.pollTimeoutMs;

    try {
      for (;;) {
        const result = await this.client.request(
          `/v1/conversions/tasks/${encodeURIComponent(batchId)}`,
          'GET'
        );
        const status = (result as { status?: string })?.status as
          | string
          | undefined;
        const results =
          (result as any)?.result?.results || (result as any)?.results;

        if (Array.isArray(results)) {
          return { results };
        }
        if (status && !activeStates.has(status)) {
          return { results: (result as any)?.result?.results || [] };
        }
        if (Date.now() >= deadline) {
          throw new Error(`Workflow task ${batchId} timed out`);
        }
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      }
    } catch (err) {
      this.markUnavailable(err as Error);
      throw err;
    }
  }

  private markUnavailable(err: Error): void {
    this.cooldownUntil = Date.now() + BatchDelegateConversionExecutor.COOLDOWN_MS;
    this.logger.warn(
      `Batch delegate conversion service unavailable (${err.message}), cooling down for ${BatchDelegateConversionExecutor.COOLDOWN_MS}ms`
    );
  }
}
