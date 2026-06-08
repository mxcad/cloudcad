import { ref, readonly, onMounted } from 'vue';
import { authControllerGetProfile } from '../api-sdk';
import { triggerProactiveRefresh, cancelProactiveRefresh } from '../utils/apiConfig';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatar?: string;
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

function hasToken(): boolean {
  const at = localStorage.getItem('accessToken');
  const rt = localStorage.getItem('refreshToken');
  return !!(at || rt);
}

const user = ref<UserInfo | null>(readUserFromStorage());
const isAuthenticated = ref(hasToken());
const loading = ref(hasToken());

async function validateToken() {
  if (!hasToken()) {
    loading.value = false;
    return;
  }

  try {
    const res = await authControllerGetProfile();
    if (res.error) {
      throw res.error;
    }
    const profile = res.data as unknown as UserInfo;
    user.value = profile;
    isAuthenticated.value = true;
    localStorage.setItem('user', JSON.stringify(profile));
    triggerProactiveRefresh();
  } catch {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    user.value = null;
    isAuthenticated.value = false;
  } finally {
    loading.value = false;
  }
}

export function useUser() {
  function refresh() {
    user.value = readUserFromStorage();
    isAuthenticated.value = hasToken();
    if (isAuthenticated.value && !loading.value) {
      triggerProactiveRefresh();
    }
  }

  onMounted(() => {
    window.addEventListener('storage', refresh);
  });

  function logout() {
    cancelProactiveRefresh();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    user.value = null;
    isAuthenticated.value = false;
    window.location.href = '/login';
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
    loading: readonly(loading),
    refresh,
    logout,
    hasPermission,
  };
}

// 模块加载时立即执行一次 token 验证（不受 onMounted 限制）
// 使 useUser() 的消费者在组件挂载前就能拿到验证结果
if (typeof window !== 'undefined') {
  validateToken();
}
