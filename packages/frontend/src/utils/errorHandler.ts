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

/**
 * 统一错误处理工具
 * 提供一致的错误处理和用户反馈
 */

import {
  extractApiError,
  isAbortError as _isAbortError,
  isServerError as _isServerError,
} from '@cloudcad/platform';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AppError {
  message: string;
  code?: string;
  severity?: ErrorSeverity;
  details?: unknown;
}

/**
 * 从错误对象中提取错误消息
 * @param error - 错误对象
 * @returns string - 错误消息
 */
/**
 * 从错误里取可读文本，并把后端的字段级明细（`errors[]`）拼进同一句。
 *
 * openapi-ts 在 `!response.ok` 时抛的是**响应体普通对象**（不是 Error），此前这里
 * 只取 `message`：用户只看到「请求参数验证失败」，拿不到 `errors[]` 里「哪个字段、
 * 什么原因」（#469）。提取逻辑在 @cloudcad/platform，分隔符与兜底文案留在端包。
 *
 * 注意：后端若透出的是 i18n key（GlobalExceptionFilter 在 i18n 上下文缺失时会原样
 * 返回 `error.validation.failed` 这类 key），前端无法翻译——它的命名空间只存在于
 * 后端 error.yml，前端 idMap 里没有；那属于后端该修的问题，这里不假装能兜。
 */
export const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  const detail = extractApiError(error);
  if (detail.message) {
    return detail.fields.length
      ? `${detail.message}（${detail.fields.join('；')}）`
      : detail.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    return extractRawErrorMessage(error);
  }

  return t('未知错误');
};

/**
 * 从错误里取「原始」消息文本（不含后端字段级明细拼接）。
 *
 * 提取链此前在三个管理端页面逐字节复制，这里收成唯一出口：
 * 字符串 → 响应体 message → Error.message → JSON 序列化，逐层回落。
 */
function extractRawErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  const errAny = error as Record<string, unknown> | null;
  if (typeof errAny?.message === 'string' && errAny.message) {
    return errAny.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    // 尝试转换为字符串（空对象返回有意义的默认消息）
    try {
      const str = JSON.stringify(error);
      if (str === '{}') {
        return t('请求失败，请检查网络或联系管理员');
      }
      return str;
    } catch {
      return t('未知错误');
    }
  }

  return t('未知错误');
}

/**
 * 提取后端业务 code 与可读消息，供调用方按 code 分流（如 MFA_REQUIRED）。
 * 原先 AdminLogin / AdminMfaSetup / AdminPasswordChange 各写一份逐字节副本，
 * 统一收口到这里，提取链与 getErrorMessage 共用 extractRawErrorMessage。
 */
export const getErrorInfo = (
  error: unknown
): { code?: string; message: string } => {
  const errAny = error as Record<string, unknown> | null;
  const code =
    typeof errAny?.code === 'string' ? (errAny.code as string) : undefined;

  return { code, message: extractRawErrorMessage(error) };
};

/**
 * 处理错误并记录日志
 * @param error - 错误对象
 * @param context - 错误上下文
 * @param severity - 错误严重程度
 * @returns AppError - 标准化的错误对象
 */
export const handleError = (
  error: unknown,
  context?: string,
  severity: ErrorSeverity = 'medium'
): AppError => {
  const message = getErrorMessage(error);

  console.error(message, context, error);

  return {
    message,
    severity,
    details: error,
  };
};

/**
 * 创建错误对象
 * @param message - 错误消息
 * @param code - 错误代码
 * @param severity - 错误严重程度
 * @returns AppError - 错误对象
 */
export const createError = (
  message: string,
  code?: string,
  severity: ErrorSeverity = 'medium'
): AppError => {
  return {
    message,
    code,
    severity,
  };
};

/**
 * 检查是否为请求取消错误
 * 用于检测 AbortController、Axios CancelToken、CanceledError 等取消类型
 * @param error - 错误对象
 * @returns boolean - 是否为请求取消错误
 */
export const isAbortError = (error: unknown): boolean => _isAbortError(error);

import { t } from '@/languages';

/**
 * 检查是否为服务器错误
 * @param error - 错误对象
 * @returns boolean - 是否为服务器错误
 */
export const isServerError = (error: unknown): boolean => _isServerError(error);
