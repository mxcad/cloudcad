import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/app.config';
import { IL2CacheManager } from '../interfaces/cache-manager.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';
/**
 * L2 缓存提供者（Redis 缓存）
 * 分布式缓存，TTL 30 分钟，支持批量操作
 */
export declare class L2CacheProvider<T = unknown> implements IL2CacheManager<T>, OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly logger;
    private client;
    private isConnected;
    private defaultTTL;
    private hits;
    private misses;
    constructor(configService: ConfigService<AppConfig>);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
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
     * 批量获取缓存
     */
    getMany<K = T>(keys: string[]): Promise<Map<string, K>>;
    /**
     * 批量设置缓存
     */
    setMany<K = T>(items: Map<string, K>, ttl?: number): Promise<void>;
    /**
     * 设置过期时间
     */
    expire(key: string, ttl: number): Promise<void>;
    /**
     * 获取剩余过期时间（秒）
     */
    ttl(key: string): Promise<number>;
    /**
     * 根据模式删除缓存
     */
    deleteByPattern(pattern: string): Promise<number>;
    /**
     * 获取缓存级别
     */
    getLevel(): CacheLevel;
    /**
     * 获取缓存策略
     */
    getStrategy(): CacheStrategy;
    /**
     * 获取缓存统计信息
     */
    getStats(): Promise<{
        level: CacheLevel;
        size: number;
        hits: number;
        misses: number;
        hitRate: number;
        totalRequests: number;
        memoryUsage: number;
        isConnected: boolean;
    }>;
    /**
     * 获取缓存命中率
     */
    getHitRate(): number;
    /**
     * 获取内存使用量
     */
    private getMemoryUsage;
    /**
     * 检查连接状态
     */
    isReady(): boolean;
}
//# sourceMappingURL=l2-cache.provider.d.ts.map