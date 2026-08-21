import { useState, useCallback } from 'react';
import { authControllerResetPassword } from '@/api-sdk';
import { t } from '@/languages';

export function useResetPassword() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (data: {
      email?: string;
      phone?: string;
      code: string;
      newPassword: string;
      confirmPassword: string;
    }): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const result = await authControllerResetPassword({
          body: {
            email: data.email,
            phone: data.phone,
            code: data.code,
            newPassword: data.newPassword,
            confirmPassword: data.confirmPassword,
            validateContact: '',
          },
        });
        // SDK 默认不抛错：非 2xx/业务错误在 result.error，必须显式抛出，
        // 否则失败会被当成"重置成功"（历史 bug）
        if (result.error) throw result.error;
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
    },
    []
  );

  return { submit, loading, error, setError };
}
