import { ref, readonly, onMounted, getCurrentInstance } from 'vue';
import {
  logout as logoutSession,
  onSessionChanged,
} from '../utils/authSession';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

/**
 * 从 URL 提取 PC 端登录后 redirect 回来的 token（跨端口开发场景）。
 * 新标签页加载时运行，存入 localStorage 后自动关闭。
 */
function extractTokensFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('accessToken');
  if (!accessToken) return;
  localStorage.setItem('accessToken', accessToken);
  const refreshToken = params.get('refreshToken');
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  const user = params.get('user');
  if (user) localStorage.setItem('user', user);
  const url = new URL(window.location.href);
  url.searchParams.delete('accessToken');
  url.searchParams.delete('refreshToken');
  url.searchParams.delete('user');
  window.history.replaceState({}, '', url.toString());
  // 只有 popup 窗口（移动端登录流程）才关闭自身，
  // 直接重定向（PC→移动端）时不关闭
  // _redirect=1 由桌面端 getMobileRedirectUrl() 注入，标记为桌面→移动端重定向
  const isRedirect = params.get('_redirect') === '1';
  if (window.opener && !isRedirect) {
    window.close();
  }
}
if (typeof window !== 'undefined') {
  extractTokensFromUrl();
}

function readUserFromStorage(): UserInfo | null {
  try {
    const raw = localStorage.getItem('user');
    if (raw) {
      return JSON.parse(raw) as UserInfo;
    }
  } catch {
    // ignore
  }
  return null;
}

function hasAuth(): boolean {
  return !!localStorage.getItem('accessToken');
}

const user = ref<UserInfo | null>(readUserFromStorage());
const isAuthenticated = ref(hasAuth());

function refreshUserState() {
  user.value = readUserFromStorage();
  isAuthenticated.value = hasAuth();
}

// 会话唯一出口（authSession）写入/清理后同步本状态机；
// 注册在模块加载时完成，早于任何组件调用 useUser()
onSessionChanged((event) => {
  if (event === 'written') {
    refreshUserState();
    return;
  }
  user.value = null;
  isAuthenticated.value = false;
});

export function useUser() {
  function refresh() {
    refreshUserState();
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      window.addEventListener('storage', refresh);
    });
  }

  async function logout() {
    // 统一失败协议在 authSession.logout：API 失败 toast 后仍清会话并跳登录
    await logoutSession();
  }

  function hasPermission(permission: string): boolean {
    if (!user.value) return false;
    const rolePermissions = (user.value as unknown as Record<string, unknown>)
      .role as Record<string, unknown> | undefined;
    if (
      !rolePermissions?.permissions ||
      !Array.isArray(rolePermissions.permissions)
    ) {
      return false;
    }
    for (const p of rolePermissions.permissions) {
      if (typeof p === 'string' && p === permission) return true;
      if (
        p &&
        typeof (p as Record<string, unknown>).permission === 'string' &&
        (p as Record<string, unknown>).permission === permission
      )
        return true;
    }
    return false;
  }

  return {
    user: readonly(user),
    isAuthenticated: readonly(isAuthenticated),
    refresh,
    logout,
    hasPermission,
  };
}
