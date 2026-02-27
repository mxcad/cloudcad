import { ApiProperty } from '@nestjs/swagger';

/**
 * 缓存统计 DTO
 */
export class CacheStatsDto {
  @ApiProperty({ description: '缓存级别' })
  level: string;

  @ApiProperty({ description: '缓存大小' })
  size: number;

  @ApiProperty({ description: '命中次数' })
  hits: number;

  @ApiProperty({ description: '未命中次数' })
  misses: number;

  @ApiProperty({ description: '命中率' })
  hitRate: number;

  @ApiProperty({ description: '总请求数' })
  totalRequests: number;

  @ApiProperty({ description: '内存使用量（字节）' })
  memoryUsage: number;
}

/**
 * 缓存健康状态 DTO
 */
export class CacheHealthStatusDto {
  @ApiProperty({ description: '缓存级别' })
  level: string;

  @ApiProperty({ description: '健康状态', enum: ['healthy', 'degraded', 'unhealthy'] })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({ description: '最后检查时间' })
  lastCheckTime: Date;

  @ApiProperty({ description: '可用性（0-100）' })
  availability: number;

  @ApiProperty({ description: '错误信息', required: false })
  error?: string;
}

/**
 * 缓存性能指标 DTO
 */
export class CachePerformanceMetricsDto {
  @ApiProperty({ description: '平均响应时间（毫秒）' })
  avgResponseTime: number;

  @ApiProperty({ description: 'P50 响应时间（毫秒）' })
  p50ResponseTime: number;

  @ApiProperty({ description: 'P95 响应时间（毫秒）' })
  p95ResponseTime: number;

  @ApiProperty({ description: 'P99 响应时间（毫秒）' })
  p99ResponseTime: number;

  @ApiProperty({ description: '吞吐量（请求/秒）' })
  throughput: number;

  @ApiProperty({ description: '错误率（0-100）' })
  errorRate: number;
}

/**
 * 热点数据 DTO
 */
export class HotDataDto {
  @ApiProperty({ description: '缓存键' })
  key: string;

  @ApiProperty({ description: '访问次数' })
  accessCount: number;

  @ApiProperty({ description: '最后访问时间' })
  lastAccessTime: Date;

  @ApiProperty({ description: '访问频率（次/分钟）' })
  accessFrequency: number;
}

/**
 * 缓存监控摘要 DTO
 */
export class CacheMonitoringSummaryDto {
  @ApiProperty({ description: '缓存统计' })
  stats: {
    levels: {
      L1: CacheStatsDto;
      L2: CacheStatsDto;
      L3: CacheStatsDto;
    };
    summary: {
      totalHits: number;
      totalMisses: number;
      totalRequests: number;
      overallHitRate: number;
      totalMemoryUsage: number;
    };
  };

  @ApiProperty({ description: '健康状态' })
  healthStatus: {
    L1: CacheHealthStatusDto;
    L2: CacheHealthStatusDto;
    L3: CacheHealthStatusDto;
    overall: 'healthy' | 'degraded' | 'unhealthy';
  };

  @ApiProperty({ description: '性能指标' })
  performanceMetrics: {
    L1: CachePerformanceMetricsDto;
    L2: CachePerformanceMetricsDto;
    L3: CachePerformanceMetricsDto;
  };

  @ApiProperty({ description: '热点数据' })
  hotData: HotDataDto[];

  @ApiProperty({ description: '时间戳' })
  timestamp: Date;
}

/**
 * 缓存警告列表 DTO
 */
export class CacheWarningsDto {
  @ApiProperty({ description: '警告列表' })
  warnings: string[];
}

/**
 * 缓存操作请求 DTO
 */
export class CacheOperationDto {
  @ApiProperty({ description: '缓存键' })
  key: string;

  @ApiProperty({ description: '缓存值', required: false })
  value?: unknown;

  @ApiProperty({ description: 'TTL（秒）', required: false })
  ttl?: number;
}

/**
 * 批量缓存操作请求 DTO
 */
export class BatchCacheOperationDto {
  @ApiProperty({ description: '缓存键列表' })
  keys: string[];

  @ApiProperty({ description: 'TTL（秒）', required: false })
  ttl?: number;
}

/**
 * 缓存刷新请求 DTO
 */
export class CacheRefreshDto {
  @ApiProperty({ description: '缓存键' })
  key: string;

  @ApiProperty({ description: '是否强制刷新', required: false })
  force?: boolean;
}

/**
 * 缓存清理请求 DTO
 */
export class CacheCleanupDto {
  @ApiProperty({ description: '缓存级别', enum: ['L1', 'L2', 'L3', 'ALL'], required: false })
  level?: 'L1' | 'L2' | 'L3' | 'ALL';

  @ApiProperty({ description: '模式（支持通配符）', required: false })
  pattern?: string;
}

/**
 * 缓存统计查询 DTO
 */
export class CacheStatsQueryDto {
  @ApiProperty({ description: '缓存级别', enum: ['L1', 'L2', 'L3'], required: false })
  level?: 'L1' | 'L2' | 'L3';

  @ApiProperty({ description: '是否包含性能指标', required: false })
  includePerformance?: boolean;

  @ApiProperty({ description: '是否包含热点数据', required: false })
  includeHotData?: boolean;

  @ApiProperty({ description: '热点数据数量', required: false })
  hotDataLimit?: number;
}

/**
 * 性能趋势查询 DTO
 */
export class PerformanceTrendQueryDto {
  @ApiProperty({ description: '缓存级别', enum: ['L1', 'L2', 'L3'] })
  level: 'L1' | 'L2' | 'L3';

  @ApiProperty({ description: '时间范围（分钟）', required: false })
  minutes?: number;
}

/**
 * 性能趋势响应 DTO
 */
export class PerformanceTrendDto {
  @ApiProperty({ description: '时间戳数组' })
  timestamps: number[];

  @ApiProperty({ description: '平均响应时间数组' })
  avgResponseTimes: number[];

  @ApiProperty({ description: '错误率数组' })
  errorRates: number[];
}

/**
 * 缓存大小趋势响应 DTO
 */
export class SizeTrendDto {
  @ApiProperty({ description: 'L1 缓存大小数组' })
  L1: number[];

  @ApiProperty({ description: 'L2 缓存大小数组' })
  L2: number[];

  @ApiProperty({ description: 'L3 缓存大小数组' })
  L3: number[];
}