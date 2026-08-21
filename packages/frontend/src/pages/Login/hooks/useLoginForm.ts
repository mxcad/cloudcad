///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { authControllerSendSmsCode } from '@/api-sdk';
import { t } from '@/languages';
import {
  accountLoginSchema,
  phoneLoginSchema,
  type AccountLoginValues,
  type PhoneLoginValues,
} from './loginFormSchema';

export type LoginTab = 'account' | 'phone';

export interface UseLoginFormReturn {
  // Account form (react-hook-form)
  accountForm: ReturnType<typeof useForm<AccountLoginValues>>;
  // Phone form (react-hook-form)
  phoneFormHook: ReturnType<typeof useForm<PhoneLoginValues>>;
  // Runtime config flags
  smsEnabled: boolean;
  // Tab
  activeTab: LoginTab;
  setActiveTab: (tab: LoginTab) => void;
  // UI state
  loading: boolean;
  error: string | null;
  setError: (err: string | null) => void;
  success: string | null;
  setSuccess: (msg: string | null) => void;
  focusedField: string | null;
  setFocusedField: (field: string | null) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  // SMS countdown
  countdown: number;
  sendingCode: boolean;
  // Support modal
  showSupportModal: boolean;
  setShowSupportModal: (show: boolean) => void;
  /** 客服弹框场景：disabled=账号被禁用，deactivated=账号已注销且已过冷静期 */
  supportModalVariant: 'disabled' | 'deactivated';
  setSupportModalVariant: (variant: 'disabled' | 'deactivated') => void;
  /** 注销场景：数据彻底删除延迟天数 */
  supportModalCleanupDays: number;
  setSupportModalCleanupDays: (days: number) => void;
  // Auth error from context
  authError: string | null;
  setAuthError: (err: string | null) => void;
  // Account login labels
  getAccountLoginLabel: () => string;
  getAccountLoginPlaceholder: () => string;
  // Handlers
  handleSendCode: () => Promise<void>;
  handleAccountSubmit: (e: React.FormEvent) => Promise<void>;
  handlePhoneSubmit: (e: React.FormEvent) => Promise<void>;
  handleWechatLogin: () => Promise<void>;
  // Navigate
  navigate: ReturnType<typeof useNavigate>;
}

