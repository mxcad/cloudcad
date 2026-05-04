import { CacheMonitorService } from '../services/cache-monitor.service';
import { MultiLevelCacheService } from '../services/multi-level-cache.service';
import { CacheWarmupService } from '../services/cache-warmup.service';
import { CacheMonitoringSummaryDto } from '../dto/cache-stats.dto';
import { CacheWarningsDto } from '../dto/cache-stats.dto';
import { PerformanceTrendQueryDto } from '../dto/cache-stats.dto';
import { PerformanceTrendDto } from '../dto/cache-stats.dto';
import { SizeTrendDto } from '../dto/cache-stats.dto';
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
export declare class CacheMonitorController {
    private readonly cacheMonitorService;
    private readonly cacheService;
    private readonly cacheWarmupService;
    constructor(cacheMonitorService: CacheMonitorService, cacheService: MultiLevelCacheService, cacheWarmupService: CacheWarmupService);
    /**
     * 获取缓存监控摘要
     */
    getSummary(): Promise<CacheMonitoringSummaryDto>;
    /**
     * 获取缓存健康状态
     */
    getHealthStatus(): Promise<{
        L1: import("../interfaces/cache-stats.interface").ICacheHealthStatus;
        L2: import("../interfaces/cache-stats.interface").ICacheHealthStatus;
        L3: import("../interfaces/cache-stats.interface").ICacheHealthStatus;
        overall: "healthy" | "degraded" | "unhealthy";
    }>;
    /**
     * 获取性能指标
     */
    getPerformanceMetrics(): Promise<{
        [k: string]: import("../interfaces/cache-stats.interface").ICachePerformanceMetrics;
    }>;
    /**
     * 获取热点数据
     */
    getHotData(limit?: string): Promise<import("../interfaces/cache-stats.interface").IHotData[]>;
    /**
     * 获取性能趋势
     */
    getPerformanceTrend(query: PerformanceTrendQueryDto): Promise<PerformanceTrendDto>;
    /**
     * 获取缓存大小趋势
     */
    getSizeTrend(minutes?: string): Promise<SizeTrendDto>;
    /**
     * 获取缓存警告
     */
    getWarnings(): Promise<CacheWarningsDto>;
    /**
     * 获取缓存值
     */
    getValue(key: string): Promise<unknown>;
    /**
     * 删除缓存
     */
    deleteValue(key: string): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 批量删除缓存
     */
    deleteValues(dto: BatchCacheOperationDto): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 刷新缓存
     */
    refresh(dto: CacheRefreshDto): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 清理缓存
     */
    cleanup(dto: CacheCleanupDto): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 获取预热配置
     */
    getWarmupConfig(): Promise<import("../services/cache-warmup.service").ICacheWarmupConfig>;
    /**
     * 更新预热配置
     */
    updateWarmupConfig(dto: UpdateWarmupConfigDto): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * 触发预热
     */
    triggerWarmup(dto?: TriggerWarmupDto): Promise<WarmupResponseDto>;
    /**
     * 获取预热历史
     */
    getWarmupHistory(): Promise<WarmupHistoryDto[]>;
    /**
     * 获取预热统计
     */
    getWarmupStats(): Promise<WarmupStatsDto>;
    /**
     * 清除预热历史
     */
    clearWarmupHistory(): Promise<{
        success: boolean;
        message: string;
    }>;
}
//# sourceMappingURL=cache-monitor.controller.d.ts.map