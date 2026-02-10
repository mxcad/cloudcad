import { CacheLevel } from '../enums/cache-level.enum';

/**
 * 缓存统计接口
 */
export interface ICacheStats {
  /**
   * 缓存级别
   */
  level: CacheLevel;

  /**
   * 缓存大小（条目数）
   */
  size: number;

  /**
   * 命中次数
   */
  hits: number;

  /**
   * 未命中次数
   */
  misses: number;

  /**
   * 命中率（0-100）
   */
  hitRate: number;

  /**
   * 总请求数
   */
  totalRequests: number;

  /**
   * 总设置次数
   */
  totalSets: number;

  /**
   * 总删除次数
   */
  totalDeletes: number;

  /**
   * 内存使用量（字节）
   */
  memoryUsage: number;

  /**
   * 统计开始时间
   */
  startTime: Date;

  /**
   * 最后更新时间
   */
  lastUpdated: Date;
}

/**
 * 缓存性能指标接口
 */
export interface ICachePerformanceMetrics {
  /**
   * 平均响应时间（毫秒）
   */
  avgResponseTime: number;

  /**
   * P50 响应时间（毫秒）
   */
  p50ResponseTime: number;

  /**
   * P95 响应时间（毫秒）
   */
  p95ResponseTime: number;

  /**
   * P99 响应时间（毫秒）
   */
  p99ResponseTime: number;

  /**
   * 吞吐量（请求/秒）
   */
  throughput: number;

  /**
   * 错误率（0-100）
   */
  errorRate: number;
}

/**
 * 缓存健康状态接口
 */
export interface ICacheHealthStatus {
  /**
   * 缓存级别
   */
  level: CacheLevel;

  /**
   * 健康状态
   */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /**
   * 最后检查时间
   */
  lastCheckTime: Date;

  /**
   * 可用性（0-100）
   */
  availability: number;

  /**
   * 错误信息
   */
  error?: string;
}

/**
 * 缓存热点数据接口
 */
export interface IHotData {
  /**
   * 缓存键
   */
  key: string;

  /**
   * 访问次数
   */
  accessCount: number;

  /**
   * 最后访问时间
   */
  lastAccessTime: Date;

  /**
   * 访问频率（次/分钟）
   */
  accessFrequency: number;
}

/**
 * 缓存预热配置接口
 */
export interface ICacheWarmupConfig {
  /**
   * 是否启用预热
   */
  enabled: boolean;

  /**
   * 预热时间（cron 表达式）
   */
  schedule: string;

  /**
   * 热点数据阈值（次/分钟）
   */
  hotDataThreshold: number;

  /**
   * 最大预热数据量
   */
  maxWarmupSize: number;

  /**
   * 预热数据类型
   */
  dataTypes: string[];
}