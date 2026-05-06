import { useState, useCallback } from 'react';
import { authControllerForgotPassword } from '@/api-sdk';

interface ForgotPasswordResult {
  mailEnabled: boolean;
  smsEnabled: boolean;
  supportEmail?: string | null;
  supportPhone?: string | null;
}

export function useForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (data: {
    email?: string;
    phone?: string;
  }): Promise<ForgotPasswordResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await authControllerForgotPassword({
        body: {
          email: data.email,
          phone: data.phone,
          validateContact: '',
        },
      });
      return result as unknown as ForgotPasswordResult;
    } catch (err) {
      const message =
        (err as Error & { response?: { data?: { message?: string } } })
          .response?.data?.message ||
        (err as Error).message ||
        '发送验证码失败，请稍后重试';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { submit, loading, error, setError };
}
