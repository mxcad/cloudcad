/**
 * 缓存统计 DTO
 */
export declare class CacheStatsDto {
    level: string;
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    totalRequests: number;
    memoryUsage: number;
}
/**
 * 缓存健康状态 DTO
 */
export declare class CacheHealthStatusDto {
    level: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheckTime: Date;
    availability: number;
    error?: string;
}
/**
 * 缓存性能指标 DTO
 */
export declare class CachePerformanceMetricsDto {
    avgResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    errorRate: number;
}
/**
 * 热点数据 DTO
 */
export declare class HotDataDto {
    key: string;
    accessCount: number;
    lastAccessTime: Date;
    accessFrequency: number;
}
/**
 * 缓存监控摘要 DTO
 */
export declare class CacheMonitoringSummaryDto {
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
    healthStatus: {
        L1: CacheHealthStatusDto;
        L2: CacheHealthStatusDto;
        L3: CacheHealthStatusDto;
        overall: 'healthy' | 'degraded' | 'unhealthy';
    };
    performanceMetrics: {
        L1: CachePerformanceMetricsDto;
        L2: CachePerformanceMetricsDto;
        L3: CachePerformanceMetricsDto;
    };
    hotData: HotDataDto[];
    timestamp: Date;
}
/**
 * 缓存警告列表 DTO
 */
export declare class CacheWarningsDto {
    warnings: string[];
}
/**
 * 缓存操作请求 DTO
 */
export declare class CacheOperationDto {
    key: string;
    value?: unknown;
    ttl?: number;
}
/**
 * 批量缓存操作请求 DTO
 */
export declare class BatchCacheOperationDto {
    keys: string[];
    ttl?: number;
}
/**
 * 缓存刷新请求 DTO
 */
export declare class CacheRefreshDto {
    key: string;
    force?: boolean;
}
/**
 * 缓存清理请求 DTO
 */
export declare class CacheCleanupDto {
    level?: 'L1' | 'L2' | 'L3' | 'ALL';
    pattern?: string;
}
/**
 * 缓存统计查询 DTO
 */
export declare class CacheStatsQueryDto {
    level?: 'L1' | 'L2' | 'L3';
    includePerformance?: boolean;
    includeHotData?: boolean;
    hotDataLimit?: number;
}
/**
 * 性能趋势查询 DTO
 */
export declare class PerformanceTrendQueryDto {
    level: 'L1' | 'L2' | 'L3';
    minutes?: number;
}
/**
 * 性能趋势响应 DTO
 */
export declare class PerformanceTrendDto {
    timestamps: number[];
    avgResponseTimes: number[];
    errorRates: number[];
}
/**
 * 缓存大小趋势响应 DTO
 */
export declare class SizeTrendDto {
    L1: number[];
    L2: number[];
    L3: number[];
}
//# sourceMappingURL=cache-stats.dto.d.ts.map