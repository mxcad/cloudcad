///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { client } from './client.gen';
import { getApiBaseUrl } from '@/config/apiConfig';

// ── 1. Base URL & Envelope Unwrap ─────────────────────────────
const baseUrl = getApiBaseUrl().replace(/\/api$/, '');
client.setConfig({
  baseUrl,
  /** 保留默认 fields 模式：返回 { data, error, request, response }，类型安全 */
  /** 自动解包后端响应信封 { code, message, data } → data */
  responseTransformer: async (data: unknown) => {
    if (
      data &&
      typeof data === 'object' &&
      'data' in data &&
      'code' in data
    ) {
      return (data as Record<string, unknown>).data;
    }
    return data;
  },
});

// ── 2. Bearer Token (request interceptor) ────────────────────
client.interceptors.request.use((request) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }
  // FormData 上传：Content-Type = 'null' 时删除，让浏览器自动设置 boundary
  if (request.headers.get('Content-Type') === 'null') {
    request.headers.delete('Content-Type');
  }
  return request;
});

// ── 3. Refresh callback (notify AuthContext after silent refresh) ─
let onTokenRefreshed: ((accessToken: string) => void) | null = null;

export function setTokenRefreshCallback(cb: (accessToken: string) => void) {
  onTokenRefreshed = cb;
}

// ── 4. 401 Refresh (custom fetch wrapper) ────────────────────
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const token = localStorage.getItem('refreshToken');
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
      if (inner?.accessToken) {
        localStorage.setItem('accessToken', inner.accessToken);
        if (inner.refreshToken) localStorage.setItem('refreshToken', inner.refreshToken);
        // Notify AuthContext so React state stays in sync
        onTokenRefreshed?.(inner.accessToken);
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

function clearAuthAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

const nativeFetch = globalThis.fetch.bind(globalThis);

client.setConfig({
  fetch: async (input, init) => {
    let response = await nativeFetch(input, init);

    // 401 → try refresh and retry once
    if (response.status === 401) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/auth/login') && !url.includes('/auth/profile')) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${localStorage.getItem('accessToken')}`);
          response = await nativeFetch(input, { ...init, headers });
        } else {
          clearAuthAndRedirect();
        }
      }

      // Profile 401: clear auth silently
      if (url.includes('/auth/profile')) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
    }

    return response;
  },
});

// ── 5. Error tagging ─────────────────────────────────────────
client.interceptors.error.use(async (error, _response, _request, _options) => {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.status === 403) {
      (error as any).isPermissionError = true;
      (error as any).statusCode = 403;
    }
  }
  return error;
});
