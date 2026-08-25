///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { client } from '@cloudcad/api-sdk/client.gen';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken, isAccessTokenExpired } from '@/utils/tokenUtils';
import { t, i18nScope } from '@/languages';
import {
  handleQuotaExceededError,
  isQuotaExceededError,
} from '@/utils/quotaUpgradeGuide';
import {
  handleVipFeatureRequiredError,
  isVipFeatureRequiredError,
} from '@/utils/vipFeatureGuide';
import { globalShowToast } from '@/utils/notificationEvents';
import { tryRefreshToken, handleTokenRefreshFailure } from './tokenRefresh';
// 外部调用方从 clientSetup 导入的符号统一转发自 tokenRefresh
export {
  setTokenRefreshCallback,
  setAuthFailureCallback,
  setSpaNavigate,
  getReturnUrl,
  cancelLoginRedirect,
  triggerProactiveRefresh,
  cancelProactiveRefresh,
  ensureFreshAuthCookie,
} from './tokenRefresh';

// ── 1. Base URL & Envelope Unwrap ─────────────────────────────
// SDK 路由已含 /api/v1/ 前缀（@hey-api/openapi-ts 从 servers 字段自动添加），
// baseUrl 只需保留协议+主机
const apiBaseUrl = getApiBaseUrl();
let baseUrl: string;
try {
  baseUrl = new URL(apiBaseUrl).origin;
} catch {
  baseUrl = '';
}
client.setConfig({
  baseUrl,
  responseTransformer: async (data: unknown) => {
    if (data && typeof data === 'object' && 'code' in data) {
      const typedData = data as Record<string, unknown>;
      const code = typedData.code;
      // 当 code 存在且不为 0 时，视为业务错误，抛出异常
      if (typeof code === 'number' && code !== 0) {
        const message = String(typedData.message || t('业务处理失败'));
        const error: Error & { code?: number; data?: unknown } = Object.assign(
          new Error(message),
          { code, data: typedData }
        );
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

// ── 2. Bearer Token + Language (request interceptor) ──
client.interceptors.request.use((request) => {
  const token = getValidToken();
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

// ── 3. 401 Refresh — 见 ./tokenRefresh ───────────────────────
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
  fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
    let response = await nativeFetch(input, init);

    // 401 → 尝试刷新 token 并重试（支持所有 HTTP 方法）
    if (response.status === 401) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const isAuthEndpoint =
        url.includes('/auth/login') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/forgot-password') ||
        url.includes('/auth/reset-password');
      if (!isAuthEndpoint) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          const token = getValidToken();
          if (!token) {
            handleTokenRefreshFailure();
            return response;
          }
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${token}`);
          response = await nativeFetch(input, { ...init, headers });
        } else {
          handleTokenRefreshFailure();
        }
      }
    }

    return response;
  },
});

// ── 4. Global error logging ───────────────────────────────────
// 4xx 业务错误仅记录到控制台，不自动弹 Toast，各调用方根据需要自行决定是否显示错误提示；
// 5xx 服务器错误（如 500）由用户明确要求必须可见，这里统一分发全局 Toast，避免静默失败。
// 例外：下载/批量任务类端点（路径含 /download，sdk.gen.ts 中全部 14 个均已核对）的
// 调用方契约是「失败抛错、由调用方提示具体原因」（src/utils/download.ts、useBatchDownload、
// useFileSystemNavigation、useFontLibrary 均在 catch 中自行 toast），拦截器不再重复弹，
// 避免一次失败出现两个错误提示（实例：批量逐个下载 524 时双 toast 轰炸且叉不完）。
const isCallerToastedDownload = (path: string) => path.includes('/download');

client.interceptors.response.use(async (response) => {
  if (!response.ok) {
    const url = typeof response.url === 'string' ? response.url : '';
    const path = url.startsWith('http') ? new URL(url).pathname : url;
    let message = '';
    try {
      const cloned = response.clone();
      const body = await cloned.json();
      message =
        (body?.message as string) ||
        (body?.error as string) ||
        (body?.code as string) ||
        '';
    } catch {
      // 非 JSON 响应体（HTML/空白等），message 保持为空，使用兜底文案
    }

    const fallback =
      response.status >= 500
        ? t('服务器繁忙，请稍后重试')
        : response.status === 429
          ? t('操作过于频繁，请稍后重试')
          : '';

    // 未登录（无有效 accessToken 或 token 已过期）时的 401 是预期行为，
    // 不打印 [API Error] 噪音（如首页游客模式下全局组件的鉴权数据请求）。
    const isUnauthenticated401 =
      response.status === 401 && isAccessTokenExpired();
    if (!isUnauthenticated401) {
      console.warn(
        `[API Error] ${response.status} ${path}:`,
        message || fallback || '(no message)'
      );
    }

    if (response.status >= 500 && !isCallerToastedDownload(path)) {
      globalShowToast(
        message || fallback || t('服务器繁忙，请稍后重试'),
        'error'
      );
    }
  }
  return response;
});

// ── 5. Error tagging ─────────────────────────────────────────
client.interceptors.error.use(async (error, _response, _request, _options) => {
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (e.status === 403) {
      (error as Record<string, unknown>).isPermissionError = true;
      (error as Record<string, unknown>).statusCode = 403;
    }
    // QUOTA_EXCEEDED（配额超限/转换频率限制）的提示 owner 是此处：该错误可能出现在
    // 任意 API（不限于上传），全局统一处理避免各调用方各自实现提示逻辑。
    // isQuotaExceededError 与 mxcadOpenFile.ts 的 catch 共用同一判断（单一事实源）。
    if (isQuotaExceededError(error)) {
      // 刻意不 await（fire-and-forget）：登录用户分支会 await globalShowConfirm，
      // 若在此挂起，调用方（如 handlePublicUpload 的 catch）要等用户关闭弹窗才继续，
      // 期间 loading 悬挂：LoadingOverlay（Z_LAYERS.LOADING_OVERLAY=99999，pointerEvents:auto）
      // 全屏遮挡，而确认弹窗 z-index（Z_LAYERS.MODAL=10000）在其之下 → 用户看不到弹窗 → 死锁。
      // 提示渲染由 NotificationProvider 独立于请求链路完成，无需等待其结果。
      void handleQuotaExceededError(error);
    }
    // VIP_FEATURE_REQUIRED（导出下载为会员专属功能）的提示 owner 同样在此：
    // 任意导出方向 API 被后端门控拒绝时统一弹购买引导（游客 toast，登录用户 confirm → 购买弹窗）。
    if (isVipFeatureRequiredError(error)) {
      void handleVipFeatureRequiredError(error);
    }
  }
  return error;
});
