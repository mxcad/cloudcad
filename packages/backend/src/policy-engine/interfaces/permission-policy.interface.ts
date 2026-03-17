///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Permission as PrismaPermission } from '@prisma/client';
import { SystemPermission } from '../../common/enums/permissions.enum';

/**
 * 权限策略上下文
 *
 * 包含策略评估所需的所有上下文信息
 */
export interface PolicyContext {
  /** 用户 ID */
  userId: string;
  /** 请求的权限 */
  permission: PrismaPermission | SystemPermission;
  /** 当前时间 */
  time?: Date;
  /** IP 地址 */
  ipAddress?: string;
  /** 用户代理（User-Agent） */
  userAgent?: string;
  /** 额外的上下文数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 策略评估结果
 */
export interface PolicyEvaluationResult {
  /** 是否允许访问 */
  allowed: boolean;
  /** 拒绝原因（如果拒绝） */
  reason?: string;
  /** 策略 ID */
  policyId: string;
  /** 策略类型 */
  policyType: string;
  /** 评估时间戳 */
  evaluatedAt: Date;
}

/**
 * 权限策略接口
 *
 * 所有权限策略必须实现此接口
 */
export interface IPermissionPolicy {
  /**
   * 获取策略类型
   */
  getType(): string;

  /**
   * 获取策略名称
   */
  getName(): string;

  /**
   * 获取策略描述
   */
  getDescription(): string;

  /**
   * 评估策略
   *
   * @param context 策略上下文
   * @returns 评估结果
   */
  evaluate(context: PolicyContext): Promise<PolicyEvaluationResult>;

  /**
   * 验证策略配置
   *
   * @param config 策略配置
   * @returns 验证结果
   */
  validateConfig(config: Record<string, unknown>): boolean;

  /**
   * 获取策略配置 schema（用于前端展示和验证）
   */
  getConfigSchema(): PolicyConfigSchema;
}

/**
 * 策略配置 Schema
 *
 * 定义策略的配置结构
 */
export interface PolicyConfigSchema {
  /** 配置属性 */
  properties: Record<string, PolicyConfigProperty>;
  /** 必填属性 */
  required: string[];
}

/**
 * 策略配置属性
 */
export interface PolicyConfigProperty {
  /** 属性类型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** 属性描述 */
  description: string;
  /** 默认值 */
  default?: unknown;
  /** 枚举值（如果有限制） */
  enum?: string[];
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 属性项类型（如果是 array 类型） */
  items?: PolicyConfigProperty;
}
