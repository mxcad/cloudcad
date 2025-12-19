import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { components } from '../types/api';
import { authApi } from '../services/apiService';

type User = components['schemas']['UserDto'];

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (account: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    username: string;
    nickname?: string;
  }) => Promise<{ message: string; email: string }>;
  verifyEmailAndLogin: (token: string) => Promise<void>;
  logout: () => void;
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
      console.error('[AuthContext] 初始化认证状态失败:', error);
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
      console.log('[AuthContext] 验证 token 有效性');
      authApi
        .getProfile()
        .then((response) => {
          setUser(response.data);
          console.log('[AuthContext] Token验证成功');
        })
        .catch((error) => {
          console.error('[AuthContext] Token验证失败:', error);
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
    const response = await authApi.login({ account, password });
    const { accessToken, refreshToken, user: userData } = response.data;

    // 存储到本地存储
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));

    // 更新状态
    setToken(accessToken);
    setUser(userData);
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      username: string;
      nickname?: string;
    }) => {
      try {
        const response = await authApi.register(data);
        // 注册成功但不自动登录，返回注册成功信息
        console.log('[AuthContext] 注册成功，等待邮箱验证:', response.data);
        return response.data; // { message: string; email: string }
      } catch (error) {
        console.error('[AuthContext] 注册失败:', error);
        throw error;
      }
    },
    []
  );

  const verifyEmailAndLogin = useCallback(
    async (email: string, code: string) => {
      try {
        const response = await authApi.verifyEmail({ email, code });
        console.log('[AuthContext] 邮箱验证成功:', response.data);
        // 注意：现在验证邮箱不再返回 tokens，只是验证成功
        // 用户需要重新登录
      } catch (error) {
        console.error('[AuthContext] 邮箱验证失败:', error);
        throw error;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
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

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      login,
      register,
      verifyEmailAndLogin,
      logout,
      loading,
      isAuthenticated: !!token && !!user,
    }),
    [user, token, login, register, verifyEmailAndLogin, logout, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
