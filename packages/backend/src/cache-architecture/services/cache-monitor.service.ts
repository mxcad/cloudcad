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

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MultiLevelCacheService } from './multi-level-cache.service';
import { L1CacheProvider } from '../providers/l1-cache.provider';
import { L2CacheProvider } from '../providers/l2-cache.provider';
import {
  ICachePerformanceMetrics,
  ICacheHealthStatus,
} from '../interfaces/cache-stats.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';
import {
  TASK_ENABLED_KEYS,
  TASK_NAMES,
} from '../../task-run/task-run.constants';

/**
 * 性能数据点
 */
interface PerformanceDataPoint {
  timestamp: number;
  responseTime: number;
  success: boolean;
}

/**
 * 缓存告警消息键（#242 定案）
 */
export const CACHE_ALERT_KEYS = {
  L1_CAPACITY: 'cache_l1_capacity',
  HIT_RATE: 'cache_hit_rate',
  L2_DISCONNECTED: 'cache_l2_disconnected',
  MEMORY_HIGH: 'cache_memory_high',
} as const;

/**
 * 结构化缓存警告项：供告警接线使用（messageKey + level + detail）
 */
export interface CacheWarningItem {
  key: (typeof CACHE_ALERT_KEYS)[keyof typeof CACHE_ALERT_KEYS];
  level: AlertLevel;
  message: string;
  detail?: Record<string, string | number | boolean>;
}

/**
 * 定时 cron 表达式：@Cron 装饰器与手动触发注册表（任务清单展示）共用同一来源，防止漂移
 */
const PERFORMANCE_DATA_CLEANUP_CRON = '0 * * * * *';

/**
 * 缓存监控服务
 * 实时监控缓存性能和健康状态
 */
@Injectable()
export class CacheMonitorService {
  private readonly logger = new Logger(CacheMonitorService.name);
  private readonly performanceData: Map<string, PerformanceDataPoint[]> =
    new Map();
  private readonly maxDataPoints = 1000;

