/**
 * 认证会话**唯一出口**：写入 / 清理 / 读取 / JWT exp 判定 / redirect 目标解析。
 *
 * - applyAuthResponse：登录（含改密重登、验证页自动登录）后写入 token/user 并通知状态机。
 * - clearSession：唯一的「清空 accessToken/refreshToken/user 三键」出口，登出、
 *   刷新失效、陈旧 token 清理一律走这里（历史上同一套三连 removeItem 散落 6 处）。
 * - logout：用户主动登出的统一失败协议——API 失败 toast 后端错误文案 + **仍然**清本地
 *   会话并跳登录页（废止「失败不清」的旧协议）。
 * - isTokenExpired：JWT exp 解析唯一出口，语义统一为「无法解析 / 无 exp 视为有效，
 *   交由 401 刷新流程兜底」（与 useAuthState / 路由守卫的原语义一致）。
 * - AUTH_PAGE_PATHS：认证覆盖层路径单源（router 守卫与 App.vue 覆盖层共用，
 *   废止两处人工同步的重复常量）。
 *
 * 状态机同步：authSession 在 utils/ 层，**禁止静态 import composables**（会形成
 * utils → composables → utils 循环依赖），改用 onSessionChanged 回调注册——
 * useAuthState / useUser 在各自模块加载时注册监听，会话写入（written）/ 清理
 * （cleared）后两个状态机同步切换，调用方无需再手动 setGuest/refresh。
 */
import { authControllerLogout } from '../api-sdk';
import { showToast } from 'vant';
import { t } from '@/languages';
import { errMsg } from './apiError';

export interface AuthResponseData {
  accessToken: string;
  refreshToken?: string;
  user?: unknown;
  restored?: boolean;
}

/** 认证覆盖层路径单源：router/index.ts 守卫与 App.vue 覆盖层渲染共用 */
export const AUTH_PAGE_PATHS = [
  '/login',
  '/register',
  '/verify-email',
  '/verify-phone',
  '/forgot-password',
  '/reset-password',
];

// ── 状态机同步回调（useAuthState / useUser 模块加载时注册） ──

export type SessionEvent = 'written' | 'cleared';
export type SessionListener = (event: SessionEvent) => void;

const sessionListeners = new Set<SessionListener>();

/** 注册会话变更监听（写入/清理后同步触发；authSession 不反向依赖 composables 的唯一通道） */
export function onSessionChanged(listener: SessionListener): void {
  sessionListeners.add(listener);
}

function notifySessionChanged(event: SessionEvent): void {
  for (const listener of sessionListeners) {
    try {
      listener(event);
    } catch (e) {
      console.error('[authSession] session listener failed:', e);
    }
  }
}

// ── 读取 ──

/** 读取 accessToken（过滤 'undefined'/'null' 脏值；localStorage 不可用时返回 null） */
export function readToken(): string | null {
  try {
    const token = localStorage.getItem('accessToken');
    if (token && token !== 'undefined' && token !== 'null') return token;
  } catch {
    // localStorage 不可用时忽略
  }
  return null;
}

/** 读取 localStorage 里的 user（JSON 损坏时返回 null） */
export function readUser<T = Record<string, unknown>>(): T | null {
  try {
    const raw = localStorage.getItem('user');
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // ignore
  }
  return null;
}

/** 增量更新 localStorage 里的 user（如会员信息回写），并通知状态机刷新 */
export function patchUser(fields: Record<string, unknown>): void {
  const current = readUser<Record<string, unknown>>() ?? {};
  const merged = { ...current, ...fields };
  localStorage.setItem('user', JSON.stringify(merged));
  notifySessionChanged('written');
}

// ── JWT exp 判定（唯一出口） ──

/**
 * 解析 JWT exp 声明判断是否已过期；无法解析 / 无 exp 视为未过期（交由 401 刷新流程兜底）。
 * 无 token 一律视为已过期（调用方据此引导登录）。
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as {
      exp?: number;
    };
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

// ── redirect 目标解析 ──

/** 登录后 redirect 目标：仅接受同源内部路径（/ 开头且非 //），否则回退 fallback */
export function resolveRedirectTarget(
  raw: unknown,
  fallback = '/shell'
): string {
  if (typeof raw !== 'string') return fallback;
  const target = raw.trim();
  if (target.startsWith('/') && !target.startsWith('//')) return target;
  return fallback;
}

// ── 写入 / 清理 / 登出 ──

/** 写入会话：token/user 落盘 + 通知状态机切 authenticated（useUser 同步刷新） */
export function applyAuthResponse(data: AuthResponseData) {
  if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
  if (data.refreshToken)
    localStorage.setItem('refreshToken', data.refreshToken);
  if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
  notifySessionChanged('written');
}

/** 唯一的会话清理出口：清空 accessToken/refreshToken/user 三键并通知状态机切 guest */
export function clearSession(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  notifySessionChanged('cleared');
}

/**
 * 用户主动登出（唯一失败协议）：调后端登出，API 失败时 toast 后端错误文案，
 * **无论成败**都清本地会话并跳登录页——后端登出失败（网络断/token 已失效）
 * 不应把用户困在已不可用的会话里。
 */
export async function logout(): Promise<void> {
  try {
    await authControllerLogout();
  } catch (e) {
    console.error('[authSession] logout API failed:', e);
    showToast(errMsg(e, t('退出失败，请重试')));
  }
  clearSession();
  // 动态 import：authNavigate 静态依赖本文件（resolveRedirectTarget），静态引用会成环
  const { navigateToLogin } = await import('./authNavigate');
  navigateToLogin();
}

/**
 * 手机号 + 邮箱双验证注册的中转凭证（sessionStorage，非敏感期临时态）。
 *
 * 注册页在「手机号已通过短信验证、邮箱待验证」时写入本凭证并跳 /verify-email；
 * 邮箱验证页完成后取走它直接调 registerByPhoneAndVerifyEmail 一步完成注册。
 * 用 sessionStorage 而非 router state：hash 路由的 state 在整页刷新 / 微信
 * 授权回跳后丢失，而这条链路中间会经过一次邮箱验证码输入，用户可能刷新。
 */
export const REGISTER_PHONE_PENDING_KEY = 'registerPhonePending';

export interface RegisterPhonePending {
  phone: string;
  code: string;
  username: string;
  password: string;
  nickname?: string;
}

export function setRegisterPhonePending(pending: RegisterPhonePending): void {
  sessionStorage.setItem(REGISTER_PHONE_PENDING_KEY, JSON.stringify(pending));
}

/** 读取中转凭证（不删除：邮箱验证码输入过程中用户刷新后仍可续上） */
export function getRegisterPhonePending(): RegisterPhonePending | null {
  const raw = sessionStorage.getItem(REGISTER_PHONE_PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RegisterPhonePending>;
    if (
      typeof parsed.username !== 'string' ||
      !parsed.username ||
      typeof parsed.password !== 'string' ||
      !parsed.password ||
      typeof parsed.phone !== 'string' ||
      !parsed.phone ||
      typeof parsed.code !== 'string' ||
      !parsed.code
    ) {
      return null;
    }
    return parsed as RegisterPhonePending;
  } catch {
    return null;
  }
}

/** 注册完成（或放弃中转）后清掉凭证，避免下一轮注册误用旧账号信息 */
export function clearRegisterPhonePending(): void {
  sessionStorage.removeItem(REGISTER_PHONE_PENDING_KEY);
}
