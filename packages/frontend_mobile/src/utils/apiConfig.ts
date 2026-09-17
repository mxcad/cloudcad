import { t, i18nScope } from '@/languages';
import { client } from '@cloudcad/api-sdk/client.gen';
import { authControllerRefreshToken } from '../api-sdk';
import { classifyApiError, isPermissionError, isAbortError } from './errorHandler';
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

// ── 401 刷新 — fetch 层覆写，与 PC packages/frontend/src/config/clientSetup.ts 对齐 ──
// 背景：@hey-api 生成的 client 其 error interceptor 返回 {retry: true} 不被消费端 honor，
// 请求保持失败态。PC 端在 fetch 层做 401 检测→refresh→重放。此处同步实现。
const nativeFetch = globalThis.fetch.bind(globalThis);

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
          const message = String(typedData.message || t('业务处理失败'));
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

  client.setConfig({
    fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
      let response = await nativeFetch(input, init);

      if (response.status === 401) {
        const url = typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
        const isAuthEndpoint =
          url.includes('/auth/login') ||
          url.includes('/auth/refresh') ||
          url.includes('/auth/forgot-password') ||
          url.includes('/auth/reset-password');
        if (!isAuthEndpoint) {
          if (!refreshPromise) {
            refreshPromise = tryRefreshToken();
          }
          const refreshed = await refreshPromise;
          refreshPromise = null;
          if (refreshed) {
            const token = getAccessToken();
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${token}`);
            response = await nativeFetch(input, { ...init, headers });
          }
        }
      }

      return response;
    },
  });

  // Bearer Token request interceptor — 与 PC packages/frontend/src/config/clientSetup.ts 对齐
  client.interceptors.request.use((request) => {
    const token = getAccessToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    // 携带当前语言，后端根据 Accept-Language 返回国际化响应
    const lang = i18nScope.activeLanguage;
    if (lang) {
      request.headers.set('Accept-Language', lang);
    }
    if (request.headers.get('Content-Type') === 'null') {
      request.headers.delete('Content-Type');
    }
    return request;
  });

  // Error interceptor — 仅做错误分类标记，401 刷新已在 fetch 层处理
  client.interceptors.error.use((error) => {
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      if (isPermissionError(error)) {
        e.isPermissionError = true;
        e.statusCode = 403;
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
  // 业务错误优先展示后端 message（如 VIP 门控 VIP_FEATURE_REQUIRED、配额超限
  // QUOTA_EXCEEDED）：后端已按 Accept-Language 返回 i18n 文案，直接透传；
  // 避免被通用分类（403 → "没有执行此操作的权限"、401 → "请登录"）覆盖导致信息丢失
  const raw = error as Record<string, unknown> | null;
  if (raw && typeof raw.code === 'string' && typeof raw.message === 'string') {
    showToast(raw.message as string);
    return raw.message as string;
  }
  const classified = classifyApiError(error);
  if (classified.type === 'abort') return '';
  const prefix = context ? `${context}: ` : '';
  const message = `${prefix}${classified.message}`;
  showToast(message);
  return message;
}

/**
 * 获取 PC 端登录页面 URL。
 * 移动端通过 window.open 打开，PC 端登录后 redirect 回移动端 URL 带回 token。
 * 同端口 storage 事件触发原标签页同步认证状态。
 * @param redirectUrl 登录成功后要跳转的移动端 URL
 */
export function getPCLoginUrl(redirectUrl?: string): string {
  let url: string;
  if (import.meta.env.DEV) {
    url = 'http://localhost:3000/login';
  } else {
    url = '/login';
  }
  if (redirectUrl) {
    url += `?redirect=${encodeURIComponent(redirectUrl)}`;
  }
  return url;
}

/**
 * 获取 PC 端忘记密码页面 URL。
 * 移动端不承载原生认证流程（ADR-0062），忘记密码走 PC 页；不带 redirect，
 * 完成重置后用户在 PC 重新登录。
 * DEV/prod 分支沿用 getPCLoginUrl，避免第二处 import.meta.env 引用。
 */
export function getPCForgotPasswordUrl(): string {
  return getPCLoginUrl().replace('/login', '/forgot-password');
}

/**
 * 获取 PC 端会员中心 URL（套餐对比 / 购买续费 / 订单历史）。
 * 会员购买涉及支付下单流程，移动端不重做，统一跳 PC 会员中心。
 * DEV/prod 分支沿用 getPCLoginUrl，避免第二处 import.meta.env 引用。
 */
export function getPCMemberCenterUrl(): string {
  return getPCLoginUrl().replace('/login', '/member-center');
}
