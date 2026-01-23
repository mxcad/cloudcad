/**
 * 统一错误处理工具
 * 提供一致的错误处理和用户反馈
 */

import { logger } from './logger';

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
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    // 尝试从 Axios 错误中提取消息
    if ('response' in error) {
      const err = error as { response?: { data?: { message?: string } } };
      if (err.response?.data?.message) {
        return err.response.data.message;
      }
    }

    // 尝试从其他对象中提取消息
    if ('message' in error) {
      return String((error as { message: string }).message);
    }

    // 尝试转换为字符串
    try {
      return JSON.stringify(error);
    } catch {
      return '未知错误';
    }
  }

  return '未知错误';
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

  logger.error(message, context, error);

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

/**
 * 检查是否为服务器错误
 * @param error - 错误对象
 * @returns boolean - 是否为服务器错误
 */
export const isServerError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { status?: number } };
    const status = err.response?.status;
    return status !== undefined && status >= 500 && status < 600;
  }

  return false;
};
