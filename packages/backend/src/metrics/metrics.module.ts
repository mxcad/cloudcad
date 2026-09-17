import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HostMetricsService } from './host-metrics.service';
import { PrometheusMiddleware } from './prometheus.middleware';
import { PermissionModule } from '../permission/permission.module';
import { CleanupMetricsService } from './cleanup-metrics.service';

@Module({
  imports: [PermissionModule],
  controllers: [MetricsController],
  // CleanupMetricsService：清理任务指标 + 结构化日志双写（#325/#322），供各 cleanup 调度器消费
  providers: [MetricsService, HostMetricsService, CleanupMetricsService],
  exports: [CleanupMetricsService],
})
export class MetricsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PrometheusMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
