///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CacheMonitorService } from '../services/cache-monitor.service';
import { MultiLevelCacheService } from '../services/multi-level-cache.service';
import { CacheWarmupService } from '../services/cache-warmup.service';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheMonitoringSummaryDto } from '../dto/cache-stats.dto';
import { CacheWarningsDto } from '../dto/cache-stats.dto';
import { CacheStatsQueryDto } from '../dto/cache-stats.dto';
import { PerformanceTrendQueryDto } from '../dto/cache-stats.dto';
import { PerformanceTrendDto } from '../dto/cache-stats.dto';
import { SizeTrendDto } from '../dto/cache-stats.dto';
import { CacheOperationDto } from '../dto/cache-stats.dto';
import { BatchCacheOperationDto } from '../dto/cache-stats.dto';
import { CacheRefreshDto } from '../dto/cache-stats.dto';
import { CacheCleanupDto } from '../dto/cache-stats.dto';
import { UpdateWarmupConfigDto } from '../dto/cache-warmup-config.dto';
import { TriggerWarmupDto } from '../dto/cache-warmup-config.dto';
import { WarmupResponseDto } from '../dto/cache-warmup-config.dto';
import { WarmupHistoryDto } from '../dto/cache-warmup-config.dto';
import { WarmupStatsDto } from '../dto/cache-warmup-config.dto';

/**
 * 缓存监控控制器
 * 提供缓存管理、监控和预热 API
 */
@ApiTags('Cache Monitor')
@Controller('cache-monitor')
@ApiBearerAuth()
export class CacheMonitorController {
  constructor(
    private readonly cacheMonitorService: CacheMonitorService,
    private readonly cacheService: MultiLevelCacheService,
    private readonly cacheWarmupService: CacheWarmupService
  ) {}

