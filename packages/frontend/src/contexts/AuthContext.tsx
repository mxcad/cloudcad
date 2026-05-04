import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { getApiClientAsync } from '../services/apiClient';
import { authApi } from '../services/authApi';
import type {
  LoginDto,
  RegisterDto,
  UserDto,
  AuthApiResponseDto,
} from '../types/api-client';

type User = UserDto;

// 登录响应数据（axios 拦截器解包后的实际数据）
type AuthResponseData = AuthApiResponseDto['data'];

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
          loading: false,
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
    // 避免在初始化时立即验证，给后端服务一点启动时间
    const validateToken = async () => {
      if (token && user) {
        setLoading(true);
        try {
          // 静默：验证 token 有效性
          const client = await getApiClientAsync();
          const response = await client.AuthController_getProfile();
          const userData = response.data as unknown as UserDto;
          setUser(userData);
          // 同步更新 localStorage 中的用户数据（包含最新权限）
          localStorage.setItem('user', JSON.stringify(userData));
        } catch (error) {
          // 只在明确的 401 错误时清除认证信息，但不自动跳转
          // 由各个路由组件根据自己的保护级别决定是否跳转
          const axiosError = error as { response?: { status?: number } };
          if (axiosError.response?.status === 401) {
            // Token 确实无效，清除本地存储（但不跳转）
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            setToken(null);
            setUser(null);
          }
          // 其他错误（如网络错误、5xx 等）不清除认证信息，避免误判
          // 因为 apiClient 拦截器会自动尝试刷新 token
        } finally {
          setLoading(false);
        }
      }
    };

    // 延迟验证，避免组件刚挂载时状态不稳定
    const timer = setTimeout(validateToken, 300);
    return () => clearTimeout(timer);
  }, [token]); // 依赖 token，当 token 变化时重新验证

  const login = useCallback(async (account: string, password: string) => {
    console.log('[AuthContext] 开始登录:', account);
    try {
      const client = await getApiClientAsync();
      const response = await client.AuthController_login(null, {
        account,
        password,
      } as LoginDto);
      console.log('[AuthContext] 登录响应:', response);

      const {
        accessToken,
        refreshToken,
        user: userData,
      } = response.data as unknown as AuthResponseData;
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
      const client = await getApiClientAsync();
      const response = await client.AuthController_loginByPhone(null, {
        phone,
        code,
      });
      console.log('[AuthContext] 手机登录响应:', response);

      const {
        accessToken,
        refreshToken,
        user: userData,
      } = response.data as unknown as AuthResponseData;

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
      const client = await getApiClientAsync();
      const response = await client.AuthController_register(
        null,
        data as RegisterDto
      );

      const responseData = response.data as unknown as Record<string, unknown>;

      // 需要邮箱验证：后端返回 { message, email }，无 token
      if (responseData.message && !responseData.accessToken) {
        return {
          message: responseData.message as string,
          email: responseData.email as string | undefined,
        };
      }

      // 直接注册成功：后端返回 { accessToken, refreshToken, user }
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = responseData as unknown as AuthResponseData;

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
      const client = await getApiClientAsync();
      const response = await client.AuthController_verifyEmail(null, {
        email,
        code,
      });
      // 验证成功，返回 token，自动登录
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = response.data as unknown as AuthResponseData;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      return response.data;
    },
    []
  );

  const verifyPhoneAndLogin = useCallback(
    async (phone: string, code: string) => {
      const response = await authApi.verifyPhone(phone, code);
      const {
        accessToken,
        refreshToken,
        user: userData,
      } = response.data as unknown as AuthResponseData;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(accessToken);
      setUser(userData);

      return response.data;
    },
    []
  );

  const logout = useCallback(async () => {
    console.log('[AuthContext] 开始退出登录');
    try {
      // 1. 调用后端 API 注销（清理 JWT + Session + Cookie）
      const client = await getApiClientAsync();
      await client.AuthController_logout();
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
      const client = await getApiClientAsync();
      const response = await client.AuthController_getProfile();
      const userData = response.data as unknown as UserDto;
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

          if (result.error) {
            console.error('微信登录失败:', result.error);
            setError(result.error);
          } else if (result.accessToken) {
            // 登录成功
            localStorage.setItem('accessToken', result.accessToken);
            localStorage.setItem('refreshToken', result.refreshToken);
            localStorage.setItem('user', JSON.stringify(result.user));
            setToken(result.accessToken);
            setUser(result.user);
          } else if (result.needRegister) {
            // 需要注册
            sessionStorage.setItem('wechatTempToken', result.tempToken);
            window.location.href = '/register?wechat=1';
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
      const { authApi } = await import('../services/authApi');
      const response = await authApi.getWechatAuthUrl({
        origin: window.location.origin,
        isPopup: 'true',
        purpose: 'login',
      });
      const { authUrl } = response.data as { authUrl: string };

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
