/**
 * 缓存级别枚举
 * 定义三级缓存架构的缓存级别
 */
export declare enum CacheLevel {
    /**
     * L1 缓存 - 内存缓存
     * 特点：
     * - 最快访问速度
     * - 容量最小
     * - TTL 最短（5 分钟）
     * - 单实例独享
     */
    L1 = "L1",
    /**
     * L2 缓存 - Redis 缓存
     * 特点：
     * - 快速访问
     * - 容量中等
     * - TTL 中等（30 分钟）
     * - 跨实例共享
     */
    L2 = "L2",
    /**
     * L3 缓存 - 数据库缓存
     * 特点：
     * - 较慢访问
     * - 容量最大
     * - 持久化存储
     * - 最终数据源
     */
    L3 = "L3"
}
/**
 * 获取缓存级别的默认 TTL（秒）
 */
export declare function getDefaultTTL(level: CacheLevel): number;
/**
 * 获取缓存级别的描述
 */
export declare function getCacheLevelDescription(level: CacheLevel): string;
//# sourceMappingURL=cache-level.enum.d.ts.map