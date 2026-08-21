import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';

@ApiExcludeController()
@Controller('metrics')
@UseGuards(PermissionsGuard)
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
