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

import { ref, computed, onMounted, getCurrentInstance } from 'vue';
import { refreshTokensOnce } from '../utils/apiConfig';
import { navigateToLogin } from '../utils/authNavigate';
import {
  clearSession,
  isTokenExpired as isJwtExpired,
  onSessionChanged,
  readToken,
} from '../utils/authSession';
import { errorKind } from '../utils/apiError';

export type AuthStateKind =
  | 'guest'
  | 'authenticated'
  | 'token_expired'
  | 'network_error'
  | 'forbidden'
  | 'deactivated';

export interface AuthState {
  kind: AuthStateKind;
  /** 态附带信息，如 forbidden 的错误详情 */
  detail?: unknown;
}

const initialState: AuthState = { kind: 'guest' };

const authState = ref<AuthState>(initialState);
const refreshing = ref(false);

// 会话唯一出口（authSession）写入/清理后同步本状态机；
// 注册在模块加载时完成，早于任何组件调用 useAuthState()
onSessionChanged((event) => {
  if (event === 'written') {
    authState.value = { kind: 'authenticated' };
    return;
  }
  if (authState.value.kind !== 'guest') {
    authState.value = { kind: 'guest' };
  }
});

// 错误类别判定委托 apiError.errorKind（单一出口）；kind 语义：
// unauthorized = 401/UNAUTHORIZED/AUTH_TOKEN_*，forbidden = 403/FORBIDDEN/PERMISSION_DENIED，
// deactivated = ACCOUNT_DEACTIVATED，network = ERR_NETWORK 等 + TypeError 网络形态
function _isTokenExpiredError(error: unknown): boolean {
  return errorKind(error) === 'unauthorized';
}

function _isForbiddenError(error: unknown): boolean {
  return errorKind(error) === 'forbidden';
}

function _isNetworkError(error: unknown): boolean {
  return errorKind(error) === 'network';
}

function _isDeactivatedError(error: unknown): boolean {
  return errorKind(error) === 'deactivated';
}

/**
 * 静默刷新 token；成功切回 authenticated，失败切 token_expired。
 * 实际刷新委托 apiConfig.refreshTokensOnce（唯一刷新出口，与 fetch 层 401 刷新共享 in-flight 去重），
 * 避免两条路径各自消费轮换制 refresh token 互相作废。
 */
async function attemptRefresh(): Promise<boolean> {
  if (refreshing.value) return false;
  refreshing.value = true;
  try {
    const ok = await refreshTokensOnce();
    if (ok) {
      authState.value = { kind: 'authenticated' };
      return true;
    }
    authState.value = { kind: 'token_expired' };
    return false;
  } catch {
    authState.value = { kind: 'token_expired' };
    return false;
  } finally {
    refreshing.value = false;
  }
}

function initFromStorage() {
  const token = readToken();
  const refreshToken = localStorage.getItem('refreshToken');
  if (token && !isJwtExpired(token)) {
    authState.value = { kind: 'authenticated' };
    return;
  }
  // accessToken 缺失或已过期：
  if (refreshToken) {
    // refreshToken 仍在：先置 guest（刷新失败时登录引导可接管），静默尝试刷新，成功切回 authenticated
    authState.value = { kind: 'guest' };
    void attemptRefresh();
  } else {
    // 无任何可用 token：清除陈旧 token（走唯一清理出口，同步 useUser 状态机），
    // 避免被误判为已登录（回归：stale token 401 死循环）
    clearSession();
    authState.value = { kind: 'guest' };
  }
}

export function useAuthState() {
  /** 将任意错误映射为对应态 */
  function handleError(error: unknown, detail?: unknown) {
    if (_isDeactivatedError(error)) {
      authState.value = { kind: 'deactivated', detail };
    } else if (_isNetworkError(error)) {
      authState.value = { kind: 'network_error', detail };
    } else if (_isForbiddenError(error)) {
      authState.value = { kind: 'forbidden', detail };
    } else if (_isTokenExpiredError(error)) {
      void attemptRefresh();
    }
  }

  /** 子页调用：需要登录态，否则自动跳转 */
  function requireAuth() {
    if (authState.value.kind === 'guest') {
      navigateToLogin();
      return false;
    }
    if (authState.value.kind === 'token_expired') {
      navigateToLogin();
      return false;
    }
    if (authState.value.kind === 'deactivated') {
      return false;
    }
    return true;
  }

  /** 子页调用：需要指定权限，否则切 forbidden */
  function requirePermission(permission: string): boolean {
    if (authState.value.kind !== 'authenticated') return false;
    const userRaw = localStorage.getItem('user');
    if (!userRaw) return false;
    try {
      const user = JSON.parse(userRaw) as Record<string, unknown>;
      const role = user.role as Record<string, unknown> | undefined;
      if (role?.permissions && Array.isArray(role.permissions)) {
        for (const p of role.permissions as unknown[]) {
          if (typeof p === 'string' && p === permission) return true;
          if (
            p &&
            typeof p === 'object' &&
            (p as Record<string, unknown>).permission === permission
          )
            return true;
        }
      }
    } catch {
      // ignore
    }
    authState.value = {
      kind: 'forbidden',
      detail: { missingPermission: permission },
    };
    return false;
  }

  /** 显式切 guest（登出后） */
  function setGuest() {
    authState.value = { kind: 'guest' };
  }

  /** 显式切 authenticated（登录后） */
  function setAuthenticated() {
    authState.value = { kind: 'authenticated' };
  }

  /** 重置网络错误（重试后） */
  function clearNetworkError() {
    if (authState.value.kind === 'network_error') {
      authState.value = readToken()
        ? { kind: 'authenticated' }
        : { kind: 'guest' };
    }
  }

  initFromStorage();

  if (getCurrentInstance()) {
    onMounted(() => {
      window.addEventListener('storage', (e) => {
        if (e.key !== 'accessToken' && e.key !== null) return;
        const token = readToken();
        const kind = authState.value.kind;
        // 其他标签写入有效 token 时，从 guest / token_expired 恢复为 authenticated
        if (
          token &&
          !isJwtExpired(token) &&
          (kind === 'guest' || kind === 'token_expired')
        ) {
          authState.value = { kind: 'authenticated' };
        }
      });
    });
  }

  const isGuest = computed(() => authState.value.kind === 'guest');
  const isAuthenticated = computed(
    () => authState.value.kind === 'authenticated'
  );
  const isTokenExpired = computed(
    () => authState.value.kind === 'token_expired'
  );
  const isNetworkError = computed(
    () => authState.value.kind === 'network_error'
  );
  const isForbidden = computed(() => authState.value.kind === 'forbidden');
  const isDeactivated = computed(() => authState.value.kind === 'deactivated');

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
  };
}
