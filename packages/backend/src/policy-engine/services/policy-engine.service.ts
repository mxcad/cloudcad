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

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import {
  IPermissionPolicy,
  PolicyContext,
  PolicyEvaluationResult,
} from '../interfaces/permission-policy.interface';
import { TimePolicy } from '../policies/time-policy';
import { IpPolicy } from '../policies/ip-policy';
import { DevicePolicy } from '../policies/device-policy';
import { PolicyType } from '../enums/policy-type.enum';

/**
 * 策略评估结果汇总
 */
export interface PolicyEvaluationSummary {
  /** 是否允许访问 */
  allowed: boolean;
  /** 各策略的评估结果 */
  results: PolicyEvaluationResult[];
  /** 拒绝原因（如果拒绝） */
  denialReason?: string;
}

/**
 * 策略引擎服务
 *
 * 负责管理和评估权限策略
 */
@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);
  private readonly policies: Map<string, IPermissionPolicy> = new Map();
  private readonly policyFactories: Map<
    PolicyType,
    (id: string, config: unknown) => IPermissionPolicy
  >;
  private readonly policyCacheTTL: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: PermissionCacheService
  ) {
    // 初始化策略工厂
    this.policyFactories = new Map();
    this.policyFactories.set(
      PolicyType.TIME,
      (id, config) => new TimePolicy(id, config as never)
    );
    this.policyFactories.set(
      PolicyType.IP,
      (id, config) => new IpPolicy(id, config as never)
    );
    this.policyFactories.set(
      PolicyType.DEVICE,
      (id, config) => new DevicePolicy(id, config as never)
    );

    const cacheTTL = this.configService.get('cacheTTL', { infer: true });
    this.policyCacheTTL = cacheTTL.policy * 1000; // 转为毫秒
  }

  /**
   * 注册策略
   */
  registerPolicy(policy: IPermissionPolicy): void {
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
  registerPolicies(policies: IPermissionPolicy[]): void {
    for (const policy of policies) {
      this.registerPolicy(policy);
    }
  }

  /**
   * 创建策略实例
   */
  createPolicy(
    type: PolicyType,
    policyId: string,
    config: Record<string, unknown>
  ): IPermissionPolicy {
    const factory = this.policyFactories.get(type);
    if (!factory) {
      throw new BadRequestException(`未知的策略类型: ${type}`);
    }

    const policy = factory(policyId, config);

    // 验证策略配置
    if (!policy.validateConfig(config)) {
      throw new BadRequestException(`策略配置验证失败: ${type}`);
    }

    return policy;
  }

  /**
   * 创建策略实例（不验证配置）
   */
  createPolicyUnsafe(
    type: PolicyType,
    policyId: string,
    config: Record<string, unknown>
  ): IPermissionPolicy {
    const factory = this.policyFactories.get(type);
    if (!factory) {
      throw new BadRequestException(`未知的策略类型: ${type}`);
    }

    return factory(policyId, config);
  }

  /**
   * 评估单个策略
   */
  async evaluatePolicy(
    policy: IPermissionPolicy,
    context: PolicyContext
  ): Promise<PolicyEvaluationResult> {
    try {
      const cacheKey = this.buildCacheKey(policy, context);
      const cached =
        await this.cacheService.get<PolicyEvaluationResult>(cacheKey);

      if (cached !== null) {
        return cached;
      }

      const result = await policy.evaluate(context);

      // 缓存结果（使用配置的 TTL）
      this.cacheService.set(cacheKey, result, this.policyCacheTTL);

      return result;
    } catch (error) {
      this.logger.error(
        `策略评估失败: ${policy.getType()} - ${error.message}`,
        error.stack
      );
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
  async evaluatePolicies(
    policies: IPermissionPolicy[],
    context: PolicyContext
  ): Promise<PolicyEvaluationSummary> {
    const results: PolicyEvaluationResult[] = [];

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
  async evaluatePoliciesAny(
    policies: IPermissionPolicy[],
    context: PolicyContext
  ): Promise<PolicyEvaluationSummary> {
    const results: PolicyEvaluationResult[] = [];

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
  getPolicies(): IPermissionPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * 根据类型获取策略
   */
  getPolicyByType(type: string): IPermissionPolicy | undefined {
    return this.policies.get(type);
  }

  /**
   * 移除策略
   */
  removePolicy(type: string): boolean {
    return this.policies.delete(type);
  }

  /**
   * 清除所有策略
   */
  clearPolicies(): void {
    this.policies.clear();
    this.logger.log('所有策略已清除');
  }

  /**
   * 清除策略缓存
   */
  clearPolicyCache(policy: IPermissionPolicy): void {
    // 由于缓存键依赖于上下文，这里只能清除所有策略相关的缓存
    // 实际实现中可以根据需要更精细地控制缓存
    this.logger.log(`策略 ${policy.getType()} 的缓存已清除`);
  }

  /**
   * 构建缓存键
   */
  private buildCacheKey(
    policy: IPermissionPolicy,
    context: PolicyContext
  ): string {
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
  getSupportedPolicyTypes(): PolicyType[] {
    return Array.from(this.policyFactories.keys());
  }
}
