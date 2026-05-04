/**
 * 缓存预热配置 DTO
 */
export declare class CacheWarmupConfigDto {
    enabled: boolean;
    schedule: string;
    hotDataThreshold: number;
    maxWarmupSize: number;
    dataTypes: string[];
}
/**
 * 更新预热配置 DTO
 */
export declare class UpdateWarmupConfigDto {
    enabled?: boolean;
    schedule?: string;
    hotDataThreshold?: number;
    maxWarmupSize?: number;
    dataTypes?: string[];
}
/**
 * 触发预热请求 DTO
 */
export declare class TriggerWarmupDto {
    dataType?: string;
    ids?: number[];
}
/**
 * 预热历史记录 DTO
 */
export declare class WarmupHistoryDto {
    key: string;
    lastWarmup: Date;
}
/**
 * 预热统计 DTO
 */
export declare class WarmupStatsDto {
    config: CacheWarmupConfigDto;
    strategies: string[];
    strategyCount: number;
}
/**
 * 预热响应 DTO
 */
export declare class WarmupResponseDto {
    success: boolean;
    count: number;
    duration?: number;
    error?: string;
}
//# sourceMappingURL=cache-warmup-config.dto.d.ts.map