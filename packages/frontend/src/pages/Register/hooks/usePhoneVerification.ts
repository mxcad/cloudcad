import { useState, useRef, useEffect, useCallback } from 'react';

interface PhoneVerificationOptions {
  /** Setter for field-level errors (from parent form hook) */
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface PhoneVerificationState {
  phone: string;
  code: string;
}

export interface PhoneVerificationReturn {
  phoneForm: PhoneVerificationState;
  setPhoneForm: React.Dispatch<React.SetStateAction<PhoneVerificationState>>;
  countdown: number;
  sendingCode: boolean;
  handlePhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSendCode: () => Promise<void>;
}

export function usePhoneVerification({ setFieldErrors }: PhoneVerificationOptions): PhoneVerificationReturn {
  const [phoneForm, setPhoneForm] = useState<PhoneVerificationState>({
    phone: '',
    code: '',
  });
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理倒计时
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // 处理倒计时
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
    // Dependency: trigger effect when countdown transitions from 0 to positive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown > 0]);

  // 手机号输入处理
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      // 手机号只允许输入数字
      if (name === 'phone' && value && !/^\d*$/.test(value)) {
        return;
      }
      // 验证码只允许输入数字
      if (name === 'code' && value && !/^\d*$/.test(value)) {
        return;
      }
      setPhoneForm((prev) => ({ ...prev, [name]: value }));
      setFieldErrors((prev) => {
        if (prev[name]) {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        }
        return prev;
      });
    },
    [setFieldErrors],
  );

  // 发送短信验证码
  const handleSendCode = useCallback(async () => {
    // 验证手机号格式
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      setFieldErrors((prev) => ({ ...prev, phone: '请输入正确的手机号' }));
      return;
    }

    setSendingCode(true);
    setFieldErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.phone;
      return newErrors;
    });

    try {
      // 动态导入 API SDK 以避免在 hook 顶部引入
      const { authControllerCheckFieldUniqueness, authControllerSendSmsCode } = await import('@/api-sdk');

      // 先检查手机号是否已被注册
      const checkResult = await authControllerCheckFieldUniqueness();
      if ((checkResult as { phoneExists?: boolean })?.phoneExists) {
        setFieldErrors((prev) => ({ ...prev, phone: '该手机号已被注册' }));
        return;
      }

      // 手机号可用，发送验证码
      const { data: response } = await authControllerSendSmsCode();
      if ((response as { success?: boolean })?.success) {
        setCountdown(60);
      } else {
        setFieldErrors((prev) => ({
          ...prev,
          phone: (response as { message?: string })?.message || '发送验证码失败',
        }));
      }
    } catch (err: unknown) {
      setFieldErrors((prev) => ({
        ...prev,
        phone:
          (err as Error & { response?: { data?: { message?: string } } })
            .response?.data?.message ||
          (err as Error).message ||
          '发送验证码失败',
      }));
    } finally {
      setSendingCode(false);
    }
  }, [phoneForm.phone, setFieldErrors]);

  return {
    phoneForm,
    setPhoneForm,
    countdown,
    sendingCode,
    handlePhoneChange,
    handleSendCode,
  };
}
