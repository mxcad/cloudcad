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
/**
 * Redis 缓存服务
 *
 * 功能：
 * 1. 使用 Redis 存储权限缓存
 * 2. 支持缓存过期
 * 3. 支持缓存清理
 * 4. 提供缓存统计
 */
let RedisCacheService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RedisCacheService = _classThis = class {
        constructor(configService, redis) {
            this.configService = configService;
            this.redis = redis;
            this.logger = new Logger(RedisCacheService.name);
            this.KEY_PREFIX = 'permission:';
            const cacheTTL = this.configService.get('cacheTTL', { infer: true });
            this.defaultTTL = cacheTTL.default;
            this.permissionTTL = cacheTTL.permission;
        }
        /**
         * 生成缓存键
         */
        generateCacheKey(type, userId, resourceId) {
            if (type === 'user') {
                return `${this.KEY_PREFIX}user:${userId}`;
            }
            else if (type === 'node') {
                return `${this.KEY_PREFIX}node:${userId}:${resourceId}`;
            }
            else if (type === 'role') {
                return `${this.KEY_PREFIX}role:${type}:${userId}`;
            }
            return '';
        }
        /**
         * 设置缓存
         */
        async set(key, value, ttl = this.defaultTTL) {
            try {
                await this.redis.setex(key, ttl, JSON.stringify(value));
            }
            catch (error) {
                this.logger.error(`设置缓存失败: ${error.message}`, error.stack);
            }
        }
        /**
         * 获取缓存
         */
        async get(key) {
            try {
                const value = await this.redis.get(key);
                if (!value) {
                    return null;
                }
                return JSON.parse(value);
            }
            catch (error) {
                this.logger.error(`获取缓存失败: ${error.message}`, error.stack);
                return null;
            }
        }
        /**
         * 删除缓存
         */
        async delete(key) {
            try {
                await this.redis.del(key);
            }
            catch (error) {
                this.logger.error(`删除缓存失败: ${error.message}`, error.stack);
            }
        }
        /**
         * 清除用户相关缓存
         */
        async clearUserCache(userId) {
            try {
                const pattern = `${this.KEY_PREFIX}user:${userId}*`;
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                    this.logger.log(`清除用户 ${userId} 的权限缓存，共 ${keys.length} 个`);
                }
            }
            catch (error) {
                this.logger.error(`清除用户缓存失败: ${error.message}`, error.stack);
            }
        }
        /**
         * 清除节点相关缓存（项目/文件夹/文件）
         */
        async clearNodeCache(nodeId) {
            try {
                const pattern = `${this.KEY_PREFIX}node:*:${nodeId}`;
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                    this.logger.log(`清除节点 ${nodeId} 的权限缓存，共 ${keys.length} 个`);
                }
            }
            catch (error) {
                this.logger.error(`清除节点缓存失败: ${error.message}`, error.stack);
            }
        }
        /**
         * 清除项目缓存（向后兼容）
         * @deprecated 使用 clearNodeCache 代替
         */
        async clearProjectCache(projectId) {
            return this.clearNodeCache(projectId);
        }
        /**
         * 清除文件缓存（向后兼容）
         * @deprecated 使用 clearNodeCache 代替
         */
        async clearFileCache(fileId) {
            return this.clearNodeCache(fileId);
        }
        /**
         * 缓存用户权限
         */
        async cacheUserPermissions(userId, permissions) {
            const key = this.generateCacheKey('user', userId);
            await this.set(key, permissions, 10 * 60); // 用户权限缓存10分钟
        }
        /**
         * 获取用户权限缓存
         */
        async getUserPermissions(userId) {
            const key = this.generateCacheKey('user', userId);
            return await this.get(key);
        }
        /**
         * 缓存节点访问权限（统一管理项目/文件夹/文件的访问权限）
         */
        async cacheNodeAccessRole(userId, nodeId, role) {
            const key = this.generateCacheKey('node', userId, nodeId);
            await this.set(key, role, 5 * 60); // 节点角色缓存5分钟
        }
        /**
         * 获取节点访问角色缓存
         */
        async getNodeAccessRole(userId, nodeId) {
            const key = this.generateCacheKey('node', userId, nodeId);
            return await this.get(key);
        }
        /**
         * 获取文件访问角色缓存（向后兼容）
         * @deprecated 使用 getNodeAccessRole 代替
         */
        async getFileAccessRole(userId, nodeId) {
            return this.getNodeAccessRole(userId, nodeId);
        }
        /**
         * 缓存用户角色
         */
        async cacheUserRole(userId, role) {
            const key = this.generateCacheKey('role', userId);
            const roleData = {
                id: role.id,
                name: role.name,
                description: role.description ?? undefined,
                category: role.category,
                isSystem: role.isSystem,
            };
            await this.set(key, roleData, 10 * 60); // 用户角色缓存10分钟
        }
        /**
         * 获取用户角色缓存
         */
        async getUserRole(userId) {
            const key = this.generateCacheKey('role', userId);
            return await this.get(key);
        }
        /**
         * 获取缓存统计信息
         */
        async getStats() {
            try {
                const pattern = `${this.KEY_PREFIX}*`;
                const keys = await this.redis.keys(pattern);
                const info = await this.redis.info('memory');
                // 解析内存使用信息
                const usedMemoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
                const memoryUsage = usedMemoryMatch ? usedMemoryMatch[1] : 'N/A';
                return {
                    totalEntries: keys.length,
                    memoryUsage,
                };
            }
            catch (error) {
                this.logger.error(`获取缓存统计失败: ${error.message}`, error.stack);
                return {
                    totalEntries: 0,
                    memoryUsage: 'N/A',
                };
            }
        }
        /**
         * 清理所有权限缓存
         */
        async clearAll() {
            try {
                const pattern = `${this.KEY_PREFIX}*`;
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                    this.logger.log(`清理所有权限缓存，共 ${keys.length} 个`);
                }
            }
            catch (error) {
                this.logger.error(`清理所有缓存失败: ${error.message}`, error.stack);
            }
        }
    };
    __setFunctionName(_classThis, "RedisCacheService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        RedisCacheService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return RedisCacheService = _classThis;
})();
export { RedisCacheService };
//# sourceMappingURL=redis-cache.service.js.map