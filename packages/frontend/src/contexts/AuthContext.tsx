import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { getApiClient } from '../services/apiClient';
import type { LoginDto, RegisterDto, UserDto } from '../types/api-client';

type User = UserDto;

// 登录响应数据（axios 拦截器解包后的实际数据）
interface LoginResponseData {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (account: string, password: string) => Promise<void>;
  register: (data: {
    email?: string;
    password: string;
    username: string;
    nickname?: string;
  }) => Promise<{ message: string; email?: string }>;
  verifyEmailAndLogin: (email: string, code: string) => Promise<unknown>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
  isAuthenticated: boolean;
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

  // 异步验证 token
  useEffect(() => {
    if (token && user) {
      // 静默：验证 token 有效性
      getApiClient()
        .AuthController_getProfile()
        .then((response) => {
          const userData = response.data as UserDto;
          setUser(userData);
          // 同步更新 localStorage 中的用户数据（包含最新权限）
          localStorage.setItem('user', JSON.stringify(userData));
        })
        .catch((error) => {
          // Token 无效，清除本地存储
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        });
    }
  }, []); // 只在组件挂载时执行一次

  const login = useCallback(async (account: string, password: string) => {
    console.log('[AuthContext] 开始登录:', account);
    try {
      const response = await getApiClient().AuthController_login(null, {
        account,
        password,
      } as LoginDto);
      console.log('[AuthContext] 登录响应:', response);

      const {
        accessToken,
        refreshToken,
        user: userData,
      } = response.data as unknown as LoginResponseData;
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

  const register = useCallback(
    async (data: {
      email?: string;
      password: string;
      username: string;
      nickname?: string;
    }) => {
      const response = await getApiClient().AuthController_register(
        null,
        data as RegisterDto
      );
      // 注册成功但不自动登录，返回注册成功信息
      return response.data; // { message: string; email: string }
    },
    []
  );
  const verifyEmailAndLogin = useCallback(async (email: string, code: string) => {
    const response = await getApiClient().AuthController_verifyEmail(null, { email, code });
    // 注意：现在验证邮箱不再返回 tokens，只是验证成功
    // 用户需要重新登录
    return response.data;
  }, []);
  const logout = useCallback(async () => {
    try {
      await getApiClient().AuthController_logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // 清除本地存储
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');

      // 更新状态
      setToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await getApiClient().AuthController_getProfile();
      const userData = response.data as UserDto;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      login,
      register,
      verifyEmailAndLogin,
      logout,
      refreshUser,
      loading,
      isAuthenticated: !!token && !!user,
    }),
    [user, token, login, register, verifyEmailAndLogin, logout, refreshUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
