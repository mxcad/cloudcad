///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { client } from '@/api-sdk/client.gen';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken, isValidToken } from '@/utils/tokenUtils';

// ── 1. Base URL & Envelope Unwrap ─────────────────────────────
const baseUrl = getApiBaseUrl().replace(/\/api$/, '');
client.setConfig({
  baseUrl,
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
      if (inner?.accessToken && isValidToken(inner.accessToken)) {
        localStorage.setItem('accessToken', inner.accessToken);
        if (inner.refreshToken && isValidToken(inner.refreshToken)) {
          localStorage.setItem('refreshToken', inner.refreshToken);
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
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
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

client.setConfig({
  fetch: async (input, init) => {
    let response = await nativeFetch(input, init);

    // 401 → try refresh and retry once
    if (response.status === 401) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/auth/login') && !url.includes('/auth/profile')) {
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD') {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${getValidToken()}`);
            response = await nativeFetch(input, { ...init, headers });
          } else {
            handleTokenRefreshFailure();
          }
        } else {
          handleTokenRefreshFailure();
        }
      }

      // Profile 401: redirect to login
      if (url.includes('/auth/profile')) {
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
      (error as any).isPermissionError = true;
      (error as any).statusCode = 403;
    }
  }
  return error;
});
