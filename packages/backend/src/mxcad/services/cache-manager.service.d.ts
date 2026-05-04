import { ConfigService } from '@nestjs/config';
export interface CacheItem<T> {
    data: T;
    timestamp: number;
}
export declare class CacheManagerService {
    private readonly configService;
    private readonly logger;
    private readonly caches;
    private readonly defaultTTL;
    constructor(configService: ConfigService);
    /**
     * 获取缓存值
     * @param cacheName 缓存名称
     * @param key 缓存键
     * @param ttl 过期时间（毫秒），可选
     * @returns 缓存值或null
     */
    get<T>(cacheName: string, key: string, ttl?: number): T | null;
    /**
     * 设置缓存值
     * @param cacheName 缓存名称
     * @param key 缓存键
     * @param value 缓存值
     */
    set<T>(cacheName: string, key: string, value: T): void;
    /**
     * 删除缓存值
     * @param cacheName 缓存名称
     * @param key 缓存键
     * @returns 是否删除成功
     */
    delete(cacheName: string, key: string): boolean;
    /**
     * 清理过期缓存
     * @param cacheName 缓存名称，可选
     * @param ttl 过期时间（毫秒），可选
     */
    cleanExpired(cacheName?: string, ttl?: number): void;
    /**
     * 清空指定缓存
     * @param cacheName 缓存名称
     */
    clear(cacheName: string): void;
    /**
     * 清空所有缓存
     */
    clearAll(): void;
    /**
     * 获取缓存统计信息
     * @param cacheName 缓存名称，可选
     * @returns 缓存统计信息
     */
    getStats(cacheName?: string): Record<string, number>;
    private cleanCacheExpired;
}
//# sourceMappingURL=cache-manager.service.d.ts.map