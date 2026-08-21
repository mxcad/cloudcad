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
  convertFile: (options: MxCadConversionOptions) => Promise<MxCadConversionResult>;
  convertBinToMxweb: (
    binPath: string,
    outputPath: string,
    outName: string,
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

@Injectable()
export class ProcessPoolExecutor implements IFunctionExecutor {
  private readonly logger = new Logger(ProcessPoolExecutor.name);
  private readonly taskStore = new Map<string, TaskRecord>();
  private readonly rateLimiter: RateLimiter;

  constructor(
    @Inject(MXCAD_CONVERSION_SERVICE)
    private readonly fileConversionService: IMxcadConversionService &
      MxcadConversionMethods,
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

      const priority = task.priority === 1 ? 'critical' : task.priority === 2 ? 'high' : 'low';
      const result = await this.rateLimiter.execute(async () => {
        return this.executeTask(task);
      }, priority);

      record.status = result.status;
      record.result = result;
      if (result.status === 'FAILED') {
        record.error = result.error;
      }
      record.updatedAt = new Date();
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      record.status = 'FAILED';
      record.error = errMsg;
      record.updatedAt = new Date();
      return {
        taskId: task.id,
        status: 'FAILED',
        error: errMsg,
      };
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
        const { isOk, ret, error } = await this.fileConversionService.convertFile(params as never);
        return {
          taskId: task.id,
          status: isOk ? 'COMPLETED' : 'FAILED',
          outputPath: ret?.newpath,
          error,
          metadata: ret as Record<string, unknown>,
        };
      }
      case 'convertBinToMxweb': {
        const binPath = params['binPath'] as string;
        const outputPath = params['outputPath'] as string;
        const outName = params['outName'] as string;
        const result = await this.fileConversionService.convertBinToMxweb(binPath, outputPath, outName);
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

  clearQueue() {
    return this.rateLimiter.clearQueue();
  }
}
