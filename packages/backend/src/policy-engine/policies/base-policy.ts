///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Logger } from '@nestjs/common';
import {
  IPermissionPolicy,
  PolicyConfigSchema,
  PolicyConfigProperty,
  PolicyContext,
  PolicyEvaluationResult,
} from '../interfaces/permission-policy.interface';

/**
 * 权限策略基类
 *
 * 提供策略的通用实现，子类只需实现特定的评估逻辑
 */
export abstract class BasePolicy implements IPermissionPolicy {
  protected readonly logger: Logger;
  protected readonly policyId: string;

  constructor(policyId: string) {
    this.policyId = policyId;
    this.logger = new Logger(`${this.constructor.name}[${policyId}]`);
  }

  /**
   * 获取策略 ID
   */
  getPolicyId(): string {
    return this.policyId;
  }

  /**
   * 获取策略类型（子类必须实现）
   */
  abstract getType(): string;

  /**
   * 获取策略名称（子类必须实现）
   */
  abstract getName(): string;

  /**
   * 获取策略描述（子类必须实现）
   */
  abstract getDescription(): string;

  /**
   * 评估策略（子类必须实现）
   */
  abstract evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>;

  /**
   * 验证策略配置（子类可以重写）
   */
  validateConfig(config: Record<string, unknown>): boolean {
    const schema = this.getConfigSchema();
    const required = schema.required || [];

    // 检查必填字段
    for (const field of required) {
      if (config[field] === undefined || config[field] === null) {
        this.logger.warn(`策略配置验证失败: 缺少必填字段 ${field}`);
        return false;
      }
    }

    // 检查字段类型
    for (const [key, value] of Object.entries(config)) {
      const property = schema.properties[key];
      if (!property) {
        this.logger.warn(`策略配置验证失败: 未知字段 ${key}`);
        return false;
      }

      if (!this.validatePropertyType(value, property)) {
        this.logger.warn(
          `策略配置验证失败: 字段 ${key} 类型不正确，期望 ${property.type}`
        );
        return false;
      }

      // 检查枚举值
      if (property.enum && typeof value === 'string') {
        if (!property.enum.includes(value)) {
          this.logger.warn(
            `策略配置验证失败: 字段 ${key} 的值 ${value} 不在允许的枚举值中`
          );
          return false;
        }
      }

      // 检查数值范围
      if (property.type === 'number') {
        if (
          property.minimum !== undefined &&
          typeof value === 'number' &&
          value < property.minimum
        ) {
          this.logger.warn(
            `策略配置验证失败: 字段 ${key} 的值 ${value} 小于最小值 ${property.minimum}`
          );
          return false;
        }
        if (
          property.maximum !== undefined &&
          typeof value === 'number' &&
          value > property.maximum
        ) {
          this.logger.warn(
            `策略配置验证失败: 字段 ${key} 的值 ${value} 大于最大值 ${property.maximum}`
          );
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 验证属性类型
   */
  private validatePropertyType(
    value: unknown,
    property: PolicyConfigProperty
  ): boolean {
    switch (property.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      default:
        return false;
    }
  }

  /**
   * 获取策略配置 schema（子类必须实现）
   */
  abstract getConfigSchema(): PolicyConfigSchema;

  /**
   * 创建允许的评估结果
   */
  protected createAllowedResult(): PolicyEvaluationResult {
    return {
      allowed: true,
      policyId: this.policyId,
      policyType: this.getType(),
      evaluatedAt: new Date(),
    };
  }

  /**
   * 创建拒绝的评估结果
   */
  protected createDeniedResult(reason: string): PolicyEvaluationResult {
    return {
      allowed: false,
      reason,
      policyId: this.policyId,
      policyType: this.getType(),
      evaluatedAt: new Date(),
    };
  }
}
