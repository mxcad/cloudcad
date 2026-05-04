import { MultiLevelCacheService } from './multi-level-cache.service';
import { L1CacheProvider } from '../providers/l1-cache.provider';
import { L2CacheProvider } from '../providers/l2-cache.provider';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { ICachePerformanceMetrics, ICacheHealthStatus, IHotData } from '../interfaces/cache-stats.interface';
import { CacheLevel } from '../enums/cache-level.enum';
/**
 * 缓存监控服务
 * 实时监控缓存性能和健康状态
 */
export declare class CacheMonitorService {
    private readonly cacheService;
    private readonly l1Cache;
    private readonly l2Cache;
    private readonly l3Cache;
    private readonly logger;
    private readonly performanceData;
    private readonly maxDataPoints;
    constructor(cacheService: MultiLevelCacheService, l1Cache: L1CacheProvider, l2Cache: L2CacheProvider, l3Cache: L3CacheProvider);
    /**
     * 每分钟清理过期的性能数据（使用 @nestjs/schedule）
     */
    private cleanOldPerformanceData;
    /**
     * 获取缓存统计信息
     */
    getStats(): Promise<{
        levels: {
            L1: {
                level: CacheLevel;
                size: number;
                maxCapacity: number;
                hits: number;
                misses: number;
                hitRate: number;
                totalRequests: number;
                memoryUsage: number;
            };
            L2: {
                level: CacheLevel;
                size: number;
                hits: number;
                misses: number;
                hitRate: number;
                totalRequests: number;
                memoryUsage: number;
                isConnected: boolean;
            };
            L3: {
                level: CacheLevel;
                size: number;
                hits: number;
                misses: number;
                hitRate: number;
                totalRequests: number;
                memoryUsage: number;
            };
        };
        summary: {
            totalHits: number;
            totalMisses: number;
            totalRequests: number;
            overallHitRate: number;
            totalMemoryUsage: number;
        };
    }>;
    /**
     * 获取缓存健康状态
     */
    getHealthStatus(): Promise<{
        L1: ICacheHealthStatus;
        L2: ICacheHealthStatus;
        L3: ICacheHealthStatus;
        overall: 'healthy' | 'degraded' | 'unhealthy';
    }>;
    /**
     * 获取性能指标
     */
    getPerformanceMetrics(): Promise<Map<CacheLevel, ICachePerformanceMetrics>>;
    /**
     * 获取热点数据
     */
    getHotData(limit?: number): Promise<IHotData[]>;
    /**
     * 记录性能数据
     */
    recordPerformance(level: CacheLevel, responseTime: number, success: boolean): void;
    /**
     * 获取性能趋势
     */
    getPerformanceTrend(level: CacheLevel, minutes?: number): {
        timestamps: number[];
        avgResponseTimes: number[];
        errorRates: number[];
    };
    /**
     * 重置性能数据
     */
    resetPerformanceData(level?: CacheLevel): void;
    /**
     * 获取缓存大小趋势
     */
    getSizeTrend(minutes?: number): Promise<Map<CacheLevel, number[]>>;
    /**
     * 获取监控摘要
     */
    getMonitoringSummary(): Promise<{
        stats: {
            levels: {
                L1: {
                    level: CacheLevel;
                    size: number;
                    maxCapacity: number;
                    hits: number;
                    misses: number;
                    hitRate: number;
                    totalRequests: number;
                    memoryUsage: number;
                };
                L2: {
                    level: CacheLevel;
                    size: number;
                    hits: number;
                    misses: number;
                    hitRate: number;
                    totalRequests: number;
                    memoryUsage: number;
                    isConnected: boolean;
                };
                L3: {
                    level: CacheLevel;
                    size: number;
                    hits: number;
                    misses: number;
                    hitRate: number;
                    totalRequests: number;
                    memoryUsage: number;
                };
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
            L1: ICacheHealthStatus;
            L2: ICacheHealthStatus;
            L3: ICacheHealthStatus;
            overall: "healthy" | "degraded" | "unhealthy";
        };
        performanceMetrics: {
            [k: string]: ICachePerformanceMetrics;
        };
        hotData: IHotData[];
        timestamp: Date;
    }>;
    /**
     * 检查缓存警告
     */
    checkWarnings(): Promise<string[]>;
    /**
     * 获取级别健康状态
     */
    private getLevelHealthStatus;
    /**
     * 计算性能指标
     */
    private calculatePerformanceMetrics;
}
//# sourceMappingURL=cache-monitor.service.d.ts.map