  /**
   * 获取缓存监控摘要
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存监控摘要' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取监控摘要',
    type: CacheMonitoringSummaryDto,
  })
  async getSummary(): Promise<CacheMonitoringSummaryDto> {
    const summary = this.cacheMonitorService.getMonitoringSummary();
    return summary as unknown as CacheMonitoringSummaryDto;
  }

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

  /**
   * 获取缓存健康状态
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存健康状态' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功获取健康状态' })
  async getHealthStatus() {
    return this.cacheMonitorService.getHealthStatus();
  }

  /**
   * 获取性能指标
   */
  @Get('performance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存性能指标' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功获取性能指标' })
  async getPerformanceMetrics() {
    const metrics = await this.cacheMonitorService.getPerformanceMetrics();
    return Object.fromEntries(metrics);
  }

  /**
   * 获取热点数据
   */
  @Get('hot-data')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取热点数据' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功获取热点数据' })
  async getHotData(@Query('limit') limit?: string) {
    const hotDataLimit = limit ? parseInt(limit, 10) : 100;
    return this.cacheMonitorService.getHotData(hotDataLimit);
  }

  /**
   * 获取性能趋势
   */
  @Get('performance-trend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取性能趋势' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取性能趋势',
    type: PerformanceTrendDto,
  })
  async getPerformanceTrend(
    @Query() query: PerformanceTrendQueryDto
  ): Promise<PerformanceTrendDto> {
    const level = query.level as unknown as CacheLevel;
    const trend = this.cacheMonitorService.getPerformanceTrend(
      level,
      query.minutes ?? 60
    );
    return trend as unknown as PerformanceTrendDto;
  }

  /**
   * 获取缓存大小趋势
   */
  @Get('size-trend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存大小趋势' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取大小趋势',
    type: SizeTrendDto,
  })
  async getSizeTrend(
    @Query('minutes') minutes?: string
  ): Promise<SizeTrendDto> {
    const trendMinutes = minutes ? parseInt(minutes, 10) : 60;
    const trend = await this.cacheMonitorService.getSizeTrend(trendMinutes);

    // 从 Map 转换为 DTO 格式
    const l1Trend = trend.get(CacheLevel.L1) ?? [];
    const l2Trend = trend.get(CacheLevel.L2) ?? [];
    const l3Trend = trend.get(CacheLevel.L3) ?? [];

    return {
      L1: l1Trend,
      L2: l2Trend,
      L3: l3Trend,
    } as SizeTrendDto;
  }

  /**
   * 获取缓存警告
   */
  @Get('warnings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存警告' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取警告',
    type: CacheWarningsDto,
  })
  async getWarnings(): Promise<CacheWarningsDto> {
    const warnings = await this.cacheMonitorService.checkWarnings();
    return { warnings };
  }

  /**
   * 获取缓存值
   */
  @Get('value')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取缓存值' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功获取缓存值' })
  async getValue(@Query('key') key: string) {
    return this.cacheService.get(key);
  }

  /**
   * 设置缓存值
   */
  @Post('value')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '设置缓存值' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功设置缓存值' })
  async setValue(@Body() dto: CacheOperationDto) {
    await this.cacheService.set(dto.key, dto.value, dto.ttl);
    return { success: true, message: '缓存设置成功' };
  }

  /**
   * 删除缓存
   */
  @Delete('value')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除缓存' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功删除缓存' })
  async deleteValue(@Query('key') key: string) {
    await this.cacheService.delete(key);
    return { success: true, message: '缓存删除成功' };
  }

  /**
   * 批量删除缓存
   */
  @Delete('values')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量删除缓存' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功批量删除缓存' })
  async deleteValues(@Body() dto: BatchCacheOperationDto) {
    await this.cacheService.deleteMany(dto.keys);
    return { success: true, message: `成功删除 ${dto.keys.length} 条缓存` };
  }

  /**
   * 根据模式删除缓存
   */
  @Delete('pattern')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '根据模式删除缓存' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功删除缓存' })
  async deleteByPattern(@Query('pattern') pattern: string) {
    const count = await this.cacheService.deleteByPattern(pattern);
    return { success: true, message: `成功删除 ${count} 条缓存` };
  }

  /**
   * 刷新缓存
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新缓存' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功刷新缓存' })
  async refresh(@Body() dto: CacheRefreshDto) {
    const value = await this.cacheService.get(dto.key);
    if (value === null) {
      return { success: false, message: '缓存不存在' };
    }
    await this.cacheService.delete(dto.key);
    await this.cacheService.set(dto.key, value);
    return { success: true, message: '缓存刷新成功' };
  }

  /**
   * 清理缓存
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清理缓存' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功清理缓存' })
  async cleanup(@Body() dto: CacheCleanupDto) {
    if (dto.pattern) {
      const count = await this.cacheService.deleteByPattern(dto.pattern);
      return { success: true, message: `成功清理 ${count} 条缓存` };
    }

    if (dto.level === 'ALL' || !dto.level) {
      await this.cacheService.clear();
      return { success: true, message: '成功清理所有缓存' };
    }

    // 根据级别清理（需要实现特定级别的清理）
    return { success: true, message: '缓存清理成功' };
  }

  /**
   * 获取预热配置
   */
  @Get('warmup/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取预热配置' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功获取预热配置' })
  async getWarmupConfig() {
    return this.cacheWarmupService.getConfig();
  }

  /**
   * 更新预热配置
   */
  @Post('warmup/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新预热配置' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功更新预热配置' })
  async updateWarmupConfig(@Body() dto: UpdateWarmupConfigDto) {
    this.cacheWarmupService.updateConfig(dto);
    return { success: true, message: '预热配置更新成功' };
  }

  /**
   * 触发预热
   */
  @Post('warmup/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '触发预热' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功触发预热',
    type: WarmupResponseDto,
  })
  async triggerWarmup(
    @Body() dto?: TriggerWarmupDto
  ): Promise<WarmupResponseDto> {
    return this.cacheWarmupService.triggerWarmup();
  }

  /**
   * 获取预热历史
   */
  @Get('warmup/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取预热历史' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取预热历史',
    type: [WarmupHistoryDto],
  })
  async getWarmupHistory(): Promise<WarmupHistoryDto[]> {
    return this.cacheWarmupService.getWarmupHistory();
  }

  /**
   * 获取预热统计
   */
  @Get('warmup/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取预热统计' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '成功获取预热统计',
    type: WarmupStatsDto,
  })
  async getWarmupStats(): Promise<WarmupStatsDto> {
    return this.cacheWarmupService.getWarmupStats();
  }

  /**
   * 清除预热历史
   */
  @Delete('warmup/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '清除预热历史' })
  @ApiResponse({ status: HttpStatus.OK, description: '成功清除预热历史' })
  async clearWarmupHistory() {
    this.cacheWarmupService.clearWarmupHistory();
    return { success: true, message: '预热历史已清除' };
  }
}
