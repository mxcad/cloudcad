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

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { Prisma } from '@cloudcad/db';
import { Request, Response } from 'express';

import { I18nContext } from 'nestjs-i18n';

/**
 * Prisma 数据库表名（@@map 值），用于从 P2002 字符串约束名（如 `users_email_key`）
 * 反解出唯一约束涉及的字段列名。取最长前缀匹配，需按长度降序。
 *
 * 来源：packages/db/prisma/schema.prisma 各 model 的 @@map。新增带唯一约束的表时
 * 若 P2002 文案丢失字段名，先确认此表已登记。
 */
const KNOWN_TABLE_NAMES = [
  'alert_records',
  'assets',
  'audit_logs',
  'batch_download_jobs',
  'channel_verifications',
  'config_key_registry',
  'duration_pricings',
  'feedback_rewards',
  'feedbacks',
  'file_shares',
  'file_system_nodes',
  'fonts',
  'ip_blacklist_entries',
  'ip_whitelist_entries',
  'notices',
  'payment_orders',
  'project_members',
  'project_role_permissions',
  'project_roles',
  'refresh_tokens',
  'refund_applications',
  'role_permissions',
  'roles',
  'runtime_config_logs',
  'runtime_configs',
  'security_access_attempts',
  'task_runs',
  'upload_sessions',
  'user_memberships',
  'users',
  'vip_tiers',
].sort((a, b) => b.length - a.length);

/**
 * 从 P2002 的 meta 提取唯一约束涉及的字段名（用于 i18n 文案 `字段 {fields} 已存在`）。
 *
 * Prisma 版本差异（driver adapter 改变 meta 形状）：
 * - 旧 Prisma：`meta.target` 为字段名数组，如 `['email']` → `email`。
 * - Prisma 7 无 driver adapter：`meta.target` 为约束名字符串，如 `users_email_key`
 *   → 去掉 `_key` 后缀后剥掉表名前缀，剩余为字段列名（复合约束以 `, ` 连接）。
 * - Prisma 7 + driver adapter：`meta.target` 缺失，字段在
 *   `meta.driverAdapterError.cause.constraint.fields`（如 `['name']`），约束名在
 *   `meta.driverAdapterError.cause.originalMessage`（`...unique constraint "roles_name_key"`）。
 *
 * 无法反解时回退为原始约束名（避免字段名丢失成空）。
 */
export function extractUniqueConstraintFields(meta: unknown): string {
  // 形状 1：Prisma 7 + driver adapter —— 字段在 cause.constraint.fields
  const driverAdapterError = (meta as Record<string, unknown>)
    ?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverAdapterError?.cause as Record<string, unknown> | undefined;
  if (cause && typeof cause === 'object') {
    const constraint = cause.constraint as Record<string, unknown> | undefined;
    if (Array.isArray(constraint?.fields)) {
      const fields = constraint.fields
        .filter((f): f is string => typeof f === 'string' && f.length > 0)
        .join(', ');
      if (fields) return fields;
    }
    // 约束名从 originalMessage 的 `unique constraint "roles_name_key"` 反解
    if (typeof cause.originalMessage === 'string') {
      const m = cause.originalMessage.match(/"([^"]+)"|constraint "([^"]+)"/);
      const constraintName = m?.[1] || m?.[2];
      if (constraintName) {
        const fromName = fieldsFromConstraintName(constraintName);
        if (fromName) return fromName;
      }
    }
  }

  // 形状 2：旧 Prisma —— target 为字段名数组
  if (Array.isArray(meta)) {
    return meta
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .join(', ');
  }

  // 形状 3：Prisma 7 无 driver adapter —— target 为约束名字符串
  if (typeof meta === 'string' && meta.length > 0) {
    return fieldsFromConstraintName(meta);
  }

  return '';
}

/**
 * 从约束名（如 `users_email_key` / `file_system_nodes_name_parentId_key`）反解字段列名。
 * 去掉 `_key`/`_idx`/`_unique` 后缀后剥掉表名前缀，剩余为字段列名（复合以 `, ` 连接）。
 * 未命中已知表时回退为去掉后缀的原始约束名。
 */
