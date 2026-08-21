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

import { AuditAction, ResourceType } from '../enums/audit.enum';
import { getAuditLoggerInstance } from '../../audit/audit-logger.service';

/**
 * @Audit 方法装饰器配置
 */
export interface AuditDecoratorOptions {
  /** 自定义 resourceId 提取器（默认 result?.user?.id） */
  resourceId?: (result: unknown, args: unknown[]) => string | undefined;
  /** 自定义 userId 提取器（默认 result?.user?.id ?? 'unknown'） */
  userId?: (result: unknown, args: unknown[]) => string;
  /** 自定义 success 提取器（默认 true） */
  success?: (result: unknown, args: unknown[]) => boolean;
  /** 自定义 details 提取器（默认 {}） */
  details?: (result: unknown, args: unknown[]) => Record<string, unknown>;
  /** 审计条件，返回 false 时跳过审计（默认始终审计） */
  when?: (result: unknown, args: unknown[]) => boolean;
}

/**
 * 审计横切方法装饰器
 *
 * 包装原方法：成功执行后按约定提取 resourceId/userId/details 调用 AuditLogger，
 * 异常时不审计（错误直接向上传播）；AuditLogger 未注册或原方法返回 undefined 时均不抛错。
 * 使用前需由 AuditLogModule 注册 AuditLogger 实例（registerAuditLoggerInstance）。
 */
export function Audit(
  action: AuditAction,
  resourceType: ResourceType,
  options: AuditDecoratorOptions = {},
) {
  return <T extends (...args: any[]) => Promise<any>>(
    _target: object,
    _propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> => {
    const original = descriptor.value;
    if (!original) {
      return descriptor;
    }

    descriptor.value = (async function (
      this: unknown,
      ...args: any[]
    ): Promise<unknown> {
      const result = await original.apply(this, args);

      const logger = getAuditLoggerInstance();
      if (!logger) {
        return result;
      }
      if (options.when && !options.when(result, args)) {
        return result;
      }

      const resultUser = (result ?? {}) as { user?: { id?: string } };
      const resourceId = options.resourceId
        ? options.resourceId(result, args)
        : resultUser.user?.id;
      const userId = options.userId
        ? options.userId(result, args)
        : (resultUser.user?.id ?? 'unknown');
      const success = options.success ? options.success(result, args) : true;
      const details = options.details ? options.details(result, args) : {};

      await logger.audit({
        action,
        resourceType,
        resourceId,
        userId,
        success,
        details,
      });

      return result;
    }) as T;

    return descriptor;
  };
}
