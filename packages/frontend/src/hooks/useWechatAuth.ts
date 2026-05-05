import { useEffect, useCallback, useRef } from 'react';
import { authControllerGetWechatAuthUrl } from '@/api-sdk';

export type WechatPurpose = 'login' | 'bind' | 'deactivate';

export interface WechatAuthOptions {
  purpose: WechatPurpose;
  onSuccess?: (data: {
    code?: string;
    state?: string;
    accessToken?: string;
    refreshToken?: string;
    user?: unknown;
    needRegister?: boolean;
    tempToken?: string;
    error?: string;
  }) => void;
  onError?: (error: string) => void;
}

export interface WechatAuthResult {
  open: () => Promise<void>;
}

/**
 * 通用微信授权 Hook
 * 核心逻辑：直接跳转授权页面，授权后从 hash 解析结果
 */
export function useWechatAuth(options: WechatAuthOptions): WechatAuthResult {
  const { purpose, onSuccess, onError } = options;
  const loadingRef = useRef(false);
  const processedRef = useRef(false);

  const clearHash = useCallback(() => {
    if (window.location.hash.includes('wechat_result')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const checkHashResult = useCallback(() => {
    if (processedRef.current) return;

    const hash = window.location.hash;
    if (!hash.includes('wechat_result')) return;

    try {
      const hashValue = hash.split('wechat_result=')[1];
      if (!hashValue) return;

      const result = JSON.parse(decodeURIComponent(hashValue));
      console.log(
        '[useWechatAuth] 解析 hash 结果:',
        result,
        'purpose:',
        purpose
      );

      if (result.purpose !== purpose) {
        console.log('[useWechatAuth] purpose 不匹配, 忽略');
        return;
      }

      processedRef.current = true;
      clearHash();

      if (result.error) {
        onError?.(result.error);
      } else if (result.code || result.accessToken) {
        console.log('[useWechatAuth] 调用 onSuccess');
        onSuccess?.(result);
      }
    } catch (e) {
      console.error('解析微信授权结果失败', e);
    }
  }, [purpose, onSuccess, onError, clearHash]);

  useEffect(() => {
    checkHashResult();
    const handleHashChange = () => checkHashResult();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [checkHashResult]);

  const open = useCallback(async () => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    processedRef.current = false;
    try {
      const response = await authControllerGetWechatAuthUrl({
        query: {
          origin: window.location.origin,
          isPopup: 'false',
          purpose,
        },
      });

      console.log('[useWechatAuth] 跳转授权页面, purpose:', purpose);
      const { authUrl } = response as unknown as { authUrl: string };
      window.location.href = authUrl;
    } catch (err) {
      console.error('[useWechatAuth] 获取授权链接失败:', err);
      const errorMsg =
        (err as Error & { response?: { data?: { message?: string } } })
          ?.response?.data?.message ||
        (err as Error).message ||
        '获取授权链接失败';
      onError?.(errorMsg);
    } finally {
      loadingRef.current = false;
    }
  }, [purpose, onError]);

  return { open };
}