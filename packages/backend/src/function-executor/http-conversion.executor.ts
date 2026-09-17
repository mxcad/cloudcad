import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { isConversionFailureCategory } from '@cloudcad/contracts';
import type { ConversionFailureCategory } from '@cloudcad/contracts';
import { ConversionServiceClient } from '../common/utils/conversion-service-client';
import { buildOutboundTraceHeaders } from '../common/utils/outbound-trace';
import { internalServiceSecretHeader } from '../common/utils/internal-service-auth';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
  ExecutorQueueStats,
  ExecutorDurationStats,
  ExecutorTaskRecord,
  WorkerPoolLevelStats,
} from './function-executor.interface';

/**
 * 把转换服务下发的失败分类收敛为契约类型；非法或缺省值归 undefined，
 * 调用方据此走 isTransientFailure 的默认分支（瞬态）。
 */
function toFailureCategory(
  value: unknown
): ConversionFailureCategory | undefined {
  return isConversionFailureCategory(value) ? value : undefined;
}

function toErrorCode(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

@Injectable()
export class HttpConversionExecutor implements IFunctionExecutor {
  private readonly logger = new Logger(HttpConversionExecutor.name);
  private readonly client: ConversionServiceClient;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly cls: ClsService,
  ) {
    this.client = new ConversionServiceClient({
      baseUrl:
        this.configService.get<string>('CONVERSION_SERVICE_URL') ||
        'http://localhost:3100',
      timeoutMs: 300000,
      // #419：conversion-service 非 health 路由需共享密钥（空则不带头，向后兼容本地开发）
      headers: {
        'Content-Type': 'application/json',
        ...internalServiceSecretHeader(
          this.configService.get<string>('INTERNAL_SERVICE_SECRET'),
        ),
      },
    });
    this.pollIntervalMs = Number(
      this.configService.get<string>('CONVERSION_SERVICE_POLL_INTERVAL') || 1000,
    );
    this.pollTimeoutMs = Number(
      this.configService.get<string>('CONVERSION_SERVICE_POLL_TIMEOUT') || 300000,
    );
  }

  async invoke(task: ConversionTask): Promise<ConversionResult> {
    let submitted: any;
    try {
      // 异步提交：返回 taskId 后由轮询等待终态，避免在 conversion-service 服务侧长期占用连接
      submitted = await this.client.request(
        '/v1/conversions/async/convertFile',
        'POST',
        {
          priority: task.priority,
          callbackUrl: null,
          params: {
            type: task.type,
            ...task.params,
          },
        },
        this.traceHeaders()
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        taskId: task.id,
        status: 'FAILED',
        error: `Failed to submit task: ${errMsg}`,
      };
    }

    const taskId: string | undefined = submitted.taskId;
    if (!taskId) {
      return {
        taskId: task.id,
        status: 'FAILED',
        error: 'Conversion service did not return a taskId',
      };
    }

    return this.waitForTerminal(taskId);
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await this.client.request<Record<string, any>>(
      `/v1/conversions/tasks/${taskId}`,
      'GET',
      undefined,
      this.traceHeaders()
    );
    const raw = response.result as Record<string, unknown> | undefined;
    return {
      taskId: response.taskId,
      status: response.status,
      progress: response.progress,
      result: raw
        ? {
            taskId: response.taskId,
            status: response.status,
            outputPath: (raw.newpath ?? raw.outputPath) as string | undefined,
            metadata: raw,
          }
        : undefined,
      error: response.error,
      // 失败性质分类结构化透传（此前只透传 error 字符串，backend 靠中文文案反推）
      errorCategory: toFailureCategory(response.errorCategory),
      errorCode: toErrorCode(response.errorCode),
      // 排队位置（S6-5）：conversion-service GET /tasks/:taskId 透传（仅排队中任务有意义，否则 null）
      queuePosition:
        typeof response.queuePosition === 'number'
          ? response.queuePosition
          : undefined,
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    };
  }

  /**
   * 取消任务（#463）：转发到 conversion-service 的取消路由
   * （排队中出队 / 运行中杀 mxcadassembly 进程组）。
   */
  async cancelTask(taskId: string): Promise<{
    ok: boolean;
    status?: string;
    reason?: string;
  }> {
    try {
      const response = await this.client.request<Record<string, any>>(
        `/v1/conversions/tasks/${encodeURIComponent(taskId)}/cancel`,
        'POST',
        undefined,
        this.traceHeaders()
      );
      return { ok: true, status: response.status };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      // 409（终态不可取消）/ 404（任务不存在）等：透传为 ok=false + reason
      return { ok: false, reason: errMsg };
    }
  }

  private async waitForTerminal(taskId: string): Promise<ConversionResult> {
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const status = await this.getTaskStatus(taskId);
        if (status.status === 'COMPLETED') {
          return {
            taskId,
            status: 'COMPLETED',
            outputPath: status.result?.outputPath,
            metadata: status.result?.metadata,
          };
        }
        if (status.status === 'FAILED') {
          return {
            taskId,
            status: 'FAILED',
            error: status.error,
            errorCategory: status.errorCategory,
            errorCode: status.errorCode,
          };
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Task status poll failed for ${taskId}: ${errMsg}`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
    return {
      taskId,
      status: 'FAILED',
      error: `Conversion task timed out after ${this.pollTimeoutMs}ms`,
    };
  }

  /**
   * 队列统计（seam 统一形态）：透传 conversion-service GET /v1/conversions/stats。
   * 该形态的排队/运行计数落在 tasks，工作池明细落在 workers。
   */
  async queueStats(): Promise<ExecutorQueueStats | null> {
    const raw = await this.fetchRemoteStats();
    const tasks = (raw.tasks ?? {}) as Record<string, unknown>;
    return {
      kind: 'worker-pool',
      tasks: {
        total: toNumber(tasks.total),
        pending: toNumber(tasks.pending),
        processing: toNumber(tasks.processing),
        completed: toNumber(tasks.completed),
        failed: toNumber(tasks.failed),
      },
      workers: parseWorkerLevels(raw.workers),
    };
  }

  /** 终态任务执行耗时（有界样本）；该形态无排队等待时长语义 */
  async durationStats(): Promise<ExecutorDurationStats | null> {
    const raw = await this.fetchRemoteStats();
    const duration = (raw.duration ?? {}) as Record<string, unknown>;
    return {
      kind: 'task',
      stats: {
        sampleCount: toNumber(duration.sampleCount),
        p50Ms: toNullableNumber(duration.p50Ms),
        p95Ms: toNullableNumber(duration.p95Ms),
      },
    };
  }

  /**
   * 逐任务明细：proxy conversion-service GET /v1/conversions/tasks。
   * 可选 status 过滤（pending/processing/completed/failed/cancelled）。
   */
  async listTasks(status?: string): Promise<ExecutorTaskRecord[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const raw = await this.client.request<Record<string, unknown>>(
      `/v1/conversions/tasks${qs}`,
      'GET',
      undefined,
      this.traceHeaders()
    );
    const rawItems = Array.isArray(raw.tasks) ? raw.tasks : [];
    return rawItems
      .map((item) => {
        const o = (item ?? {}) as Record<string, unknown>;
        return {
          id: typeof o.id === 'string' ? o.id : '',
          type: typeof o.type === 'string' ? o.type : undefined,
          status: typeof o.status === 'string' ? o.status.toLowerCase() : 'unknown',
          progress: toNumber(o.progress),
          createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
          updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '',
          startedAt: typeof o.startedAt === 'string' ? o.startedAt : null,
          completedAt: typeof o.completedAt === 'string' ? o.completedAt : null,
          error: typeof o.error === 'string' ? o.error : undefined,
          contentKey: typeof o.contentKey === 'string' ? o.contentKey : undefined,
        } satisfies ExecutorTaskRecord;
      })
      .filter((item) => item.id !== '');
  }

  /** 拉取远端 conversion-service 的 /v1/conversions/stats */
  private async fetchRemoteStats(): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>(
      '/v1/conversions/stats',
      'GET',
      undefined,
      this.traceHeaders()
    );
  }

  /**
   * 出站追踪头（#309）：conversion-service 侧日志据此与 backend 请求串联
   */
  private traceHeaders(): Record<string, string> {
    return buildOutboundTraceHeaders(
      {
        requestId: this.cls?.get<string>('requestId'),
        traceId: this.cls?.get<string>('traceId'),
      },
      'http-conversion',
    );
  }
}

function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseWorkerLevels(
  raw: unknown
): Record<string, WorkerPoolLevelStats> {
  const workersRaw = (raw ?? {}) as Record<string, unknown>;
  const workers: Record<string, WorkerPoolLevelStats> = {};
  for (const [key, value] of Object.entries(workersRaw)) {
    const w = (value ?? {}) as Record<string, unknown>;
    workers[key] = {
      label: typeof w.label === 'string' ? w.label : key,
      maxConcurrent: toNumber(w.maxConcurrent),
      currentMax: toNumber(w.currentMax),
      running: toNumber(w.running),
      waiting: toNumber(w.waiting),
      autoScale: w.autoScale === true,
      backlogSince: typeof w.backlogSince === 'number' ? w.backlogSince : null,
    };
  }
  return workers;
}
