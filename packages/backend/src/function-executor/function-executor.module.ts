import { Module, forwardRef, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcessPoolExecutor } from './process-pool.executor';
import { HttpConversionExecutor } from './http-conversion.executor';
import { BatchDelegateConversionExecutor } from './batch-delegate.executor';
import { CloudFaaSExecutor } from './cloud-faas/cloud-faas.executor';
import { IFunctionExecutor } from './function-executor.interface';
import {
  FaaS_PROVIDER,
  type FaasProvider,
} from './cloud-faas/interfaces/faas-provider.interface';
import { HuaweiExecutor } from './cloud-faas/providers/huawei.executor';
import { AliyunExecutor } from './cloud-faas/providers/aliyun.executor';
import { LambdaExecutor } from './cloud-faas/providers/aws.executor';
import { MxcadConversionModule } from '../mxcad/conversion/mxcad-conversion.module';

const logger = new Logger('FunctionExecutorModule');

/**
 * 按 CLOUD_FAAS_PROVIDER 选择云函数 provider（缺省华为，未知值告警后回退华为）。
 * 选择上移到模块层：CloudFaaSExecutor 只依赖 FaasProvider 接口，
 * 不知道具体厂商，新增厂商只改这里。
 */
export function selectFaasProvider(configService: ConfigService): FaasProvider {
  const name = configService.get<string>('CLOUD_FAAS_PROVIDER') || 'huawei';
  switch (name) {
    case 'huawei':
      return new HuaweiExecutor(configService);
    case 'aliyun':
      return new AliyunExecutor(configService);
    case 'aws':
      return new LambdaExecutor(configService);
    default:
      logger.warn(`Unknown FaaS provider: ${name}, falling back to huawei`);
      return new HuaweiExecutor(configService);
  }
}

/**
 * 按 FUNCTION_EXECUTOR 选择执行器——该配置的**唯一读取点**。
 * 缺省/未知值回退 process-pool（进程内 spawn，恒可用）。
 *
 * FileConversionService 不再读此配置：它按注入的执行器自声明的 isRemote 判定能否转发。
 * 此前配置被读两次（模块内选 provider + service 内算 useConversionService），两者可不同步——
 * service 判可转发而执行器是 ProcessPoolExecutor（其 executeTask 回调本服务）即
 * convertFile↔invoke 无限递归死锁（f2df958）。
 */
export function selectFunctionExecutor(
  configService: ConfigService,
  processPool: ProcessPoolExecutor,
  httpConversion: HttpConversionExecutor,
  cloudFaaS: CloudFaaSExecutor,
): IFunctionExecutor {
  const mode = configService.get<string>('FUNCTION_EXECUTOR') || 'process-pool';
  let executor: IFunctionExecutor;
  switch (mode) {
    case 'conversion-service':
      executor = httpConversion;
      break;
    case 'cloud-faas':
      executor = cloudFaaS;
      break;
    default:
      executor = processPool;
  }

  // BATCH_DOWNLOAD_DELEGATE_WORKFLOW（既有 TOB 部署能力：嵌入式引擎 + 批量下载
  // 外包给独立 conversion-service）：开关只在此一个 seam 上起作用——包装出的
  // 执行器带可选批量原语（submitBatch/waitBatch 走远端，其余透传 base），
  // 批量下载编排层据此走批量路径并自带不可达回退。
  const batchConfig = configService.get('batchDownload', { infer: true });
  if (batchConfig?.delegateWorkflow) {
    executor = new BatchDelegateConversionExecutor(executor, configService);
  }
  return executor;
}

@Module({
  imports: [ConfigModule, forwardRef(() => MxcadConversionModule)],
  providers: [
    ProcessPoolExecutor,
    HttpConversionExecutor,
    CloudFaaSExecutor,
    {
      provide: FaaS_PROVIDER,
      useFactory: selectFaasProvider,
      inject: [ConfigService],
    },
    {
      provide: IFunctionExecutor,
      useFactory: selectFunctionExecutor,
      inject: [ConfigService, ProcessPoolExecutor, HttpConversionExecutor, CloudFaaSExecutor],
    },
  ],
  exports: [
    ProcessPoolExecutor,
    HttpConversionExecutor,
    CloudFaaSExecutor,
    FaaS_PROVIDER,
    IFunctionExecutor,
  ],
})
export class FunctionExecutorModule {}
