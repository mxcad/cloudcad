import { useState, useEffect, useCallback } from 'react';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { t } from '@/languages';
import { RESEND_COOLDOWN_SECONDS } from '../constants';

interface UseResendEmailParams {
  email: string;
  onError: (message: string | null) => void;
  onEmailSent: () => void;
}

export function useResendEmail({
  email,
  onError,
  onEmailSent,
}: UseResendEmailParams) {
  const { resendVerification } = useEmailVerification();

  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResendEmail = useCallback(async () => {
    if (!email) {
      onError(t('请先输入邮箱地址'));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      onError(t('请输入有效的邮箱地址'));
      return;
    }

    if (resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    onError(null);
    setResendSuccess(false);

    try {
      await resendVerification({ email });
      setResendSuccess(true);
      onEmailSent();
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err) {
      const errorMessage =
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
        (err as Error).message ||
        t('发送失败，请稍后重试');
      onError(errorMessage);
    } finally {
      setResendLoading(false);
    }
  }, [
    email,
    resendCooldown,
    resendLoading,
    onError,
    onEmailSent,
    resendVerification,
  ]);

  return {
    resendLoading,
    resendCooldown,
    resendSuccess,
    setResendCooldown,
    handleResendEmail,
  };
}
