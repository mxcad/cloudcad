import { ref, readonly, onMounted } from 'vue';
import { getPCLoginUrl } from '../utils/apiConfig';

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
  window.close();
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

export function useUser() {
  function refresh() {
    user.value = readUserFromStorage();
    isAuthenticated.value = hasAuth();
  }

  onMounted(() => {
    window.addEventListener('storage', refresh);
  });

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    user.value = null;
    isAuthenticated.value = false;
    window.location.href = getPCLoginUrl();
  }

  function hasPermission(permission: string): boolean {
    if (!user.value) return false;
    const rolePermissions = (user.value as unknown as Record<string, unknown>).role as
      Record<string, unknown> | undefined;
    if (!rolePermissions?.permissions || !Array.isArray(rolePermissions.permissions)) {
      return false;
    }
    for (const p of rolePermissions.permissions) {
      if (typeof p === 'string' && p === permission) return true;
      if (p && typeof (p as Record<string, unknown>).permission === 'string' &&
        (p as Record<string, unknown>).permission === permission) return true;
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
