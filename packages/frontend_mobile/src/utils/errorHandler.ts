import { t } from '@/languages';
import { errorKind } from './apiError';
import {
  isAbortError as platformIsAbortError,
  isPermissionError as platformIsPermissionError,
  isServerError as platformIsServerError,
} from '@cloudcad/platform';

export interface ClassifiedError {
  type: 'auth' | 'permission' | 'not-found' | 'server' | 'network' | 'abort' | 'converting' | 'open-failed' | 'unknown';
  message: string;
  status?: number;
}

// 判定口径已收敛到 @cloudcad/platform（与 PC 共用，并集更宽），本文件只做透传。
export function isPermissionError(error: unknown): boolean {
  return platformIsPermissionError(error);
}

export function isServerError(error: unknown): boolean {
  return platformIsServerError(error);
}

export function isAbortError(error: unknown): boolean {
  return platformIsAbortError(error);
}

/**
 * UI 层错误分类：类别判定委托 apiError.errorKind（单一出口），本文件只负责
 * 分类名 → 本地化文案的映射。typed error 的 kind（deleted/converting/open-failed）
 * 由 useFileLoader 等 catch 点直接消费，不走本函数。
 */
export function classifyApiError(error: unknown): ClassifiedError {
  if (isAbortError(error)) {
    return { type: 'abort', message: t('请求已取消') };
  }
  const kind = errorKind(error);
  if (kind === 'network') {
    return { type: 'network', message: t('网络连接失败，请检查网络') };
  }
  if (kind === 'unauthorized') {
    return { type: 'auth', message: t('请登录后访问此文件') };
  }
  if (kind === 'forbidden' || kind === 'deactivated') {
    return { type: 'permission', message: t('没有执行此操作的权限') };
  }
  if (kind === 'not-found' || kind === 'deleted') {
    return { type: 'not-found', message: t('文件不存在或已被删除') };
  }
  if (isServerError(error)) {
    return { type: 'server', message: t('服务器错误，请稍后重试'), status: (error as Record<string, unknown>).status as number };
  }

  const msg = error instanceof Error ? error.message : t('未知错误');
  return { type: 'unknown', message: msg };
}
