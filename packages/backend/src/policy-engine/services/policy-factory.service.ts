///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, BadRequestException } from '@nestjs/common';
import { IPermissionPolicy } from '../interfaces/permission-policy.interface';
import { TimePolicy } from '../policies/time-policy';
import { IpPolicy } from '../policies/ip-policy';
import { DevicePolicy } from '../policies/device-policy';
import { PolicyType } from '../enums/policy-type.enum';

/**
 * 策略工厂服务
 *
 * 负责策略实例的创建和配置验证。
 * 提取为独立服务以解除 PolicyConfigService 对 PolicyEngineService 的依赖。
 */
@Injectable()
export class PolicyFactoryService {
  private readonly policyFactories: Map<
    PolicyType,
    (id: string, config: unknown) => IPermissionPolicy
  >;

  constructor() {
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
  }

  /**
   * 创建策略实例并验证配置
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
   * 获取支持的策略类型
   */
  getSupportedPolicyTypes(): PolicyType[] {
    return Array.from(this.policyFactories.keys());
  }
}
