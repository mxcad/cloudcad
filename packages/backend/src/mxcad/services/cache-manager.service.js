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
import { Injectable, Logger } from '@nestjs/common';
let CacheManagerService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CacheManagerService = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new Logger(CacheManagerService.name);
            this.caches = new Map();
            const cacheTTL = this.configService.get('cacheTTL', { infer: true });
            this.defaultTTL = cacheTTL.mxcad * 1000; // 转为毫秒
        }
        /**
         * 获取缓存值
         * @param cacheName 缓存名称
         * @param key 缓存键
         * @param ttl 过期时间（毫秒），可选
         * @returns 缓存值或null
         */
        get(cacheName, key, ttl) {
            const cache = this.caches.get(cacheName);
            if (!cache) {
                return null;
            }
            const item = cache.get(key);
            if (!item) {
                return null;
            }
            const now = Date.now();
            const actualTTL = ttl || this.defaultTTL;
            if (now - item.timestamp >= actualTTL) {
                cache.delete(key);
                this.logger.debug(`缓存过期已清理: ${cacheName}:${key}`);
                return null;
            }
            this.logger.debug(`缓存命中: ${cacheName}:${key}`);
            return item.data;
        }
        /**
         * 设置缓存值
         * @param cacheName 缓存名称
         * @param key 缓存键
         * @param value 缓存值
         */
        set(cacheName, key, value) {
            if (!this.caches.has(cacheName)) {
                this.caches.set(cacheName, new Map());
            }
            const cache = this.caches.get(cacheName);
            cache.set(key, {
                data: value,
                timestamp: Date.now(),
            });
            this.logger.debug(`缓存设置: ${cacheName}:${key}`);
        }
        /**
         * 删除缓存值
         * @param cacheName 缓存名称
         * @param key 缓存键
         * @returns 是否删除成功
         */
        delete(cacheName, key) {
            const cache = this.caches.get(cacheName);
            if (!cache) {
                return false;
            }
            const deleted = cache.delete(key);
            if (deleted) {
                this.logger.debug(`缓存删除: ${cacheName}:${key}`);
            }
            return deleted;
        }
        /**
         * 清理过期缓存
         * @param cacheName 缓存名称，可选
         * @param ttl 过期时间（毫秒），可选
         */
        cleanExpired(cacheName, ttl) {
            const now = Date.now();
            const actualTTL = ttl || this.defaultTTL;
            if (cacheName) {
                this.cleanCacheExpired(cacheName, now, actualTTL);
            }
            else {
                for (const [name] of this.caches) {
                    this.cleanCacheExpired(name, now, actualTTL);
                }
            }
        }
        /**
         * 清空指定缓存
         * @param cacheName 缓存名称
         */
        clear(cacheName) {
            const cache = this.caches.get(cacheName);
            if (cache) {
                cache.clear();
                this.logger.debug(`缓存清空: ${cacheName}`);
            }
        }
        /**
         * 清空所有缓存
         */
        clearAll() {
            this.caches.clear();
            this.logger.debug('所有缓存已清空');
        }
        /**
         * 获取缓存统计信息
         * @param cacheName 缓存名称，可选
         * @returns 缓存统计信息
         */
        getStats(cacheName) {
            const stats = {};
            if (cacheName) {
                const cache = this.caches.get(cacheName);
                stats[cacheName] = cache ? cache.size : 0;
            }
            else {
                for (const [name, cache] of this.caches) {
                    stats[name] = cache.size;
                }
            }
            return stats;
        }
        cleanCacheExpired(cacheName, now, ttl) {
            const cache = this.caches.get(cacheName);
            if (!cache) {
                return;
            }
            let cleanedCount = 0;
            for (const [key, item] of cache) {
                if (now - item.timestamp >= ttl) {
                    cache.delete(key);
                    cleanedCount++;
                }
            }
            if (cleanedCount > 0) {
                this.logger.debug(`缓存 ${cacheName} 清理过期项目: ${cleanedCount} 个`);
            }
        }
    };
    __setFunctionName(_classThis, "CacheManagerService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheManagerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheManagerService = _classThis;
})();
export { CacheManagerService };
//# sourceMappingURL=cache-manager.service.js.map