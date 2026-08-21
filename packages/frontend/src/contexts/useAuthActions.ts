import { useCallback } from 'react';
import {
  authControllerLogin,
  authControllerLoginByPhone,
  authControllerRegister,
  authControllerRegisterByPhone,
  authControllerGetProfile,
  authControllerLogout,
  authControllerVerifyEmail,
  authControllerVerifyPhone,
  adminAuthControllerLogin,
} from '@/api-sdk';
import type { UserDto } from '@/api-sdk';
import { t } from '@/languages';
import {
  triggerProactiveRefresh,
  cancelProactiveRefresh,
} from '@/config/clientSetup';
import { setAccessToken, setRefreshToken } from '@/utils/tokenUtils';
import { clearProjectPermissionsCache } from '@/utils/permissionUtils';

export interface User extends UserDto {
  membershipTierLevel?: number;
  membershipExpiresAt?: string | null;
}

export interface UseAuthActionsOptions {
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
}

export interface RegisterPayload {
  email?: string;
  password: string;
  username: string;
  nickname?: string;
  wechatTempToken?: string;
}

export interface UseAuthActionsResult {
  /** 返回注销冷静期内自动恢复标记（true=登录同时已自动取消注销） */
  login: (account: string, password: string) => Promise<boolean>;
  /**
   * 管理员独立入口登录（POST /admin/auth/login）：
   * 仅 ADMIN 角色 + IP 白名单可通过；成功即写入标准登录态，
   * 复用既有刷新/鉴权链路进入管理后台。
   */
  adminLogin: (account: string, password: string) => Promise<boolean>;
  /** 返回注销冷静期内自动恢复标记（true=登录同时已自动取消注销） */
  loginByPhone: (phone: string, code: string) => Promise<boolean>;
  register: (
    data: RegisterPayload
  ) => Promise<{ message: string; email?: string | undefined }>;
  registerByPhone: (data: {
    phone: string;
    code: string;
    username: string;
    password: string;
    nickname?: string;
  }) => Promise<void>;
  verifyEmailAndLogin: (email: string, code: string) => Promise<unknown>;
  verifyPhoneAndLogin: (phone: string, code: string) => Promise<unknown>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
}

/**
 * 认证动作集合（登录/注册/验证/登出/刷新用户）。
 * 由 AuthContext 注入 setToken/setUser 装配，保证登录态写入 React state 的唯一出口
 * 仍在 AuthProvider 内。
 */
