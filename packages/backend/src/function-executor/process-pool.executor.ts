import { Injectable, Inject, Logger } from '@nestjs/common';
import type {
  IFunctionExecutor,
  ExecutorCapabilities,
  ConversionTask,
  ConversionResult,
  TaskStatus,
  ExecutorQueueStats,
  ExecutorDurationStats,
} from './function-executor.interface';
import type { IMxcadConversionService } from '../mxcad/interfaces/mxcad-conversion.interface';
import { MXCAD_CONVERSION_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';

interface TaskRecord {
  task: ConversionTask;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: ConversionResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** 终态任务记录保留上限：超出后按入队顺序淘汰最旧，防止 taskStore 随进程生命周期无限增长 */
const MAX_TERMINAL_RETAIN = 500;

@Injectable()
export class ProcessPoolExecutor implements IFunctionExecutor {
  private readonly logger = new Logger(ProcessPoolExecutor.name);
  /** 进程内执行：executeTask 回调 FileConversionService.convertFile，故不得作为转发目标 */
  readonly isRemote = false;
  /** 进程内形态：无取消/逐任务明细/批量原语（簿记仅供 getTaskStatus） */
  readonly capabilities: ExecutorCapabilities = {
    cancel: false,
    listTasks: false,
    batch: false,
  };
  private readonly taskStore = new Map<string, TaskRecord>();
  /** 终态任务 id 的入队顺序（Map 淘汰依据；仅终态 id 入列，每个任务只入列一次） */
  private readonly terminalOrder: string[] = [];

  constructor(
    @Inject(MXCAD_CONVERSION_SERVICE)
    private readonly fileConversionService: IMxcadConversionService
  ) {}

  async invoke(task: ConversionTask): Promise<ConversionResult> {
    const record: TaskRecord = {
      task,
      status: 'PENDING',
      createdAt: task.createdAt,
      updatedAt: new Date(),
    };
    this.taskStore.set(task.id, record);

    try {
      record.status = 'PROCESSING';
      record.updatedAt = new Date();

      // 并发闸门下沉到 FileConversionService 的内层限流器（convertFile 自带排队
      // 上限 + 按方向/优先级入队）：此前这里再套一层 RateLimiter(4) 形成双限流——
      // 外层无排队上限，持续高负载下任务在外层无限排队，前端先超时放弃而引擎
      // 从未启动。此处只透传任务，不再二次排队。
      const result = await this.executeTask(task);

      record.status = result.status;
      record.result = result;
      if (result.status === 'FAILED') {
        record.error = result.error;
      }
      record.updatedAt = new Date();
      this.markTerminal(task.id);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      record.status = 'FAILED';
      record.error = errMsg;
      record.updatedAt = new Date();
      this.markTerminal(task.id);
      return {
        taskId: task.id,
        status: 'FAILED',
        error: errMsg,
      };
    }
  }

  // 终态记录入列，超出上限时淘汰最旧的终态记录（被淘汰任务 getTaskStatus 将报 not found，可接受）
  private markTerminal(taskId: string): void {
    this.terminalOrder.push(taskId);
    while (this.terminalOrder.length > MAX_TERMINAL_RETAIN) {
      const evicted = this.terminalOrder.shift();
      if (evicted) this.taskStore.delete(evicted);
    }
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const record = this.taskStore.get(taskId);
    if (!record) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return {
      taskId: record.task.id,
      status: record.status,
      result: record.result,
      error: record.error,
      errorCategory: record.result?.errorCategory,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async executeTask(task: ConversionTask): Promise<ConversionResult> {
    // ConversionTask 是按 type 判别的联合：switch(task.type) 逐分支拿到强类型 params，
    // 不再需要 as never / params['x'] as string 的手工断言。
    const taskId = task.id;
    const type = task.type;

    this.logger.log(`Executing task ${taskId}: ${type}`);

    switch (task.type) {
      case 'convertFile': {
        // 优先级透传到内层限流器（1=打开→critical / 2=导出→high / 3=后台→low），
        // 与远端模式「打开 > 导出 > 后台」的档位次序一致；调用方未显式指定时不覆盖
        // params 里已有的 priority（如 convertFileAsync 的 'low'）
        const priority =
          task.priority === 1
            ? 'critical'
            : task.priority === 3
              ? 'low'
              : undefined;
        const { isOk, ret, error, errorCategory } =
          await this.fileConversionService.convertFile(
            priority ? { ...task.params, priority } : task.params,
          );
        return {
          taskId,
          status: isOk ? 'COMPLETED' : 'FAILED',
          outputPath: ret?.newpath,
          error,
          metadata: ret as Record<string, unknown>,
          errorCategory,
        };
      }
      case 'convertBinToMxweb': {
        // 参数名与 FileConversionService.forwardViaExecutor 的转发契约一致（srcPath/outpath/outname）
        const {
          srcPath: binPath,
          outpath: outputPath,
          outname: outName,
        } = task.params;
        const result = await this.fileConversionService.convertBinToMxweb(
          binPath,
          outputPath,
          outName
        );
        return {
          taskId,
          status: result.success ? 'COMPLETED' : 'FAILED',
          outputPath: result.outputPath,
          error: result.error,
        };
      }
      case 'generateBinFiles': {
        const { mxwebPath, nodeName } = task.params;
        await this.fileConversionService.generateBinFiles(mxwebPath, nodeName);
        return { taskId, status: 'COMPLETED' };
      }
      default:
        return {
          taskId,
          status: 'FAILED',
          error: `Unknown task type: ${type}`,
        };
    }
  }

  /**
   * 队列统计读内层限流器（FileConversionService 的 conversionRateLimiter，
   * 即真正的并发闸门）。执行器未接线内层统计出口（测试 mock / 旧实现）时
   * 回落全零，不报错。
   */
  async queueStats(): Promise<ExecutorQueueStats | null> {
    const stats = this.fileConversionService.getConversionLimiterStats?.();
    return {
      kind: 'priority-queue',
      stats: stats ?? {
        queueLength: 0,
        criticalPriorityQueueLength: 0,
        highPriorityQueueLength: 0,
        lowPriorityQueueLength: 0,
        runningCount: 0,
        maxConcurrent: 0,
        timeout: 0,
      },
    };
  }

  /** 最近完成任务的耗时/等待时长统计（透传内层限流器有界样本） */
  async durationStats(): Promise<ExecutorDurationStats | null> {
    const stats =
      this.fileConversionService.getConversionLimiterDurationStats?.();
    return {
      kind: 'priority-queue',
      stats: stats ?? {
        sampleCount: 0,
        p50DurationMs: null,
        p95DurationMs: null,
        p50WaitMs: null,
        p95WaitMs: null,
      },
    };
  }
}
