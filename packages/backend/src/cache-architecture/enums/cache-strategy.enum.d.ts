/**
 * 缓存策略枚举
 * 定义缓存淘汰和数据更新策略
 */
export declare enum CacheStrategy {
    /**
     * LRU (Least Recently Used) - 最近最少使用
     * 优先淘汰最长时间未被访问的数据
     * 适用于：访问模式具有时间局部性的场景
     */
    LRU = "LRU",
    /**
     * LFU (Least Frequently Used) - 最少使用频率
     * 优先淘汰访问频率最低的数据
     * 适用于：热点数据明确的场景
     */
    LFU = "LFU",
    /**
     * FIFO (First In First Out) - 先进先出
     * 按照插入顺序淘汰最早的数据
     * 适用于：数据访问顺序性强的场景
     */
    FIFO = "FIFO",
    /**
     * TTL (Time To Live) - 生存时间
     * 根据过期时间淘汰数据
     * 适用于：数据有时效性要求的场景
     */
    TTL = "TTL",
    /**
     * LRU-TTL - LRU 和 TTL 结合
     * 先淘汰过期数据，再淘汰 LRU 数据
     * 适用于：需要兼顾时间和访问频率的场景
     */
    LRU_TTL = "LRU_TTL"
}
/**
 * 获取缓存策略的描述
 */
export declare function getCacheStrategyDescription(strategy: CacheStrategy): string;
/**
 * 获取推荐缓存策略
 */
export declare function getRecommendedStrategy(level: string): CacheStrategy;
//# sourceMappingURL=cache-strategy.enum.d.ts.map