export function useLoginForm(): UseLoginFormReturn {
  const navigate = useNavigate();
  const {
    login,
    loginByPhone,
    loginWithWechat,
    error: authError,
    setError: setAuthError,
  } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();

  const smsEnabled = runtimeConfig?.smsEnabled ?? false;
  const mailEnabled = runtimeConfig?.mailEnabled ?? false;

  // Tab state
  const [activeTab, setActiveTab] = useState<LoginTab>('account');

  // react-hook-form for account login
  const accountForm = useForm<AccountLoginValues>({
    resolver: zodResolver(accountLoginSchema),
    defaultValues: {
      account: '',
      password: '',
    },
  });

  // react-hook-form for phone login
  const phoneFormHook = useForm<PhoneLoginValues>({
    resolver: zodResolver(phoneLoginSchema),
    defaultValues: {
      phone: '',
      code: '',
    },
  });

  // Shared UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // SMS countdown
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Support modal
  const [showSupportModal, setShowSupportModal] = useState(false);
  /** 客服弹框场景：disabled=账号被禁用，deactivated=账号已注销且已过冷静期（联系客服恢复） */
  const [supportModalVariant, setSupportModalVariant] = useState<
    'disabled' | 'deactivated'
  >('disabled');
  /** 注销场景：数据彻底删除延迟天数 */
  const [supportModalCleanupDays, setSupportModalCleanupDays] = useState(30);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const id = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);
      countdownRef.current = id;
    }
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [countdown > 0]);

  // Account login labels based on runtime config
  const getAccountLoginLabel = useCallback(() => {
    if (smsEnabled && mailEnabled) return t('手机号、邮箱或用户名');
    if (smsEnabled) return t('手机号或用户名');
    if (mailEnabled) return t('邮箱或用户名');
    return t('用户名');
  }, [smsEnabled, mailEnabled]);

  const getAccountLoginPlaceholder = useCallback(() => {
    if (smsEnabled && mailEnabled) return t('请输入手机号、邮箱或用户名');
    if (smsEnabled) return t('请输入手机号或用户名');
    if (mailEnabled) return t('请输入邮箱或用户名');
    return t('请输入用户名');
  }, [smsEnabled, mailEnabled]);

  // Send SMS code
  const handleSendCode = useCallback(async () => {
    const phoneValue = phoneFormHook.getValues('phone');

    // Validate phone via zod schema manually
    const result = phoneLoginSchema.shape.phone.safeParse(phoneValue);
    if (!result.success) {
      setError(result.error.issues[0]?.message || t('请输入正确的手机号'));
      return;
    }

    setSendingCode(true);
    setError(null);

    try {
      const res = await authControllerSendSmsCode({
        body: { phone: phoneValue },
      });
      // SDK 默认不抛错：失败时响应体在 result.error，成功数据在 result.data
      if (res.error) throw res.error;
      if ((res.data as Record<string, unknown> | undefined)?.success) {
        setSuccess(t('验证码已发送'));
        setCountdown(60);
      } else {
        setError(
          (res.data as { message?: string } | undefined)?.message ||
            t('发送验证码失败')
        );
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    } finally {
      setSendingCode(false);
    }
  }, [phoneFormHook]);

  // Account login submit
  const handleAccountSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      const valid = await accountForm.trigger();
      if (!valid) {
        setLoading(false);
        return;
      }

      const { account, password } = accountForm.getValues();

      try {
        const restored = await login(account, password);
        // 桌面端 OAuth 验证未完成时，留在登录页等待验证成功
        if (sessionStorage.getItem('desktop_redirect_uri')) {
          return;
        }
        if (restored) {
          // 注销冷静期内登录自动恢复：提示用户后跳转（与注销成功处理一致，延迟跳转让提示可见）
          setSuccess(t('您的账户已自动恢复，注销已取消'));
          setTimeout(() => navigate('/'), 1500);
          return;
        }
        navigate('/');
      } catch (err: unknown) {
        const errAny = err as Record<string, unknown>;
        const errResponse = errAny?.response as
          Record<string, unknown> | undefined;
        const errorData = errResponse?.data as
          Record<string, unknown> | undefined;

        const errorBody = (errorData ?? errAny) as Record<string, unknown>;

        const errorMessage =
          (errorBody?.message as string) ||
          (err as Error).message ||
          t('登录失败，请检查账号和密码');

        if (errorBody?.code === 'ACCOUNT_DEACTIVATED') {
          setSupportModalVariant('deactivated');
          setSupportModalCleanupDays(Number(errorBody?.cleanupDays) || 30);
          setShowSupportModal(true);
          return;
        }

        if (errorBody?.code === 'EMAIL_NOT_VERIFIED') {
          navigate('/verify-email', {
            state: { email: (errorBody?.email as string) || '' },
          });
          return;
        }

        if (errorBody?.code === 'EMAIL_REQUIRED') {
          navigate('/verify-email', {
            state: { tempToken: errorBody?.tempToken as string, mode: 'bind' },
          });
          return;
        }

        if (errorBody?.code === 'PHONE_NOT_VERIFIED') {
          navigate('/verify-phone', {
            state: { phone: (errorBody?.phone as string) || '' },
          });
          return;
        }

        if (errorBody?.code === 'PHONE_REQUIRED') {
          navigate('/verify-phone', {
            state: { tempToken: errorBody?.tempToken as string, mode: 'bind' },
          });
          return;
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [accountForm, login, navigate]
  );

  // Phone login submit
  const handlePhoneSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      const valid = await phoneFormHook.trigger();
      if (!valid) {
        setLoading(false);
        return;
      }

      const { phone, code } = phoneFormHook.getValues();

      try {
        const restored = await loginByPhone(phone, code);
        // 桌面端 OAuth 验证未完成时，留在登录页等待验证成功
        if (sessionStorage.getItem('desktop_redirect_uri')) {
          return;
        }
        if (restored) {
          // 注销冷静期内登录自动恢复：提示用户后跳转（与注销成功处理一致，延迟跳转让提示可见）
          setSuccess(t('您的账户已自动恢复，注销已取消'));
          setTimeout(() => navigate('/'), 1500);
          return;
        }
        navigate('/');
      } catch (err: unknown) {
        // 与账号路径一致：SDK 抛错形状可能变化（response.data 或直接错误体），两层兜底读取
        const errAny = err as Record<string, unknown>;
        const errResponse = errAny?.response as
          | {
              data?: {
                code?: string;
                message?: string;
                phone?: string;
                cleanupDays?: number;
              };
            }
          | undefined;
        const errorData = (errResponse?.data ?? errAny) as {
          code?: string;
          message?: string;
          phone?: string;
          cleanupDays?: number;
        };
        const errorCode = errorData?.code;
        const errorMessage =
          errorData?.message || (err as Error).message || t('登录失败，请重试');

        if (errorCode === 'ACCOUNT_DEACTIVATED') {
          setSupportModalVariant('deactivated');
          setSupportModalCleanupDays(Number(errorData?.cleanupDays) || 30);
          setShowSupportModal(true);
          return;
        }

        if (errorCode === 'PHONE_NOT_REGISTERED') {
          navigate('/register', {
            state: {
              prefillPhone: phone,
              prefillCode: code,
            },
          });
          return;
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [phoneFormHook, loginByPhone, navigate]
  );

  // WeChat login
  const handleWechatLogin = useCallback(async () => {
    try {
      setAuthError(null);
      await loginWithWechat();
    } catch (err: unknown) {
      const errorMessage =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        t('微信登录失败');
      setAuthError(errorMessage);
    }
  }, [loginWithWechat, setAuthError]);

  return {
    accountForm,
    phoneFormHook,
    smsEnabled,
    activeTab,
    setActiveTab,
    loading,
    error,
    setError,
    success,
    setSuccess,
    focusedField,
    setFocusedField,
    showPassword,
    setShowPassword,
    countdown,
    sendingCode,
    showSupportModal,
    setShowSupportModal,
    supportModalVariant,
    setSupportModalVariant,
    supportModalCleanupDays,
    setSupportModalCleanupDays,
    authError,
    setAuthError,
    getAccountLoginLabel,
    getAccountLoginPlaceholder,
    handleSendCode,
    handleAccountSubmit,
    handlePhoneSubmit,
    handleWechatLogin,
    navigate,
  };
}
