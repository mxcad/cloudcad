import { useCallback, useState } from 'react';
import { authControllerGetWechatAuthUrl } from '@/api-sdk';
import { useWechatAuth } from '@/hooks/useWechatAuth';
import { isMobile as isMobileDevice } from 'react-device-detect';

export interface WechatLoginCallbacks {
  /** 登录页错误显示（form.setError）；未注册页面时回退 context error */
  onError: (error: string) => void;
  /** need_register 时是否携带"自动注册失败"提示（Login 页） */
  wechatAutoRegister: boolean;
  /** SPA 跳转（Login 页 react-router navigate） */
  navigateTo: (path: string, options?: { state?: unknown }) => void;
  /** 注销冷静期内自动恢复成功回调（Login 页 setSuccess 提示） */
  onRestored?: () => void;
  /** 注销冷静期已过回调（Login 页弹客服信息弹框） */
  onDeactivated?: (cleanupDays: number) => void;
}

export interface UseAuthWechatLoginOptions {
  setToken: (token: string | null) => void;
  setUser: (user: unknown) => void;
  setError: (error: string | null) => void;
}

export interface UseAuthWechatLoginResult {
  loginWithWechat: () => Promise<void>;
  setWechatLoginCallbacks: (callbacks: WechatLoginCallbacks | null) => void;
}

/**
 * AuthContext 微信登录编排：持有 useWechatAuth 的 login 唯一处理实例。
 *
 * 双实例竞态修复：AuthContext（Provider）是微信登录唯一处理实例——它持有
 * setToken/setUser，是登录态权威。Login 页不注册独立监听实例，仅通过
 * setWechatLoginCallbacks 注入页面级回调（navigate / setError / wechatAutoRegister），
 * 由本实例处理结果并更新登录态后调用回调。
 */
export function useAuthWechatLogin({
  setToken,
  setUser,
  setError,
}: UseAuthWechatLoginOptions): UseAuthWechatLoginResult {
  const [wechatCallbacks, setWechatCallbacksState] =
    useState<WechatLoginCallbacks | null>(null);

  const setWechatLoginCallbacks = useCallback(
    (callbacks: WechatLoginCallbacks | null) => {
      setWechatCallbacksState((prev) =>
        prev === callbacks ? prev : callbacks
      );
    },
    []
  );

  // 登录成功后：token 先写入 localStorage（handleLogin 内），这里同步 React state
  const handleWechatLoginSuccess = useCallback(
    (user: unknown, accessToken: string) => {
      setToken(accessToken);
      if (user) setUser(user);
    },
    [setToken, setUser]
  );

  useWechatAuth({
    // 页面（Login）注册了回调 → 页面展示错误；否则回退 context error（旧 AuthContext 行为）
    onError: (message) => {
      if (wechatCallbacks) {
        wechatCallbacks.onError(message);
      } else {
        setError(message);
      }
    },
    onLoginSuccess: handleWechatLoginSuccess,
    wechatAutoRegister: wechatCallbacks?.wechatAutoRegister ?? false,
    navigateTo: wechatCallbacks?.navigateTo,
    // 注销冷静期场景回调：页面注册了才生效（Login 页未挂载时静默）
    onRestored: () => wechatCallbacks?.onRestored?.(),
    onDeactivated: (cleanupDays) =>
      wechatCallbacks?.onDeactivated?.(cleanupDays),
  });

  const loginWithWechat = useCallback(async () => {
    console.log('[AuthContext] 开始微信登录');
    try {
      const response = await authControllerGetWechatAuthUrl({
        query: {
          origin: window.location.origin,
          isPopup: isMobileDevice ? 'false' : 'true',
          purpose: 'login',
          client: 'web',
          txn: '',
        },
      });
      if ((response as Record<string, unknown>).error)
        throw (response as Record<string, unknown>).error;
      const wechatData = response.data as unknown as {
        authUrl: string;
        transactionId: string;
      };
      const { authUrl } = wechatData;

      if (isMobileDevice) {
        window.location.href = authUrl;
        return;
      }

      const width = 600;
      const height = 600;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        authUrl,
        'wechat-auth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = authUrl;
      }
    } catch (error) {
      console.log('[AuthContext] 微信登录失败:', error);
      throw error;
    }
  }, []);

  return { loginWithWechat, setWechatLoginCallbacks };
}
