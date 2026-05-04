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
import { Injectable, Logger, NotFoundException, InternalServerErrorException, } from '@nestjs/common';
/**
 * 策略配置服务
 *
 * 负责管理权限策略的配置（创建、更新、删除、查询）
 */
let PolicyConfigService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PolicyConfigService = _classThis = class {
        constructor(configService, prisma, cacheService, policyFactory) {
            this.configService = configService;
            this.prisma = prisma;
            this.cacheService = cacheService;
            this.policyFactory = policyFactory;
            this.logger = new Logger(PolicyConfigService.name);
            this.cachePrefix = 'policy_config:';
            const cacheTTLConfig = this.configService.get('cacheTTL', { infer: true });
            this.cacheTTL = cacheTTLConfig.policy * 1000; // 转为毫秒
        }
        /**
         * 创建策略配置
         */
        async createPolicyConfig(config, createdBy) {
            try {
                // 验证策略配置
                const policy = this.policyFactory.createPolicyUnsafe(config.type, `temp_${Date.now()}`, config.config);
                // 创建策略记录
                const policyRecord = await this.prisma.permissionPolicy.create({
                    data: {
                        type: config.type,
                        name: config.name,
                        description: config.description,
                        config: config.config,
                        enabled: config.enabled,
                        priority: config.priority || 0,
                    },
                });
                // 创建策略-权限关联
                for (const permission of config.permissions) {
                    await this.prisma.policyPermission.create({
                        data: {
                            policyId: policyRecord.id,
                            permission,
                        },
                    });
                }
                // 清除缓存
                this.clearCache();
                this.logger.log(`策略配置创建成功: ${config.name} (${config.type}) by ${createdBy}`);
                return this.formatPolicyConfig(policyRecord, config.permissions);
            }
            catch (error) {
                this.logger.error(`创建策略配置失败: ${error.message}`, error.stack);
                throw new InternalServerErrorException(`创建策略配置失败: ${error.message}`);
            }
        }
        /**
         * 更新策略配置
         */
        async updatePolicyConfig(policyId, updates, updatedBy) {
            try {
                // 查找现有策略
                const existing = await this.prisma.permissionPolicy.findUnique({
                    where: { id: policyId },
                    include: {
                        permissions: true,
                    },
                });
                if (!existing) {
                    throw new NotFoundException(`策略配置不存在: ${policyId}`);
                }
                // 如果更新了 config，验证新配置
                if (updates.config && updates.type) {
                    const policy = this.policyFactory.createPolicyUnsafe(updates.type, `temp_${Date.now()}`, updates.config);
                }
                // 更新策略记录
                const updateData = {};
                if (updates.name !== undefined)
                    updateData.name = updates.name;
                if (updates.description !== undefined)
                    updateData.description = updates.description;
                if (updates.config !== undefined)
                    updateData.config = updates.config;
                if (updates.enabled !== undefined)
                    updateData.enabled = updates.enabled;
                if (updates.priority !== undefined)
                    updateData.priority = updates.priority;
                const updatedPolicy = await this.prisma.permissionPolicy.update({
                    where: { id: policyId },
                    data: updateData,
                });
                // 更新策略-权限关联
                if (updates.permissions !== undefined) {
                    // 删除旧的关联
                    await this.prisma.policyPermission.deleteMany({
                        where: { policyId },
                    });
                    // 创建新的关联
                    for (const permission of updates.permissions) {
                        await this.prisma.policyPermission.create({
                            data: {
                                policyId,
                                permission,
                            },
                        });
                    }
                }
                // 清除缓存
                this.clearCache();
                this.logger.log(`策略配置更新成功: ${policyId} by ${updatedBy}`);
                return this.formatPolicyConfig(updatedPolicy, updates.permissions || existing.permissions.map((p) => p.permission));
            }
            catch (error) {
                this.logger.error(`更新策略配置失败: ${error.message}`, error.stack);
                throw new InternalServerErrorException(`更新策略配置失败: ${error.message}`);
            }
        }
        /**
         * 删除策略配置
         */
        async deletePolicyConfig(policyId, deletedBy) {
            try {
                // 删除策略-权限关联
                await this.prisma.policyPermission.deleteMany({
                    where: { policyId },
                });
                // 删除策略记录
                await this.prisma.permissionPolicy.delete({
                    where: { id: policyId },
                });
                // 清除缓存
                this.clearCache();
                this.logger.log(`策略配置删除成功: ${policyId} by ${deletedBy}`);
            }
            catch (error) {
                this.logger.error(`删除策略配置失败: ${error.message}`, error.stack);
                throw new InternalServerErrorException(`删除策略配置失败: ${error.message}`);
            }
        }
        /**
         * 获取策略配置
         */
        async getPolicyConfig(policyId) {
            try {
                const cacheKey = `${this.cachePrefix}${policyId}`;
                const cached = this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const policy = await this.prisma.permissionPolicy.findUnique({
                    where: { id: policyId },
                    include: {
                        permissions: true,
                    },
                });
                if (!policy) {
                    return null;
                }
                const formatted = this.formatPolicyConfig(policy, policy.permissions.map((p) => p.permission));
                // 缓存结果
                this.cacheService.set(cacheKey, formatted, this.cacheTTL);
                return formatted;
            }
            catch (error) {
                this.logger.error(`获取策略配置失败: ${error.message}`, error.stack);
                throw new InternalServerErrorException(`获取策略配置失败: ${error.message}`);
            }
        }
        /**
         * 获取所有策略配置
         */
        async getAllPolicyConfigs() {
            try {
                const cacheKey = `${this.cachePrefix}all`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const policies = await this.prisma.permissionPolicy.findMany({
                    include: {
                        permissions: true,
                    },
                    orderBy: {
                        priority: 'desc',
                    },
                });
                const formatted = policies.map((policy) => this.formatPolicyConfig(policy, policy.permissions.map((p) => p.permission)));
                // 缓存结果
                this.cacheService.set(cacheKey, formatted, this.cacheTTL);
                return formatted;
            }
            catch (error) {
                this.logger.error(`获取所有策略配置失败: ${error.message}`, error.stack);
                throw new InternalServerErrorException(`获取所有策略配置失败: ${error.message}`);
            }
        }
        /**
         * 根据权限获取启用的策略配置
         */
        async getEnabledPoliciesForPermission(permission) {
            try {
                const cacheKey = `${this.cachePrefix}permission:${permission}`;
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const policyPermissions = await this.prisma.policyPermission.findMany({
                    where: {
                        permission,
                        policy: {
                            enabled: true,
                        },
                    },
                    include: {
                        policy: {
                            include: {
                                permissions: true,
                            },
                        },
                    },
                    orderBy: {
                        policy: {
                            priority: 'desc',
                        },
                    },
                });
                const formatted = policyPermissions.map((pp) => this.formatPolicyConfig(pp.policy, pp.policy.permissions.map((p) => p.permission)));
                // 缓存结果
                this.cacheService.set(cacheKey, formatted, this.cacheTTL);
                return formatted;
            }
            catch (error) {
                this.logger.error(`获取权限的策略配置失败: ${error.message}`, error.stack);
                throw new InternalServerErrorException(`获取权限的策略配置失败: ${error.message}`);
            }
        }
        /**
         * 启用/禁用策略配置
         */
        async togglePolicyConfig(policyId, enabled, updatedBy) {
            return this.updatePolicyConfig(policyId, { enabled }, updatedBy);
        }
        /**
         * 格式化策略配置
         */
        formatPolicyConfig(policy, permissions) {
            return {
                id: policy.id,
                type: policy.type,
                name: policy.name,
                description: policy.description ?? undefined,
                config: policy.config,
                permissions,
                enabled: policy.enabled,
                priority: policy.priority,
                createdAt: policy.createdAt,
                updatedAt: policy.updatedAt,
            };
        }
        /**
         * 清除缓存
         */
        clearCache() {
            // TODO: 实现 clearPattern 方法或使用其他方式清除缓存
            // 清除所有策略配置缓存
            // this.cacheService.clearPattern(`${this.cachePrefix}*`);
        }
    };
    __setFunctionName(_classThis, "PolicyConfigService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PolicyConfigService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PolicyConfigService = _classThis;
})();
export { PolicyConfigService };
//# sourceMappingURL=policy-config.service.js.map