import { useState, useCallback } from 'react';
import { authControllerResetPassword } from '@/api-sdk';
import { t } from '@/languages';

export function useResetPassword() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: {
    email?: string;
    phone?: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      await authControllerResetPassword({
        body: {
          email: data.email,
          phone: data.phone,
          code: data.code,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
          validateContact: '',
        },
      });
      return true;
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } })
          .response?.data?.message ||
          (err as Error).message ||
          t('重置密码失败，请检查验证码')
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { submit, loading, error, setError };
}
