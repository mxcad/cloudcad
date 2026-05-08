import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  authControllerLogin,
  authControllerLoginByPhone,
  authControllerRegister,
  authControllerGetProfile,
  authControllerLogout,
  authControllerVerifyEmail,
  authControllerVerifyPhone,
  authControllerGetWechatAuthUrl,
} from '@/api-sdk';
import type { UserDto as UserDtoType } from '@/api-sdk';
import { setTokenRefreshCallback } from '@/config/clientSetup';
import { classifyWechatAuthResult } from '@/utils/wechat-auth-result';

type User = UserDtoType;

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (account: string, password: string) => Promise<void>;
  loginByPhone: (phone: string, code: string) => Promise<void>;
  loginWithWechat: () => Promise<void>;
  register: (data: {
    email?: string;
    password: string;
    username: string;
    nickname?: string;
  }) => Promise<{ message: string; email?: string }>;
  verifyEmailAndLogin: (email: string, code: string) => Promise<unknown>;
  verifyPhoneAndLogin: (phone: string, code: string) => Promise<unknown>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(initialState.user);
  const [token, setToken] = useState<string | null>(initialState.token);
  const [loading, setLoading] = useState<boolean>(initialState.loading);
  const [error, setError] = useState<string | null>(null);

  // 异步验证 token - 只在 token 存在且用户信息存在时执行
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const validateToken = async () => {
      if (token && user) {
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
          } else if (response.error) {
            // API返回了错误，但token可能仍有效，保留用户信息
            console.warn('[AuthContext] Token验证返回错误:', response.error);
            setLoading(false);
          }
        } catch (error) {
          const fetchError = error as { status?: number; message?: string };
          console.error('[AuthContext] Token 验证失败:', fetchError.status, fetchError.message);
          // Clear auth state on any error during token validation.
          // Without this, a network timeout or server error would leave
          // loading=true indefinitely, permanently blocking the app.
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
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

  const login = useCallback(async (account: string, password: string) => {
    console.log('[AuthContext] 开始登录:', account);
    try {
      const response = await authControllerLogin({
        body: { account, password },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;
      console.log('[AuthContext] 登录响应:', apiResponse);
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = apiResponse;
   
      console.log(
        '[AuthContext] Access Token:',
        accessToken ? `${accessToken.substring(0, 20)}...` : 'missing'
      );
      console.log(
        '[AuthContext] Refresh Token:',
        refreshToken ? `${refreshToken.substring(0, 20)}...` : 'missing'
      );

      // 存储到本地存储
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));

      // 清除旧用户的私人空间 ID 缓存，确保不会使用上一个用户的缓存
      localStorage.removeItem('personalSpaceId');

      console.log('[AuthContext] Token 已存储到 localStorage');

      // 更新状态
      setToken(accessToken);
      setUser(userData);

      console.log('[AuthContext] 登录完成');
    } catch (error) {
      console.log('[AuthContext] 登录失败:', error);
      // 重新抛出错误，让调用方处理
      throw error;
    }
  }, []);

  const loginByPhone = useCallback(async (phone: string, code: string) => {
    console.log('[AuthContext] 开始手机号登录:', phone);
    try {
      const response = await authControllerLoginByPhone({
        body: { phone, code },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;
      console.log('[AuthContext] 手机登录响应:', apiResponse);

      const {
        accessToken,
        refreshToken,
        user: userData,
      } = apiResponse;

      // 存储到本地存储
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));

      console.log('[AuthContext] 手机登录 Token 已存储到 localStorage');

      // 清除旧用户的私人空间 ID 缓存，确保不会使用上一个用户的缓存
      localStorage.removeItem('personalSpaceId');

      // 更新状态
      setToken(accessToken);
      setUser(userData);

      console.log('[AuthContext] 手机登录完成');
    } catch (error) {
      console.log('[AuthContext] 手机登录失败:', error);
      throw error;
    }
  }, []);

  const register = useCallback(
    async (data: {
      email?: string;
      password: string;
      username: string;
      nickname?: string;
      wechatTempToken?: string;
    }): Promise<{ message: string; email?: string }> => {
      const response = await authControllerRegister({
        body: data,
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;

      // 需要邮箱验证：后端返回 { message, email }，无 token
      if (apiResponse.message && !apiResponse.accessToken) {
        return {
          message: apiResponse.message,
          email: (apiResponse as unknown as Record<string, unknown>).email as string | undefined,
        };
      }

      // 直接注册成功：后端返回 { accessToken, refreshToken, user }
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = apiResponse;

      // 自动登录，保存 token
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      return { message: '注册成功' };
    },
    []
  );
  const verifyEmailAndLogin = useCallback(
    async (email: string, code: string) => {
      const response = await authControllerVerifyEmail({
        body: { email, code },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;

      // 验证成功，返回 token，自动登录
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = apiResponse;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      return apiResponse;
    },
    []
  );

  const verifyPhoneAndLogin = useCallback(
    async (phone: string, code: string) => {
      const response = await authControllerVerifyPhone({
        body: { phone, code },
      });
      if (response.error) throw response.error;
      const apiResponse = response.data!;
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = apiResponse;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      return apiResponse;
    },
    []
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

      console.log('[AuthContext] 本地状态已清除');

      // 4. 通知 mxcadManager 清理状态
      try {
        const { clearCurrentFileInfo } =
          await import('../services/mxcadManager');
        clearCurrentFileInfo();
      } catch (error) {
        console.warn('[AuthContext] 清理 mxcadManager 状态失败:', error);
      }

      // 5. 跳转到登录页
      window.location.href = '/login';
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authControllerGetProfile();
      if (response.error) throw response.error;
      const userData = response.data as unknown as User;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  }, []);

  // 监听弹窗通过 localStorage 传递的登录结果
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'wechat_auth_result' && e.newValue) {
        try {
          const result = JSON.parse(e.newValue);
          // 清理 localStorage
          localStorage.removeItem('wechat_auth_result');

          const action = classifyWechatAuthResult(result);
          if (action?.type === 'error') {
            console.error('微信登录失败:', action.message);
            setError(action.message);
          } else if (action?.type === 'login') {
            localStorage.setItem('accessToken', action.accessToken);
            localStorage.setItem('refreshToken', action.refreshToken);
            localStorage.setItem('user', JSON.stringify(action.user));
            setToken(action.accessToken);
            setUser(action.user as User);
          } else if (action?.type === 'need_register') {
            sessionStorage.setItem('wechatTempToken', action.tempToken);
            window.location.href = '/register?wechat=1';
          } else if (action?.type === 'bind_email') {
            sessionStorage.setItem('wechatTempToken', action.tempToken);
            window.location.href = '/verify-email';
          } else if (action?.type === 'bind_phone') {
            sessionStorage.setItem('wechatTempToken', action.tempToken);
            window.location.href = '/verify-phone';
          }
        } catch (err) {
          console.error('解析微信登录结果失败', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loginWithWechat = useCallback(async () => {
    console.log('[AuthContext] 开始微信登录');
    try {
      // 1. 获取微信授权 URL
      const response = await authControllerGetWechatAuthUrl({
        query: {
          origin: window.location.origin,
          isPopup: 'true',
          purpose: 'login',
        },
      });
      if (response.error) throw response.error;
      const wechatData = response.data as unknown as { authUrl: string };
      const { authUrl } = wechatData;

      console.log('[AuthContext] 微信授权 URL:', authUrl);

      // 2. 打开微信授权页面（弹窗方式）
      const width = 600;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      window.open(
        authUrl,
        'wechat-auth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
    } catch (error) {
      console.log('[AuthContext] 微信登录失败:', error);
      throw error;
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
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
      isAuthenticated: !!token && !!user,
      error,
      setError,
    }),
    [
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
      error,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
