///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
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
import { RolePermissionsMapper } from '../utils/role-permissions.mapper';
/**
 * 权限预热策略
 * 预热活跃用户的权限数据
 */
let PermissionStrategy = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PermissionStrategy = _classThis = class {
        constructor(prisma, redisCache) {
            this.prisma = prisma;
            this.redisCache = redisCache;
            this.name = 'permissions';
            this.logger = new Logger(PermissionStrategy.name);
            this.maxUsersToWarmup = 100;
        }
        /**
         * 执行权限预热
         */
        async warmup() {
            const startTime = Date.now();
            try {
                // 获取最近登录的活跃用户
                const activeUsers = await this.prisma.user.findMany({
                    where: {
                        status: 'ACTIVE',
                    },
                    orderBy: {
                        updatedAt: 'desc',
                    },
                    take: this.maxUsersToWarmup,
                    select: {
                        id: true,
                        role: true,
                    },
                });
                this.logger.log(`开始预热 ${activeUsers.length} 个活跃用户的权限`);
                let successCount = 0;
                for (const user of activeUsers) {
                    try {
                        // 缓存用户角色
                        await this.redisCache.cacheUserRole(user.id, user.role);
                        // 缓存用户权限（基于角色）
                        const permissions = RolePermissionsMapper.getPermissionsByRole(user.role.name);
                        await this.redisCache.cacheUserPermissions(user.id, permissions);
                        successCount++;
                    }
                    catch (error) {
                        this.logger.error(`预热用户 ${user.id} 的权限失败: ${error.message}`);
                    }
                }
                const duration = Date.now() - startTime;
                this.logger.log(`活跃用户权限预热完成: ${successCount}/${activeUsers.length}，耗时 ${duration}ms`);
                return {
                    success: true,
                    count: successCount,
                    duration,
                };
            }
            catch (error) {
                const duration = Date.now() - startTime;
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                this.logger.error(`权限预热失败: ${errorMessage}`, error.stack);
                return {
                    success: false,
                    count: 0,
                    duration,
                    error: errorMessage,
                };
            }
        }
    };
    __setFunctionName(_classThis, "PermissionStrategy");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PermissionStrategy = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PermissionStrategy = _classThis;
})();
export { PermissionStrategy };
//# sourceMappingURL=permission.strategy.js.map