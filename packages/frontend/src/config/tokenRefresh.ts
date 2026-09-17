///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { authControllerRefreshToken } from '@/api-sdk';
import { isCADRoute } from '@/utils/hasRoute';
import { ADMIN_LOGIN_PATH } from '@/constants/adminLoginConfig';
import {
  decodeJwtPayload,
  getAccessToken,
  getRefreshToken,
  getValidToken,
  isValidToken,
  removeAccessToken,
  removeRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@/utils/tokenUtils';

// ── 3. 401 Refresh ────────────────────────────────────────────
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// 刷新失败冷却：切断 401 → 重复刷新风暴（轮询请求在 token 失效时会持续触发 401）
const REFRESH_FAILURE_COOLDOWN_MS = 60_000;
let refreshCooldownUntil = 0;

// cookie 模式失败记忆：无 body（httpOnly cookie）刷新失败一次后跳过该模式；
// 刷新成功（后端会重新种 cookie）时重置，因此是瞬态而非永久
let cookieModeFailed = false;

// Token refresh callback for React state sync
let tokenRefreshCallback: ((newAccessToken: string) => void) | null = null;

export function setTokenRefreshCallback(
  callback: (newAccessToken: string) => void
): void {
  tokenRefreshCallback = callback;
}

// Auth failure callback — called immediately when refresh fails, before redirect
let authFailureCallback: (() => void) | null = null;

export function setAuthFailureCallback(callback: () => void): void {
  authFailureCallback = callback;
}

async function doRefresh(token?: string): Promise<boolean> {
  try {
    // 浏览器：优先 httpOnly cookie（不传 body），桌面 EXE：继续用 body 传
    const body = token ? { refreshToken: token } : {};
    const res = await authControllerRefreshToken({ body });
    const inner = res.data!;
    if (inner?.accessToken && isValidToken(inner.accessToken)) {
      setAccessToken(inner.accessToken);
      // 始终保存到 localStorage，供桌面离线版 cookie 丢失后 body 模式兜底
      // 浏览器模式下 httpOnly cookie 仍是主要机制，localStorage 是次级 fallback
      if (inner.refreshToken && isValidToken(inner.refreshToken)) {
        setRefreshToken(inner.refreshToken);
      }
      if (tokenRefreshCallback) {
        tokenRefreshCallback(inner.accessToken);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function tryRefreshToken(): Promise<boolean> {
  if (isRedirecting) return false;
  // 冷却期内 401 直接返回失败，不再重复发起刷新
  if (Date.now() < refreshCooldownUntil) return false;
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    let success = false;
    try {
      // 第一次尝试：无 body，浏览器自动携带 httpOnly refresh_token cookie。
      // 若 cookie 模式失败过一次，直接跳过，避免每次 401 都重复打一个必然失败的请求
      if (!cookieModeFailed) {
        success = await doRefresh();
        if (success) return true;
        cookieModeFailed = true;
      }

      // cookie 方式失败后，回退到 localStorage body 方式（桌面 EXE 场景）
      const initialToken = getRefreshToken();
      if (initialToken) {
        success = await doRefresh(initialToken);
        if (success) return true;

        // 检查 token 是否被其他流程轮换
        const currentToken = getRefreshToken();
        if (currentToken && currentToken !== initialToken) {
          success = await doRefresh(currentToken);
          if (success) return true;
        }
      }

      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
      if (success) {
        // 刷新成功：清除冷却并重置 cookie 失败记忆（后端刷新成功时会重新种 cookie）
        refreshCooldownUntil = 0;
        cookieModeFailed = false;
      } else {
        // 刷新失败进入冷却期，期间 401 直接返回失败，不再重复发起刷新
        refreshCooldownUntil = Date.now() + REFRESH_FAILURE_COOLDOWN_MS;
      }
    }
  })();

  return refreshPromise;
}

let isRedirecting = false;
let redirectTimer: number | null = null;

// SPA navigate function — set by App.tsx on mount
let spaNavigate: ((path: string) => void) | null = null;

export function setSpaNavigate(fn: (path: string) => void): void {
  spaNavigate = fn;
}

function getCurrentReturnUrl(): string {
  const path =
    window.location.pathname + window.location.search + window.location.hash;
  if (
    !path.startsWith('/login') &&
    !path.startsWith('/register') &&
    !path.startsWith(ADMIN_LOGIN_PATH)
  ) {
    return path;
  }
  return '/';
}

// Backward compat — keep for Login page
function saveReturnUrl() {
  const url = getCurrentReturnUrl();
  if (url !== '/') {
    sessionStorage.setItem('returnUrl', url);
  }
}

export function getReturnUrl(): string {
  const url = sessionStorage.getItem('returnUrl') || '/';
  sessionStorage.removeItem('returnUrl');
  return url;
}

// 清除本地失效 token + 通知 React 状态 + 取消主动刷新。
// 被 CAD 公开路由分支（降级游客模式）与跳转登录分支共用。
// 不清会导致：1. 页面刷新后 AuthContext 误判"已登录"，反复发起 401 请求风暴；
// 2. 授权页面反复进入 ready → 自动授权 → 401 → 失败 的死循环。
function clearAuthState() {
  removeAccessToken();
  removeRefreshToken();
  localStorage.removeItem('user');
  localStorage.removeItem('personalSpaceId');
  localStorage.removeItem('mxcad-personal-space-id');
  // 立即通知 React 状态（AuthContext 清除 user/token → 降级游客模式 / ProtectedRoute 跳登录）
  if (authFailureCallback) {
    authFailureCallback();
  }
  // 清除主动刷新定时器
  cancelProactiveRefresh();
}

export function handleTokenRefreshFailure() {
  // 如果用户从未登录（没有任何 token），则不触发登录跳转
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  if (!accessToken && !refreshToken) {
    return;
  }

  // 如果已经在公开页面（登录/注册/密码重置等），无需跳转也不清空 token
  const currentPath = window.location.pathname;
  const PUBLIC_PATHS = [
    '/login',
    ADMIN_LOGIN_PATH,
    '/register',
    '/logo',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/verify-phone',
    // 会话转移透明交接路由：交接瞬间旧 token 恰好 401 时不得被劫持跳登录页，打断转移
    '/session-transfer',
  ];
  if (PUBLIC_PATHS.some((p) => currentPath.startsWith(p))) {
    return;
  }

  // CAD 编辑器公开路由（/ 或 /cad-editor）：token 失效时仅清除本地状态，
  // 不跳转登录页 —— 默认首页必须始终可用（无需登录，以游客模式继续浏览）。
  // 与 PUBLIC_PATHS 的关键区别：此处必须清 token，否则残留失效 token 会让
  // 后续每次请求继续 401（触发刷新风暴），且 AuthContext 误判"已登录"。
  // 置于 isRedirecting 守卫之前：即使同会话先在被保护页失败并发出登录跳转，
  // 在 CAD 路由上发生的 401 也优先降级为游客模式，不被上一次跳转拖入登录页。
  if (isCADRoute()) {
    clearAuthState();
    return;
  }

  if (isRedirecting) return;

  isRedirecting = true;
  saveReturnUrl();

  // 立即清除失效 token，避免残留 localStorage 导致上述问题
  clearAuthState();

  if (redirectTimer !== null) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }

  const returnUrl = getCurrentReturnUrl();
  const loginUrl = `/login?redirect=${encodeURIComponent(returnUrl)}`;

  if (spaNavigate) {
    spaNavigate(loginUrl);
  } else {
    window.location.href = loginUrl;
  }
}

/**
 * 取消待定的登录跳转
 * 当用户触发另存为等本地操作时，应调用此函数取消后台 401 触发的跳转定时器
 */
export function cancelLoginRedirect(): void {
  if (redirectTimer !== null) {
    clearTimeout(redirectTimer);
    redirectTimer = null;
  }
  isRedirecting = false;
}

// ── 6. Proactive Token Refresh ───────────────────────────────
// 在 access token 过期前 5 分钟主动刷新，避免 401 发生

/** 解析 access token 剩余有效毫秒数（主动刷新/临门刷新共用，统一口径） */
function getTokenRemainingMs(token: string): number | null {
  // 必须走 decodeJwtPayload（base64url 解码）：payload 含 UUID（sub/jti）时
  // 编码结果几乎必然含 -/_，直接 atob 抛异常 → 返回 null → 主动刷新与
  // ensureFreshAuthCookie 保活全部静默失效
  const payload = decodeJwtPayload(token);
  return payload?.exp ? (payload.exp as number) * 1000 - Date.now() : null;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProactiveRefresh() {
  // 清除旧定时器
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const token = getValidToken();
  if (!token) return;

  // 后台 tab 的 setTimeout 可能被浏览器节流导致错过刷新窗口，
  // 页面回前台时补一次临门检查（幂等注册）
  registerVisibilityListener();

  const remainingMs = getTokenRemainingMs(token);
  if (remainingMs === null) return;

  // 提前 5 分钟刷新（300000ms）
  const REFRESH_AHEAD_MS = 5 * 60 * 1000;
  const delay = remainingMs - REFRESH_AHEAD_MS;

  // 如果已过期或即将过期（剩余不足 60 秒），立即刷新
  if (delay <= 60_000) {
    tryRefreshToken().then((ok) => {
      if (ok) {
        scheduleProactiveRefresh(); // 刷新成功，重新排期
      } else if (delay <= 0) {
        handleTokenRefreshFailure(); // 已过期且刷新失败 → 跳转登录
      }
    });
    return;
  }

  refreshTimer = setTimeout(() => {
    tryRefreshToken().then((ok) => {
      if (ok) scheduleProactiveRefresh(); // 刷新成功，重新排期
    });
  }, delay);
}

// 当 token 被外部更新时（如登录、主动刷新成功），重新排期
export function triggerProactiveRefresh(): void {
  scheduleProactiveRefresh();
}

// ── 7. Cookie 新鲜度保活 ─────────────────────────────────────
// 外部参照图片等由 mxcad 引擎内部发起的请求（<img>/canvas）只携带 cookie，
// 不携带 Authorization header。auth_token cookie 与 access token 同寿命（1h），
// 一旦过期这些请求直接 401。因此需要在这些请求发生前确保 cookie 新鲜。

// 剩余不足 10 分钟即刷新（临门检查；与 proactive 排期的提前量 5 分钟互补）
const AUTH_COOKIE_REFRESH_AHEAD_MS = 10 * 60 * 1000;

/**
 * 确保 auth_token cookie 新鲜：access token 剩余有效期不足时触发刷新
 * （后端 /auth/refresh 会重新种 auth_token cookie）。已登录但无需刷新时无网络开销。
 */
export async function ensureFreshAuthCookie(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  const remainingMs = getTokenRemainingMs(token);
  if (remainingMs === null) return;
  if (remainingMs < AUTH_COOKIE_REFRESH_AHEAD_MS) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      scheduleProactiveRefresh(); // 刷新成功，按新 token 重新排期
    } else {
      console.warn(
        '[ensureFreshAuthCookie] token 刷新失败，依赖 cookie 的请求（外部参照等）可能 401'
      );
    }
  }
}

// visibility 监听生命周期与主动刷新同步：scheduleProactiveRefresh 注册（幂等），
// cancelProactiveRefresh 移除（登出后不再空跑）
let visibilityListenerRegistered = false;
function registerVisibilityListener(): void {
  if (visibilityListenerRegistered || typeof document === 'undefined') return;
  visibilityListenerRegistered = true;
  document.addEventListener('visibilitychange', visibilityChangeHandler);
}

const visibilityChangeHandler = () => {
  if (document.visibilityState === 'visible') {
    void ensureFreshAuthCookie();
  }
};

// 清除主动刷新定时器与 visibility 监听（用于登出）
export function cancelProactiveRefresh(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (visibilityListenerRegistered && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityChangeHandler);
    visibilityListenerRegistered = false;
  }
}

// 初始化：页面加载时启动主动刷新
scheduleProactiveRefresh();
