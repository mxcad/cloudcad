import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useAccountDeactivate } from './useAccountDeactivate';
import { usePhoneBind } from './usePhoneBind';
import { useCountdown } from './useCountdown';
import { t } from '@/languages';

export type DeactivateVerificationMethod =
  'password' | 'phone' | 'email' | 'wechat' | '';

export interface DeactivateFormState {
  verificationMethod: DeactivateVerificationMethod;
  password: string;
  phoneCode: string;
  emailCode: string;
  /** 微信授权 code（授权成功由后端验证 openid 与账户绑定微信是否一致） */
  wechatCode: string;
  confirmed: boolean;
}

interface UseDeactivateProfileOptions {
  setError: (e: string | null) => void;
  setSuccess: (e: string | null) => void;
}

export function useDeactivateProfile({
  setError,
  setSuccess,
}: UseDeactivateProfileOptions) {
  const { user, logout } = useAuth();
  const { deactivateAccount, resendVerification } = useAccountDeactivate();
  const { sendSmsCode } = usePhoneBind();
  // 注销冷静期天数（运行时配置，默认 7）：期间重新登录自动取消注销
  const { config } = useRuntimeConfig();
  const graceDays = config.userCancelGraceDays ?? 7;

  const [deactivateForm, setDeactivateForm] = useState<DeactivateFormState>(
    () => {
      const savedMethod = sessionStorage.getItem(
        'deactivate_verification_method'
      );
      return {
        verificationMethod: (savedMethod || '') as DeactivateVerificationMethod,
        password: '',
        phoneCode: '',
        emailCode: '',
        wechatCode: '',
        confirmed: false,
      };
    }
  );
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  // 手机/邮箱验证码倒计时各自独立持有，切换验证方式互不串扰；
  // useCountdown 的 effect 会在倒计时变化时清理旧 interval，避免重复发送叠加计时器
  const {
    countdown: deactivatePhoneCountdown,
    setCountdown: setDeactivatePhoneCountdown,
  } = useCountdown();
  const {
    countdown: deactivateEmailCountdown,
    setCountdown: setDeactivateEmailCountdown,
  } = useCountdown();
  const deactivateTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(deactivateTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!deactivateForm.verificationMethod && user) {
      if (user.hasPassword)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'password' }));
      else if (
        user.phone &&
        (user as unknown as Record<string, unknown>).phoneVerified
      )
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'phone' }));
      else if (user.email)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'email' }));
      else if ((user as unknown as Record<string, unknown>).wechatId)
        setDeactivateForm((f) => ({ ...f, verificationMethod: 'wechat' }));
    }
  }, [user, deactivateForm.verificationMethod]);

  const handleDeactivate = async () => {
    try {
      setDeactivateLoading(true);
      setError(null);

      await deactivateAccount({
        password: deactivateForm.password || undefined,
        phoneCode: deactivateForm.phoneCode || undefined,
        emailCode: deactivateForm.emailCode || undefined,
        wechatCode: deactivateForm.wechatCode || undefined,
      });

      setSuccess(
        t(
          '账户已注销。{days} 天内重新登录可自动取消注销，逾期需联系客服恢复；30 天后数据将被彻底删除。',
          { days: String(graceDays) }
        )
      );

      deactivateTimeoutRef.current = setTimeout(() => {
        logout();
      }, 1500);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('注销失败')
      );
    } finally {
      setDeactivateLoading(false);
    }
  };

  const handleSendDeactivatePhoneCode = async () => {
    try {
      if (!user?.phone) {
        setError(t('手机号不存在'));
        return;
      }
      const phone = String(user.phone ?? '');
      await sendSmsCode({ phone });
      setDeactivatePhoneCountdown(60);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    }
  };

  const handleSendDeactivateEmailCode = async () => {
    try {
      if (!user?.email) {
        setError(t('邮箱不存在'));
        return;
      }
      const email = String(user.email ?? '');
      await resendVerification({ email });
      setDeactivateEmailCountdown(60);
    } catch (err) {
      setError(
        (err as Error & { response?: { data?: { message?: string } } }).response
          ?.data?.message ||
          (err as Error).message ||
          t('发送验证码失败')
      );
    }
  };

  return {
    user,
    deactivateForm,
    setDeactivateForm,
    deactivateLoading,
    deactivatePhoneCountdown,
    deactivateEmailCountdown,
    handleDeactivate,
    handleSendDeactivatePhoneCode,
    handleSendDeactivateEmailCode,
  };
}
