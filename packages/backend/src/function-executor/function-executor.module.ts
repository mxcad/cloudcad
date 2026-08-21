import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProcessPoolExecutor } from './process-pool.executor';
import { HttpConversionExecutor } from './http-conversion.executor';
import { CloudFaaSExecutor } from './cloud-faas/cloud-faas.executor';
import { IFunctionExecutor } from './function-executor.interface';
import { MxcadConversionModule } from '../mxcad/conversion/mxcad-conversion.module';

@Module({
  imports: [ConfigModule, forwardRef(() => MxcadConversionModule)],
  providers: [
    ProcessPoolExecutor,
    HttpConversionExecutor,
    CloudFaaSExecutor,
    {
      provide: IFunctionExecutor,
      useFactory: (
        configService: ConfigService,
        processPool: ProcessPoolExecutor,
        httpConversion: HttpConversionExecutor,
        cloudFaaS: CloudFaaSExecutor,
      ) => {
        const mode = configService.get<string>('FUNCTION_EXECUTOR') || 'process-pool';
        switch (mode) {
          case 'conversion-service':
            return httpConversion;
          case 'cloud-faas':
            return cloudFaaS;
          default:
            return processPool;
        }
      },
      inject: [ConfigService, ProcessPoolExecutor, HttpConversionExecutor, CloudFaaSExecutor],
    },
  ],
  exports: [
    ProcessPoolExecutor,
    HttpConversionExecutor,
    CloudFaaSExecutor,
    IFunctionExecutor,
  ],
})
export class FunctionExecutorModule {}
