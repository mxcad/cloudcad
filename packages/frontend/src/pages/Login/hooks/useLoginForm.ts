///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { authControllerSendSmsCode } from '@/api-sdk';
import type { LoginDto } from '@/api-sdk';

export type LoginTab = 'account' | 'phone';

interface PhoneForm {
  phone: string;
  code: string;
}

export interface UseLoginFormReturn {
  // Form data
  formData: LoginDto;
  phoneForm: PhoneForm;
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
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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

  // Account login form state
  const [formData, setFormData] = useState<LoginDto>({
    account: '',
    password: '',
  });

  // Phone login form state
  const [phoneForm, setPhoneForm] = useState<PhoneForm>({
    phone: '',
    code: '',
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
    if (smsEnabled && mailEnabled) return '手机号、邮箱或用户名';
    if (smsEnabled) return '手机号或用户名';
    if (mailEnabled) return '邮箱或用户名';
    return '用户名';
  }, [smsEnabled, mailEnabled]);

  const getAccountLoginPlaceholder = useCallback(() => {
    if (smsEnabled && mailEnabled) return '请输入手机号、邮箱或用户名';
    if (smsEnabled) return '请输入手机号或用户名';
    if (mailEnabled) return '请输入邮箱或用户名';
    return '请输入用户名';
  }, [smsEnabled, mailEnabled]);

  // Account login input handler
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
    },
    [error]
  );

  // Phone login input handler (digits only)
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      if ((name === 'phone' || name === 'code') && value && !/^\d*$/.test(value)) {
        return;
      }
      setPhoneForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
    },
    [error]
  );

  // Send SMS code
  const handleSendCode = useCallback(async () => {
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setError('请输入正确的手机号');
      return;
    }

    setSendingCode(true);
    setError(null);

    try {
      const { data: response } = await authControllerSendSmsCode();
      if ((response as Record<string, unknown>)?.success) {
        setSuccess('验证码已发送');
        setCountdown(60);
      } else {
        setError(
          (response as { message?: string })?.message || '发送验证码失败'
        );
      }
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          '发送验证码失败'
      );
    } finally {
      setSendingCode(false);
    }
  }, [phoneForm.phone]);

  // Account login submit
  const handleAccountSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        await login(formData.account, formData.password);
        navigate('/');
      } catch (err: unknown) {
        const errorData = (
          err as Error & {
            response?: {
              data?: {
                code?: string;
                message?: string;
                email?: string;
                phone?: string;
                tempToken?: string;
              };
            };
          }
        ).response?.data;
        const errorMessage =
          errorData?.message ||
          (err as Error).message ||
          '登录失败，请检查账号和密码';

        if (errorMessage.includes('账号已被禁用')) {
          setShowSupportModal(true);
          return;
        }

        if (errorData?.code === 'EMAIL_NOT_VERIFIED') {
          navigate('/verify-email', {
            state: { email: errorData.email || '' },
          });
          return;
        }

        if (errorData?.code === 'EMAIL_REQUIRED') {
          navigate('/verify-email', {
            state: { tempToken: errorData.tempToken, mode: 'bind' },
          });
          return;
        }

        if (errorData?.code === 'PHONE_NOT_VERIFIED') {
          navigate('/verify-phone', {
            state: { phone: errorData.phone || '' },
          });
          return;
        }

        if (errorData?.code === 'PHONE_REQUIRED') {
          navigate('/verify-phone', {
            state: { tempToken: errorData.tempToken, mode: 'bind' },
          });
          return;
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [formData.account, formData.password, login, navigate]
  );

  // Phone login submit
  const handlePhoneSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
        setError('请输入正确的手机号');
        setLoading(false);
        return;
      }

      if (!phoneForm.code || !/^\d{6}$/.test(phoneForm.code)) {
        setError('请输入6位数字验证码');
        setLoading(false);
        return;
      }

      try {
        await loginByPhone(phoneForm.phone, phoneForm.code);
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
          errorData?.message || (err as Error).message || '登录失败，请重试';

        if (errorMessage.includes('账号已被禁用')) {
          setShowSupportModal(true);
          return;
        }

        if (errorCode === 'PHONE_NOT_REGISTERED') {
          navigate('/register', {
            state: {
              prefillPhone: phoneForm.phone,
              prefillCode: phoneForm.code,
            },
          });
          return;
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [phoneForm.phone, phoneForm.code, loginByPhone, navigate]
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
        '微信登录失败';
      setAuthError(errorMessage);
    }
  }, [loginWithWechat, setAuthError]);

  return {
    formData,
    phoneForm,
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
    handleChange,
    handlePhoneChange,
    handleSendCode,
    handleAccountSubmit,
    handlePhoneSubmit,
    handleWechatLogin,
    navigate,
  };
}
