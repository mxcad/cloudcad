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
import { Injectable, Logger, } from '@nestjs/common';
import { createClient } from 'redis';
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';
/**
 * L2 缓存提供者（Redis 缓存）
 * 分布式缓存，TTL 30 分钟，支持批量操作
 */
let L2CacheProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var L2CacheProvider = _classThis = class {
        constructor(configService) {
            this.configService = configService;
            this.logger = new Logger(L2CacheProvider.name);
            this.isConnected = false;
            this.defaultTTL = 1800; // 30 分钟
            this.hits = 0;
            this.misses = 0;
            const redisConfig = this.configService.get('redis');
            if (!redisConfig)
                throw new Error('Redis 配置不存在');
            this.client = createClient({
                socket: {
                    host: redisConfig.host,
                    port: redisConfig.port,
                    connectTimeout: redisConfig.connectTimeout,
                },
                password: redisConfig.password,
                database: redisConfig.db,
            });
            this.client.on('error', (err) => {
                this.logger.error(`Redis 错误: ${err.message}`);
                this.isConnected = false;
            });
            this.client.on('connect', () => {
                this.logger.log('Redis 连接成功');
                this.isConnected = true;
            });
            this.client.on('disconnect', () => {
                this.logger.warn('Redis 连接断开');
                this.isConnected = false;
            });
        }
        async onModuleInit() {
            try {
                // 添加 5 秒超时控制
                const connectPromise = this.client.connect();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis 连接超时 (5000ms)')), 5000));
                await Promise.race([connectPromise, timeoutPromise]);
                this.isConnected = true;
                this.logger.log('Redis L2 缓存连接成功');
            }
            catch (error) {
                this.logger.error('Redis 连接失败', error);
                this.isConnected = false;
            }
        }
        async onModuleDestroy() {
            await this.client.quit();
            this.isConnected = false;
        }
        /**
         * 获取缓存值
         */
        async get(key) {
            if (!this.isConnected) {
                this.logger.warn('Redis 未连接，跳过 L2 缓存读取');
                this.misses++;
                return null;
            }
            try {
                const value = await this.client.get(key);
                if (value === null) {
                    this.misses++;
                    return null;
                }
                this.hits++;
                return JSON.parse(value);
            }
            catch (error) {
                this.logger.error(`获取 L2 缓存失败: ${key}`, error);
                this.misses++;
                return null;
            }
        }
        /**
         * 设置缓存值
         */
        async set(key, value, ttl) {
            if (!this.isConnected) {
                this.logger.warn('Redis 未连接，跳过 L2 缓存写入');
                return;
            }
            try {
                const effectiveTTL = ttl ?? this.defaultTTL;
                await this.client.setEx(key, effectiveTTL, JSON.stringify(value));
            }
            catch (error) {
                this.logger.error(`设置 L2 缓存失败: ${key}`, error);
            }
        }
        /**
         * 删除缓存
         */
        async delete(key) {
            if (!this.isConnected) {
                return;
            }
            try {
                await this.client.del(key);
            }
            catch (error) {
                this.logger.error(`删除 L2 缓存失败: ${key}`, error);
            }
        }
        /**
         * 批量删除缓存
         */
        async deleteMany(keys) {
            if (!this.isConnected || keys.length === 0) {
                return;
            }
            try {
                await this.client.del(keys);
            }
            catch (error) {
                this.logger.error(`批量删除 L2 缓存失败`, error);
            }
        }
        /**
         * 清空所有缓存
         */
        async clear() {
            if (!this.isConnected) {
                return;
            }
            try {
                await this.client.flushDb();
                this.hits = 0;
                this.misses = 0;
            }
            catch (error) {
                this.logger.error('清空 L2 缓存失败', error);
            }
        }
        /**
         * 检查缓存是否存在
         */
        async has(key) {
            if (!this.isConnected) {
                return false;
            }
            try {
                const result = await this.client.exists(key);
                return result === 1;
            }
            catch (error) {
                this.logger.error(`检查 L2 缓存存在失败: ${key}`, error);
                return false;
            }
        }
        /**
         * 获取缓存大小
         */
        async size() {
            if (!this.isConnected) {
                return 0;
            }
            try {
                return await this.client.dbSize();
            }
            catch (error) {
                this.logger.error('获取 L2 缓存大小失败', error);
                return 0;
            }
        }
        /**
         * 批量获取缓存
         */
        async getMany(keys) {
            const result = new Map();
            if (!this.isConnected || keys.length === 0) {
                return result;
            }
            try {
                const values = await this.client.mGet(keys);
                for (let i = 0; i < keys.length; i++) {
                    const value = values[i];
                    if (value !== null &&
                        value !== undefined &&
                        typeof value === 'string') {
                        result.set(keys[i], JSON.parse(value));
                        this.hits++;
                    }
                    else {
                        this.misses++;
                    }
                }
            }
            catch (error) {
                this.logger.error('批量获取 L2 缓存失败', error);
                for (const key of keys) {
                    this.misses++;
                }
            }
            return result;
        }
        /**
         * 批量设置缓存
         */
        async setMany(items, ttl) {
            if (!this.isConnected || items.size === 0) {
                return;
            }
            try {
                const effectiveTTL = ttl ?? this.defaultTTL;
                const pipeline = this.client.multi();
                for (const [key, value] of items.entries()) {
                    pipeline.setEx(key, effectiveTTL, JSON.stringify(value));
                }
                await pipeline.exec();
            }
            catch (error) {
                this.logger.error('批量设置 L2 缓存失败', error);
            }
        }
        /**
         * 设置过期时间
         */
        async expire(key, ttl) {
            if (!this.isConnected) {
                return;
            }
            try {
                await this.client.expire(key, ttl);
            }
            catch (error) {
                this.logger.error(`设置 L2 缓存过期时间失败: ${key}`, error);
            }
        }
        /**
         * 获取剩余过期时间（秒）
         */
        async ttl(key) {
            if (!this.isConnected) {
                return -1;
            }
            try {
                return await this.client.ttl(key);
            }
            catch (error) {
                this.logger.error(`获取 L2 缓存 TTL 失败: ${key}`, error);
                return -1;
            }
        }
        /**
         * 根据模式删除缓存
         */
        async deleteByPattern(pattern) {
            if (!this.isConnected) {
                return 0;
            }
            try {
                const keys = [];
                for await (const key of this.client.scanIterator({
                    MATCH: pattern,
                })) {
                    // scanIterator 返回的键类型是 string，但 TypeScript 推断可能有问题
                    keys.push(String(key));
                }
                if (keys.length > 0) {
                    // Redis 的 del 方法支持数组形式
                    // 使用 any 来避免 TypeScript 类型检查问题
                    await this.client.del(keys);
                    this.logger.debug(`根据模式删除了 ${keys.length} 条 L2 缓存: ${pattern}`);
                }
                return keys.length;
            }
            catch (error) {
                this.logger.error(`根据模式删除 L2 缓存失败: ${pattern}`, error);
                return 0;
            }
        }
        /**
         * 获取缓存级别
         */
        getLevel() {
            return CacheLevel.L2;
        }
        /**
         * 获取缓存策略
         */
        getStrategy() {
            return CacheStrategy.TTL;
        }
        /**
         * 获取缓存统计信息
         */
        async getStats() {
            return {
                level: this.getLevel(),
                size: await this.size(),
                hits: this.hits,
                misses: this.misses,
                hitRate: this.getHitRate(),
                totalRequests: this.hits + this.misses,
                memoryUsage: await this.getMemoryUsage(),
                isConnected: this.isConnected,
            };
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
         * 获取内存使用量
         */
        async getMemoryUsage() {
            if (!this.isConnected) {
                return 0;
            }
            try {
                const info = await this.client.info('memory');
                const match = info?.match(/used_memory:(\d+)/);
                return match && match[1] ? parseInt(match[1], 10) : 0;
            }
            catch (error) {
                this.logger.error('获取 Redis 内存使用量失败', error);
                return 0;
            }
        }
        /**
         * 检查连接状态
         */
        isReady() {
            return this.isConnected;
        }
    };
    __setFunctionName(_classThis, "L2CacheProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        L2CacheProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return L2CacheProvider = _classThis;
})();
export { L2CacheProvider };
//# sourceMappingURL=l2-cache.provider.js.map