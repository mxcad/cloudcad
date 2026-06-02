import { client } from '../api-sdk/client.gen';
import { classifyApiError, isAuthError, isPermissionError, isAbortError } from './errorHandler';
import { showToast } from 'vant';

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return '/api';
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const resp = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function getAccessToken(): string | undefined {
  try {
    const token = localStorage.getItem('accessToken');
    if (token && token !== 'undefined' && token !== 'null') return token;
  } catch {
    // localStorage 不可用时忽略
  }
  return undefined;
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
