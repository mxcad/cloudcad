
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
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CacheMonitorService } from '../services/cache-monitor.service';
import { CacheStatsQueryDto } from '../dto/cache-stats.dto';

/**
 * 简化的缓存监控控制器
 * 提供与 /api/cache-monitor/stats 相同的功能，但路径更短
 */
@ApiTags('Cache')
@Controller('cache')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CacheController {
  constructor(private readonly cacheMonitorService: CacheMonitorService) {}

  /**
   * 获取缓存统计信息
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存统计信息' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功获取统计信息' })
  async getStats(@Query() query: CacheStatsQueryDto) {
    const stats = await this.cacheMonitorService.getStats();

    let result: Record<string, unknown> = stats;

    if (query.level) {
      result = stats.levels[query.level] as Record<string, unknown>;
    }

    if (query.includeHotData) {
      const hotData = await this.cacheMonitorService.getHotData(
        query.hotDataLimit ?? 100
      );
      result = { ...result, hotData };
    }

    if (query.includePerformance) {
      const performanceMetrics =
        await this.cacheMonitorService.getPerformanceMetrics();
      result = {
        ...result,
        performanceMetrics: Object.fromEntries(performanceMetrics),
      };
    }

    return result;
  }
}