function fieldsFromConstraintName(constraintName: string): string {
  const stripped = constraintName.replace(/_(?:key|idx|unique)$/, '');
  if (!stripped) return '';
  const table = KNOWN_TABLE_NAMES.find((t) => stripped.startsWith(`${t}_`));
  if (table) {
    const remainder = stripped.slice(table.length + 1);
    const fields = remainder.split('_').filter(Boolean).join(', ');
    return fields || stripped;
  }
  return stripped;
}

/**
 * Prisma 数据库异常过滤器
 *
 * 捕获 PrismaClientKnownRequestError 并转换为有意义的 HTTP 响应，
 * 替代默认的 500 错误，向客户端提供可操作的错误信息。
 *
 * 覆盖的错误码：
 * - P2002: 唯一约束冲突 → 409 Conflict
 * - P2003: 外键约束失败 → 400 Bad Request
 * - P2004: 数据库约束失败 → 400 Bad Request
 * - P2005/P2006: 字段值无效 → 400 Bad Request
 * - P2011: 空约束冲突 → 400 Bad Request
 * - P2014: 必需关联冲突 → 400 Bad Request
 * - P2016: 查询解析错误 → 400 Bad Request
 * - P2025: 记录不存在 → 404 Not Found
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '数据库操作错误';
    let code = 'DATABASE_ERROR';

    const i18n = I18nContext.current(host);

    switch (exception.code) {
      case 'P2002': {
        status = HttpStatus.CONFLICT;
        code = 'UNIQUE_CONSTRAINT';
        const meta = exception.meta as Record<string, unknown>;
        // Prisma 7 的 meta 形状有版本差异（target 字符串/数组，或 driverAdapterError.cause.constraint.fields）。
        // 统一提取字段名，避免 i18n 文案 `字段 {fields} 已存在` 的 {fields} 为空。
        const fields = extractUniqueConstraintFields(meta);
        if (fields) {
          message =
            i18n?.t('error.database.unique_constraint', { args: { fields } }) ??
            `字段 ${fields} 已存在`;
        } else {
          message =
            i18n?.t('error.database.unique_constraint', { args: { fields: '' } }) ??
            '数据已存在，请勿重复提交';
        }
        break;
      }
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = i18n?.t('error.database.foreign_key_constraint') ?? '数据关联错误，请检查关联数据是否存在';
        code = 'FOREIGN_KEY_CONSTRAINT';
        break;
      case 'P2004':
        status = HttpStatus.BAD_REQUEST;
        message = i18n?.t('error.database.constraint_failed') ?? '数据库约束校验失败';
        code = 'CONSTRAINT_FAILED';
        break;
      case 'P2005':
      case 'P2006':
        status = HttpStatus.BAD_REQUEST;
        message = '字段值不符合数据库要求';
        code = 'INVALID_FIELD_VALUE';
        break;
      case 'P2011':
        status = HttpStatus.BAD_REQUEST;
        message = '必填字段不能为空';
        code = 'NULL_CONSTRAINT';
        break;
      case 'P2014':
        status = HttpStatus.BAD_REQUEST;
        message = '数据关联错误：缺少必需的关联数据';
        code = 'REQUIRED_RELATION';
        break;
      case 'P2016':
        status = HttpStatus.BAD_REQUEST;
        message = '查询参数错误';
        code = 'QUERY_ERROR';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = (I18nContext.current()?.t('error.resource.not_found') ?? '请求的资源不存在');
        code = 'NOT_FOUND';
        break;
      default:
        this.logger.error(
          `Prisma Error [${exception.code}]: ${exception.message}`,
          exception.stack
        );
        Sentry.captureException(exception);
        message = `数据库错误 (${exception.code})`;
        break;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${message}`,
        exception.stack
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${message}`
      );
    }

    response.status(status).json({
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
