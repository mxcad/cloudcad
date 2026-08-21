import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailBind } from './useEmailBind';
import { useCountdown } from './useCountdown';
import { useNotification } from '@/contexts/NotificationContext';
import { t } from '@/languages';

export type EmailStep =
  'input' | 'verify' | 'verifyOld' | 'inputNew' | 'verifyNew';

export interface EmailFormState {
  email: string;
  code: string;
}

interface UseEmailProfileOptions {
  error: string | null;
  success: string | null;
  setError: (e: string | null) => void;
  setSuccess: (e: string | null) => void;
  setLoading: (v: boolean) => void;
}

export function useEmailProfile({
  error,
  success,
  setError,
  setSuccess,
  setLoading,
}: UseEmailProfileOptions) {
  const { refreshUser } = useAuth();
  const {
    sendBindCode,
    verifyBindEmail,
    sendUnbindCode,
    verifyUnbindEmail,
    rebindEmail,
    unbindEmail,
  } = useEmailBind();
  const { showToast, showConfirm } = useNotification();

  const [emailForm, setEmailForm] = useState<EmailFormState>({
    email: '',
    code: '',
  });
  const [emailStep, setEmailStep] = useState<EmailStep>('input');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailVerifyToken, setEmailVerifyToken] = useState<string>('');
  // 解绑模式：verifyOld 验证通过后直接解绑（而非进入换绑新邮箱流程）
  const [unbindMode, setUnbindMode] = useState(false);
  // 倒计时/发送中状态仅在邮箱绑定流程内持有，避免与其他验证流程（手机号/注销）串扰
  const { countdown, setCountdown } = useCountdown();
  const [sendingCode, setSendingCode] = useState(false);

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setEmailForm((prev) => ({ ...prev, [name]: value }));
      if (error) setError(null);
      if (success) setSuccess(null);
    },
    [error, success, setError, setSuccess]
  );

  const handleSendBindCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!emailForm.email) {
      setError(t('请输入邮箱地址'));
      setLoading(false);
      return;
    }
    try {
      await sendBindCode({ email: emailForm.email });
      setCountdown(60);
      setEmailStep('verify');
      setSuccess(t('验证码已发送到您的邮箱'));
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendBindCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      await sendBindCode({ email: emailForm.email });
      setSuccess(t('验证码已重新发送到您的邮箱'));
      setCountdown(60);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyBindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyBindEmail({ email: emailForm.email, code: emailForm.code });
      setSuccess(t('邮箱绑定成功'));
      setEmailStep('input');
      setEmailForm({ email: '', code: '' });
      setCountdown(0);
      await refreshUser();
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('验证失败')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendUnbindEmailCode = async () => {
    setSendingCode(true);
    setError(null);
    try {
      const response = await sendUnbindCode();
      if (response?.success) {
        setSuccess(t('验证码已发送到原邮箱'));
        setCountdown(60);
      } else {
        setError(response?.message || t('发送验证码失败'));
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyOldEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!emailForm.code || !/^\d{6}$/.test(emailForm.code)) {
      setError(t('请输入 6 位数字验证码'));
      setLoading(false);
      return;
    }
    const code = emailForm.code;
    try {
      if (unbindMode) {
        // 解绑模式：unbind-email 接口自行验证原邮箱验证码并解绑。
        // 验证码一次性，不能先 verifyUnbindEmail 消费后再传同一 code
        await performUnbind(code);
        return;
      }
      const response = await verifyUnbindEmail({ code });
      if (response?.success) {
        setCountdown(0);
        setEmailVerifyToken(response.token || '');
        setEmailStep('inputNew');
        setEmailForm({ email: '', code: '' });
      } else {
        setError(response?.message || t('验证失败'));
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('验证失败')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSetEditingEmail = (editing: boolean) => {
    if (editing) {
      // 换绑入口：确保退出解绑模式
      setUnbindMode(false);
      setIsEditingEmail(true);
      setEmailStep('verifyOld');
      setEmailForm({ email: '', code: '' });
      setError(null);
      setSuccess(null);
    } else {
      setIsEditingEmail(false);
      setEmailStep('input');
      setEmailForm({ email: '', code: '' });
      setEmailVerifyToken('');
      setUnbindMode(false);
      setError(null);
      setSuccess(null);
    }
  };

  const handleSendNewEmailCode = async () => {
    if (
      !emailForm.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)
    ) {
      setError(t('请输入正确的邮箱地址'));
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      await sendBindCode({ email: emailForm.email, isRebind: true });
      setSuccess(t('验证码已发送'));
      setCountdown(60);
      setEmailStep('verifyNew');
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    } finally {
      setSendingCode(false);
    }
  };

  const handleRebindEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (
      !emailForm.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.email)
    ) {
      setError(t('请输入正确的邮箱地址'));
      setLoading(false);
      return;
    }
    if (!emailForm.code || !/^\d{6}$/.test(emailForm.code)) {
      setError(t('请输入 6 位数字验证码'));
      setLoading(false);
      return;
    }
    if (!emailVerifyToken) {
      setError(t('请先验证原邮箱'));
      setLoading(false);
      return;
    }
    try {
      const response = await rebindEmail({
        email: emailForm.email,
        code: emailForm.code,
        token: emailVerifyToken,
      });
      if (response?.success) {
        setSuccess(t('邮箱换绑成功'));
        setEmailStep('input');
        setEmailForm({ email: '', code: '' });
        setEmailVerifyToken('');
        setCountdown(0);
        setIsEditingEmail(false);
        await refreshUser();
      } else {
        setError(response?.message || t('换绑失败'));
      }
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('换绑失败')
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * 执行解绑（必须携带已通过验证的原邮箱验证码）
   */
  const performUnbind = async (code: string) => {
    const response = await unbindEmail({ code });
    if (response?.success) {
      showToast(t('邮箱解绑成功'), 'success');
      setSuccess(t('邮箱解绑成功'));
      setCountdown(0);
      setEmailForm({ email: '', code: '' });
      setEmailVerifyToken('');
      setIsEditingEmail(false);
      setUnbindMode(false);
      await refreshUser();
    } else {
      setError(response?.message || t('解绑失败'));
      showToast(response?.message || t('解绑失败'), 'error');
    }
  };

  /**
   * 开始解绑：确认后进入原邮箱验证码流程（验证通过后直接解绑）
   */
  const handleStartUnbind = async () => {
    const confirmed = await showConfirm({
      title: t('解绑邮箱'),
      message: t('确定要解绑邮箱吗？解绑后将无法通过邮箱找回密码。'),
      confirmText: t('确认解绑'),
      cancelText: t('取消'),
      type: 'warning',
    });
    if (!confirmed) return;
    setUnbindMode(true);
    setIsEditingEmail(true);
    setEmailStep('verifyOld');
    setEmailForm({ email: '', code: '' });
    setError(null);
    setSuccess(null);
  };

  return {
    emailForm,
    setEmailForm,
    emailStep,
    isEditingEmail,
    setIsEditingEmail,
    setEmailStep,
    emailVerifyToken,
    countdown,
    sendingCode,
    handleEmailChange,
    handleSendBindCode,
    handleResendBindCode,
    handleVerifyBindEmail,
    handleSendUnbindEmailCode,
    handleVerifyOldEmail,
    handleSetEditingEmail,
    handleSendNewEmailCode,
    handleRebindEmail,
    handleStartUnbind,
    unbindMode,
  };
}
