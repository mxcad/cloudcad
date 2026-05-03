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

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AppError {
  message: string;
  code?: string;
  severity?: ErrorSeverity;
  details?: unknown;
}

/**
 * 从错误对象中提取错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      return String((error as { message: string }).message);
    }
    try {
      return JSON.stringify(error);
    } catch {
      return '未知错误';
    }
  }

  return '未知错误';
}

/**
 * 处理错误并记录日志
 */
export function handleError(
  error: unknown,
  context?: string,
  severity: ErrorSeverity = 'medium'
): AppError {
  const message = getErrorMessage(error);
  console.error(`[CloudCAD] ${context ?? 'Error'}:`, message, error);

  return {
    message,
    severity,
    details: error,
  };
}

/**
 * 创建错误对象
 */
export function createError(
  message: string,
  code?: string,
  severity: ErrorSeverity = 'medium'
): AppError {
  return { message, code, severity };
}

/**
 * 检查是否为网络错误
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('Network Error') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    );
  }
  return false;
}

/**
 * 检查是否为请求取消错误
 */
export function isAbortError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    if ('isAborted' in error && (error as { isAborted?: boolean }).isAborted) {
      return true;
    }
    const axiosError = error as { code?: string };
    if (
      axiosError.code === 'ERR_CANCELED' ||
      axiosError.code === 'ERR_FR_TXN_CANCELLED'
    ) {
      return true;
    }
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    if (error.name === 'CanceledError') return true;
    if (error.message === 'canceled') return true;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return false;
}

/**
 * 检查是否为认证错误
 */
export function isAuthError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { status?: number } };
    return err.response?.status === 401 || err.response?.status === 403;
  }
  return false;
}

/**
 * 检查是否为服务器错误
 */
export function isServerError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { status?: number } };
    const status = err.response?.status;
    return status !== undefined && status >= 500 && status < 600;
  }
  return false;
}
