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
import { SystemPermission } from '../enums/permissions.enum';
import { CACHE_TTL } from '../constants/cache.constants';
/**
 * 系统权限检查服务
 *
 * 功能：
 * 1. 检查用户是否具有指定系统权限
 * 2. 支持系统权限缓存优化性能
 * 3. 支持上下文感知的权限检查
 */
let PermissionService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PermissionService = _classThis = class {
        constructor(prisma, cacheService, roleInheritanceService, permissionStore, policyConfigService, policyEngineService) {
            this.prisma = prisma;
            this.cacheService = cacheService;
            this.roleInheritanceService = roleInheritanceService;
            this.permissionStore = permissionStore;
            this.policyConfigService = policyConfigService;
            this.policyEngineService = policyEngineService;
            this.logger = new Logger(PermissionService.name);
        }
        /**
         * 系统权限检查入口
         *
         * @param userId 用户 ID
         * @param permission 系统权限
         * @returns 是否具有权限
         */
        async checkSystemPermission(userId, permission) {
            const startTime = Date.now();
            let decisionReason = '';
            let hasPermission = false;
            try {
                if (this.permissionStore) {
                    return this.permissionStore.checkSystemPermission(userId, permission);
                }
                // 1. 检查缓存
                const cacheKey = `system_perm:${userId}:${permission}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    decisionReason = '缓存命中';
                    hasPermission = cached;
                    this.logger.log(`权限检查缓存命中: 用户=${userId.substring(0, 8)}..., 权限=${permission}, 结果=${hasPermission}`);
                }
                else {
                    // 2. 检查用户的系统权限（包括管理员也需要具体权限配置）
                    decisionReason = '系统权限检查';
                    hasPermission = await this.checkUserSystemPermission(userId, permission);
                    this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.SYSTEM_PERMISSION); // 5 分钟
                    this.logger.log(`权限检查完成: 用户=${userId.substring(0, 8)}..., 权限=${permission}, 结果=${hasPermission}, 原因=${decisionReason}`);
                }
                // 权限检查不记录审计日志（避免日志过多）
                return hasPermission;
            }
            catch (error) {
                this.logger.error(`系统权限检查失败: ${error.message}`, error.stack);
                // 权限检查不记录审计日志（避免日志过多）
                return false;
            }
        }
        /**
         * 检查用户是否为系统管理员
         */
        async isSystemAdmin(userId) {
            const cacheKey = `is_admin:${userId}`;
            const cached = await this.cacheService.get(cacheKey);
            if (cached !== null) {
                this.logger.log(`is_admin 缓存命中: 用户=${userId.substring(0, 8)}..., 结果=${cached}`);
                return cached;
            }
            // 检查用户是否具有 SYSTEM_ADMIN 权限
            const isAdmin = await this.checkUserSystemPermission(userId, SystemPermission.SYSTEM_ADMIN);
            this.logger.log(`is_admin 计算完成: 用户=${userId.substring(0, 8)}..., 结果=${isAdmin}`);
            this.cacheService.set(cacheKey, isAdmin, CACHE_TTL.USER_ROLE); // 10 分钟
            return isAdmin;
        }
        /**
         * 检查用户的系统权限（支持角色继承）
         */
        async checkUserSystemPermission(userId, permission) {
            try {
                // 使用角色继承服务检查权限（包括继承的权限）
                return await this.roleInheritanceService.checkUserPermissionWithInheritance(userId, permission);
            }
            catch (error) {
                this.logger.error(`检查用户系统权限失败: ${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 获取用户的系统权限（包括继承的权限）
         */
        async getUserPermissions(user) {
            try {
                if (!user.role) {
                    return [];
                }
                // 使用角色继承服务获取所有权限（包括继承的权限）
                return await this.roleInheritanceService.getRolePermissions(user.role.name);
            }
            catch (error) {
                this.logger.error(`获取用户权限失败: ${error.message}`, error.stack);
                return [];
            }
        }
        /**
         * 检查用户是否具有指定角色
         */
        hasRole(user, roleNames) {
            return roleNames.includes(user.role?.name || '');
        }
        /**
         * 支持上下文的权限检查
         *
         * 在基础权限检查的基础上，增加上下文感知的额外验证
         *
         * @param userId 用户 ID
         * @param permission 系统权限
         * @param context 上下文信息
         * @returns 是否具有权限
         */
        async checkSystemPermissionWithContext(userId, permission, context) {
            const startTime = Date.now();
            try {
                // 1. 先进行基础权限检查
                const hasBasicPermission = await this.checkSystemPermission(userId, permission);
                if (!hasBasicPermission) {
                    return false;
                }
                // 2. 检查上下文规则
                const contextGranted = await this.checkContextRules(userId, permission, context);
                if (!contextGranted) {
                    // 权限检查不记录审计日志（避免日志过多）
                    return false;
                }
                return true;
            }
            catch (error) {
                this.logger.error(`上下文权限检查失败: ${error.message}`, error.stack);
                return false;
            }
        }
        /**
         * 检查上下文规则
         *
         * 使用策略引擎评估动态权限策略
         *
         * @returns 是否通过上下文规则检查
         */
        async checkContextRules(userId, permission, context) {
            // 如果策略引擎服务未注入，使用旧的硬编码规则（向后兼容）
            if (!this.policyConfigService || !this.policyEngineService) {
                return this.checkLegacyContextRules(userId, permission, context);
            }
            try {
                // 获取该权限的所有启用的策略
                const policyConfigs = await this.policyConfigService.getEnabledPoliciesForPermission(permission);
                // 如果没有配置策略，默认允许
                if (policyConfigs.length === 0) {
                    return true;
                }
                // 创建策略实例
                const policies = [];
                for (const config of policyConfigs) {
                    try {
                        const policy = this.policyEngineService.createPolicy(config.type, config.id || 'temp', config.config);
                        policies.push(policy);
                    }
                    catch (error) {
                        this.logger.error(`创建策略实例失败: ${config.name} - ${error.message}`, error.stack);
                    }
                }
                // 如果没有有效的策略，默认允许
                if (policies.length === 0) {
                    return true;
                }
                // 构建策略上下文
                const policyContext = {
                    userId,
                    permission: permission,
                    time: context.time,
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    metadata: context.metadata,
                };
                // 评估所有策略（AND 逻辑，所有策略都通过才允许）
                const summary = await this.policyEngineService.evaluatePolicies(policies, policyContext);
                if (!summary.allowed) {
                    this.logger.warn(`用户 ${userId} 的权限 ${permission} 被策略拒绝: ${summary.denialReason}`);
                }
                return summary.allowed;
            }
            catch (error) {
                this.logger.error(`策略引擎评估失败: ${error.message}`, error.stack);
                // 出错时默认拒绝（安全原则）
                return false;
            }
        }
        /**
         * 旧的硬编码上下文规则（向后兼容）
         *
         * @deprecated 使用策略引擎替代
         */
        async checkLegacyContextRules(userId, permission, context) {
            // 示例规则 1：工作时间限制（9:00 - 18:00）
            // 仅对敏感操作（如 DELETE）进行时间限制
            const sensitivePermissions = [
                SystemPermission.SYSTEM_USER_DELETE,
                SystemPermission.SYSTEM_ROLE_DELETE,
                SystemPermission.SYSTEM_FONT_DELETE,
            ];
            if (sensitivePermissions.includes(permission) && context.time) {
                const hour = context.time.getHours();
                if (hour < 9 || hour >= 18) {
                    this.logger.warn(`用户 ${userId} 在非工作时间尝试执行敏感操作 ${permission}`);
                    return false;
                }
            }
            // 示例规则 2：IP 地址白名单检查
            // 如果配置了 IP 白名单，检查用户 IP 是否在白名单中
            if (context.ipAddress) {
                const isAllowedIp = await this.checkIpAddressWhitelist(userId, context.ipAddress);
                if (!isAllowedIp) {
                    this.logger.warn(`用户 ${userId} 的 IP 地址 ${context.ipAddress} 不在白名单中`);
                    return false;
                }
            }
            // 示例规则 3：设备类型限制
            // 如果配置了设备类型限制，检查用户设备类型
            if (context.userAgent) {
                const isAllowedDevice = await this.checkDeviceRestriction(userId, context.userAgent);
                if (!isAllowedDevice) {
                    this.logger.warn(`用户 ${userId} 的设备类型不在允许列表中: ${context.userAgent}`);
                    return false;
                }
            }
            // 所有规则都通过
            return true;
        }
        /**
         * 检查 IP 地址白名单
         */
        async checkIpAddressWhitelist(userId, ipAddress) {
            try {
                // 从数据库获取用户的 IP 白名单
                const user = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: { email: true }, // 暂时没有 IP 白名单字段，后续可以添加
                });
                // 如果用户配置了 IP 白名单，进行验证
                // 目前默认允许所有 IP
                return true;
            }
            catch (error) {
                this.logger.error(`检查 IP 白名单失败: ${error.message}`);
                // 出错时默认拒绝
                return false;
            }
        }
        /**
         * 检查设备限制
         */
        async checkDeviceRestriction(userId, userAgent) {
            try {
                // 从数据库获取用户的设备限制配置
                const user = await this.prisma.user.findUnique({
                    where: { id: userId },
                    select: { email: true }, // 暂时没有设备限制字段，后续可以添加
                });
                // 如果用户配置了设备限制，进行验证
                // 目前默认允许所有设备
                return true;
            }
            catch (error) {
                this.logger.error(`检查设备限制失败: ${error.message}`);
                // 出错时默认拒绝
                return false;
            }
        }
        /**
         * 清除用户权限缓存
         */
        async clearUserCache(userId) {
            if (this.permissionStore) {
                await this.permissionStore.clearUserCache(userId);
                return;
            }
            await this.cacheService.clearUserCache(userId);
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { role: { select: { name: true } } },
            });
            if (user?.role) {
                await this.roleInheritanceService.clearRoleCache(user.role.name);
            }
        }
        /**
         * 批量检查系统权限
         *
         * @param userId 用户ID
         * @param permissions 需要检查的权限列表
         * @returns 权限检查结果映射（权限 -> 是否有权限）
         */
        async checkSystemPermissionsBatch(userId, permissions) {
            const results = new Map();
            if (this.permissionStore) {
                const userPermissions = await this.permissionStore.getUserSystemPermissions(userId);
                for (const permission of permissions) {
                    results.set(permission, userPermissions.includes(permission));
                }
                return results;
            }
            const uncachedPermissions = [];
            // 先从缓存中获取
            for (const permission of permissions) {
                const cacheKey = `system_perm:${userId}:${permission}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    results.set(permission, cached);
                }
                else {
                    uncachedPermissions.push(permission);
                }
            }
            // 批量查询未缓存的权限
            if (uncachedPermissions.length > 0) {
                try {
                    const user = await this.prisma.user.findUnique({
                        where: { id: userId },
                        select: {
                            role: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    });
                    if (!user?.role) {
                        // 用户不存在或没有角色，所有权限返回 false
                        for (const permission of uncachedPermissions) {
                            results.set(permission, false);
                        }
                        return results;
                    }
                    // 获取用户的所有权限（包括继承）
                    const userPermissions = await this.roleInheritanceService.getRolePermissions(user.role.name);
                    for (const permission of uncachedPermissions) {
                        const hasPermission = userPermissions.includes(permission);
                        results.set(permission, hasPermission);
                        // 缓存结果
                        const cacheKey = `system_perm:${userId}:${permission}`;
                        this.cacheService.set(cacheKey, hasPermission, CACHE_TTL.SYSTEM_PERMISSION); // 5 分钟
                    }
                }
                catch (error) {
                    this.logger.error(`批量检查系统权限失败: ${error.message}`, error.stack);
                    // 出错时所有未缓存的权限返回 false
                    for (const permission of uncachedPermissions) {
                        results.set(permission, false);
                    }
                }
            }
            return results;
        }
    };
    __setFunctionName(_classThis, "PermissionService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PermissionService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PermissionService = _classThis;
})();
export { PermissionService };
//# sourceMappingURL=permission.service.js.map