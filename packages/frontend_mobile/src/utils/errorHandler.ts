export interface ClassifiedError {
  type: 'auth' | 'permission' | 'not-found' | 'server' | 'network' | 'abort' | 'unknown';
  message: string;
  status?: number;
}

export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = String((error as Record<string, unknown>).message || '');
  return (
    msg.includes('Network Error') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('network') ||
    msg.includes('Network')
  );
}

export function isAuthError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.status === 401 || e.statusCode === 401) return true;
    if ((e.response as Record<string, unknown>)?.status === 401) return true;
  }
  return false;
}

export function isPermissionError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.status === 403 || e.statusCode === 403) return true;
    if ((e.response as Record<string, unknown>)?.status === 403) return true;
    if (e.isPermissionError === true) return true;
  }
  return false;
}

export function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.status === 404 || e.statusCode === 404) return true;
    if ((e.response as Record<string, unknown>)?.status === 404) return true;
  }
  return false;
}

export function isServerError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const status = e.status || e.statusCode || (e.response as Record<string, unknown>)?.status;
    return typeof status === 'number' && status >= 500 && status < 600;
  }
  return false;
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const name = String(e.name || '');
  const msg = String(e.message || '');
  return (
    name === 'AbortError' ||
    name === 'CanceledError' ||
    msg.includes('aborted') ||
    msg.includes('canceled') ||
    msg.includes('ERR_CANCELED')
  );
}

export function classifyApiError(error: unknown): ClassifiedError {
  if (isAbortError(error)) {
    return { type: 'abort', message: '请求已取消' };
  }
  if (isNetworkError(error)) {
    return { type: 'network', message: '网络连接失败，请检查网络' };
  }
  if (isAuthError(error)) {
    return { type: 'auth', message: '请登录后访问此文件' };
  }
  if (isPermissionError(error)) {
    return { type: 'permission', message: '没有执行此操作的权限' };
  }
  if (isNotFoundError(error)) {
    return { type: 'not-found', message: '文件不存在或已被删除' };
  }
  if (isServerError(error)) {
    return { type: 'server', message: '服务器错误，请稍后重试', status: (error as Record<string, unknown>).status as number };
  }

  const msg = error instanceof Error ? error.message : '未知错误';
  return { type: 'unknown', message: msg };
}
