import { IL1CacheManager } from '../interfaces/cache-manager.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';
/**
 * L1 缓存提供者（内存缓存）
 * 使用 LRU 策略，最大容量 1000 条，TTL 5 分钟
 */
export declare class L1CacheProvider<T = unknown> implements IL1CacheManager<T> {
    private readonly logger;
    private readonly cache;
    private maxCapacity;
    private defaultTTL;
    private hits;
    private misses;
    constructor();
    /**
     * 获取缓存值
     */
    get<K = T>(key: string): Promise<K | null>;
    /**
     * 设置缓存值
     */
    set<K = T>(key: string, value: K, ttl?: number | null): Promise<void>;
    /**
     * 删除缓存
     */
    delete(key: string): Promise<void>;
    /**
     * 批量删除缓存
     */
    deleteMany(keys: string[]): Promise<void>;
    /**
     * 清空所有缓存
     */
    clear(): Promise<void>;
    /**
     * 检查缓存是否存在
     */
    has(key: string): Promise<boolean>;
    /**
     * 获取缓存大小
     */
    size(): Promise<number>;
    /**
     * 获取缓存级别
     */
    getLevel(): CacheLevel;
    /**
     * 获取缓存策略
     */
    getStrategy(): CacheStrategy;
    /**
     * 设置最大缓存容量
     */
    setMaxCapacity(capacity: number): void;
    /**
     * 获取当前缓存容量
     */
    getCurrentCapacity(): number;
    /**
     * 获取缓存命中率
     */
    getHitRate(): number;
    /**
     * 获取缓存统计信息
     */
    getStats(): {
        level: CacheLevel;
        size: number;
        maxCapacity: number;
        hits: number;
        misses: number;
        hitRate: number;
        totalRequests: number;
        memoryUsage: number;
    };
    /**
     * 清理过期缓存
     */
    private cleanExpired;
    /**
     * 执行 LRU 淘汰
     */
    private evictLRU;
    /**
     * 估算内存使用量（字节）
     */
    private estimateMemoryUsage;
}
//# sourceMappingURL=l1-cache.provider.d.ts.map