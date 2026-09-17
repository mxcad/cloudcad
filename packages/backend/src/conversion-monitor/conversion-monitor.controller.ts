///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ConversionMonitorService } from './conversion-monitor.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import {
  ConversionMonitorStatsDto,
  MonitorTaskListDto,
} from './dto/conversion-monitor.dto';

/**
 * 转换队列监控（#406 / ADR-0058）：
 * 单端点返回「当前值 + 24h 历史采样」，前端 30s 轮询。
 * 与 /queue/stats（process-pool 运维端点）互补：本端点按 FUNCTION_EXECUTOR
 * 模式路由取数，standalone 模式下代理远端 conversion-service 的真实队列。
 */
@ApiTags('转换监控')
@Controller('conversion-monitor')
@UseGuards(PermissionsGuard)
export class ConversionMonitorController {
  constructor(
    private readonly conversionMonitorService: ConversionMonitorService
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '转换队列监控统计（当前值 + 24h 历史）' })
  @ApiResponse({
    status: 200,
    type: ConversionMonitorStatsDto,
    description: '转换队列监控统计',
  })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  getStats(): Promise<ConversionMonitorStatsDto> {
    return this.conversionMonitorService.getStats();
  }

  @Get('tasks')
  @ApiOperation({
    summary:
      '列出转换任务明细（#478 监控 Tab 逐任务明细）：conversion-service 模式 proxy 远端 GET /v1/conversions/tasks；process-pool 模式返回空列表',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description:
      '按状态过滤（pending/processing/completed/failed/cancelled），缺省=全部',
  })
  @ApiResponse({ status: 200, type: MonitorTaskListDto })
  @RequirePermissions([SystemPermission.SYSTEM_MONITOR])
  listTasks(
    @Query('status') status?: string
  ): Promise<MonitorTaskListDto> {
    return this.conversionMonitorService.listTasks(status);
  }
}
