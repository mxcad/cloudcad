///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IFunctionExecutor } from '../function-executor/function-executor.interface';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { QueueStatsDto } from './dto/queue-stats.dto';

@ApiTags('队列')
@Controller('queue')
@UseGuards(PermissionsGuard)
export class QueueController {
  constructor(
    @Inject(IFunctionExecutor) private readonly executor: IFunctionExecutor
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '转换队列统计' })
  @ApiResponse({
    status: 200,
    type: QueueStatsDto,
    nullable: true,
    description:
      '优先级队列统计；当前执行器无排队队列（独立服务/云函数）时为 null',
  })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  async getQueueStats(): Promise<QueueStatsDto | null> {
    const stats = await this.executor.queueStats();
    return stats?.kind === 'priority-queue' ? stats.stats : null;
  }
}
