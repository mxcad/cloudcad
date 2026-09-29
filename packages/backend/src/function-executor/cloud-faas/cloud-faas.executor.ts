import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
  ExecutorQueueStats,
  ExecutorDurationStats,
} from '../function-executor.interface';
import {
  FaaS_PROVIDER,
  type FaasProvider,
} from './interfaces/faas-provider.interface';

/**
 * TaskStatus 状态联合的全集（与 function-executor.interface.ts 的
 * TaskStatus['status'] 同步）。provider 响应缺 status 时回 'UNKNOWN'
 * （契约外值），getTaskStatus 据此校验：未命中的值映射为已知失败态 FAILED，
 * 而非强转塞进联合——运行期契约外值会让前端状态映射崩或显示错。
 */
const KNOWN_TASK_STATUSES: readonly TaskStatus['status'][] = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
];

@Injectable()
export class CloudFaaSExecutor implements IFunctionExecutor {
  private readonly logger = new Logger(CloudFaaSExecutor.name);
  /**
   * 云函数执行器语义上属远端，但当前 cloud-faas 模式下 FileConversionService 未使用
   * 它执行 convertFile（恒进程内 spawn），保持 false 以维持既有行为。是否改为转发需
   * 先端到端验证 forwardViaExecutor ↔ FaasProvider 的载荷契约（本服务的 forwardViaExecutor
   * 假定 result.metadata 承载引擎输出，而 cloud-faas 的 metadata 来自供应商侧）。
   */
  readonly isRemote = false;

  constructor(@Inject(FaaS_PROVIDER) private readonly provider: FaasProvider) {
    this.logger.log('CloudFaaSExecutor 初始化');
  }

  async invoke(task: ConversionTask): Promise<ConversionResult> {
    try {
      const result = await this.provider.invoke(task);
      return {
        taskId: task.id,
        status: result.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        outputPath: result.outputPath,
        error: result.error,
        metadata: result.metadata,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cloud FaaS invoke failed: ${errMsg}`);
      return { taskId: task.id, status: 'FAILED', error: errMsg };
    }
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const result = await this.provider.getTaskStatus(taskId);
    return {
      taskId,
      // 契约外值（如 provider 缺 status 回的 'UNKNOWN'）映射为已知失败态 FAILED
      status: (KNOWN_TASK_STATUSES as readonly string[]).includes(
        result.status,
      )
        ? (result.status as TaskStatus['status'])
        : 'FAILED',
      progress: result.progress,
      error: result.error,
      createdAt: new Date(result.createdAt),
      updatedAt: new Date(result.updatedAt),
    };
  }

  /** 云函数形态无排队队列（由供应商侧调度），监控返回「不适用」 */
  async queueStats(): Promise<ExecutorQueueStats | null> {
    return null;
  }

  async durationStats(): Promise<ExecutorDurationStats | null> {
    return null;
  }
}
