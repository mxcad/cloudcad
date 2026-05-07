///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { client } from '@/api-sdk/client.gen';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken, isValidToken, getRefreshToken, setAccessToken, setRefreshToken, removeAccessToken, removeRefreshToken } from '@/utils/tokenUtils';

// ── 1. Base URL & Envelope Unwrap ─────────────────────────────
const baseUrl = getApiBaseUrl().replace(/\/api$/, '');
client.setConfig({
  baseUrl,
  responseTransformer: async (data: unknown) => {
    if (
      data &&
      typeof data === 'object' &&
      'code' in data
    ) {
      const typedData = data as Record<string, unknown>;
      const code = typedData.code;
      // 当 code 存在且不为 0 时，视为业务错误，抛出异常
      if (typeof code === 'number' && code !== 0) {
        const message = String(typedData.message || '业务处理失败');
        const error: Error & { code?: number; data?: unknown } = Object.assign(new Error(message), { code, data: typedData });
        throw error;
      }
      // 成功时解包 data 字段
      if ('data' in typedData) {
        return typedData.data;
      }
    }
    return data;
  },
});

// ── 2. Bearer Token (request interceptor) ────────────────────
client.interceptors.request.use((request) => {
  const token = getValidToken();
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }
  if (request.headers.get('Content-Type') === 'null') {
    request.headers.delete('Content-Type');
  }
  return request;
});

// ── 3. 401 Refresh (custom fetch wrapper) ────────────────────
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Token refresh callback for React state sync
let tokenRefreshCallback: ((newAccessToken: string) => void) | null = null;

export function setTokenRefreshCallback(callback: (newAccessToken: string) => void): void {
  tokenRefreshCallback = callback;
}

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const token = getRefreshToken();
  if (!token) return false;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      const body = await res.json();
      const inner = body?.data || body;
      if (inner?.accessToken && isValidToken(inner.accessToken)) {
        setAccessToken(inner.accessToken);
        if (inner.refreshToken && isValidToken(inner.refreshToken)) {
          setRefreshToken(inner.refreshToken);
        }
        // Notify React state if callback registered
        if (tokenRefreshCallback) {
          tokenRefreshCallback(inner.accessToken);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

let isRedirecting = false;
let redirectTimer: number | null = null;

function clearAuthAndRedirect() {
  if (isRedirecting) return;
  isRedirecting = true;
  removeAccessToken();
  removeRefreshToken();
  localStorage.removeItem('user');
  window.location.href = '/login';
}

function handleTokenRefreshFailure() {
  if (isRedirecting) return;
  isRedirecting = true;

  // Show alert to user
  alert('Login session expired. Please log in again.');

  // Clear any pending redirect
  if (redirectTimer !== null) {
    clearTimeout(redirectTimer);
  }

  // Delay redirect to allow user to see the alert
  redirectTimer = window.setTimeout(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }, 2000);
}

const nativeFetch = globalThis.fetch.bind(globalThis);

// 辅助函数：保存请求体副本，避免重试时 body 被消耗
function persistBody(init?: RequestInit): RequestInit | undefined {
  if (!init) return init;
  const { body, ...rest } = init;
  if (body && typeof body === 'string') {
    return { ...rest, body };
  }
  // 对于其他类型（FormData, Blob 等），暂不支持克隆，直接返回原 init
  // 这种情况下重试可能失败，但至少保证原始请求正常发送
  return init;
}

client.setConfig({
  fetch: async (input, init) => {
    // 首次请求前，保存 body 副本（用于可能的重试）
    const persistedInit = persistBody(init);
    let response = await nativeFetch(input, init);

    // 401 → 尝试刷新 token 并重试（支持所有 HTTP 方法）
    if (response.status === 401) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/profile');
      if (!isAuthEndpoint) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${getValidToken()}`);
          const retryInit = persistedInit ? { ...persistedInit, headers } : { ...init, headers };
          response = await nativeFetch(input, retryInit);
        } else {
          handleTokenRefreshFailure();
        }
      } else if (url.includes('/auth/profile')) {
        handleTokenRefreshFailure();
      }
    }

    return response;
  },
});

// ── 4. Error tagging ─────────────────────────────────────────
client.interceptors.error.use(async (error, _response, _request, _options) => {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.status === 403) {
      (error as Record<string, unknown>).isPermissionError = true;
      (error as Record<string, unknown>).statusCode = 403;
    }
  }
  return error;
});
