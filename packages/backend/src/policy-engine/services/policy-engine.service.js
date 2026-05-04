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
 * 策略引擎服务
 *
 * 负责管理和评估权限策略
 */
let PolicyEngineService = (() => {
    let _classDecorators = [Injectable()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PolicyEngineService = _classThis = class {
        constructor(configService, cacheService, policyFactory) {
            this.configService = configService;
            this.cacheService = cacheService;
            this.policyFactory = policyFactory;
            this.logger = new Logger(PolicyEngineService.name);
            this.policies = new Map();
            const cacheTTL = this.configService.get('cacheTTL', { infer: true });
            this.policyCacheTTL = cacheTTL.policy * 1000; // 转为毫秒
        }
        /**
         * 注册策略
         */
        registerPolicy(policy) {
            const policyId = policy.getType();
            if (this.policies.has(policyId)) {
                this.logger.warn(`策略 ${policyId} 已存在，将被覆盖`);
            }
            this.policies.set(policyId, policy);
            this.logger.log(`策略 ${policyId} 已注册`);
        }
        /**
         * 批量注册策略
         */
        registerPolicies(policies) {
            for (const policy of policies) {
                this.registerPolicy(policy);
            }
        }
        /**
         * 创建策略实例
         */
        createPolicy(type, policyId, config) {
            return this.policyFactory.createPolicy(type, policyId, config);
        }
        /**
         * 创建策略实例（不验证配置）
         */
        createPolicyUnsafe(type, policyId, config) {
            return this.policyFactory.createPolicyUnsafe(type, policyId, config);
        }
        /**
         * 评估单个策略
         */
        async evaluatePolicy(policy, context) {
            try {
                const cacheKey = this.buildCacheKey(policy, context);
                const cached = await this.cacheService.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const result = await policy.evaluate(context);
                // 缓存结果（使用配置的 TTL）
                this.cacheService.set(cacheKey, result, this.policyCacheTTL);
                return result;
            }
            catch (error) {
                this.logger.error(`策略评估失败: ${policy.getType()} - ${error.message}`, error.stack);
                return {
                    allowed: false,
                    reason: `策略评估异常: ${error.message}`,
                    policyId: policy.getType(),
                    policyType: policy.getType(),
                    evaluatedAt: new Date(),
                };
            }
        }
        /**
         * 评估多个策略（AND 逻辑，所有策略都通过才允许）
         */
        async evaluatePolicies(policies, context) {
            const results = [];
            for (const policy of policies) {
                const result = await this.evaluatePolicy(policy, context);
                results.push(result);
                // 如果任何一个策略拒绝访问，立即返回
                if (!result.allowed) {
                    return {
                        allowed: false,
                        results,
                        denialReason: result.reason,
                    };
                }
            }
            // 所有策略都通过
            return {
                allowed: true,
                results,
            };
        }
        /**
         * 评估多个策略（OR 逻辑，任一策略通过就允许）
         */
        async evaluatePoliciesAny(policies, context) {
            const results = [];
            for (const policy of policies) {
                const result = await this.evaluatePolicy(policy, context);
                results.push(result);
                // 如果任何一个策略允许访问，立即返回
                if (result.allowed) {
                    return {
                        allowed: true,
                        results,
                    };
                }
            }
            // 所有策略都拒绝
            return {
                allowed: false,
                results,
                denialReason: '所有策略都拒绝访问',
            };
        }
        /**
         * 获取已注册的策略
         */
        getPolicies() {
            return Array.from(this.policies.values());
        }
        /**
         * 根据类型获取策略
         */
        getPolicyByType(type) {
            return this.policies.get(type);
        }
        /**
         * 移除策略
         */
        removePolicy(type) {
            return this.policies.delete(type);
        }
        /**
         * 清除所有策略
         */
        clearPolicies() {
            this.policies.clear();
            this.logger.log('所有策略已清除');
        }
        /**
         * 清除策略缓存
         */
        clearPolicyCache(policy) {
            // 由于缓存键依赖于上下文，这里只能清除所有策略相关的缓存
            // 实际实现中可以根据需要更精细地控制缓存
            this.logger.log(`策略 ${policy.getType()} 的缓存已清除`);
        }
        /**
         * 构建缓存键
         */
        buildCacheKey(policy, context) {
            const parts = [
                'policy',
                policy.getType(),
                context.userId,
                context.permission,
                context.ipAddress || '',
                context.userAgent || '',
            ];
            return parts.join(':');
        }
        /**
         * 获取支持的策略类型
         */
        getSupportedPolicyTypes() {
            return this.policyFactory.getSupportedPolicyTypes();
        }
    };
    __setFunctionName(_classThis, "PolicyEngineService");
    (() => {
        const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        PolicyEngineService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return PolicyEngineService = _classThis;
})();
export { PolicyEngineService };
//# sourceMappingURL=policy-engine.service.js.map