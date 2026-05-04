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
 * 缓存级别枚举
 * 定义三级缓存架构的缓存级别
 */
export var CacheLevel;
(function (CacheLevel) {
    /**
     * L1 缓存 - 内存缓存
     * 特点：
     * - 最快访问速度
     * - 容量最小
     * - TTL 最短（5 分钟）
     * - 单实例独享
     */
    CacheLevel["L1"] = "L1";
    /**
     * L2 缓存 - Redis 缓存
     * 特点：
     * - 快速访问
     * - 容量中等
     * - TTL 中等（30 分钟）
     * - 跨实例共享
     */
    CacheLevel["L2"] = "L2";
    /**
     * L3 缓存 - 数据库缓存
     * 特点：
     * - 较慢访问
     * - 容量最大
     * - 持久化存储
     * - 最终数据源
     */
    CacheLevel["L3"] = "L3";
})(CacheLevel || (CacheLevel = {}));
/**
 * 获取缓存级别的默认 TTL（秒）
 */
export function getDefaultTTL(level) {
    switch (level) {
        case CacheLevel.L1:
            return 300; // 5 分钟
        case CacheLevel.L2:
            return 1800; // 30 分钟
        case CacheLevel.L3:
            return 86400; // 24 小时
        default:
            return 300;
    }
}
/**
 * 获取缓存级别的描述
 */
export function getCacheLevelDescription(level) {
    switch (level) {
        case CacheLevel.L1:
            return 'L1 内存缓存 - 最快访问速度，容量 1000 条，TTL 5 分钟';
        case CacheLevel.L2:
            return 'L2 Redis 缓存 - 快速访问，跨实例共享，TTL 30 分钟';
        case CacheLevel.L3:
            return 'L3 数据库缓存 - 持久化存储，最终数据源';
        default:
            return '未知缓存级别';
    }
}
//# sourceMappingURL=cache-level.enum.js.map