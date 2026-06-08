import { client } from '../api-sdk/client.gen';
import { authControllerRefreshToken } from '../api-sdk';
import { classifyApiError, isAuthError, isPermissionError, isAbortError } from './errorHandler';
import { showToast } from 'vant';

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return '/api';
}

let refreshPromise: Promise<boolean> | null = null;

function getAccessToken(): string | undefined {
  try {
    const token = localStorage.getItem('accessToken');
    if (token && token !== 'undefined' && token !== 'null') return token;
  } catch {
    // localStorage 不可用时忽略
  }
  return undefined;
}

function getRefreshToken(): string | null {
  try {
    const token = localStorage.getItem('refreshToken');
    if (token && token !== 'undefined' && token !== 'null') return token;
  } catch {
    return null;
  }
  return null;
}

function setAccessToken(token: string): void {
  localStorage.setItem('accessToken', token);
}

function setRefreshToken(token: string): void {
  localStorage.setItem('refreshToken', token);
}

export function removeAccessToken(): void {
  localStorage.removeItem('accessToken');
}

export function removeRefreshToken(): void {
  localStorage.removeItem('refreshToken');
}

function parseJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await authControllerRefreshToken({
      body: { refreshToken },
    });
    const inner = res.data as unknown as Record<string, unknown> | undefined;
    if (inner?.accessToken) {
      setAccessToken(inner.accessToken as string);
      if (inner.refreshToken) {
        setRefreshToken(inner.refreshToken as string);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function setupApiClient(): void {
  const apiBaseUrl = getApiBaseUrl();
  let baseUrl: string;
  try {
    baseUrl = new URL(apiBaseUrl).origin;
  } catch {
    baseUrl = '';
  }

  client.setConfig({
    baseUrl,
    credentials: 'include',
    auth: () => getAccessToken(),
    responseTransformer: async (data: unknown) => {
      if (data && typeof data === 'object' && 'code' in data) {
        const typedData = data as Record<string, unknown>;
        const code = typedData.code;
        if (typeof code === 'number' && code !== 0) {
          const message = String(typedData.message || '业务处理失败');
          const error: Error & { code?: number; data?: unknown } = Object.assign(
            new Error(message),
            { code, data: typedData },
          );
          throw error;
        }
        if ('data' in typedData) {
          return typedData.data;
        }
      }
      return data;
    },
  });

  client.interceptors.error.use(async (error, response, _request, _options) => {
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;

      if (isPermissionError(error)) {
        e.isPermissionError = true;
        e.statusCode = 403;
      }

      if (isAuthError(error)) {
        const isAuthEndpoint = typeof _request?.url === 'string' &&
          (_request.url.includes('/auth/') || _request.url.includes('/login') || _request.url.includes('/refresh'));
        if (!isAuthEndpoint) {
          if (!refreshPromise) {
            refreshPromise = tryRefreshToken();
          }
          const refreshed = await refreshPromise;
          refreshPromise = null;
          if (refreshed) {
            return { retry: true };
          }
        }
      }

      if (isAbortError(error)) {
        return error;
      }
    }
    return error;
  });
}

export function handleApiError(error: unknown, context?: string): string {
  if (isAbortError(error)) return '';
  const classified = classifyApiError(error);
  if (classified.type === 'abort') return '';
  const prefix = context ? `${context}: ` : '';
  const message = `${prefix}${classified.message}`;
  showToast(message);
  return message;
}

// ── Proactive Token Refresh ───────────────────────────────────

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh() {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const token = getAccessToken();
  if (!token) return;

  const expMs = parseJwtExp(token);
  if (!expMs) return;

  const now = Date.now();
  const REFRESH_AHEAD_MS = 5 * 60 * 1000;
  const delay = expMs - now - REFRESH_AHEAD_MS;

  if (delay <= 60_000) {
    if (delay <= 0) return;
    tryRefreshToken().then((ok) => {
      if (ok) scheduleProactiveRefresh();
    });
    return;
  }

  refreshTimer = setTimeout(() => {
    tryRefreshToken().then((ok) => {
      if (ok) scheduleProactiveRefresh();
    });
  }, delay);
}

export function triggerProactiveRefresh(): void {
  scheduleProactiveRefresh();
}

export function cancelProactiveRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

// 初始化：页面加载时启动主动刷新
scheduleProactiveRefresh();
