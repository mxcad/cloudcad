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
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
import { Injectable, Logger, InternalServerErrorException, } from '@nestjs/common';
import { CacheLevel } from '../enums/cache-level.enum';
/**
 * 多级缓存服务
 * 统一管理 L1、L2、L3 三级缓存
 */
let MultiLevelCacheService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MultiLevelCacheService = _classThis = class {
        constructor(l1Cache, l2Cache, l3Cache, cacheVersionService) {
            this.l1Cache = l1Cache;
            this.l2Cache = l2Cache;
            this.l3Cache = l3Cache;
            this.cacheVersionService = cacheVersionService;
            this.logger = new Logger(MultiLevelCacheService.name);
            this.penetrationConfig = {
                enabled: true,
                nullTTL: 60, // 1 分钟
                bloomSize: 1000000,
            };
            this.avalancheConfig = {
                enabled: true,
                randomizationRange: 300, // 5 分钟
            };
            this.versionConfig = {
                enabled: false, // 默认不启用版本控制，需要显式配置
            };
        }
        /**
         * 启用版本控制
         */
        enableVersionControl(type, versionKey) {
            this.versionConfig.enabled = true;
            this.versionConfig.type = type;
            this.versionConfig.versionKey = versionKey;
            this.logger.debug(`启用版本控制: ${type}, ${versionKey || 'global'}`);
        }
        /**
         * 禁用版本控制
         */
        disableVersionControl() {
            this.versionConfig.enabled = false;
            this.versionConfig.type = undefined;
            this.versionConfig.versionKey = undefined;
            this.logger.debug('禁用版本控制');
        }
        /**
         * 获取版本化的缓存键
         */
        async getVersionedKey(baseKey) {
            if (!this.versionConfig.enabled || !this.cacheVersionService) {
                return baseKey;
            }
            try {
                return await this.cacheVersionService.getVersionedKey(baseKey, this.versionConfig.type, this.versionConfig.versionKey);
            }
            catch (error) {
                this.logger.error(`获取版本化缓存键失败: ${error.message}`);
                // 出错时返回原始键，确保服务可用性
                return baseKey;
            }
        }
        /**
         * 更新缓存版本
         */
        async updateVersion(description) {
            if (!this.versionConfig.enabled || !this.cacheVersionService) {
                return null;
            }
            try {
                return await this.cacheVersionService.updateVersion(this.versionConfig.type, this.versionConfig.versionKey, description);
            }
            catch (error) {
                this.logger.error(`更新缓存版本失败: ${error.message}`);
                return null;
            }
        }
        /**
         * 获取缓存值（多级查询）
         * 查询顺序：L1 → L2 → L3
         * 自动回填：L3 → L2 → L1
         */
        async get(key) {
            // 获取版本化的缓存键
            const versionedKey = await this.getVersionedKey(key);
            // L1 查询
            const l1Value = await this.l1Cache.get(versionedKey);
            if (l1Value !== null) {
                this.logger.debug(`L1 缓存命中: ${key}`);
                return l1Value;
            }
            // L2 查询
            const l2Value = await this.l2Cache.get(versionedKey);
            if (l2Value !== null) {
                this.logger.debug(`L2 缓存命中: ${key}`);
                // 回填 L1
                await this.l1Cache.set(versionedKey, l2Value);
                return l2Value;
            }
            // L3 查询
            const l3Value = await this.l3Cache.get(versionedKey);
            if (l3Value !== null) {
                this.logger.debug(`L3 缓存命中: ${key}`);
                // 回填 L2 和 L1
                await this.l2Cache.set(versionedKey, l3Value);
                await this.l1Cache.set(versionedKey, l3Value);
                return l3Value;
            }
            this.logger.debug(`缓存未命中: ${key}`);
            return null;
        }
        /**
         * 获取或加载缓存值
         * 如果缓存不存在，从数据源加载并写入所有级别
         */
        async getOrLoad(key, loader) {
            // 先尝试从缓存获取
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }
            // 缓存未命中，从数据源加载
            const value = await loader();
            // 写入所有级别
            await this.set(key, value);
            return value;
        }
        /**
         * 批量获取缓存值
         */
        async getMany(keys) {
            const result = new Map();
            const missedKeys = [];
            // L1 批量查询
            for (const key of keys) {
                const value = await this.l1Cache.get(key);
                if (value !== null) {
                    result.set(key, value);
                }
                else {
                    missedKeys.push(key);
                }
            }
            if (missedKeys.length === 0) {
                return result;
            }
            // L2 批量查询
            const l2Values = await this.l2Cache.getMany(missedKeys);
            for (const [key, value] of l2Values.entries()) {
                result.set(key, value);
                await this.l1Cache.set(key, value);
            }
            const stillMissedKeys = missedKeys.filter((key) => !l2Values.has(key));
            if (stillMissedKeys.length === 0) {
                return result;
            }
            // L3 查询
            for (const key of stillMissedKeys) {
                const value = await this.l3Cache.get(key);
                if (value !== null) {
                    result.set(key, value);
                    await this.l2Cache.set(key, value);
                    await this.l1Cache.set(key, value);
                }
            }
            return result;
        }
        /**
         * 设置缓存值（写入所有级别）
         */
        async set(key, value, ttl) {
            const effectiveTTL = this.getEffectiveTTL(ttl);
            // 获取版本化的缓存键
            const versionedKey = await this.getVersionedKey(key);
            // 并行写入所有级别
            await Promise.all([
                this.l1Cache.set(versionedKey, value, effectiveTTL),
                this.l2Cache.set(versionedKey, value, effectiveTTL),
                this.l3Cache.set(versionedKey, value, effectiveTTL),
            ]);
            this.logger.debug(`缓存已设置: ${key}`);
        }
        /**
         * 批量设置缓存值
         */
        async setMany(items, ttl) {
            const effectiveTTL = this.getEffectiveTTL(ttl);
            await Promise.all([
                this.setL1Many(items, effectiveTTL),
                this.l2Cache.setMany(items, effectiveTTL),
                this.setL3Many(items, effectiveTTL),
            ]);
            this.logger.debug(`批量设置缓存: ${items.size} 条`);
        }
        /**
         * 删除缓存（所有级别）
         */
        async delete(key) {
            // 获取版本化的缓存键
            const versionedKey = await this.getVersionedKey(key);
            await Promise.all([
                this.l1Cache.delete(versionedKey),
                this.l2Cache.delete(versionedKey),
                this.l3Cache.delete(versionedKey),
            ]);
            this.logger.debug(`缓存已删除: ${key}`);
        }
        /**
         * 批量删除缓存（所有级别）
         */
        async deleteMany(keys) {
            // 批量获取版本化的缓存键
            const versionedKeys = await Promise.all(keys.map((key) => this.getVersionedKey(key)));
            await Promise.all([
                this.l1Cache.deleteMany(versionedKeys),
                this.l2Cache.deleteMany(versionedKeys),
                this.l3Cache.deleteMany(versionedKeys),
            ]);
            this.logger.debug(`批量删除缓存: ${keys.length} 条`);
        }
        /**
         * 根据模式删除缓存（仅 L2 和 L3）
         */
        async deleteByPattern(pattern) {
            const [l2Count, l3Count] = await Promise.all([
                this.l2Cache.deleteByPattern(pattern),
                this.l3Cache.deleteByPattern(pattern),
            ]);
            this.logger.debug(`根据模式删除缓存: ${pattern}, L2: ${l2Count}, L3: ${l3Count}`);
            return l2Count + l3Count;
        }
        /**
         * 清空所有缓存（所有级别）
         */
        async clear() {
            await Promise.all([
                this.l1Cache.clear(),
                this.l2Cache.clear(),
                this.l3Cache.clear(),
            ]);
            this.logger.debug('所有缓存已清空');
        }
        /**
         * 检查缓存是否存在
         */
        async has(key) {
            // 检查任意一级缓存存在即可
            const results = await Promise.all([
                this.l1Cache.has(key),
                this.l2Cache.has(key),
                this.l3Cache.has(key),
            ]);
            return results.some((result) => result);
        }
        /**
         * 获取缓存统计信息
         */
        async getStats() {
            const [l1Stats, l2Stats, l3Stats] = await Promise.all([
                this.l1Cache.getStats(),
                this.l2Cache.getStats(),
                this.l3Cache.getStats(),
            ]);
            const totalHits = l1Stats.hits + l2Stats.hits + l3Stats.hits;
            const totalMisses = l1Stats.misses + l2Stats.misses + l3Stats.misses;
            const totalRequests = totalHits + totalMisses;
            return {
                levels: {
                    L1: l1Stats,
                    L2: l2Stats,
                    L3: l3Stats,
                },
                summary: {
                    totalHits,
                    totalMisses,
                    totalRequests,
                    overallHitRate: totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0,
                    totalMemoryUsage: l1Stats.memoryUsage + l2Stats.memoryUsage + l3Stats.memoryUsage,
                },
            };
        }
        /**
         * 刷新缓存（删除并重新加载）
         */
        async refresh(key, loader) {
            await this.delete(key);
            return this.getOrLoad(key, loader);
        }
        /**
         * 仅从指定级别获取缓存
         */
        async getFromLevel(key, level) {
            switch (level) {
                case CacheLevel.L1:
                    return this.l1Cache.get(key);
                case CacheLevel.L2:
                    return this.l2Cache.get(key);
                case CacheLevel.L3:
                    return this.l3Cache.get(key);
                default:
                    throw new InternalServerErrorException(`不支持的缓存级别: ${level}`);
            }
        }
        /**
         * 仅写入指定级别
         */
        async setToLevel(key, value, level, ttl) {
            switch (level) {
                case CacheLevel.L1:
                    await this.l1Cache.set(key, value, ttl);
                    break;
                case CacheLevel.L2:
                    await this.l2Cache.set(key, value, ttl);
                    break;
                case CacheLevel.L3:
                    await this.l3Cache.set(key, value, ttl);
                    break;
                default:
                    throw new InternalServerErrorException(`不支持的缓存级别: ${level}`);
            }
        }
        /**
         * 获取有效 TTL（应用缓存雪崩保护）
         */
        getEffectiveTTL(ttl) {
            if (!this.avalancheConfig.enabled) {
                return ttl ?? 300;
            }
            const baseTTL = ttl ?? 300;
            const randomOffset = Math.floor(Math.random() * this.avalancheConfig.randomizationRange);
            return baseTTL + randomOffset;
        }
        /**
         * 批量设置 L1 缓存
         */
        async setL1Many(items, ttl) {
            const promises = [];
            for (const [key, value] of items.entries()) {
                promises.push(this.l1Cache.set(key, value, ttl));
            }
            await Promise.all(promises);
        }
        /**
         * 批量设置 L3 缓存
         */
        async setL3Many(items, ttl) {
            const promises = [];
            for (const [key, value] of items.entries()) {
                promises.push(this.l3Cache.set(key, value, ttl));
            }
            await Promise.all(promises);
        }
    };
    __setFunctionName(_classThis, "MultiLevelCacheService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MultiLevelCacheService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MultiLevelCacheService = _classThis;
})();
export { MultiLevelCacheService };
//# sourceMappingURL=multi-level-cache.service.js.map