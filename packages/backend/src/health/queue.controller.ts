///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProcessPoolExecutor } from '../function-executor/process-pool.executor';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { QueueStatsDto } from './dto/queue-stats.dto';

@ApiTags('队列')
@Controller('queue')
@UseGuards(PermissionsGuard)
export class QueueController {
  constructor(private readonly processPoolExecutor: ProcessPoolExecutor) {}

  @Get('stats')
  @ApiOperation({ summary: '转换队列统计' })
  @ApiResponse({ status: 200, type: QueueStatsDto, description: '转换队列统计信息' })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  getQueueStats(): QueueStatsDto {
    return this.processPoolExecutor.getQueueStats();
  }
}
