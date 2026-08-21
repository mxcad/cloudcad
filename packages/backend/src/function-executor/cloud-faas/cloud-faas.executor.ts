import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IFunctionExecutor,
  ConversionTask,
  ConversionResult,
  TaskStatus,
} from '../function-executor.interface';
import { HuaweiExecutor } from './providers/huawei.executor';
import { AliyunExecutor } from './providers/aliyun.executor';
import { LambdaExecutor } from './providers/aws.executor';

interface FaasProvider {
  invoke(task: ConversionTask): Promise<{ status: string; outputPath?: string; error?: string; metadata?: Record<string, unknown> }>;
  getTaskStatus(taskId: string): Promise<{ status: string; progress?: number; error?: string; createdAt: string; updatedAt: string }>;
}

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
      status: result.status as TaskStatus['status'],
      progress: result.progress,
      error: result.error,
      createdAt: new Date(result.createdAt),
      updatedAt: new Date(result.updatedAt),
    };
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
