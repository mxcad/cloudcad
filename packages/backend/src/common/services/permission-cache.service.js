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
import { SystemPermission } from '../enums/permissions.enum';
import { CacheKeyUtil } from '../../cache-architecture/utils/cache-key.utils';
import { CacheVersionType, } from '../../cache-architecture/services/cache-version.service';
let PermissionCacheService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PermissionCacheService = _classThis = class {
        constructor(redis, multiLevelCache, cacheVersionService) {
            this.redis = redis;
            this.multiLevelCache = multiLevelCache;
            this.cacheVersionService = cacheVersionService;
            this.logger = new Logger(PermissionCacheService.name);
            this.defaultTTL = 5 * 60; // 5 分钟
            this.CHANNEL_PREFIX = 'permission:cache:invalidation';
            this.subscriber = null;
            this.subscribeToInvalidationEvents();
            this.setupVersionControl();
        }
        async onModuleDestroy() {
            // 取消订阅
            if (this.subscriber) {
                await Promise.all([
                    this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:user`),
                    this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:project`),
                    this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:role`),
                    this.subscriber.unsubscribe(`${this.CHANNEL_PREFIX}:all`),
                ]);
            }
        }
        /**
         * 设置版本控制
         */
        setupVersionControl() {
            // 用户权限版本控制
            this.multiLevelCache.enableVersionControl(CacheVersionType.USER_PERMISSIONS);
            this.logger.debug('权限缓存版本控制已启用');
        }
        /**
         * 订阅缓存失效事件
         */
        async subscribeToInvalidationEvents() {
            try {
                this.subscriber = this.redis.duplicate();
                // 订阅各种类型的缓存失效事件
                const channels = [
                    `${this.CHANNEL_PREFIX}:user`,
                    `${this.CHANNEL_PREFIX}:project`,
                    `${this.CHANNEL_PREFIX}:role`,
                    `${this.CHANNEL_PREFIX}:all`,
                ];
                // 分别订阅每个频道
                for (const channel of channels) {
                    await this.subscriber.subscribe(channel, (err) => {
                        if (err) {
                            this.logger.error(`订阅缓存失效事件失败: ${channel} - ${err.message}`);
                        }
                    });
                }
                // 处理消息
                this.subscriber.on('message', (channel, message) => {
                    try {
                        const event = JSON.parse(message);
                        this.handleInvalidationEvent(event);
                    }
                    catch (error) {
                        this.logger.error(`处理缓存失效事件失败: ${error.message}`);
                    }
                });
                this.logger.log('缓存失效事件订阅已启动');
            }
            catch (error) {
                this.logger.error(`订阅缓存失效事件失败: ${error.message}`);
            }
        }
        /**
         * 处理缓存失效事件
         * 只处理 5 秒内的事件，防止过期的事件在重启的地方再次处理
         */
        handleInvalidationEvent(event) {
            try {
                // 只处理 5 秒内的事件，防止循环
                const eventAge = Date.now() - event.timestamp;
                if (eventAge > 5000) {
                    this.logger.debug(`忽略过期缓存失效事件: ${event.type}:${event.id || 'all'} (age: ${eventAge}ms)`);
                    return;
                }
                switch (event.type) {
                    case 'user':
                        if (event.id) {
                            this.clearUserCacheInternal(event.id);
                        }
                        break;
                    case 'project':
                        if (event.id) {
                            this.clearProjectCacheInternal(event.id);
                        }
                        break;
                    case 'role':
                        if (event.id) {
                            this.clearRoleCacheInternal(event.id);
                        }
                        break;
                    case 'all':
                        this.clearAllCacheInternal();
                        break;
                }
                this.logger.debug(`处理缓存失效事件: ${event.type}:${event.id || 'all'}`);
            }
            catch (error) {
                this.logger.error(`处理缓存失效事件失败: ${error.message}`);
            }
        }
        /**
         * 发布缓存失效事件
         */
        async publishInvalidationEvent(type, id, source) {
            try {
                const event = {
                    type,
                    id,
                    timestamp: Date.now(),
                    source,
                };
                await this.redis.publish(`${this.CHANNEL_PREFIX}:${type}`, JSON.stringify(event));
            }
            catch (error) {
                this.logger.error(`发布缓存失效事件失败: ${error.message}`);
            }
        }
        /**
         * 生成缓存键
         */
        generateCacheKey(type, id, permission) {
            const idNum = parseInt(id, 10);
            switch (type) {
                case 'user':
                    return CacheKeyUtil.userPermissions(idNum);
                case 'project':
                    return CacheKeyUtil.projectPermissions(idNum);
                default:
                    throw new InternalServerErrorException(`不支持的缓存类型: ${type}`);
            }
        }
        /**
         * 设置缓存
         */
        async set(key, value, ttl = this.defaultTTL) {
            await this.multiLevelCache.set(key, value, ttl);
        }
        /**
         * 获取缓存
         */
        async get(key) {
            return this.multiLevelCache.get(key);
        }
        /**
         * 删除缓存
         */
        async delete(key) {
            await this.multiLevelCache.delete(key);
        }
        /**
         * 清除用户缓存（公共接口）
         */
        async clearUserCache(userId) {
            // 更新版本号
            if (this.cacheVersionService) {
                await this.cacheVersionService.updateVersion(CacheVersionType.USER_PERMISSIONS, userId, `User ${userId} permissions updated`);
            }
            // 先发布事件，确保其他实例也清除缓存
            await this.publishInvalidationEvent('user', userId, 'clearUserCache');
            // 然后执行本地清除
            this.clearUserCacheInternal(userId);
        }
        /**
         * 清除用户缓存（内部实现，不发布事件）
         * 使用多级缓存进行删除
         */
        clearUserCacheInternal(userId) {
            const userIdNum = parseInt(userId, 10);
            // 生成需要删除的缓存键
            const keysToDelete = [
                CacheKeyUtil.userPermissions(userIdNum),
                CacheKeyUtil.user(userIdNum),
                // 删除 is_admin 缓存
                `is_admin:${userId}`,
                // 删除所有单个权限缓存
                ...Object.values(SystemPermission).map((perm) => `system_perm:${userId}:${perm}`),
            ];
            // 使用多级缓存进行删除
            this.multiLevelCache.deleteMany(keysToDelete);
            this.logger.debug(`清除用户 ${userId} 的 ${keysToDelete.length} 个缓存`);
        }
        /**
         * 清除项目缓存（公共接口）
         */
        async clearProjectCache(projectId) {
            // 更新版本号
            if (this.cacheVersionService) {
                await this.cacheVersionService.updateVersion(CacheVersionType.PROJECT_PERMISSIONS, projectId, `Project ${projectId} permissions updated`);
            }
            // 先发布事件
            await this.publishInvalidationEvent('project', projectId, 'clearProjectCache');
            // 然后执行本地清除
            this.clearProjectCacheInternal(projectId);
        }
        /**
         * 清除项目缓存（内部实现）
         */
        clearProjectCacheInternal(projectId) {
            const projectIdNum = parseInt(projectId, 10);
            // 生成需要删除的缓存键
            const keysToDelete = [
                CacheKeyUtil.projectPermissions(projectIdNum),
                CacheKeyUtil.project(projectIdNum),
            ];
            this.multiLevelCache.deleteMany(keysToDelete);
            this.logger.debug(`清除项目 ${projectId} 的 ${keysToDelete.length} 个缓存`);
        }
        /**
         * 清除角色缓存（公共接口）
         */
        async clearRoleCache(roleName) {
            // 更新角色权限版本
            if (this.cacheVersionService) {
                await this.cacheVersionService.updateVersion(CacheVersionType.ROLE_PERMISSIONS, roleName, `Role ${roleName} permissions updated`);
                // 同时更新用户权限版本，使 system_perm 缓存失效
                await this.cacheVersionService.updateVersion(CacheVersionType.USER_PERMISSIONS, 'global', `Role ${roleName} permissions updated, invalidating all user permission caches`);
            }
            // 先发布事件
            await this.publishInvalidationEvent('role', roleName, 'clearRoleCache');
            // 然后执行本地清除
            this.clearRoleCacheInternal(roleName);
        }
        /**
         * 清除角色缓存（内部实现）
         */
        clearRoleCacheInternal(roleName) {
            const keysToDelete = [
                CacheKeyUtil.custom('role', roleName),
                // 删除该角色的权限缓存
                `role:permissions:${roleName}`,
                `role:path:${roleName}`,
            ];
            this.multiLevelCache.deleteMany(keysToDelete);
            this.logger.debug(`清除角色 ${roleName} 的 ${keysToDelete.length} 个缓存`);
        }
        /**
         * 清除所有缓存（公共接口）
         */
        async clearAllCache() {
            // 更新所有版本号
            if (this.cacheVersionService) {
                await Promise.all([
                    this.cacheVersionService.updateVersion(CacheVersionType.USER_PERMISSIONS, undefined, 'All user permissions cleared'),
                    this.cacheVersionService.updateVersion(CacheVersionType.PROJECT_PERMISSIONS, undefined, 'All project permissions cleared'),
                    this.cacheVersionService.updateVersion(CacheVersionType.ROLE_PERMISSIONS, undefined, 'All role permissions cleared'),
                ]);
            }
            // 先发布事件
            await this.publishInvalidationEvent('all', undefined, 'clearAllCache');
            // 然后执行本地清除
            this.clearAllCacheInternal();
        }
        /**
         * 清除所有缓存（内部实现）
         */
        clearAllCacheInternal() {
            this.multiLevelCache.clear();
            this.logger.debug('清除所有缓存');
        }
        /**
         * 批量清除用户缓存
         */
        async clearMultipleUserCache(userIds) {
            await Promise.all(userIds.map((userId) => this.clearUserCache(userId)));
            this.logger.debug(`批量清除 ${userIds.length} 个用户的缓存`);
        }
        /**
         * 批量清除项目缓存
         */
        async clearMultipleProjectCache(projectIds) {
            await Promise.all(projectIds.map((projectId) => this.clearProjectCache(projectId)));
            this.logger.debug(`批量清除 ${projectIds.length} 个项目的缓存`);
        }
        /**
         * 缓存用户系统权限
         */
        async cacheUserPermissions(userId, permissions) {
            const key = this.generateCacheKey('user', userId);
            await this.set(key, permissions);
        }
        /**
         * 获取用户系统权限缓存
         */
        async getUserPermissions(userId) {
            const key = this.generateCacheKey('user', userId);
            return this.get(key);
        }
        /**
         * 缓存用户角色
         */
        async cacheUserRole(userId, role) {
            const key = CacheKeyUtil.user(parseInt(userId, 10));
            await this.set(key, role, 10 * 60); // 用户角色缓存 10 分钟
        }
        /**
         * 获取用户角色缓存
         */
        async getUserRole(userId) {
            const key = CacheKeyUtil.user(parseInt(userId, 10));
            return this.get(key);
        }
        /**
         * 缓存项目权限
         */
        async cacheProjectPermissions(projectId, permissions) {
            const key = this.generateCacheKey('project', projectId);
            await this.set(key, permissions);
        }
        /**
         * 获取项目权限缓存
         */
        async getProjectPermissions(projectId) {
            const key = this.generateCacheKey('project', projectId);
            return this.get(key);
        }
        /**
         * 获取或加载用户权限
         */
        async getOrLoadUserPermissions(userId, loader) {
            const key = this.generateCacheKey('user', userId);
            return this.multiLevelCache.getOrLoad(key, loader);
        }
        /**
         * 获取或加载项目权限
         */
        async getOrLoadProjectPermissions(projectId, loader) {
            const key = this.generateCacheKey('project', projectId);
            return this.multiLevelCache.getOrLoad(key, loader);
        }
        /**
         * 清理过期缓存（多级缓存自动清理，这里返回 0）
         * @returns 清理的条目数量
         */
        async cleanup() {
            // 清理过期的版本
            if (this.cacheVersionService) {
                const cleaned = await this.cacheVersionService.cleanupExpiredVersions(CacheVersionType.USER_PERMISSIONS);
                return cleaned;
            }
            return 0;
        }
        /**
         * 获取缓存大小
         */
        async size() {
            const stats = await this.multiLevelCache.getStats();
            return stats.summary.totalRequests;
        }
        /**
         * 获取缓存统计信息
         */
        async getStats() {
            const stats = await this.multiLevelCache.getStats();
            return {
                totalEntries: stats.levels.L1.size + stats.levels.L2.size + stats.levels.L3.size,
                capacity: 1000,
                memoryUsage: `${Math.round(stats.summary.totalMemoryUsage / 1024 / 1024)}MB`,
                hitRate: stats.summary.overallHitRate,
            };
        }
    };
    __setFunctionName(_classThis, "PermissionCacheService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PermissionCacheService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PermissionCacheService = _classThis;
})();
export { PermissionCacheService };
//# sourceMappingURL=permission-cache.service.js.map