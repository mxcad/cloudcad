import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from 'react';
import { authControllerGetProfile } from '@/api-sdk';
import type { UserDto } from '@/api-sdk';
import {
  setTokenRefreshCallback,
  setAuthFailureCallback,
  cancelProactiveRefresh,
} from '@/config/clientSetup';
import { clearProjectPermissionsCache } from '@/utils/permissionUtils';
import {
  isAccessTokenExpired,
  removeAccessToken,
  removeRefreshToken,
} from '@/utils/tokenUtils';
import {
  useAuthActions,
  type User,
  type RegisterPayload,
} from './useAuthActions';
import {
  useAuthWechatLogin,
  type WechatLoginCallbacks,
} from './useAuthWechatLogin';

interface AuthContextType {
  user: User | null;
  token: string | null;
  /** 返回注销冷静期内自动恢复标记（true=登录同时已自动取消注销） */
  login: (account: string, password: string) => Promise<boolean>;
  /** 管理员独立入口登录（仅 ADMIN 角色 + IP 白名单可通过，见 /admin-login 页面） */
  adminLogin: (account: string, password: string) => Promise<boolean>;
  /** 返回注销冷静期内自动恢复标记（true=登录同时已自动取消注销） */
  loginByPhone: (phone: string, code: string) => Promise<boolean>;
  loginWithWechat: () => Promise<void>;
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
  /**
   * 微信登录页面级回调注册（Login 页挂载时调用，卸载时传 null）。
   * AuthContext 持有 useWechatAuth 的 login 唯一处理实例（双实例竞态修复），
   * 页面通过此方法注入 navigate/setError/wechatAutoRegister。
   */
  setWechatLoginCallbacks: (callbacks: WechatLoginCallbacks | null) => void;
  loading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // 同步初始化，避免闪烁
  const getInitialAuthState = () => {
    try {
      const storedToken = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        return {
          token: storedToken,
          user: JSON.parse(storedUser),
          loading: true, // will be set to false after token validation
        };
      }
    } catch (error) {
      // 静默：初始化认证状态失败
    }

    return {
      token: null,
      user: null,
      loading: false,
    };
  };

  const initialState = getInitialAuthState();
  const [user, setUser] = useState<UserDto | null>(initialState.user);
  const [token, setToken] = useState<string | null>(initialState.token);
  const [loading, setLoading] = useState<boolean>(initialState.loading);
  const [error, setError] = useState<string | null>(null);

  // 异步验证 token - 只在 token 存在且用户信息存在时执行
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const validateToken = async () => {
      if (token && user) {
        // 本地 accessToken 已过期（如残留失效 token）：视为未登录，直接降级游客，
        // 不发起 /auth/profile 请求，避免未登录场景产生 401 控制台噪音。
        if (isAccessTokenExpired()) {
          removeAccessToken();
          removeRefreshToken();
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
          clearProjectPermissionsCache();
          cancelProactiveRefresh();
          return;
        }

        setLoading(true);

        // 安全超时：10秒后强制结束loading，防止API挂起导致永久卡死
        timeoutId = setTimeout(() => {
          setLoading(false);
        }, 10000);

        try {
          const response = await authControllerGetProfile();
          if (response.data) {
            const userData = response.data as unknown as User;
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
          } else if ((response as Record<string, unknown>).error) {
            // API返回了错误，但token可能仍有效，保留用户信息
            console.warn(
              '[AuthContext] Token验证返回错误:',
              (response as Record<string, unknown>).error
            );
            setLoading(false);
          }
        } catch (error) {
          const fetchError = error as { status?: number; message?: string };
          console.error(
            '[AuthContext] Token 验证失败:',
            fetchError.status,
            fetchError.message
          );
          // clientSetup.ts 的 fetch wrapper 已经处理了 401 → 刷新 token → 重试/跳转登录
          // 此处不再独立清除 token，避免与 clientSetup 刷新/跳转逻辑冲突
        } finally {
          clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    };

    validateToken();

    return () => clearTimeout(timeoutId);
  }, [token]); // 依赖 token，当 token 变化时重新验证

  // Register callback so SDK can notify React state after silent token refresh
  useEffect(() => {
    setTokenRefreshCallback((newAccessToken: string) => {
      setToken(newAccessToken);
    });
    return () => setTokenRefreshCallback(() => {});
  }, []);

  // Register auth failure callback: clears React state immediately (before redirect)
  useEffect(() => {
    const clearAuthState = () => {
      setToken(null);
      setUser(null);
      clearProjectPermissionsCache();
      cancelProactiveRefresh();
    };
    setAuthFailureCallback(clearAuthState);
    return () => setAuthFailureCallback(() => {});
  }, []);

  // 跨标签页同步：其他标签页登出/清除 token 时，本标签页同步清除
  useEffect(() => {
    const handleCrossTabAuth = (e: StorageEvent) => {
      if (
        (e.key === 'accessToken' || e.key === 'refreshToken') &&
        !e.newValue
      ) {
        setToken(null);
        setUser(null);
        clearProjectPermissionsCache();
        cancelProactiveRefresh();
      }
    };
    window.addEventListener('storage', handleCrossTabAuth);
    return () => window.removeEventListener('storage', handleCrossTabAuth);
  }, []);

  const {
    login,
    adminLogin,
    loginByPhone,
    register,
    registerByPhone,
    verifyEmailAndLogin,
    verifyPhoneAndLogin,
    logout,
    refreshUser,
  } = useAuthActions({
    setToken,
    setUser: (u) => setUser(u as User | null),
  });

  const { loginWithWechat, setWechatLoginCallbacks } = useAuthWechatLogin({
    setToken,
    setUser: (u) => setUser(u as User | null),
    setError,
  });

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      login,
      adminLogin,
      loginByPhone,
      loginWithWechat,
      register,
      registerByPhone,
      verifyEmailAndLogin,
      verifyPhoneAndLogin,
      logout,
      refreshUser,
      setWechatLoginCallbacks,
      loading,
      isAuthenticated: !!token && !!user,
      error,
      setError,
    }),
    [
      user,
      token,
      login,
      adminLogin,
      loginByPhone,
      loginWithWechat,
      register,
      registerByPhone,
      verifyEmailAndLogin,
      verifyPhoneAndLogin,
      logout,
      refreshUser,
      setWechatLoginCallbacks,
      loading,
      error,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
