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
      authApi
        .getProfile()
        .then((response) => {
          setUser(response.data);
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
    const response = await authApi.login({ account, password });
    console.log('[AuthContext] 登录响应:', response);

    const { accessToken, refreshToken, user: userData } = response.data;
    console.log('[AuthContext] Access Token:', accessToken ? `${accessToken.substring(0, 20)}...` : 'missing');
    console.log('[AuthContext] Refresh Token:', refreshToken ? `${refreshToken.substring(0, 20)}...` : 'missing');

    // 存储到本地存储
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));

    console.log('[AuthContext] Token 已存储到 localStorage');

    // 创建 Session（用于 mxcad 上传权限验证）
    try {
      const sessionResponse = await fetch('/api/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 包含 cookies
        body: JSON.stringify({ user: userData }),
      });

      console.log('[AuthContext] Session 创建响应:', sessionResponse);

      if (sessionResponse.ok) {
        // Session 创建成功，继续
        console.log('[AuthContext] Session 创建成功');
      } else {
        // Session 创建失败，但仍然使用 JWT 认证
        console.error('Session creation failed');
      }
    } catch (error) {
      // Session 创建失败，但仍然使用 JWT 认证
      console.error('Session creation error:', error);
    }

    // 更新状态
    setToken(accessToken);
    setUser(userData);

    console.log('[AuthContext] 登录完成');
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      username: string;
      nickname?: string;
    }) => {
      const response = await authApi.register(data);
      // 注册成功但不自动登录，返回注册成功信息
      return response.data; // { message: string; email: string }
    },
    []
  );
  const verifyEmailAndLogin = useCallback(
    async (email: string, code: string) => {
      const response = await authApi.verifyEmail({ email, code });
      // 注意：现在验证邮箱不再返回 tokens，只是验证成功
      // 用户需要重新登录
      return response.data;
    },
    []
  );
  const logout = useCallback(async () => {
    try {
      await authApi.logout();

      // 清除 Session
      try {
        await fetch('/api/session/destroy', {
          method: 'POST',
          credentials: 'include', // 包含 cookies
        });
      } catch (error) {
        // Session 清除失败，但仍然清除本地状态
        console.error('Session destroy error:', error);
      }
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
