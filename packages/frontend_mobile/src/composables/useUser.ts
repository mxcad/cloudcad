import { ref, readonly, onMounted, getCurrentInstance } from 'vue';
import {
  authTransferParamNames,
  parseAuthTransferQuery,
  hasAnyPermission,
} from '@cloudcad/platform';
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
  // 解析与参数名清单走 @cloudcad/platform（与 PC 拼参数侧共用同一份协议）。
  // 此前本文件手写 4 个字面量参数名：协议新增参数时这里的删除清单不会跟着长，
  // 已消费的凭证会残留在地址栏。
  const parsed = parseAuthTransferQuery(
    new URLSearchParams(window.location.search)
  );
  if (!parsed.credentials) return;

  const { accessToken, refreshToken, user } = parsed.credentials;
  localStorage.setItem('accessToken', accessToken);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  if (user) localStorage.setItem('user', user);

  const url = new URL(window.location.href);
  for (const name of authTransferParamNames()) {
    url.searchParams.delete(name);
  }
  window.history.replaceState({}, '', url.toString());

  // 只有 popup 窗口（移动端登录流程）才关闭自身；
  // _redirect=1 由桌面端注入标记桌面→移动端重定向，此时不关闭
  if (window.opener && !parsed.isRedirect) {
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
    return hasAnyPermission(
      (user.value as unknown as { role?: { permissions?: unknown } } | null)
        ?.role?.permissions,
      [permission]
    );
  }

  return {
    user: readonly(user),
    isAuthenticated: readonly(isAuthenticated),
    refresh,
    logout,
    hasPermission,
  };
}
