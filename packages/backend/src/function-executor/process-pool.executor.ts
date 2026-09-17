import { Injectable, Inject, Logger } from '@nestjs/common';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
} from './function-executor.interface';
import { RateLimiter } from '../common/concurrency/rate-limiter';
import type { IMxcadConversionService } from '../mxcad/interfaces/mxcad-conversion.interface';
import type {
  ConversionOptions as MxCadConversionOptions,
  ConversionResult as MxCadConversionResult,
} from '../mxcad/interfaces/file-conversion.interface';
import { MXCAD_CONVERSION_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';

/** FileConversionService 在 IMxcadConversionService 基础上额外提供的方法签名 */
type MxcadConversionMethods = {
  convertFile: (
    options: MxCadConversionOptions
  ) => Promise<MxCadConversionResult>;
  convertBinToMxweb: (
    binPath: string,
    outputPath: string,
    outName: string
  ) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
  generateBinFiles: (mxwebPath: string, nodeName: string) => Promise<void>;
};

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
  private readonly taskStore = new Map<string, TaskRecord>();
  private readonly rateLimiter: RateLimiter;
  /** 终态任务 id 的入队顺序（Map 淘汰依据；仅终态 id 入列，每个任务只入列一次） */
  private readonly terminalOrder: string[] = [];

  constructor(
    @Inject(MXCAD_CONVERSION_SERVICE)
    private readonly fileConversionService: IMxcadConversionService &
      MxcadConversionMethods
  ) {
    this.rateLimiter = new RateLimiter(4);
  }

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

      const priority =
        task.priority === 1 ? 'critical' : task.priority === 2 ? 'high' : 'low';
      const result = await this.rateLimiter.execute(async () => {
        return this.executeTask(task);
      }, priority);

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
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async executeTask(task: ConversionTask): Promise<ConversionResult> {
    const { type, params } = task;

    this.logger.log(`Executing task ${task.id}: ${type}`);

    switch (type) {
      case 'convertFile': {
        const { isOk, ret, error } =
          await this.fileConversionService.convertFile(params as never);
        return {
          taskId: task.id,
          status: isOk ? 'COMPLETED' : 'FAILED',
          outputPath: ret?.newpath,
          error,
          metadata: ret as Record<string, unknown>,
        };
      }
      case 'convertBinToMxweb': {
        // 参数名与 FileConversionService.forwardViaExecutor 的转发契约一致（srcPath/outpath/outname）
        const binPath = params['srcPath'] as string;
        const outputPath = params['outpath'] as string;
        const outName = params['outname'] as string;
        const result = await this.fileConversionService.convertBinToMxweb(
          binPath,
          outputPath,
          outName
        );
        return {
          taskId: task.id,
          status: result.success ? 'COMPLETED' : 'FAILED',
          outputPath: result.outputPath,
          error: result.error,
        };
      }
      case 'generateBinFiles': {
        const mxwebPath = params['mxwebPath'] as string;
        const nodeName = params['nodeName'] as string;
        await this.fileConversionService.generateBinFiles(mxwebPath, nodeName);
        return {
          taskId: task.id,
          status: 'COMPLETED',
        };
      }
      default:
        return {
          taskId: task.id,
          status: 'FAILED',
          error: `Unknown task type: ${type}`,
        };
    }
  }

  getQueueStats() {
    return this.rateLimiter.getStats();
  }

  /** 最近完成任务的耗时/等待时长统计（透传 RateLimiter 有界样本） */
  getDurationStats() {
    return this.rateLimiter.getDurationStats();
  }

  clearQueue() {
    return this.rateLimiter.clearQueue();
  }
}
