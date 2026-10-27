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
  triggerProactiveRefresh,
} from '@/config/clientSetup';
import { clearProjectPermissionsCache } from '@/utils/permissionUtils';
import { clearSavePermissionCache } from '@/services/mxcadManager/saveDefaults';
import { read, writeJson } from '@/lib/browserStorage';
import { isAccessTokenExpired, getUser } from '@/utils/tokenUtils';
import { clearAuthState, loadAuthState } from '@/lib/authState';
import { subscribeUserEvents } from '@/services/userEventStream';
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
  /**
   * 管理员独立入口登录（仅 ADMIN 角色 + IP 白名单可通过，见 /admin-login 页面）。
   * totpCode：已启用 TOTP 时必传；返回 mfaSetupRequired（未绑定管理员被锁定至绑定页）。
   * 返回 passwordChangeRequired（#416：首登未改密/超期，被锁定至强制改密页）。
   */
  adminLogin: (
    account: string,
    password: string,
    totpCode?: string
  ) => Promise<{
    mfaSetupRequired: boolean;
    passwordChangeRequired?: 'first_login' | 'expired';
  }>;
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
  /** 首启「创建首个管理员」（仅系统零用户时可用），成功后自动登录 */
  createFirstAdmin: (data: {
    username: string;
    password: string;
    email?: string;
    nickname?: string;
  }) => Promise<void>;
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
    const storedToken = read('accessToken');
    const storedUser = getUser();

    if (storedToken && storedUser) {
      return {
        token: storedToken,
        user: storedUser,
        loading: true, // will be set to false after token validation
      };
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
          clearAuthState();
          setToken(null);
          setUser(null);
          clearProjectPermissionsCache();
          clearSavePermissionCache();
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
            writeJson('user', userData);
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
      clearSavePermissionCache();
      cancelProactiveRefresh();
    };
    setAuthFailureCallback(clearAuthState);
    return () => setAuthFailureCallback(() => {});
  }, []);

  // 跨标签页同步：跟随认证三元组的存储快照对齐。storage 事件仅在其他标签页
  // 写入时触发（本标签页自身写入不触发），不会自我递归。
  // 清空 → 其他标签页登出，本标签页同步清除；写入 → 其他标签页登录/静默刷新，
  // 本标签页采用存储快照。setToken 会连带触发下方 [token] 的验证 effect 重跑
  // /auth/profile 校验（顺带刷新 user），此处不另写校验；该 effect 有 10s 超时
  // 兜底不会永久卡 loading，且 CAD 编辑器是全局覆盖层、不在 ProtectedRoute 内，
  // 不会因此闪全屏 spinner。本标签页后续请求自带校验能力：token 无效时
  // 401 → tryRefreshToken 自行收敛。
  // 登录按 accessToken → refreshToken → user 顺序落盘，单键事件到达时三元组
  // 可能尚未写全，缺 token 或 user 时跳过，等后续键的事件补齐。
  useEffect(() => {
    const handleCrossTabAuth = (e: StorageEvent) => {
      if (
        e.key !== 'accessToken' &&
        e.key !== 'refreshToken' &&
        e.key !== 'user'
      ) {
        return;
      }

      if (!e.newValue) {
        setToken(null);
        setUser(null);
        clearProjectPermissionsCache();
        clearSavePermissionCache();
        cancelProactiveRefresh();
        return;
      }

      const { accessToken, user: storedUser } = loadAuthState();
      if (!accessToken || !storedUser) return;

      setToken(accessToken);
      setUser(storedUser);
      triggerProactiveRefresh();
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
    createFirstAdmin,
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

  // 账户事件：管理员改会员等账户写操作后，后端经统一用户事件流推送 membership-changed，
  // 收到即 refreshUser() 重拉 /auth/profile，使已登录用户无需退出重登即拿到最新会员态。
  // 全浏览器共享一条 SSE（领导者选举 + 跨标签扇出，见 services/userEventStream，ADR-0083）；
  // 以 token/user 为依赖：登出（token 清空）或切换用户时退订（最后一个订阅者移除即关流放锁）。
  // 静默刷新 token 不需要重开流（统一流走一次性 ticket 鉴权，与 token 无关）。
  // 依赖 user?.id（稳定原始值）而非 user 对象：refreshUser 每次都会产生
  // 新 user 对象，依赖对象身份会让 effect 在每次刷新后重跑——退订使订阅数
  // 归零触发关流放锁，再订阅又重签 ticket 重开流，纯浪费且有事件空窗。
  useEffect(() => {
    if (!token || !user?.id) return undefined;
    const unsubscribe = subscribeUserEvents('account', () => {
      void refreshUser();
    });
    return unsubscribe;
  }, [token, user?.id, refreshUser]);

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
      createFirstAdmin,
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
      createFirstAdmin,
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
