/**
 * M8 壳级认证状态机（T10 定稿）
 *
 * 6 态：
 *   guest         — 未登录，可浏览公共内容（图纸库/图块库），受限操作引导登录
 *   authenticated — 正常登录态，完整功能
 *   token_expired — token 过期且静默刷新失败，需重新登录
 *   network_error — 网络异常/离线，显示重试卡片
 *   forbidden     — 403 权限不足，显示说明 + 申请入口
 *   deactivated   — 账号被禁用/注销，显示客服联系
 *
 * 所有壳子页通过 authState.value 判断当前态，根据态显示对应 UI。
 * 与 useUser 的关系：useUser 管理用户数据（user/isAuthenticated），本 store 管理壳级态转换。
 */

import { ref, computed, onMounted, getCurrentInstance } from 'vue'
import { authControllerRefreshToken } from '@cloudcad/api-sdk/sdk.gen'
import { getPCLoginUrl } from '../utils/apiConfig'

export type AuthStateKind = 'guest' | 'authenticated' | 'token_expired' | 'network_error' | 'forbidden' | 'deactivated'

export interface AuthState {
  kind: AuthStateKind
  /** 态附带信息，如 forbidden 的错误详情 */
  detail?: unknown
}

const initialState: AuthState = { kind: 'guest' }

const authState = ref<AuthState>(initialState)
const refreshing = ref(false)

/** token 过期的后端 code 签名（后端 AUTH_TOKEN_EXPIRED 等） */
const TOKEN_EXPIRED_CODES = new Set(['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_MISSING', 'UNAUTHORIZED'])
const FORBIDDEN_CODES = new Set(['FORBIDDEN', 'PERMISSION_DENIED', 'ACCOUNT_DEACTIVATED'])
const NETWORK_ERROR_CODES = new Set(['ERR_NETWORK', 'ECONNABORTED', 'ECONNREFUSED', 'ETIMEDOUT'])

function _isTokenExpiredError(error: unknown): boolean {
  if (error instanceof Error) {
    for (const code of TOKEN_EXPIRED_CODES) {
      if (error.message.includes(code)) return true
    }
  }
  const obj = error as { code?: string | number }
  if (obj && typeof obj.code === 'string') {
    return TOKEN_EXPIRED_CODES.has(obj.code)
  }
  if (obj && typeof obj.code === 'number' && obj.code === 401) {
    return true
  }
  return false
}

function _isForbiddenError(error: unknown): boolean {
  const obj = error as { code?: string | number }
  if (!obj) return false
  if (typeof obj.code === 'string') {
    return FORBIDDEN_CODES.has(obj.code)
  }
  if (typeof obj.code === 'number' && obj.code === 403) {
    return true
  }
  return false
}

function _isNetworkError(error: unknown): boolean {
  const obj = error as { code?: string; name?: string; message?: string }
  if (!obj) return false
  if (obj.code && NETWORK_ERROR_CODES.has(obj.code)) return true
  if (obj.name === 'TypeError' && obj.message && (obj.message.includes('NetworkError') || obj.message.includes('Failed to fetch'))) {
    return true
  }
  return false
}

function _isDeactivatedError(error: unknown): boolean {
  if (_isForbiddenError(error)) {
    const obj = error as { code?: string }
    return obj.code === 'ACCOUNT_DEACTIVATED'
  }
  return false
}

/** 静默刷新 token；成功切回 authenticated，失败切 token_expired */
async function attemptRefresh(): Promise<boolean> {
  if (refreshing.value) return false
  refreshing.value = true
  const storedRefresh = localStorage.getItem('refreshToken')
  try {
    const res = await authControllerRefreshToken({
      body: { refreshToken: storedRefresh || undefined },
    })
    if (res.error) {
      console.error('[authState] refreshToken error:', res.error)
      authState.value = { kind: 'token_expired' }
      return false
    }
    const data = (res.data ?? {}) as Record<string, unknown>
    const accessToken = data.accessToken || data.access_token
    const refreshToken = data.refreshToken || data.refresh_token
    if (accessToken) localStorage.setItem('accessToken', String(accessToken))
    if (refreshToken) localStorage.setItem('refreshToken', String(refreshToken))
    authState.value = { kind: 'authenticated' }
    return true
  } catch {
    authState.value = { kind: 'token_expired' }
    return false
  } finally {
    refreshing.value = false
  }
}