export function useAuthActions({
  setToken,
  setUser,
}: UseAuthActionsOptions): UseAuthActionsResult {
  const login = useCallback(
    async (account: string, password: string): Promise<boolean> => {
      const response = await authControllerLogin({
        body: { account, password },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;

      const {
        accessToken,
        refreshToken,
        user: userData,
        restored,
      } = apiResponse;

      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.removeItem('personalSpaceId');
      setToken(accessToken);
      userData && setUser(userData);
      triggerProactiveRefresh();

      return !!restored;
    },
    [setToken, setUser]
  );

  const loginByPhone = useCallback(
    async (phone: string, code: string): Promise<boolean> => {
      const response = await authControllerLoginByPhone({
        body: { phone, code },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;

      const {
        accessToken,
        refreshToken,
        user: userData,
        restored,
      } = apiResponse;

      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.removeItem('personalSpaceId');
      setToken(accessToken);
      setUser(userData);
      triggerProactiveRefresh();

      return !!restored;
    },
    [setToken, setUser]
  );

  // 自动登录：保存 token + 更新 React state + 启动主动刷新
  // register / registerByPhone 共用（T4：手机号注册路径 token 写入唯一出口）
  const applyAuthData = useCallback(
    (authData: { accessToken: string; refreshToken: string; user: User }) => {
      const { accessToken, refreshToken, user: userData } = authData;

      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      // 启动主动 token 刷新
      triggerProactiveRefresh();
    },
    [setToken, setUser]
  );

  /**
   * 管理员独立入口登录（与普通 login 共用登录态写入，但走专用接口）。
   * 复用 applyAuthData 保证 accessToken/refreshToken/user 写入与主动刷新一致，
   * 进入管理后台后复用既有鉴权/权限链路。
   */
  const adminLogin = useCallback(
    async (account: string, password: string): Promise<boolean> => {
      const response = await adminAuthControllerLogin({
        body: { account, password },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;

      const { accessToken, refreshToken, user: userData } = apiResponse;

      applyAuthData({
        accessToken,
        refreshToken: refreshToken || '',
        user: userData as unknown as User,
      });
      return false;
    },
    [applyAuthData]
  );

  const register = useCallback(
    async (
      data: RegisterPayload
    ): Promise<{ message: string; email?: string | undefined }> => {
      const response = await authControllerRegister({
        body: data,
      });
      if (response.error) throw response.error;
      const authData = response.data!;

      // 如果 API 返回的 data 为空，抛出错误
      if (!authData) {
        throw new Error(t('注册失败，服务器返回数据异常'));
      }

      // 直接注册成功：后端返回 { accessToken, refreshToken, user }
      applyAuthData(
        authData as unknown as {
          accessToken: string;
          refreshToken: string;
          user: User;
        }
      );

      return { message: t('注册成功') };
    },
    [applyAuthData]
  );

  const registerByPhone = useCallback(
    async (data: {
      phone: string;
      code: string;
      username: string;
      password: string;
      nickname?: string;
    }): Promise<void> => {
      const response = await authControllerRegisterByPhone({
        body: data,
      });
      if (response.error) throw response.error;
      const authData = response.data as {
        accessToken?: string;
        refreshToken?: string;
        user?: User;
      };

      if (authData?.accessToken) {
        applyAuthData({
          accessToken: authData.accessToken,
          refreshToken: authData.refreshToken || '',
          user: (authData.user ?? {}) as User,
        });
      }
    },
    [applyAuthData]
  );

  const verifyEmailAndLogin = useCallback(
    async (email: string, code: string) => {
      const response = await authControllerVerifyEmail({
        body: { email, code },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;

      // 验证成功，返回 token，自动登录
      const { accessToken, refreshToken, user: userData } = apiResponse;

      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      // 启动主动 token 刷新
      triggerProactiveRefresh();

      return apiResponse;
    },
    [setToken, setUser]
  );

  const verifyPhoneAndLogin = useCallback(
    async (phone: string, code: string) => {
      const response = await authControllerVerifyPhone({
        body: { phone, code },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;
      const { accessToken, refreshToken, user: userData } = apiResponse;

      setAccessToken(accessToken);
      setRefreshToken(refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      // 启动主动 token 刷新
      triggerProactiveRefresh();

      return apiResponse;
    },
    [setToken, setUser]
  );

  const logout = useCallback(async () => {
    console.log('[AuthContext] 开始退出登录');
    try {
      // 1. 调用后端 API 注销（清理 JWT + Session + Cookie）
      await authControllerLogout();
      console.log('[AuthContext] 后端注销成功');
    } catch (error) {
      console.error('[AuthContext] 后端注销失败:', error);
      // 即使后端失败，也要清除本地状态
    } finally {
      // 2. 清除本地存储
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('personalSpaceId'); // 清除私人空间 ID 缓存

      // 清除其他可能的缓存
      try {
        // 清除 mxcad 相关缓存
        localStorage.removeItem('mxcad-personal-space-id');
      } catch (error) {
        console.warn('[AuthContext] 清除额外缓存失败:', error);
      }

      // 3. 更新状态
      setToken(null);
      setUser(null);

      // 4. 清除项目权限内存缓存（防止切换账号后权限串用）
      clearProjectPermissionsCache();

      // 4. 取消主动 token 刷新定时器
      cancelProactiveRefresh();

      console.log('[AuthContext] 本地状态已清除');

      // 4. 通知 drawingSession 清理状态
      try {
        const { closeSession } = await import('@/services/drawingSession');
        closeSession();
      } catch (error) {
        console.warn('[AuthContext] 清理 drawingSession 状态失败:', error);
      }

      // 5. 跳转到登录页（保留当前页面作为 redirect，登录成功后跳回原页面）
      const currentPath = window.location.pathname + window.location.search;
      if (currentPath !== '/login' && currentPath !== '/register') {
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }
  }, [setToken, setUser]);

  // 刷新用户信息：失败返回 false 并记录日志，不 throw——
  // 调用方（绑定/解绑/支付成功）在 refreshUser 之后还有成功态 UI 更新，
  // 刷新失败不应回滚成功流程（401 由 fetch wrapper 处理，5xx 有全局 toast）
  const refreshUser = useCallback(async (): Promise<boolean> => {
    const response = await authControllerGetProfile();
    if (response.error) {
      console.error('Refresh user error:', response.error);
      return false;
    }
    const userData = response.data as unknown as User;
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    return true;
  }, [setUser]);

  return {
    login,
    adminLogin,
    loginByPhone,
    register,
    registerByPhone,
    verifyEmailAndLogin,
    verifyPhoneAndLogin,
    logout,
    refreshUser,
  };
}
