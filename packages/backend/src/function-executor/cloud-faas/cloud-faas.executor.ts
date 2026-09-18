import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
  ExecutorQueueStats,
  ExecutorDurationStats,
} from '../function-executor.interface';
import { HuaweiExecutor } from './providers/huawei.executor';
import { AliyunExecutor } from './providers/aliyun.executor';
import { LambdaExecutor } from './providers/aws.executor';

interface FaasProvider {
  invoke(task: ConversionTask): Promise<{ status: string; outputPath?: string; error?: string; metadata?: Record<string, unknown> }>;
  getTaskStatus(taskId: string): Promise<{ status: string; progress?: number; error?: string; createdAt: string; updatedAt: string }>;
}

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
  private readonly provider: FaasProvider;

  constructor(private readonly configService: ConfigService) {
    const providerName = this.configService.get<string>('CLOUD_FAAS_PROVIDER') || 'huawei';
    this.provider = this.createProvider(providerName);
    this.logger.log(`CloudFaaSExecutor 初始化, provider=${providerName}`);
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

  private createProvider(name: string): FaasProvider {
    switch (name) {
      case 'huawei':
        return new HuaweiExecutor(this.configService);
      case 'aliyun':
        return new AliyunExecutor(this.configService);
      case 'aws':
        return new LambdaExecutor(this.configService);
      default:
        this.logger.warn(`Unknown FaaS provider: ${name}, falling back to huawei`);
        return new HuaweiExecutor(this.configService);
    }
  }
}
