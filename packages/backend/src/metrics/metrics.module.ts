import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { PrometheusMiddleware } from './prometheus.middleware';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [PermissionModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PrometheusMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
