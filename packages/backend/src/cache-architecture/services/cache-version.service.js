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
 * 缓存版本类型
 */
export var CacheVersionType;
(function (CacheVersionType) {
    CacheVersionType["USER_PERMISSIONS"] = "user_permissions";
    CacheVersionType["USER_ROLE"] = "user_role";
    CacheVersionType["PROJECT_PERMISSIONS"] = "project_permissions";
    CacheVersionType["PROJECT_MEMBERS"] = "project_members";
    CacheVersionType["ROLE_PERMISSIONS"] = "role_permissions";
    CacheVersionType["SYSTEM_CONFIG"] = "system_config";
})(CacheVersionType || (CacheVersionType = {}));
/**
 * 缓存版本管理服务
 *
 * 功能：
 * 1. 为不同类型的缓存数据维护版本号
 * 2. 通过版本号确保缓存一致性
 * 3. 支持版本升级和回滚
 * 4. 防止使用过期数据
 */
let CacheVersionService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CacheVersionService = _classThis = class {
        constructor(configService, redis) {
            this.configService = configService;
            this.redis = redis;
            this.logger = new Logger(CacheVersionService.name);
            this.VERSION_PREFIX = 'cache:version:';
            this.VERSION_LOCK_PREFIX = 'cache:version:lock:';
            const cacheTTL = this.configService.get('cacheTTL', { infer: true });
            const timeout = this.configService.get('timeout', { infer: true });
            this.defaultTTL = cacheTTL.cacheVersion;
            this.distributedLockTTL = Math.floor(timeout.distributedLock / 1000); // 转为秒
        }
        async onModuleInit() {
            this.logger.log('缓存版本管理服务已初始化');
        }
        /**
         * 获取指定类型的缓存版本
         *
         * @param type 缓存类型
         * @param key 可选的缓存键（用于特定数据的版本控制）
         * @returns 版本信息
         */
        async getVersion(type, key) {
            try {
                const versionKey = this.getVersionKey(type, key);
                const data = await this.redis.get(versionKey);
                if (!data) {
                    return null;
                }
                const info = JSON.parse(data);
                return info;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`获取缓存版本失败: ${type}, ${key || 'global'} - ${message}`, stack);
                return null;
            }
        }
        /**
         * 创建新的缓存版本
         *
         * @param type 缓存类型
         * @param key 可选的缓存键
         * @param description 版本描述
         * @returns 新版本号
         */
        async createVersion(type, key, description) {
            try {
                // 获取分布式锁，防止并发创建版本
                const lockKey = this.getVersionLockKey(type, key);
                const lock = await this.acquireLock(lockKey, this.distributedLockTTL * 1000); // 使用配置的锁 TTL
                if (!lock) {
                    // 如果获取锁失败，重试获取现有版本
                    const existing = await this.getVersion(type, key);
                    if (existing) {
                        return existing.version;
                    }
                }
                try {
                    // 生成新版本号（时间戳 + 随机数）
                    const timestamp = Date.now();
                    const random = Math.random().toString(36).substring(2, 8);
                    const version = `v${timestamp}_${random}`;
                    const info = {
                        version,
                        updatedAt: timestamp,
                        description,
                    };
                    // 保存版本信息
                    const versionKey = this.getVersionKey(type, key);
                    await this.redis.setex(versionKey, this.defaultTTL, JSON.stringify(info));
                    this.logger.debug(`创建缓存版本: ${type}, ${key || 'global'} -> ${version}`);
                    return version;
                }
                finally {
                    if (lock) {
                        await this.releaseLock(lockKey, lock);
                    }
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`创建缓存版本失败: ${type}, ${key || 'global'} - ${message}`, stack);
                throw error;
            }
        }
        /**
         * 更新缓存版本（创建新版本）
         *
         * @param type 缓存类型
         * @param key 可选的缓存键
         * @param description 版本描述
         * @returns 新版本号
         */
        async updateVersion(type, key, description) {
            return this.createVersion(type, key, description);
        }
        /**
         * 删除缓存版本
         *
         * @param type 缓存类型
         * @param key 可选的缓存键
         */
        async deleteVersion(type, key) {
            try {
                const versionKey = this.getVersionKey(type, key);
                await this.redis.del(versionKey);
                this.logger.debug(`删除缓存版本: ${type}, ${key || 'global'}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`删除缓存版本失败: ${type}, ${key || 'global'} - ${message}`, stack);
            }
        }
        /**
         * 批量删除缓存版本
         *
         * @param type 缓存类型
         * @param keys 缓存键列表
         */
        async deleteVersions(type, keys) {
            try {
                const promises = keys.map((key) => this.deleteVersion(type, key));
                await Promise.all(promises);
                this.logger.debug(`批量删除缓存版本: ${type}, ${keys.length} 个`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`批量删除缓存版本失败: ${type} - ${message}`, stack);
            }
        }
        /**
         * 检查缓存版本是否过期
         *
         * @param type 缓存类型
         * @param key 可选的缓存键
         * @param maxAge 最大有效时间（毫秒）
         * @returns 是否过期
         */
        async isVersionExpired(type, key, maxAge = 5 * 60 * 1000 // 默认 5 分钟
        ) {
            try {
                const info = await this.getVersion(type, key);
                if (!info) {
                    return true; // 没有版本信息视为过期
                }
                const age = Date.now() - info.updatedAt;
                return age > maxAge;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`检查缓存版本过期失败: ${type}, ${key || 'global'} - ${message}`, stack);
                return true; // 出错时视为过期
            }
        }
        /**
         * 获取版本化的缓存键
         *
         * @param baseKey 基础缓存键
         * @param type 缓存类型
         * @param key 可选的缓存键
         * @returns 带版本号的缓存键
         */
        async getVersionedKey(baseKey, type, key) {
            const info = await this.getVersion(type, key);
            if (!info) {
                // 如果没有版本信息，创建一个新版本
                const version = await this.createVersion(type, key, 'Auto-created');
                return `${baseKey}:${version}`;
            }
            return `${baseKey}:${info.version}`;
        }
        /**
         * 验证缓存键的版本是否有效
         *
         * @param versionedKey 带版本号的缓存键
         * @param type 缓存类型
         * @param key 可选的缓存键
         * @returns 是否有效
         */
        async validateKey(versionedKey, type, key) {
            try {
                const info = await this.getVersion(type, key);
                if (!info) {
                    return false;
                }
                // 检查版本是否匹配
                return versionedKey.endsWith(`:${info.version}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`验证缓存键版本失败: ${versionedKey} - ${message}`, stack);
                return false;
            }
        }
        /**
         * 获取所有版本信息（用于调试）
         *
         * @param type 缓存类型
         * @returns 版本信息列表
         */
        async getAllVersions(type) {
            try {
                const pattern = `${this.VERSION_PREFIX}${type}:*`;
                const keys = await this.redis.keys(pattern);
                const versions = [];
                for (const key of keys) {
                    const data = await this.redis.get(key);
                    if (data) {
                        const info = JSON.parse(data);
                        const cacheKey = key.replace(this.VERSION_PREFIX, '');
                        versions.push({
                            key: cacheKey,
                            version: info.version,
                            updatedAt: info.updatedAt,
                        });
                    }
                }
                return versions;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`获取所有版本信息失败: ${type} - ${message}`, stack);
                return [];
            }
        }
        /**
         * 清理过期版本
         *
         * @param type 缓存类型
         * @param maxAge 最大有效时间（毫秒）
         * @returns 清理的版本数量
         */
        async cleanupExpiredVersions(type, maxAge = 60 * 60 * 1000 // 默认 1 小时
        ) {
            try {
                const versions = await this.getAllVersions(type);
                const now = Date.now();
                let cleaned = 0;
                for (const version of versions) {
                    if (now - version.updatedAt > maxAge) {
                        await this.deleteVersion(type, version.key);
                        cleaned++;
                    }
                }
                this.logger.debug(`清理过期版本: ${type}, 清理了 ${cleaned} 个`);
                return cleaned;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                const stack = error instanceof Error ? error.stack : undefined;
                this.logger.error(`清理过期版本失败: ${type} - ${message}`, stack);
                return 0;
            }
        }
        /**
         * 生成版本键
         */
        getVersionKey(type, key) {
            if (key) {
                return `${this.VERSION_PREFIX}${type}:${key}`;
            }
            return `${this.VERSION_PREFIX}${type}:global`;
        }
        /**
         * 生成版本锁键
         */
        getVersionLockKey(type, key) {
            if (key) {
                return `${this.VERSION_LOCK_PREFIX}${type}:${key}`;
            }
            return `${this.VERSION_LOCK_PREFIX}${type}:global`;
        }
        /**
         * 获取分布式锁
         */
        async acquireLock(lockKey, ttl = 5000) {
            const lockValue = `${process.pid}:${Date.now()}:${Math.random()}`;
            const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX');
            return result === 'OK' ? lockValue : null;
        }
        /**
         * 释放分布式锁
         */
        async releaseLock(lockKey, lockValue) {
            const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
            await this.redis.eval(script, 1, lockKey, lockValue);
        }
    };
    __setFunctionName(_classThis, "CacheVersionService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CacheVersionService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CacheVersionService = _classThis;
})();
export { CacheVersionService };
//# sourceMappingURL=cache-version.service.js.map