/** 解析 JWT exp 声明判断是否已过期；无法解析 / 无 exp 视为未过期（交由 401 刷新流程兜底） */
function isAccessTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || '')) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    return payload.exp * 1000 <= Date.now()
  } catch {
    return false
  }
}

function initFromStorage() {
  const token = localStorage.getItem('accessToken')
  const refreshToken = localStorage.getItem('refreshToken')
  if (token && !isAccessTokenExpired(token)) {
    authState.value = { kind: 'authenticated' }
    return
  }
  // accessToken 缺失或已过期：
  if (refreshToken) {
    // refreshToken 仍在：先置 guest（刷新失败时登录引导可接管），静默尝试刷新，成功切回 authenticated
    authState.value = { kind: 'guest' }
    void attemptRefresh()
  } else {
    // 无任何可用 token：清除陈旧 token，避免被误判为已登录（回归：stale token 401 死循环）
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    authState.value = { kind: 'guest' }
  }
}

export function useAuthState() {
  /** 将任意错误映射为对应态 */
  function handleError(error: unknown, detail?: unknown) {
    if (_isDeactivatedError(error)) {
      authState.value = { kind: 'deactivated', detail }
    } else if (_isNetworkError(error)) {
      authState.value = { kind: 'network_error', detail }
    } else if (_isForbiddenError(error)) {
      authState.value = { kind: 'forbidden', detail }
    } else if (_isTokenExpiredError(error)) {
      void attemptRefresh()
    }
  }

  /** 子页调用：需要登录态，否则自动跳转 */
  function requireAuth() {
    if (authState.value.kind === 'guest') {
      window.location.href = getPCLoginUrl()
      return false
    }
    if (authState.value.kind === 'token_expired') {
      window.location.href = getPCLoginUrl()
      return false
    }
    if (authState.value.kind === 'deactivated') {
      return false
    }
    return true
  }

  /** 子页调用：需要指定权限，否则切 forbidden */
  function requirePermission(permission: string): boolean {
    if (authState.value.kind !== 'authenticated') return false
    const userRaw = localStorage.getItem('user')
    if (!userRaw) return false
    try {
      const user = JSON.parse(userRaw) as Record<string, unknown>
      const role = user.role as Record<string, unknown> | undefined
      if (role?.permissions && Array.isArray(role.permissions)) {
        for (const p of role.permissions as unknown[]) {
          if (typeof p === 'string' && p === permission) return true
          if (p && typeof p === 'object' && (p as Record<string, unknown>).permission === permission) return true
        }
      }
    } catch {
      // ignore
    }
    authState.value = { kind: 'forbidden', detail: { missingPermission: permission } }
    return false
  }

  /** 显式切 guest（登出后） */
  function setGuest() {
    authState.value = { kind: 'guest' }
  }

  /** 显式切 authenticated（登录后） */
  function setAuthenticated() {
    authState.value = { kind: 'authenticated' }
  }

  /** 重置网络错误（重试后） */
  function clearNetworkError() {
    if (authState.value.kind === 'network_error') {
      authState.value = localStorage.getItem('accessToken') ? { kind: 'authenticated' } : { kind: 'guest' }
    }
  }

  initFromStorage()

  if (getCurrentInstance()) {
    onMounted(() => {
      window.addEventListener('storage', (e) => {
        if (e.key !== 'accessToken' && e.key !== null) return
        const token = localStorage.getItem('accessToken')
        const kind = authState.value.kind
        // 其他标签写入有效 token 时，从 guest / token_expired 恢复为 authenticated
        if (
          token &&
          !isAccessTokenExpired(token) &&
          (kind === 'guest' || kind === 'token_expired')
        ) {
          authState.value = { kind: 'authenticated' }
        }
      })
    })
  }

  const isGuest = computed(() => authState.value.kind === 'guest')
  const isAuthenticated = computed(() => authState.value.kind === 'authenticated')
  const isTokenExpired = computed(() => authState.value.kind === 'token_expired')
  const isNetworkError = computed(() => authState.value.kind === 'network_error')
  const isForbidden = computed(() => authState.value.kind === 'forbidden')
  const isDeactivated = computed(() => authState.value.kind === 'deactivated')

  return {
    authState,
    isGuest,
    isAuthenticated,
    isTokenExpired,
    isNetworkError,
    isForbidden,
    isDeactivated,
    refreshing,
    handleError,
    requireAuth,
    requirePermission,
    setGuest,
    setAuthenticated,
    clearNetworkError,
    attemptRefresh,
  }
}