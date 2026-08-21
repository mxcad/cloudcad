import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class PrometheusMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: () => void) {
    const reqPath = req.baseUrl || req.path;
    if (this.metricsService.isExcluded(reqPath)) {
      next();
      return;
    }

    const endTimer = this.metricsService.startDurationTimer();
    res.on('finish', () => {
      this.metricsService.recordRequest(req.method, reqPath, res.statusCode);
      endTimer(req.method, reqPath, res.statusCode);
    });

    next();
  }
}
