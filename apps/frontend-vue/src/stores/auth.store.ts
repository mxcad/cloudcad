import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/**
 * 认证 Store（状态容器，规则二合规）
 *
 * 业务逻辑全部在 useAuth composable 中。
 * 这里只存状态和简单 getter。
 *
 * 来源：apps/frontend/src/contexts/AuthContext.tsx 状态部分
 */
export const useAuthStore = defineStore('auth', () => {
  // ===== State（照搬 AuthContext useState） =====
  const user = ref<UserDto | null>(null);
  const token = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ===== Getters =====
  const isAuthenticated = computed(() => !!token.value && !!user.value);

  // ===== 初始化：从 localStorage 恢复（照搬 AuthContext getInitialAuthState） =====
  const storedToken = localStorage.getItem('accessToken');
  const storedUser = localStorage.getItem('user');
  if (storedToken && storedUser) {
    try {
      token.value = storedToken;
      user.value = JSON.parse(storedUser);
    } catch { /* 静默 */ }
  }

  // ===== 简单 Actions（无 API 调用，规则二合规） =====
  function clearAuth(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('personalSpaceId');
    token.value = null;
    user.value = null;
  }

  return { user, token, loading, error, isAuthenticated, clearAuth };
});

/** 用户数据类型（与 React AuthContext User + authApi AuthResponse.user 一致） */
export interface UserDto {
  id: string;
  username: string;
  email?: string | null;
  nickname?: string;
  avatar?: string;
  phone?: string | null;
  phoneVerified?: boolean;
  hasPassword?: boolean;
  wechatId?: string | null;
  status?: string;
  createdAt?: string;
  lastLoginAt?: string;
  role?: {
    id: string;
    name: string;
    permissions?: { permission: string }[];
  };
}
