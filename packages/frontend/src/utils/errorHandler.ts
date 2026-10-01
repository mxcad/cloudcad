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
export const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    // apiClient 拦截器已将后端错误消息设置到 error.message
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    // 尝试从其他对象中提取消息
    if ('message' in error) {
      return String((error as { message: string }).message);
    }

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
 * 检查是否为网络错误
 * @param error - 错误对象
 * @returns boolean - 是否为网络错误
 */
export const isNetworkError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return (
      error.message.includes('Network Error') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    );
  }

  return false;
};

/**
 * 检查是否为请求取消错误
 * 用于检测 AbortController、Axios CancelToken、CanceledError 等取消类型
 * @param error - 错误对象
 * @returns boolean - 是否为请求取消错误
 */
export const isAbortError = (error: unknown): boolean => _isAbortError(error);

/**
 * 检查是否为认证错误
 * @param error - 错误对象
 * @returns boolean - 是否为认证错误
 */
export const isAuthError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { status?: number } };
    return err.response?.status === 401 || err.response?.status === 403;
  }

  return false;
};

import { t } from '@/languages';

/**
 * 检查是否为服务器错误
 * @param error - 错误对象
 * @returns boolean - 是否为服务器错误
 */
export const isServerError = (error: unknown): boolean => _isServerError(error);
