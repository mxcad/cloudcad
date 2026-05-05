import { useState, useCallback } from 'react';
import { useProfile } from '../ProfileContext';
import { useVerificationCode } from './useVerificationCode';
import {
  authControllerSendBindEmailCode,
  authControllerVerifyBindEmail,
  authControllerSendUnbindEmailCode,
  authControllerVerifyUnbindEmailCode,
  authControllerRebindEmail,
} from '@/api-sdk';

export const useEmailTab = () => {
  const {
    user,
    setLoading,
    setError,
    setSuccess,
    refreshUser,
  } = useProfile();

  const [form, setForm] = useState({ email: '', code: '' });
  const [step, setStep] = useState<'input' | 'verify' | 'verifyOld' | 'inputNew' | 'verifyNew'>('input');
  const [isEditing, setIsEditing] = useState(false);
  const [verifyToken, setVerifyToken] = useState('');

  const verification = useVerificationCode({
    onSend: async (email: string, isForNewEmail = false) => {
      if (isForNewEmail) {
        await authControllerSendBindEmailCode({ body: { email, isRebind: true } });
      } else {
        await authControllerSendBindEmailCode({ body: { email } });
      }
    },
    onVerify: async (email: string, code: string) => {
      return await authControllerVerifyBindEmail({ body: { email, code } });
    },
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSendBindCode = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!form.email) {
      setError('请输入邮箱地址');
      setLoading(false);
      return;
    }
    try {
      await authControllerSendBindEmailCode({ body: { email: form.email } });
      setStep('verify');
      setSuccess('验证码已发送到您的邮箱');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        '发送验证码失败'
      );
    } finally {
      setLoading(false);
    }
  }, [form.email, setError, setLoading, setSuccess]);

  const handleVerifyBindEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authControllerVerifyBindEmail({ body: { email: form.email, code: form.code } });
      setSuccess('邮箱绑定成功');
      setStep('input');
      setForm({ email: '', code: '' });
      await refreshUser();
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        '验证失败'
      );
    } finally {
      setLoading(false);
    }
  }, [form.email, form.code, setError, setLoading, setSuccess, refreshUser]);

  const handleSendUnbindCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authControllerSendUnbindEmailCode() as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('验证码已发送到原邮箱');
        verification.resetCountdown();
      } else {
        setError(response?.message || '发送验证码失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        '发送验证码失败'
      );
    } finally {
      setLoading(false);
    }
  }, [setError, setLoading, setSuccess, verification]);

  const handleVerifyOldEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!form.code || !/^\d{6}$/.test(form.code)) {
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerVerifyUnbindEmailCode({
        body: { code: form.code },
      }) as unknown as { success?: boolean; message?: string; token?: string };
      if (response?.success) {
        setSuccess('原邮箱验证通过');
        setVerifyToken(response.token || '');
        setStep('inputNew');
        setForm({ email: '', code: '' });
      } else {
        setError(response?.message || '验证失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        '验证失败'
      );
    } finally {
      setLoading(false);
    }
  }, [form.code, setError, setLoading, setSuccess]);

  const handleSendNewEmailCode = useCallback(async () => {
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('请输入正确的邮箱地址');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authControllerSendBindEmailCode({ body: { email: form.email, isRebind: true } });
      setSuccess('验证码已发送');
      verification.resetCountdown();
      setStep('verifyNew');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        '发送验证码失败'
      );
    } finally {
      setLoading(false);
    }
  }, [form.email, setError, setLoading, setSuccess, verification]);

  const handleRebindEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('请输入正确的邮箱地址');
      setLoading(false);
      return;
    }
    if (!form.code || !/^\d{6}$/.test(form.code)) {
      setError('请输入 6 位数字验证码');
      setLoading(false);
      return;
    }
    if (!verifyToken) {
      setError('请先验证原邮箱');
      setLoading(false);
      return;
    }
    try {
      const response = await authControllerRebindEmail({
        body: { email: form.email, code: form.code, token: verifyToken },
      }) as unknown as { success?: boolean; message?: string };
      if (response?.success) {
        setSuccess('邮箱换绑成功');
        setStep('input');
        setForm({ email: '', code: '' });
        setVerifyToken('');
        setIsEditing(false);
        await refreshUser();
      } else {
        setError(response?.message || '换绑失败');
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err as Error).message ||
        '换绑失败'
      );
    } finally {
      setLoading(false);
    }
  }, [form.email, form.code, verifyToken, setError, setLoading, setSuccess, refreshUser]);

  const handleSetEditingEmail = useCallback((editing: boolean) => {
    if (editing) {
      setIsEditing(true);
      setStep('verifyOld');
      setForm({ email: '', code: '' });
      setError(null);
      setSuccess(null);
    } else {
      setIsEditing(false);
      setStep('input');
      setForm({ email: '', code: '' });
      setVerifyToken('');
      setError(null);
      setSuccess(null);
    }
  }, [setError, setSuccess]);

  return {
    form,
    step,
    isEditing,
    verifyToken,
    countdown: verification.countdown,
    sendingCode: verification.sendingCode,
    handleChange,
    handleSendBindCode,
    handleVerifyBindEmail,
    handleSendUnbindCode,
    handleVerifyOldEmail,
    handleSendNewEmailCode,
    handleRebindEmail,
    handleSetEditingEmail,
  };
};
