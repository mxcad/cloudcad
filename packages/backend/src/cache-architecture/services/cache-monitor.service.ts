import { Injectable, Logger } from '@nestjs/common';
import { MultiLevelCacheService } from './multi-level-cache.service';
import { L1CacheProvider } from '../providers/l1-cache.provider';
import { L2CacheProvider } from '../providers/l2-cache.provider';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { ICachePerformanceMetrics, ICacheHealthStatus, IHotData } from '../interfaces/cache-stats.interface';
import { CacheLevel } from '../enums/cache-level.enum';

/**
 * 性能数据点
 */
interface PerformanceDataPoint {
  timestamp: number;
  responseTime: number;
  success: boolean;
}

/**
 * 缓存监控服务
 * 实时监控缓存性能和健康状态
 */
@Injectable()
export class CacheMonitorService {
  private readonly logger = new Logger(CacheMonitorService.name);
  private readonly performanceData: Map<string, PerformanceDataPoint[]> = new Map();
  private readonly maxDataPoints = 1000;
  private readonly monitoringInterval = 60000; // 1 分钟

  constructor(
    private readonly cacheService: MultiLevelCacheService,
    private readonly l1Cache: L1CacheProvider,
    private readonly l2Cache: L2CacheProvider,
    private readonly l3Cache: L3CacheProvider,
  ) {
    // 定期清理过期的性能数据
    setInterval(() => this.cleanOldPerformanceData(), this.monitoringInterval);
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
    L3: ICacheHealthStatus;
    overall: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    const [l1Status, l2Status, l3Status] = await Promise.all([
      this.getLevelHealthStatus(CacheLevel.L1),
      this.getLevelHealthStatus(CacheLevel.L2),
      this.getLevelHealthStatus(CacheLevel.L3),
    ]);

    // 确定整体健康状态
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (l1Status.status === 'unhealthy' || l2Status.status === 'unhealthy' || l3Status.status === 'unhealthy') {
      overall = 'unhealthy';
    } else if (l1Status.status === 'degraded' || l2Status.status === 'degraded' || l3Status.status === 'degraded') {
      overall = 'degraded';
    }

    return {
      L1: l1Status,
      L2: l2Status,
      L3: l3Status,
      overall,
    };
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(): Promise<Map<CacheLevel, ICachePerformanceMetrics>> {
    const metrics = new Map<CacheLevel, ICachePerformanceMetrics>();

    for (const level of [CacheLevel.L1, CacheLevel.L2, CacheLevel.L3]) {
      const levelMetrics = this.calculatePerformanceMetrics(level);
      metrics.set(level, levelMetrics);
    }

    return metrics;
  }

  /**
   * 获取热点数据
   */
  async getHotData(limit: number = 100): Promise<IHotData[]> {
    const l3HotData = await this.l3Cache.getHotData(limit);

    return l3HotData.map((data) => {
      const minutesSinceLastAccess = (Date.now() - data.lastAccessedAt.getTime()) / 60000;
      const accessFrequency = data.accessCount / Math.max(minutesSinceLastAccess, 1);

      return {
        key: data.key,
        accessCount: data.accessCount,
        lastAccessTime: data.lastAccessedAt,
        accessFrequency,
      };
    });
  }

  /**
   * 记录性能数据
   */
  recordPerformance(level: CacheLevel, responseTime: number, success: boolean): void {
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
  getPerformanceTrend(level: CacheLevel, minutes: number = 60): {
    timestamps: number[];
    avgResponseTimes: number[];
    errorRates: number[];
  } {
    const levelKey = level.toString();
    const data = this.performanceData.get(levelKey) || [];
    const cutoffTime = Date.now() - minutes * 60000;

    const recentData = data.filter((point) => point.timestamp >= cutoffTime);

    // 按分钟聚合数据
    const aggregated = new Map<number, { responseTimes: number[]; errors: number }>();

    for (const point of recentData) {
      const minute = Math.floor(point.timestamp / 60000) * 60000;
      const aggregatedPoint = aggregated.get(minute) || { responseTimes: [], errors: 0 };

      aggregatedPoint.responseTimes.push(point.responseTime);
      if (!point.success) {
        aggregatedPoint.errors++;
      }

      aggregated.set(minute, aggregatedPoint);
    }

    const sortedMinutes = Array.from(aggregated.keys()).sort();
    const timestamps = sortedMinutes;
    const avgResponseTimes = sortedMinutes.map((minute) => {
      const point = aggregated.get(minute)!;
      return point.responseTimes.reduce((sum, time) => sum + time, 0) / point.responseTimes.length;
    });
    const errorRates = sortedMinutes.map((minute) => {
      const point = aggregated.get(minute)!;
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

    for (const level of [CacheLevel.L1, CacheLevel.L2, CacheLevel.L3]) {
      const levelStats = stats.levels[level as keyof typeof stats.levels] as { size: number };
      trend.set(level, [levelStats.size]);
    }

    return trend;
  }

  /**
   * 获取监控摘要
   */
  async getMonitoringSummary() {
    const [stats, healthStatus, performanceMetrics, hotData] = await Promise.all([
      this.getStats(),
      this.getHealthStatus(),
      this.getPerformanceMetrics(),
      this.getHotData(10),
    ]);

    return {
      stats,
      healthStatus,
      performanceMetrics: Object.fromEntries(performanceMetrics),
      hotData: hotData.slice(0, 10),
      timestamp: new Date(),
    };
  }

  /**
   * 检查缓存警告
   */
  async checkWarnings(): Promise<string[]> {
    const warnings: string[] = [];
    const stats = await this.getStats();

    // 检查 L1 缓存容量
    const l1Stats = stats.levels.L1 as { size: number; maxCapacity: number };
    if (l1Stats.size > l1Stats.maxCapacity * 0.9) {
      warnings.push(`L1 缓存容量使用率超过 90% (${l1Stats.size}/${l1Stats.maxCapacity})`);
    }

    // 检查命中率
    if (stats.summary.overallHitRate < 70) {
      warnings.push(`整体缓存命中率低于 70% (${stats.summary.overallHitRate.toFixed(2)}%)`);
    }

    // 检查 L2 连接状态
    const l2Stats = stats.levels.L2 as { isConnected: boolean };
    if (!l2Stats.isConnected) {
      warnings.push('L2 缓存（Redis）连接断开');
    }

    // 检查内存使用
    const memoryUsageMB = stats.summary.totalMemoryUsage / 1024 / 1024;
    if (memoryUsageMB > 500) {
      warnings.push(`缓存内存使用超过 500MB (${memoryUsageMB.toFixed(2)}MB)`);
    }

    return warnings;
  }

  /**
   * 获取级别健康状态
   */
  private async getLevelHealthStatus(level: CacheLevel): Promise<ICacheHealthStatus> {
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

        case CacheLevel.L2:
          // 检查 Redis 连接
          const l2Connected = (this.l2Cache as any).isReady?.() ?? true;
          if (!l2Connected) {
            status = 'unhealthy';
            availability = 0;
            error = 'Redis 连接断开';
          }
          break;

        case CacheLevel.L3:
          // 检查数据库连接
          await this.l3Cache.size();
          status = 'healthy';
          break;
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
  private calculatePerformanceMetrics(level: CacheLevel): ICachePerformanceMetrics {
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

    const responseTimes = data.map((point) => point.responseTime).sort((a, b) => a - b);
    const errors = data.filter((point) => !point.success).length;

    // 计算百分位数
    const p50Index = Math.floor(responseTimes.length * 0.5);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    // 计算吞吐量（请求/秒）
    const timeSpan = (data[data.length - 1].timestamp - data[0].timestamp) / 1000;
    const throughput = timeSpan > 0 ? data.length / timeSpan : 0;

    return {
      avgResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      p50ResponseTime: responseTimes[p50Index],
      p95ResponseTime: responseTimes[p95Index],
      p99ResponseTime: responseTimes[p99Index],
      throughput,
      errorRate: (errors / data.length) * 100,
    };
  }

  /**
   * 清理过期的性能数据
   */
  private cleanOldPerformanceData(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 保留 24 小时的数据

    for (const [levelKey, data] of this.performanceData.entries()) {
      const filteredData = data.filter((point) => point.timestamp >= cutoffTime);
      this.performanceData.set(levelKey, filteredData);
    }

    this.logger.debug('已清理过期的性能数据');
  }
}