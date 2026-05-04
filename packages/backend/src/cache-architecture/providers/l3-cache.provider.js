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
import { CacheLevel } from '../enums/cache-level.enum';
import { CacheStrategy } from '../enums/cache-strategy.enum';
/**
 * L3 缓存提供者（数据库缓存）
 * 持久化存储，最终数据源，使用 Prisma 查询
 */
let L3CacheProvider = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var L3CacheProvider = _classThis = class {
        constructor(prisma) {
            this.prisma = prisma;
            this.logger = new Logger(L3CacheProvider.name);
            this.defaultTTL = 86400; // 24 小时
            this.hits = 0;
            this.misses = 0;
        }
        /**
         * 获取缓存值
         */
        async get(key) {
            try {
                const entry = await this.prisma.cacheEntry.findUnique({
                    where: { key },
                });
                if (!entry) {
                    this.misses++;
                    return null;
                }
                // 检查是否过期
                if (entry.expiresAt && entry.expiresAt < new Date()) {
                    await this.delete(key);
                    this.misses++;
                    return null;
                }
                // 解析并返回值（更新访问信息失败不影响读取）
                this.hits++;
                // 异步更新访问信息（使用 updateMany 避免条目不存在时报错）
                this.prisma.cacheEntry
                    .updateMany({
                    where: { id: entry.id },
                    data: {
                        lastAccessedAt: new Date(),
                        accessCount: { increment: 1 },
                    },
                })
                    .catch(() => {
                    // 忽略错误
                });
                return JSON.parse(entry.value);
            }
            catch (error) {
                this.logger.error(`获取 L3 缓存失败: ${key}`, error);
                this.misses++;
                return null;
            }
        }
        /**
         * 设置缓存值
         */
        async set(key, value, ttl) {
            try {
                const effectiveTTL = ttl ?? this.defaultTTL;
                const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
                const valueStr = JSON.stringify(value);
                // 使用 upsert 更新或创建缓存
                await this.prisma.cacheEntry.upsert({
                    where: { key },
                    update: {
                        value: valueStr,
                        expiresAt,
                        lastAccessedAt: new Date(),
                        updatedAt: new Date(),
                    },
                    create: {
                        key,
                        value: valueStr,
                        expiresAt,
                        lastAccessedAt: new Date(),
                        accessCount: 0,
                    },
                });
            }
            catch (error) {
                this.logger.error(`设置 L3 缓存失败: ${key}`, error);
            }
        }
        /**
         * 删除缓存
         */
        async delete(key) {
            try {
                // 使用 deleteMany 代替 delete，避免条目不存在时报错
                await this.prisma.cacheEntry.deleteMany({
                    where: { key },
                });
            }
            catch (error) {
                this.logger.error(`删除 L3 缓存失败: ${key}`, error);
            }
        }
        /**
         * 批量删除缓存
         */
        async deleteMany(keys) {
            if (keys.length === 0) {
                return;
            }
            try {
                await this.prisma.cacheEntry.deleteMany({
                    where: {
                        key: { in: keys },
                    },
                });
            }
            catch (error) {
                this.logger.error('批量删除 L3 缓存失败', error);
            }
        }
        /**
         * 根据模式删除缓存
         * 简单模式（单个 *）使用 Prisma 原生 startsWith/endsWith/contains，
         * 复杂模式使用数据库层面 LIKE 查询，全程避免全量加载到内存再过滤
         */
        async deleteByPattern(pattern) {
            try {
                if (!pattern.includes('*') && !pattern.includes('?')) {
                    const result = await this.prisma.cacheEntry.deleteMany({
                        where: { key: pattern },
                    });
                    if (result.count > 0) {
                        this.logger.debug(`根据模式删除了 ${result.count} 条 L3 缓存: ${pattern}`);
                    }
                    return result.count;
                }
                const simpleWhere = this.tryBuildSimpleWhere(pattern);
                if (simpleWhere !== null) {
                    const result = await this.prisma.cacheEntry.deleteMany({
                        where: simpleWhere,
                    });
                    if (result.count > 0) {
                        this.logger.debug(`根据模式删除了 ${result.count} 条 L3 缓存: ${pattern}`);
                    }
                    return result.count;
                }
                const likePattern = pattern
                    .replace(/\\/g, '\\\\')
                    .replace(/%/g, '\\%')
                    .replace(/_/g, '\\_')
                    .replace(/\*/g, '%')
                    .replace(/\?/g, '_');
                const result = await this.prisma.$executeRaw `
        DELETE FROM cache_entries
        WHERE key LIKE ${likePattern}
      `;
                if (result > 0) {
                    this.logger.debug(`根据模式删除了 ${result} 条 L3 缓存: ${pattern}`);
                }
                return result;
            }
            catch (error) {
                this.logger.error(`根据模式删除 L3 缓存失败: ${pattern}`, error);
                return 0;
            }
        }
        /**
         * 尝试将简单通配符模式转换为 Prisma 原生 where 条件
         * 仅处理单个 * 通配符，返回 null 表示需要回退到 LIKE
         */
        tryBuildSimpleWhere(pattern) {
            const starCount = (pattern.match(/\*/g) || []).length;
            const qmarkCount = (pattern.match(/\?/g) || []).length;
            if (qmarkCount > 0 || starCount !== 1) {
                return null;
            }
            if (pattern === '*') {
                return {};
            }
            if (pattern.startsWith('*') && pattern.endsWith('*')) {
                return { key: { contains: pattern.slice(1, -1) } };
            }
            if (pattern.startsWith('*')) {
                return { key: { endsWith: pattern.slice(1) } };
            }
            return { key: { startsWith: pattern.slice(0, -1) } };
        }
        /**
         * 清空所有缓存
         */
        async clear() {
            try {
                await this.prisma.cacheEntry.deleteMany({});
                this.hits = 0;
                this.misses = 0;
            }
            catch (error) {
                this.logger.error('清空 L3 缓存失败', error);
            }
        }
        /**
         * 检查缓存是否存在
         */
        async has(key) {
            try {
                const entry = await this.prisma.cacheEntry.findUnique({
                    where: { key },
                });
                if (!entry) {
                    return false;
                }
                // 检查是否过期
                if (entry.expiresAt && entry.expiresAt < new Date()) {
                    await this.delete(key);
                    return false;
                }
                return true;
            }
            catch (error) {
                this.logger.error(`检查 L3 缓存存在失败: ${key}`, error);
                return false;
            }
        }
        /**
         * 获取缓存大小
         */
        async size() {
            try {
                return await this.prisma.cacheEntry.count();
            }
            catch (error) {
                this.logger.error('获取 L3 缓存大小失败', error);
                return 0;
            }
        }
        /**
         * 从数据库加载数据
         */
        async load(key, loader) {
            // 先尝试从缓存获取
            const cached = await this.get(key);
            if (cached !== null) {
                return cached;
            }
            // 缓存未命中，从数据源加载
            const value = await loader();
            // 写入缓存
            await this.set(key, value);
            return value;
        }
        /**
         * 预加载数据
         */
        async preload(keys, loader) {
            const result = new Map();
            // 批量检查缓存
            const cachedEntries = await this.prisma.cacheEntry.findMany({
                where: {
                    key: { in: keys },
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
            });
            // 返回已缓存的数据
            const cachedKeys = new Set();
            for (const entry of cachedEntries) {
                try {
                    const value = JSON.parse(entry.value);
                    result.set(entry.key, value);
                    cachedKeys.add(entry.key);
                    // 更新访问信息（使用 updateMany 避免报错）
                    await this.prisma.cacheEntry.updateMany({
                        where: { id: entry.id },
                        data: {
                            lastAccessedAt: new Date(),
                            accessCount: { increment: 1 },
                        },
                    });
                }
                catch (error) {
                    this.logger.error(`解析 L3 缓存失败: ${entry.key}`, error);
                }
            }
            // 加载未缓存的数据
            const uncachedKeys = keys.filter((key) => !cachedKeys.has(key));
            for (const key of uncachedKeys) {
                try {
                    const value = await loader(key);
                    result.set(key, value);
                    await this.set(key, value);
                }
                catch (error) {
                    this.logger.error(`预加载 L3 缓存失败: ${key}`, error);
                }
            }
            return result;
        }
        /**
         * 获取缓存级别
         */
        getLevel() {
            return CacheLevel.L3;
        }
        /**
         * 获取缓存策略
         */
        getStrategy() {
            return CacheStrategy.LRU;
        }
        /**
         * 获取缓存统计信息
         */
        async getStats() {
            const size = await this.size();
            return {
                level: this.getLevel(),
                size,
                hits: this.hits,
                misses: this.misses,
                hitRate: this.getHitRate(),
                totalRequests: this.hits + this.misses,
                memoryUsage: await this.getMemoryUsage(),
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
         * 获取内存使用量（字节）
         */
        async getMemoryUsage() {
            try {
                const entries = await this.prisma.cacheEntry.findMany({
                    select: { value: true },
                });
                let totalSize = 0;
                for (const entry of entries) {
                    totalSize += entry.value.length * 2; // UTF-16 编码，每个字符 2 字节
                }
                return totalSize;
            }
            catch (error) {
                this.logger.error('获取 L3 缓存内存使用量失败', error);
                return 0;
            }
        }
        /**
         * 清理过期缓存
         */
        async cleanExpired() {
            try {
                const result = await this.prisma.cacheEntry.deleteMany({
                    where: {
                        expiresAt: {
                            lt: new Date(),
                        },
                    },
                });
                if (result.count > 0) {
                    this.logger.debug(`清理了 ${result.count} 条过期 L3 缓存`);
                }
                return result.count;
            }
            catch (error) {
                this.logger.error('清理过期 L3 缓存失败', error);
                return 0;
            }
        }
        /**
         * 获取热点数据
         */
        async getHotData(limit = 100) {
            const safeLimit = Number(limit) || 100;
            try {
                const entries = await this.prisma.cacheEntry.findMany({
                    orderBy: { accessCount: 'desc' },
                    take: safeLimit,
                    select: {
                        key: true,
                        accessCount: true,
                        lastAccessedAt: true,
                    },
                });
                return entries;
            }
            catch (error) {
                this.logger.error('获取 L3 热点数据失败', error);
                return [];
            }
        }
    };
    __setFunctionName(_classThis, "L3CacheProvider");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        L3CacheProvider = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return L3CacheProvider = _classThis;
})();
export { L3CacheProvider };
//# sourceMappingURL=l3-cache.provider.js.map