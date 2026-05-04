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
let TokenBlacklistService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TokenBlacklistService = _classThis = class {
        constructor(configService, redis) {
            this.configService = configService;
            this.redis = redis;
            this.logger = new Logger(TokenBlacklistService.name);
            this.blacklistPrefix = 'token:blacklist:';
            const cacheTTL = this.configService.get('cacheTTL', { infer: true });
            this.defaultTTL = cacheTTL.tokenBlacklist;
        }
        onModuleInit() {
            this.redis.on('error', (error) => {
                this.logger.error('Redis连接错误:', error);
            });
            this.redis.on('connect', () => {
                this.logger.log('Redis连接成功');
            });
        }
        /**
         * 将Token添加到黑名单
         * @param token JWT Token
         * @param expiresIn Token过期时间（秒）
         */
        async addToBlacklist(token, expiresIn) {
            try {
                const key = this.blacklistPrefix + token;
                const ttl = expiresIn || this.defaultTTL;
                await this.redis.setex(key, ttl, '1');
                this.logger.log(`Token已添加到黑名单: ${token.substring(0, 20)}...`);
            }
            catch (error) {
                this.logger.error('添加Token到黑名单失败:', error);
                throw error;
            }
        }
        /**
         * 检查Token是否在黑名单中
         * @param token JWT Token
         * @returns 是否在黑名单中
         */
        async isBlacklisted(token) {
            try {
                const key = this.blacklistPrefix + token;
                const result = await this.redis.exists(key);
                return result === 1;
            }
            catch (error) {
                this.logger.error('检查Token黑名单失败:', error);
                // 如果Redis不可用，记录错误但不阻止正常使用
                return false;
            }
        }
        /**
         * 将用户的所有Token添加到黑名单
         * @param userId 用户ID
         */
        async blacklistUserTokens(userId) {
            try {
                // 这个方法需要配合JWT ID才能实现
                // 目前先记录日志，后续可以通过JWT payload中的jti实现
                this.logger.log(`用户 ${userId} 的所有Token将被加入黑名单`);
                // 可以通过Redis的SCAN命令查找该用户的所有Token
                // 或者维护一个用户黑名单列表
                const userBlacklistKey = `user:blacklist:${userId}`;
                await this.redis.setex(userBlacklistKey, this.defaultTTL, '1');
            }
            catch (error) {
                this.logger.error('黑名单用户Token失败:', error);
                throw error;
            }
        }
        /**
         * 检查用户是否在黑名单中
         * @param userId 用户ID
         * @returns 是否在黑名单中
         */
        async isUserBlacklisted(userId) {
            try {
                const key = `user:blacklist:${userId}`;
                const result = await this.redis.exists(key);
                return result === 1;
            }
            catch (error) {
                this.logger.error('检查用户黑名单失败:', error);
                // 如果Redis不可用，记录错误但不阻止正常使用
                return false;
            }
        }
        /**
         * 从黑名单中移除用户
         * @param userId 用户ID
         */
        async removeUserFromBlacklist(userId) {
            try {
                const key = `user:blacklist:${userId}`;
                await this.redis.del(key);
                this.logger.log(`用户已从黑名单移除: ${userId}`);
            }
            catch (error) {
                this.logger.error('从黑名单移除用户失败:', error);
                throw error;
            }
        }
        /**
         * 从黑名单中移除Token
         * @param token JWT Token
         */
        async removeFromBlacklist(token) {
            try {
                const key = this.blacklistPrefix + token;
                await this.redis.del(key);
                this.logger.log(`Token已从黑名单移除: ${token.substring(0, 20)}...`);
            }
            catch (error) {
                this.logger.error('从黑名单移除Token失败:', error);
                throw error;
            }
        }
        /**
         * 清理过期的黑名单条目
         */
        async cleanupExpiredTokens() {
            try {
                const pattern = this.blacklistPrefix + '*';
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    // Redis的EXPIRE会自动清理过期键，这里只是记录统计信息
                    this.logger.log(`当前黑名单中有 ${keys.length} 个Token`);
                }
            }
            catch (error) {
                this.logger.error('清理过期Token失败:', error);
            }
        }
        /**
         * 获取黑名单统计信息
         */
        async getBlacklistStats() {
            try {
                const tokenCount = await this.redis.keys(this.blacklistPrefix + '*');
                const userCount = await this.redis.keys('user:blacklist:*');
                return {
                    totalTokens: tokenCount.length,
                    blacklistedUsers: userCount.length,
                };
            }
            catch (error) {
                this.logger.error('获取黑名单统计失败:', error);
                return { totalTokens: 0, blacklistedUsers: 0 };
            }
        }
        /**
         * 存储临时数据
         * @param key 键名
         * @param value 值
         * @param ttl 过期时间（秒）
         */
        async setTempData(key, value, ttl) {
            try {
                await this.redis.setex(key, ttl, value);
                this.logger.log(`临时数据已存储: ${key}`);
            }
            catch (error) {
                this.logger.error('存储临时数据失败:', error);
                throw error;
            }
        }
        /**
         * 获取临时数据
         * @param key 键名
         */
        async getTempData(key) {
            try {
                const result = await this.redis.get(key);
                return result;
            }
            catch (error) {
                this.logger.error('获取临时数据失败:', error);
                return null;
            }
        }
        /**
         * 删除临时数据
         * @param key 键名
         */
        async deleteTempData(key) {
            try {
                await this.redis.del(key);
                this.logger.log(`临时数据已删除: ${key}`);
            }
            catch (error) {
                this.logger.error('删除临时数据失败:', error);
            }
        }
        async onModuleDestroy() {
            if (this.redis) {
                await this.redis.quit();
            }
        }
    };
    __setFunctionName(_classThis, "TokenBlacklistService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        TokenBlacklistService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return TokenBlacklistService = _classThis;
})();
export { TokenBlacklistService };
//# sourceMappingURL=token-blacklist.service.js.map