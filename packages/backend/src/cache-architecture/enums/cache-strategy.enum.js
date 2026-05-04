///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
/**
 * 缓存策略枚举
 * 定义缓存淘汰和数据更新策略
 */
export var CacheStrategy;
(function (CacheStrategy) {
    /**
     * LRU (Least Recently Used) - 最近最少使用
     * 优先淘汰最长时间未被访问的数据
     * 适用于：访问模式具有时间局部性的场景
     */
    CacheStrategy["LRU"] = "LRU";
    /**
     * LFU (Least Frequently Used) - 最少使用频率
     * 优先淘汰访问频率最低的数据
     * 适用于：热点数据明确的场景
     */
    CacheStrategy["LFU"] = "LFU";
    /**
     * FIFO (First In First Out) - 先进先出
     * 按照插入顺序淘汰最早的数据
     * 适用于：数据访问顺序性强的场景
     */
    CacheStrategy["FIFO"] = "FIFO";
    /**
     * TTL (Time To Live) - 生存时间
     * 根据过期时间淘汰数据
     * 适用于：数据有时效性要求的场景
     */
    CacheStrategy["TTL"] = "TTL";
    /**
     * LRU-TTL - LRU 和 TTL 结合
     * 先淘汰过期数据，再淘汰 LRU 数据
     * 适用于：需要兼顾时间和访问频率的场景
     */
    CacheStrategy["LRU_TTL"] = "LRU_TTL";
})(CacheStrategy || (CacheStrategy = {}));
/**
 * 获取缓存策略的描述
 */
export function getCacheStrategyDescription(strategy) {
    switch (strategy) {
        case CacheStrategy.LRU:
            return 'LRU - 最近最少使用，淘汰最长时间未被访问的数据';
        case CacheStrategy.LFU:
            return 'LFU - 最少使用频率，淘汰访问频率最低的数据';
        case CacheStrategy.FIFO:
            return 'FIFO - 先进先出，按照插入顺序淘汰最早的数据';
        case CacheStrategy.TTL:
            return 'TTL - 生存时间，根据过期时间淘汰数据';
        case CacheStrategy.LRU_TTL:
            return 'LRU-TTL - LRU 和 TTL 结合，先淘汰过期数据，再淘汰 LRU 数据';
        default:
            return '未知缓存策略';
    }
}
/**
 * 获取推荐缓存策略
 */
export function getRecommendedStrategy(level) {
    switch (level) {
        case 'L1':
            return CacheStrategy.LRU_TTL; // L1 使用 LRU+TTL，兼顾速度和时效性
        case 'L2':
            return CacheStrategy.TTL; // L2 主要依赖 TTL
        case 'L3':
            return CacheStrategy.LRU; // L3 使用 LRU，容量大
        default:
            return CacheStrategy.LRU_TTL;
    }
}
//# sourceMappingURL=cache-strategy.enum.js.map