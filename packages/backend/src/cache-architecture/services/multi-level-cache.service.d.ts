import { L1CacheProvider } from '../providers/l1-cache.provider';
import { L2CacheProvider } from '../providers/l2-cache.provider';
import { L3CacheProvider } from '../providers/l3-cache.provider';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheVersionService, CacheVersionType } from './cache-version.service';
/**
 * 多级缓存服务
 * 统一管理 L1、L2、L3 三级缓存
 */
export declare class MultiLevelCacheService {
    private readonly l1Cache;
    private readonly l2Cache;
    private readonly l3Cache;
    private readonly cacheVersionService?;
    private readonly logger;
    private readonly penetrationConfig;
    private readonly avalancheConfig;
    private readonly versionConfig;
    constructor(l1Cache: L1CacheProvider, l2Cache: L2CacheProvider, l3Cache: L3CacheProvider, cacheVersionService?: CacheVersionService | undefined);
    /**
     * 启用版本控制
     */
    enableVersionControl(type: CacheVersionType, versionKey?: string): void;
    /**
     * 禁用版本控制
     */
    disableVersionControl(): void;
    /**
     * 获取版本化的缓存键
     */
    private getVersionedKey;
    /**
     * 更新缓存版本
     */
    updateVersion(description?: string): Promise<string | null>;
    /**
     * 获取缓存值（多级查询）
     * 查询顺序：L1 → L2 → L3
     * 自动回填：L3 → L2 → L1
     */
    get<T>(key: string): Promise<T | null>;
    /**
     * 获取或加载缓存值
     * 如果缓存不存在，从数据源加载并写入所有级别
     */
    getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T>;
    /**
     * 批量获取缓存值
     */
    getMany<T>(keys: string[]): Promise<Map<string, T>>;
    /**
     * 设置缓存值（写入所有级别）
     */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    /**
     * 批量设置缓存值
     */
    setMany<T>(items: Map<string, T>, ttl?: number): Promise<void>;
    /**
     * 删除缓存（所有级别）
     */
    delete(key: string): Promise<void>;
    /**
     * 批量删除缓存（所有级别）
     */
    deleteMany(keys: string[]): Promise<void>;
    /**
     * 根据模式删除缓存（仅 L2 和 L3）
     */
    deleteByPattern(pattern: string): Promise<number>;
    /**
     * 清空所有缓存（所有级别）
     */
    clear(): Promise<void>;
    /**
     * 检查缓存是否存在
     */
    has(key: string): Promise<boolean>;
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
     * 刷新缓存（删除并重新加载）
     */
    refresh<T>(key: string, loader: () => Promise<T>): Promise<T>;
    /**
     * 仅从指定级别获取缓存
     */
    getFromLevel<T>(key: string, level: CacheLevel): Promise<T | null>;
    /**
     * 仅写入指定级别
     */
    setToLevel<T>(key: string, value: T, level: CacheLevel, ttl?: number): Promise<void>;
    /**
     * 获取有效 TTL（应用缓存雪崩保护）
     */
    private getEffectiveTTL;
    /**
     * 批量设置 L1 缓存
     */
    private setL1Many;
    /**
     * 批量设置 L3 缓存
     */
    private setL3Many;
}
//# sourceMappingURL=multi-level-cache.service.d.ts.map