  constructor(
    private readonly cacheService: MultiLevelCacheService,
    private readonly l1Cache: L1CacheProvider,
    private readonly l2Cache: L2CacheProvider,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly taskRunService: TaskRunService,
    private readonly alertService: AlertService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.CACHE_MONITOR.PERFORMANCE_DATA, {
      description: '缓存性能数据过期清理',
      schedule: PERFORMANCE_DATA_CLEANUP_CRON,
      scheduleLabel: '每分钟',
      execute: () => this.cleanOldPerformanceDataTask(),
    });
  }

  /**
   * 每分钟清理过期的性能数据（使用 @nestjs/schedule）
   */
  @Cron(PERFORMANCE_DATA_CLEANUP_CRON)
  async cleanOldPerformanceData(): Promise<void> {
    const enabled = await this.runtimeConfigService.getValue<boolean>(
      TASK_ENABLED_KEYS.CACHE_MONITOR,
      true
    );
    if (!enabled) {
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.CACHE_MONITOR.PERFORMANCE_DATA,
        () => this.cleanOldPerformanceDataTask()
      );
    } catch (error) {
      this.logger.error(`缓存性能数据清理失败: ${error.message}`, error.stack);
      await this.raiseTaskFailed('cleanOldPerformanceData', error);
    }
  }

  /**
   * 定时任务失败钩子（#245 模式）：task_run_failed 告警，source = cache-monitor
   */
  private async raiseTaskFailed(task: string, error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'cache-monitor',
        messageKey: 'task_run_failed',
        // P1：单任务失败（下一轮定时重试）
        level: AlertLevel.P1,
        message: `定时任务 cache-monitor 失败（${task}）: ${error instanceof Error ? error.message : String(error)}`,
        detail: {
          task,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (alertError) {
      this.logger.error(
        `任务失败告警上报失败: ${alertError.message}`,
        alertError.stack
      );
    }
  }

  /**
   * 过期性能数据清理裸执行（定时 + 手动触发共用）
   */
  private async cleanOldPerformanceDataTask(): Promise<void> {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;

    for (const [levelKey, data] of this.performanceData.entries()) {
      const filteredData = data.filter(
        (point) => point.timestamp >= cutoffTime
      );
      this.performanceData.set(levelKey, filteredData);
    }

    this.logger.debug('已清理过期的性能数据');
  }

  /**
   * 获取缓存统计信息
   */
  async getStats() {
    return this.cacheService.getStats();
  }

  /**
   * 获取缓存健康状态
   */
  async getHealthStatus(): Promise<{
    L1: ICacheHealthStatus;
    L2: ICacheHealthStatus;
    overall: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    const [l1Status, l2Status] = await Promise.all([
      this.getLevelHealthStatus(CacheLevel.L1),
      this.getLevelHealthStatus(CacheLevel.L2),
    ]);

    // 确定整体健康状态
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (l1Status.status === 'unhealthy' || l2Status.status === 'unhealthy') {
      overall = 'unhealthy';
    } else if (
      l1Status.status === 'degraded' ||
      l2Status.status === 'degraded'
    ) {
      overall = 'degraded';
    }

    return {
      L1: l1Status,
      L2: l2Status,
      overall,
    };
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(): Promise<
    Map<CacheLevel, ICachePerformanceMetrics>
  > {
    const metrics = new Map<CacheLevel, ICachePerformanceMetrics>();

    for (const level of [CacheLevel.L1, CacheLevel.L2]) {
      const levelMetrics = this.calculatePerformanceMetrics(level);
      metrics.set(level, levelMetrics);
    }

    return metrics;
  }

  /**
   * 记录性能数据
   */
  recordPerformance(
    level: CacheLevel,
    responseTime: number,
    success: boolean
  ): void {
    const levelKey = level.toString();
    const data = this.performanceData.get(levelKey) || [];

    data.push({
      timestamp: Date.now(),
      responseTime,
      success,
    });

    // 限制数据点数量
    if (data.length > this.maxDataPoints) {
      data.shift();
    }

    this.performanceData.set(levelKey, data);
  }

  /**
   * 获取性能趋势
   */
  getPerformanceTrend(
    level: CacheLevel,
    minutes: number = 60
  ): {
    timestamps: number[];
    avgResponseTimes: number[];
    errorRates: number[];
  } {
    const levelKey = level.toString();
    const data = this.performanceData.get(levelKey) || [];
    const cutoffTime = Date.now() - minutes * 60000;

    const recentData = data.filter((point) => point.timestamp >= cutoffTime);

    // 按分钟聚合数据
    const aggregated = new Map<
      number,
      { responseTimes: number[]; errors: number }
    >();

    for (const point of recentData) {
      const minute = Math.floor(point.timestamp / 60000) * 60000;
      const aggregatedPoint = aggregated.get(minute) || {
        responseTimes: [],
        errors: 0,
      };

      aggregatedPoint.responseTimes.push(point.responseTime);
      if (!point.success) {
        aggregatedPoint.errors++;
      }

      aggregated.set(minute, aggregatedPoint);
    }

    const sortedMinutes = Array.from(aggregated.keys()).sort();
    const timestamps = sortedMinutes;
    const avgResponseTimes = sortedMinutes.map((minute) => {
      const point = aggregated.get(minute);
      if (!point) return 0;
      return (
        point.responseTimes.reduce((sum, time) => sum + time, 0) /
        point.responseTimes.length
      );
    });
    const errorRates = sortedMinutes.map((minute) => {
      const point = aggregated.get(minute);
      if (!point) return 0;
      return (point.errors / point.responseTimes.length) * 100;
    });

    return {
      timestamps,
      avgResponseTimes,
      errorRates,
    };
  }

  /**
   * 重置性能数据
   */
  resetPerformanceData(level?: CacheLevel): void {
    if (level) {
      this.performanceData.delete(level.toString());
      this.logger.debug(`已重置 ${level} 性能数据`);
    } else {
      this.performanceData.clear();
      this.logger.debug('已重置所有性能数据');
    }
  }

  /**
   * 获取缓存大小趋势
   */
  async getSizeTrend(minutes: number = 60): Promise<Map<CacheLevel, number[]>> {
    // 这里应该从持久化存储中读取历史数据
    // 目前返回当前大小
    const stats = await this.cacheService.getStats();
    const trend = new Map<CacheLevel, number[]>();

    for (const level of [CacheLevel.L1, CacheLevel.L2]) {
      const levelStats = stats.levels[level as keyof typeof stats.levels] as {
        size: number;
      };
      trend.set(level, [levelStats.size]);
    }

    return trend;
  }

  /**
   * 获取监控摘要
   */
  async getMonitoringSummary() {
    const [stats, healthStatus, performanceMetrics] = await Promise.all([
      this.getStats(),
      this.getHealthStatus(),
      this.getPerformanceMetrics(),
    ]);

    return {
      stats,
      healthStatus,
      performanceMetrics: Object.fromEntries(performanceMetrics),
      timestamp: new Date(),
    };
  }

  /**
   * 检查缓存警告（#242 定案告警接线使用）
   * 返回结构化警告项（messageKey + level + detail），供 CacheCleanupScheduler 调 AlertService.raise
   */
  async checkWarningItems(): Promise<CacheWarningItem[]> {
    return this.buildWarningItems();
  }

  /**
   * 检查缓存警告（纯文本，API 契约保持不变）
   */
  async checkWarnings(): Promise<string[]> {
    const items = await this.buildWarningItems();
    return items.map((item) => item.message);
  }

  /**
   * 构建结构化警告项（检测阈值与逻辑保持原样，零新增检测逻辑）
   */
  private async buildWarningItems(): Promise<CacheWarningItem[]> {
    const warnings: CacheWarningItem[] = [];
    const stats = await this.getStats();

    // 检查 L1 缓存容量
    const l1Stats = stats.levels.L1 as { size: number; maxCapacity: number };
    if (l1Stats.size > l1Stats.maxCapacity * 0.9) {
      warnings.push({
        key: CACHE_ALERT_KEYS.L1_CAPACITY,
        // P1：聚合告警（容量水位）
        level: AlertLevel.P1,
        message: `L1 缓存容量使用率超过 90% (${l1Stats.size}/${l1Stats.maxCapacity})`,
        detail: { size: l1Stats.size, maxCapacity: l1Stats.maxCapacity },
      });
    }

    // 检查命中率
    if (stats.summary.overallHitRate < 70) {
      warnings.push({
        key: CACHE_ALERT_KEYS.HIT_RATE,
        // P1：聚合告警（命中率劣化）
        level: AlertLevel.P1,
        message: `整体缓存命中率低于 70% (${stats.summary.overallHitRate.toFixed(2)}%)`,
        detail: { overallHitRate: stats.summary.overallHitRate },
      });
    }

    // 检查 L2 连接状态
    const l2Stats = stats.levels.L2 as { isConnected: boolean };
    if (!l2Stats.isConnected) {
      warnings.push({
        key: CACHE_ALERT_KEYS.L2_DISCONNECTED,
        // P0：Redis（L2）不可用
        level: AlertLevel.P0,
        message: 'L2 缓存（Redis）连接断开',
        detail: { isConnected: false },
      });
    }

    // 检查内存使用
    const memoryUsageMB = stats.summary.totalMemoryUsage / 1024 / 1024;
    if (memoryUsageMB > 500) {
      warnings.push({
        key: CACHE_ALERT_KEYS.MEMORY_HIGH,
        // P1：聚合告警（内存水位）
        level: AlertLevel.P1,
        message: `缓存内存使用超过 500MB (${memoryUsageMB.toFixed(2)}MB)`,
        detail: { memoryUsageMB: Number(memoryUsageMB.toFixed(2)) },
      });
    }

    return warnings;
  }

  /**
   * 获取级别健康状态
   */
  private async getLevelHealthStatus(
    level: CacheLevel
  ): Promise<ICacheHealthStatus> {
    const now = new Date();
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let availability = 100;
    let error: string | undefined;

    try {
      switch (level) {
        case CacheLevel.L1:
          // L1 总是健康的（内存缓存）
          status = 'healthy';
          break;

        case CacheLevel.L2: {
          // 检查 Redis 连接
          const l2Connected = this.l2Cache.isReady();
          if (!l2Connected) {
            status = 'unhealthy';
            availability = 0;
            error = 'Redis 连接断开';
          }
          break;
        }
      }
    } catch (err) {
      status = 'unhealthy';
      availability = 0;
      error = err instanceof Error ? err.message : '未知错误';
    }

    return {
      level,
      status,
      lastCheckTime: now,
      availability,
      error,
    };
  }

  /**
   * 计算性能指标
   */
  private calculatePerformanceMetrics(
    level: CacheLevel
  ): ICachePerformanceMetrics {
    const levelKey = level.toString();
    const data = this.performanceData.get(levelKey) || [];

    if (data.length === 0) {
      return {
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errorRate: 0,
      };
    }

    const responseTimes = data
      .map((point) => point.responseTime)
      .sort((a, b) => a - b);
    const errors = data.filter((point) => !point.success).length;

    // 计算百分位数
    const p50Index = Math.floor(responseTimes.length * 0.5);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    // 计算吞吐量（请求/秒）
    const firstData = data[0];
    const lastData = data[data.length - 1];
    const timeSpan =
      firstData && lastData
        ? (lastData.timestamp - firstData.timestamp) / 1000
        : 0;
    const throughput = timeSpan > 0 ? data.length / timeSpan : 0;

    return {
      avgResponseTime:
        responseTimes.reduce((sum, time) => sum + time, 0) /
        responseTimes.length,
      p50ResponseTime: responseTimes[p50Index] ?? 0,
      p95ResponseTime: responseTimes[p95Index] ?? 0,
      p99ResponseTime: responseTimes[p99Index] ?? 0,
      throughput,
      errorRate: (errors / data.length) * 100,
    };
  }
}
