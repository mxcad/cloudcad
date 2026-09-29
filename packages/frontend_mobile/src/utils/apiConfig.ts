import { t, i18nScope } from '@/languages';
import { client } from '@cloudcad/api-sdk/client.gen';
import { authControllerRefreshToken } from '../api-sdk';
import { clearSession, readToken } from './authSession';
import { errorKind } from './apiError';
import {
  classifyApiError,
  isPermissionError,
  isAbortError,
} from './errorHandler';
import { showToast } from 'vant';

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return '/api';
}

/** API 源地址（origin）。配置为相对路径或非法时返回空串，调用方退化为相对路径。 */
export function getApiOrigin(): string {
  try {
    return new URL(getApiBaseUrl()).origin;
  } catch {
    return '';
  }
}

/**
 * 拼带缓存打散的绝对 API URL，强制浏览器/CDN 取最新资源。
 *
 * 唯一出口：文件流、下载、锚点下载等「内容可变但 URL 相同」的资源一律走这里，
 * 各调用方不再各自 new URL + Date.now()。需要额外查询参数时在其后追加 `&k=v`。
 * 注意：库文件/缩略图等用稳定缓存键（文件 updatedAt）的 URL 不要走这里。
 */
export function cachedApiUrl(path: string): string {
  return `${getApiOrigin()}/api/v1${path}?t=${Date.now()}`;
}

let refreshPromise: Promise<boolean> | null = null;

function getAccessToken(): string | undefined {
  return readToken() ?? undefined;
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

/**
 * 唯一刷新出口：并发调用共享同一 in-flight promise，避免轮换制 refresh token 被重复消费。
 * fetch 层 401 刷新与 useAuthState 启动/错误刷新都汇入此函数，不再各自发请求互相作废。
 * 确定性认证失败（401/UNAUTHORIZED，refresh token 已失效）时清除本地 token，避免反复重试；
 * 网络错误保留 token 供重试。
 */
export function refreshTokensOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefreshTokens().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefreshTokens(): Promise<boolean> {
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
  } catch (error) {
    // SDK 对非 2xx 直接 throw 解析后的 JSON body（无 status 字段），401 时 code 为 'UNAUTHORIZED'
    if (isDefinitiveAuthError(error)) {
      // 走会话唯一清理出口（同步 useAuthState/useUser 状态机）
      clearSession();
    }
    return false;
  }
}

/**
 * 确定性认证失败：后端 401/UNAUTHORIZED（refresh token 失效、用户禁用等），不可重试。
 * 判定委托 apiError.errorKind（unauthorized = 401/UNAUTHORIZED/AUTH_TOKEN_*），语义不变：
 * SDK 对非 2xx throw body 无 status 字段，401 检测靠 code；网络错误归 network 不会被误清。
 */
function isDefinitiveAuthError(error: unknown): boolean {
  return errorKind(error) === 'unauthorized';
}

// ── 401 刷新 — fetch 层覆写，与 PC packages/frontend/src/config/clientSetup.ts 对齐 ──
// 背景：@hey-api 生成的 client 其 error interceptor 返回 {retry: true} 不被消费端 honor，
// 请求保持失败态。PC 端在 fetch 层做 401 检测→refresh→重放。此处同步实现。
const nativeFetch = globalThis.fetch.bind(globalThis);

export function setupApiClient(): void {
  const baseUrl = getApiOrigin();

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
          const error: Error & { code?: number; data?: unknown } =
            Object.assign(new Error(message), { code, data: typedData });
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
        const url =
          typeof input === 'string'
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
          const refreshed = await refreshTokensOnce();
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
