import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { MetricsAccessGuard } from './metrics-access.guard';
import { ScrapeAuth } from '../auth/decorators/scrape-auth.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';

@ApiExcludeController()
@Controller('metrics')
@UseGuards(MetricsAccessGuard)
// 回退通道：未配置 SCRAPE_TOKEN 或凭据不匹配时，仍按 SYSTEM_MONITOR 权限控制（历史行为）
@RequirePermissions([SystemPermission.SYSTEM_MONITOR])
@ScrapeAuth()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.metricsService.getContentType());
    const metrics = await this.metricsService.getMetrics();
    res.end(metrics);
  }
}
