import { DatabaseService } from '../../database/database.service';
import { IL3CacheManager } from '../interfaces/cache-manager.interface';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';
/**
 * L3 缓存提供者（数据库缓存）
 * 持久化存储，最终数据源，使用 Prisma 查询
 */
export declare class L3CacheProvider<T = unknown> implements IL3CacheManager<T> {
    private readonly prisma;
    private readonly logger;
    private defaultTTL;
    private hits;
    private misses;
    constructor(prisma: DatabaseService);
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
     * 根据模式删除缓存
     * 简单模式（单个 *）使用 Prisma 原生 startsWith/endsWith/contains，
     * 复杂模式使用数据库层面 LIKE 查询，全程避免全量加载到内存再过滤
     */
    deleteByPattern(pattern: string): Promise<number>;
    /**
     * 尝试将简单通配符模式转换为 Prisma 原生 where 条件
     * 仅处理单个 * 通配符，返回 null 表示需要回退到 LIKE
     */
    private tryBuildSimpleWhere;
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
     * 从数据库加载数据
     */
    load<K = T>(key: string, loader: () => Promise<K>): Promise<K>;
    /**
     * 预加载数据
     */
    preload<K = T>(keys: string[], loader: (key: string) => Promise<K>): Promise<Map<string, K>>;
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
    }>;
    /**
     * 获取缓存命中率
     */
    getHitRate(): number;
    /**
     * 获取内存使用量（字节）
     */
    private getMemoryUsage;
    /**
     * 清理过期缓存
     */
    cleanExpired(): Promise<number>;
    /**
     * 获取热点数据
     */
    getHotData(limit?: number): Promise<Array<{
        key: string;
        accessCount: number;
        lastAccessedAt: Date;
    }>>;
}
//# sourceMappingURL=l3-cache.provider.d.ts.map