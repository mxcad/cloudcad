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
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';
/**
 * L1 缓存提供者（内存缓存）
 * 使用 LRU 策略，最大容量 1000 条，TTL 5 分钟
 */
let L1CacheProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var L1CacheProvider = _classThis = class {
        constructor() {
            this.logger = new Logger(L1CacheProvider.name);
            this.cache = new Map();
            this.maxCapacity = 1000;
            this.defaultTTL = 300; // 5 分钟
            this.hits = 0;
            this.misses = 0;
            // 定期清理过期缓存（每分钟执行一次）
            setInterval(() => this.cleanExpired(), 60000);
        }
        /**
         * 获取缓存值
         */
        async get(key) {
            const entry = this.cache.get(key);
            if (!entry) {
                this.misses++;
                return null;
            }
            // 检查是否过期
            if (Date.now() > entry.expiresAt) {
                this.cache.delete(key);
                this.misses++;
                return null;
            }
            // 更新访问信息（LRU 策略）
            entry.lastAccessedAt = Date.now();
            entry.accessCount++;
            this.hits++;
            // 重新插入以更新访问顺序
            this.cache.delete(key);
            this.cache.set(key, entry);
            return entry.value;
        }
        /**
         * 设置缓存值
         */
        async set(key, value, ttl) {
            const effectiveTTL = ttl ?? this.defaultTTL;
            const entry = {
                value,
                expiresAt: Date.now() + effectiveTTL * 1000,
                lastAccessedAt: Date.now(),
                accessCount: 0,
            };
            // 如果缓存已满，执行 LRU 淘汰
            if (this.cache.size >= this.maxCapacity && !this.cache.has(key)) {
                this.evictLRU();
            }
            this.cache.set(key, entry);
        }
        /**
         * 删除缓存
         */
        async delete(key) {
            this.cache.delete(key);
        }
        /**
         * 批量删除缓存
         */
        async deleteMany(keys) {
            for (const key of keys) {
                this.cache.delete(key);
            }
        }
        /**
         * 清空所有缓存
         */
        async clear() {
            this.cache.clear();
            this.hits = 0;
            this.misses = 0;
        }
        /**
         * 检查缓存是否存在
         */
        async has(key) {
            const entry = this.cache.get(key);
            if (!entry) {
                return false;
            }
            return Date.now() <= entry.expiresAt;
        }
        /**
         * 获取缓存大小
         */
        async size() {
            return this.cache.size;
        }
        /**
         * 获取缓存级别
         */
        getLevel() {
            return CacheLevel.L1;
        }
        /**
         * 获取缓存策略
         */
        getStrategy() {
            return CacheStrategy.LRU_TTL;
        }
        /**
         * 设置最大缓存容量
         */
        setMaxCapacity(capacity) {
            if (capacity < 1) {
                throw new BadRequestException('容量必须大于 0');
            }
            this.maxCapacity = capacity;
            // 如果当前大小超过新容量，执行淘汰
            while (this.cache.size > this.maxCapacity) {
                this.evictLRU();
            }
        }
        /**
         * 获取当前缓存容量
         */
        getCurrentCapacity() {
            return this.cache.size;
        }
        /**
         * 获取缓存命中率
         */
        getHitRate() {
            const total = this.hits + this.misses;
            if (total === 0) {
                return 0;
            }
            return (this.hits / total) * 100;
        }
        /**
         * 获取缓存统计信息
         */
        getStats() {
            return {
                level: this.getLevel(),
                size: this.cache.size,
                maxCapacity: this.maxCapacity,
                hits: this.hits,
                misses: this.misses,
                hitRate: this.getHitRate(),
                totalRequests: this.hits + this.misses,
                memoryUsage: this.estimateMemoryUsage(),
            };
        }
        /**
         * 清理过期缓存
         */
        cleanExpired() {
            const now = Date.now();
            let cleaned = 0;
            for (const [key, entry] of this.cache.entries()) {
                if (now > entry.expiresAt) {
                    this.cache.delete(key);
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                this.logger.debug(`清理了 ${cleaned} 条过期 L1 缓存`);
            }
        }
        /**
         * 执行 LRU 淘汰
         */
        evictLRU() {
            let oldestKey = null;
            let oldestTime = Number.MAX_VALUE;
            for (const [key, entry] of this.cache.entries()) {
                if (entry.lastAccessedAt < oldestTime) {
                    oldestTime = entry.lastAccessedAt;
                    oldestKey = key;
                }
            }
            if (oldestKey) {
                this.cache.delete(oldestKey);
                this.logger.debug(`LRU 淘汰缓存键: ${oldestKey}`);
            }
        }
        /**
         * 估算内存使用量（字节）
         */
        estimateMemoryUsage() {
            let totalSize = 0;
            for (const [key, entry] of this.cache.entries()) {
                // 估算字符串大小（UTF-16 编码，每个字符 2 字节）
                totalSize += key.length * 2;
                // 估算值大小（JSON 字符串）
                const valueStr = JSON.stringify(entry.value);
                totalSize += valueStr.length * 2;
                // 元数据大小
                totalSize += 24; // timestamp (8) * 3 + count (8)
            }
            return totalSize;
        }
    };
    __setFunctionName(_classThis, "L1CacheProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        L1CacheProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return L1CacheProvider = _classThis;
})();
export { L1CacheProvider };
//# sourceMappingURL=l1-cache.provider.js.map