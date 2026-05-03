import { computed, onMounted, onUnmounted } from 'vue';
import { authApi, type AuthResponse } from '@/services/authApi';
import { useAuthStore } from '@/stores/auth.store';
import { useCadStore } from '@/stores/cad.store';

/**
 * 认证 Composable — 照搬 AuthContext.tsx 全部逻辑
 *
 * 来源：apps/frontend/src/contexts/AuthContext.tsx
 */
export function useAuth() {
  const store = useAuthStore();
  const cadStore = useCadStore();

  // ==================== 响应式派生状态 ====================

  const user = computed(() => store.user);
  const token = computed(() => store.token);
  const loading = computed(() => store.loading);
  const error = computed(() => store.error);
  const isAuthenticated = computed(() => !!store.token && !!store.user);

  // ==================== Token 验证（照搬 AuthContext validateToken） ====================

  let validateTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleValidation(): void {
    if (validateTimer) clearTimeout(validateTimer);
    // 300ms 延迟，避免组件刚挂载时状态不稳定（照搬 AuthContext 行126-128）
    validateTimer = setTimeout(doValidate, 300);
  }

  async function doValidate(): Promise<void> {
    if (!store.token || !store.user) return;
    store.loading = true;
    try {
      const res = await authApi.getProfile();
      store.user = res.data;
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 401) {
        // Token 无效，清除本地（不跳转，由路由守卫决定）
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        store.token = null;
        store.user = null;
      }
      // 其他错误不清除认证信息，apiClient 拦截器会自动刷新
    } finally {
      store.loading = false;
    }
  }

  // ==================== 登录（照搬 AuthContext login） ====================

  async function login(account: string, password: string): Promise<void> {
    try {
      const loginRes = await authApi.login(account, password);
      persistAuth(loginRes.data);
    } catch (err) {
      throw err; // 重新抛出让调用方处理错误回显
    }
  }

  /** 手机验证码登录（照搬 AuthContext loginByPhone 行176-211） */
  async function loginByPhone(phone: string, code: string): Promise<void> {
    try {
      const phoneRes = await authApi.loginByPhone(phone, code);
      persistAuth(phoneRes.data);
    } catch (err) {
      throw err;
    }
  }

  /** 微信登录（照搬 AuthContext loginWithWechat 行391-420） */
  async function loginWithWechat(): Promise<void> {
    try {
      const res = await authApi.getWechatAuthUrl({
        origin: window.location.origin,
        isPopup: 'true',
        purpose: 'login',
      });
      const { authUrl } = res as unknown as { authUrl: string };
      const w = 600, h = 600;
      window.open(
        authUrl,
        'wechat-auth',
        `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2},scrollbars=yes`,
      );
    } catch (err) {
      throw err;
    }
  }

  // ==================== 注册（照搬 AuthContext register 行213-254） ====================

  async function register(data: {
    email?: string;
    password: string;
    username: string;
    nickname?: string;
    wechatTempToken?: string;
  }): Promise<{ message: string; email?: string }> {
    const regRes = await authApi.register(data);
    const d = regRes.data as unknown as Record<string, unknown>;

    // 需要邮箱验证：后端返回 { message, email }，无 token
    if (d.message && !d.accessToken) {
      return { message: d.message as string, email: d.email as string | undefined };
    }

    // 直接注册成功：自动登录
    persistAuth(d as unknown as AuthResponse);
    return { message: '注册成功' };
  }

  // ==================== 验证并登录（照搬 verifyEmailAndLogin / verifyPhoneAndLogin） ====================

  async function verifyEmailAndLogin(email: string, code: string): Promise<unknown> {
    const vRes = await authApi.verifyEmailAndLogin(email, code);
    persistAuth((vRes as unknown as { data: AuthResponse }).data || vRes.data as unknown as AuthResponse);
    return vRes.data;
  }

  async function verifyPhoneAndLogin(phone: string, code: string): Promise<unknown> {
    const vpRes = await authApi.verifyPhoneAndLogin(phone, code);
    persistAuth((vpRes as unknown as { data: AuthResponse }).data || vpRes.data as unknown as AuthResponse);
    return vpRes.data;
  }

  // ==================== 登出（照搬 AuthContext logout 行300-343） ====================

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // 后端失败也清理本地状态
    } finally {
      // 清除 localStorage（照搬 行312-323）
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('personalSpaceId');
      try { localStorage.removeItem('mxcad-personal-space-id'); } catch { /* 忽略 */ }

      store.token = null;
      store.user = null;

      // 通知 CAD 引擎清理状态（照搬 行332-338）
      try { cadStore.clearCurrentFileInfo(); } catch { /* 忽略 */ }

      // 跳转到登录页（照搬 行341）
      window.location.href = '/login';
    }
  }

  // ==================== 刷新用户信息（照搬 AuthContext refreshUser 行345-355） ====================

  async function refreshUser(): Promise<void> {
    try {
      const res = await authApi.getProfile();
      store.user = res.data;
      localStorage.setItem('user', JSON.stringify(res.data));
    } catch (err) {
      console.error('[useAuth] 刷新用户信息失败:', err);
    }
  }

  // ==================== 微信登录结果监听（照搬 AuthContext storage 事件 行358-389） ====================

  function handleStorageChange(e: StorageEvent): void {
    if (e.key !== 'wechat_auth_result' || !e.newValue) return;
    try {
      const result = JSON.parse(e.newValue);
      localStorage.removeItem('wechat_auth_result');

      if (result.error) {
        store.error = result.error;
      } else if (result.accessToken) {
        persistAuth(result as AuthResponse);
      } else if (result.needRegister) {
        sessionStorage.setItem('wechatTempToken', result.tempToken);
        window.location.href = '/register?wechat=1';
      }
    } catch { /* 忽略 */ }
  }

  // ==================== 共享辅助 ====================

  /** 持久化认证 token + 用户信息（照搬 行155-167、192-204等多个位置） */
  function persistAuth(data: AuthResponse): void {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.removeItem('personalSpaceId'); // 清除旧用户缓存
    store.token = data.accessToken;
    store.user = data.user;
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    scheduleValidation();
    window.addEventListener('storage', handleStorageChange);
  });

  onUnmounted(() => {
    if (validateTimer) clearTimeout(validateTimer);
    window.removeEventListener('storage', handleStorageChange);
  });

  // ==================== 暴露（与 AuthContextType 一致） ====================

  return {
    user,
    token,
    login,
    loginByPhone,
    loginWithWechat,
    register,
    verifyEmailAndLogin,
    verifyPhoneAndLogin,
    logout,
    refreshUser,
    loading,
    isAuthenticated,
    error,
    setError: (e: string | null) => { store.error = e; },
  };
}
