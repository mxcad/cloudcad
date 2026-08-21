import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { t } from '@/languages';

export interface PhoneRegisterData {
  phone: string;
  code: string;
  username: string;
  password: string;
  nickname: string;
}

interface UseEmailVerificationFormParams {
  bindMode: boolean;
  tempToken: string;
  phoneRegisterData: PhoneRegisterData | null;
}

export function useEmailVerificationForm({
  bindMode,
  tempToken,
  phoneRegisterData,
}: UseEmailVerificationFormParams) {
  const navigate = useNavigate();
  const { verifyEmailAndLogin } = useAuth();
  const { bindEmailAndLogin, verifyEmailAndRegisterPhone } =
    useEmailVerification();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string>('');
  const [emailSent, setEmailSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string>('');

  const handleVerifyCode = useCallback(async () => {
    if (!verificationCode.trim()) {
      setError(t('请输入验证码'));
      return;
    }
    if (verificationCode.length !== 6) {
      setError(t('验证码应为6位数字'));
      return;
    }
    if (!email) {
      setError(bindMode ? t('请输入邮箱地址') : t('邮箱地址缺失，请重新注册'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (bindMode) {
        const response = await bindEmailAndLogin({
          tempToken,
          email,
          code: verificationCode.trim(),
        });
        if (!response) throw new Error(t('绑定邮箱失败'));
        const { refreshToken, user: userData } = response;
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        window.location.href = '/';
        return;
      } else if (phoneRegisterData) {
        const response = await verifyEmailAndRegisterPhone({
          email,
          code: verificationCode.trim(),
          phone: phoneRegisterData.phone,
          phoneCode: phoneRegisterData.code,
          username: phoneRegisterData.username,
          password: phoneRegisterData.password,
          nickname: phoneRegisterData.nickname,
        });
        if (!response) throw new Error(t('注册失败'));
        const { accessToken, refreshToken, user: userData } = response;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        window.location.href = '/';
        return;
      } else {
        await verifyEmailAndLogin(email, verificationCode.trim());
      }
      setSuccess(true);
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('验证失败，请检查验证码是否正确或已过期')
      );
    } finally {
      setLoading(false);
    }
  }, [
    verificationCode,
    email,
    bindMode,
    tempToken,
    phoneRegisterData,
    navigate,
    verifyEmailAndLogin,
    bindEmailAndLogin,
    verifyEmailAndRegisterPhone,
  ]);

  return {
    loading,
    error,
    success,
    email,
    emailSent,
    verificationCode,
    setEmail,
    setVerificationCode,
    setError,
    setEmailSent,
    setSuccess,
    handleVerifyCode,
  };
}
