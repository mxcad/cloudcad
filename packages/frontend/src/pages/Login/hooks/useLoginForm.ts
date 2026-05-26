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
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current && countdown <= 0) {
        clearInterval(countdownRef.current);
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
      const { data: response } = await authControllerSendSmsCode({
        body: { phone: phoneValue },
      });
      if ((response as Record<string, unknown>)?.success) {
        setSuccess(t('验证码已发送'));
        setCountdown(60);
      } else {
        setError(
          (response as { message?: string })?.message || t('发送验证码失败')
        );
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
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
        await login(account, password);
        navigate('/');
      } catch (err: unknown) {
        const errAny = err as Record<string, unknown>;
        const errResponse = errAny?.response as Record<string, unknown> | undefined;
        const errorData = errResponse?.data as Record<string, unknown> | undefined;

        const errorBody = (errorData ?? errAny) as Record<string, unknown>;

        const errorMessage =
          (errorBody?.message as string) ||
          (err as Error).message ||
          t('登录失败，请检查账号和密码');

        if (errorMessage.includes('账号已被禁用')) {
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
        await loginByPhone(phone, code);
        navigate('/');
      } catch (err: unknown) {
        const errorData = (
          err as Error & {
            response?: {
              data?: { code?: string; message?: string; phone?: string };
            };
          }
        ).response?.data;
        const errorCode = errorData?.code;
        const errorMessage =
          errorData?.message || (err as Error).message || t('登录失败，请重试');

        if (errorMessage.includes('账号已被禁用')) {
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
        (err as Error & { response?: { data?: { message?: string } } })
          .response?.data?.message ||
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
