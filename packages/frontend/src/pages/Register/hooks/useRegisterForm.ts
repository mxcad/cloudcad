import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { validateField, validateRegisterForm } from '@/utils/validation';
import { handleError } from '@/utils/errorHandler';
import { authControllerCheckFieldUniqueness, authControllerRegisterByPhone } from '@/api-sdk';
import type { RegisterDto } from '@/api-sdk';

interface UseRegisterFormOptions {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  isWechatRegister: boolean;
}

interface PhoneFormRef {
  phone: string;
  code: string;
}

export interface UseRegisterFormReturn {
  formData: RegisterDto;
  setFormData: React.Dispatch<React.SetStateAction<RegisterDto>>;
  confirmPassword: string;
  setConfirmPassword: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  fieldErrors: Record<string, string>;
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  touched: Record<string, boolean>;
  focusedField: string | null;
  setFocusedField: React.Dispatch<React.SetStateAction<string | null>>;
  currentStep: number;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPassword: boolean;
  setShowConfirmPassword: React.Dispatch<React.SetStateAction<boolean>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  handleNext: (phoneForm: PhoneFormRef) => Promise<void>;
  handleBack: () => void;
  handleSubmit: (
    e: React.FormEvent,
    phoneForm: PhoneFormRef,
    wechatTempToken: string | null,
  ) => Promise<void>;
}

export function useRegisterForm(options: UseRegisterFormOptions): UseRegisterFormReturn {
  const {
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    isWechatRegister,
  } = options;

  const navigate = useNavigate();
  const location = useLocation();
  const { register: registerUser } = useAuth();

  // 微信昵称解析
  const wechatNickname = useWechatNickname(isWechatRegister);

  const [formData, setFormData] = useState<RegisterDto>({
    email: '',
    password: '',
    username: '',
    nickname: wechatNickname || '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;

      if (name === 'confirmPassword') {
        setConfirmPassword(value);
        if (touched.confirmPassword) {
          if (value && formData.password !== value) {
            setFieldErrors((prev) => ({
              ...prev,
              confirmPassword: '两次输入的密码不一致',
            }));
          } else {
            setFieldErrors((prev) => {
              const newErrors = { ...prev };
              delete newErrors.confirmPassword;
              return newErrors;
            });
          }
        }
      } else if (name in formData || name === 'email' || name === 'nickname' || name === 'username' || name === 'password') {
        setFormData((prev) => {
          // Only update if the field exists in RegisterDto
          const key = name as keyof RegisterDto;
          if (key in prev) {
            return { ...prev, [key]: value };
          }
          return prev;
        });

        if (touched[name]) {
          const fieldError = validateField(
            name as keyof typeof import('@/utils/validation').ValidationRules,
            value,
          );
          if (fieldError) {
            setFieldErrors((prev) => ({ ...prev, [name]: fieldError }));
          } else {
            setFieldErrors((prev) => {
              const newErrors = { ...prev };
              delete newErrors[name];
              return newErrors;
            });
          }
        }
      }

      if (error) setError(null);
    },
    [touched, formData.password, error],
  );

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setFocusedField(null);

    if (name === 'confirmPassword') {
      if (value && formData.password !== value) {
        setFieldErrors((prev) => ({
          ...prev,
          confirmPassword: '两次输入的密码不一致',
        }));
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.confirmPassword;
          return newErrors;
        });
      }
    } else if (name in formData || name === 'email' || name === 'nickname' || name === 'username' || name === 'password') {
      const fieldError = validateField(
        name as keyof typeof import('@/utils/validation').ValidationRules,
        value,
      );
      if (fieldError) {
        setFieldErrors((prev) => ({ ...prev, [name]: fieldError }));
      } else {
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    }
  };

  const validateStep = async (step: number, phoneForm: PhoneFormRef): Promise<boolean> => {
    if (step === 1) {
      const errors: Record<string, string> = {};
      if (!formData.username) errors.username = '请输入用户名';

      if (mailEnabled && requireEmailVerification) {
        if (!formData.email) {
          errors.email = '请输入邮箱';
        } else if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          errors.email = '请输入有效的邮箱地址';
        }
      }

      if (smsEnabled && requirePhoneVerification) {
        if (!phoneForm.phone) {
          errors.phone = '请输入手机号';
        } else if (phoneForm.phone && !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
          errors.phone = '请输入正确的手机号';
        }
        if (!phoneForm.code) {
          errors.code = '请输入验证码';
        }
      }

      if (formData.username || formData.email || phoneForm.phone) {
        try {
          const checkResult = await authControllerCheckFieldUniqueness();
          const checkData = checkResult as { usernameExists?: boolean; emailExists?: boolean; phoneExists?: boolean };
          if (checkData.usernameExists) {
            errors.username = '用户名已被使用';
          }
          if (checkData.emailExists) {
            errors.email = '邮箱已被注册';
          }
          if (checkData.phoneExists) {
            errors.phone = '手机号已被注册';
          }
        } catch (checkErr) {
          handleError(checkErr, '检查字段唯一性');
        }
      }

      setFieldErrors((prev) => ({ ...prev, ...errors }));
      return Object.keys(errors).length === 0;
    }
    return true;
  };

  const handleNext = useCallback(
    async (phoneForm: PhoneFormRef) => {
      const isValid = await validateStep(currentStep, phoneForm);
      if (isValid) {
        setCurrentStep((prev) => prev + 1);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep, formData.username, formData.email, mailEnabled, requireEmailVerification, smsEnabled, requirePhoneVerification],
  );

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
  }, []);

  const handleSubmit = useCallback(
    async (
      e: React.FormEvent,
      phoneForm: PhoneFormRef,
      wechatTempToken: string | null,
    ) => {
      e.preventDefault();

      const dataToValidate = {
        email: formData.email ?? '',
        username: formData.username,
        password: formData.password,
        confirmPassword,
        nickname: formData.nickname,
      };
      const validationError = validateRegisterForm(dataToValidate, {
        validateEmail: mailEnabled && requireEmailVerification,
      });

      if (validationError) {
        setError(validationError);
        return;
      }

      const relevantFields = ['username', 'password', 'confirmPassword', 'nickname'];
      if (mailEnabled && requireEmailVerification) relevantFields.push('email');
      if (smsEnabled && requirePhoneVerification) {
        relevantFields.push('phone');
        if (requirePhoneVerification) relevantFields.push('code');
      }
      const actualErrors = Object.entries(fieldErrors).filter(
        ([key, v]) => v && v.trim() && relevantFields.includes(key),
      );
      if (actualErrors.length > 0) {
        const labels: Record<string, string> = {
          username: '用户名',
          password: '密码',
          confirmPassword: '确认密码',
          nickname: '昵称',
          email: '邮箱',
          phone: '手机号',
          code: '验证码',
        };
        const errorFields = actualErrors.map(([key]) => labels[key] || key);
        setError(`请修正以下字段：${errorFields.join('、')}`);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (phoneForm.phone && phoneForm.code && smsEnabled && requirePhoneVerification) {
          if (mailEnabled && requireEmailVerification) {
            navigate('/verify-email', {
              state: {
                email: formData.email,
                phone: phoneForm.phone,
                code: phoneForm.code,
                username: formData.username,
                password: formData.password,
                nickname: formData.nickname,
                message: '请先验证邮箱，完成注册',
              },
            });
            return;
          }

          await authControllerRegisterByPhone();
          if (isWechatRegister) {
            sessionStorage.removeItem('wechatTempToken');
          }
          navigate('/');
        } else {
          const needEmail = mailEnabled && requireEmailVerification;
          const registerData = needEmail
            ? { ...formData, wechatTempToken }
            : { ...formData, email: undefined, wechatTempToken };
          const result = await registerUser(registerData as RegisterDto);

          if (isWechatRegister) {
            sessionStorage.removeItem('wechatTempToken');
          }

          if (result.email) {
            navigate('/verify-email', {
              state: { email: result.email, message: result.message },
            });
          } else {
            navigate('/');
          }
        }
      } catch (err: unknown) {
        const axiosError = err as Error & {
          response?: {
            data?: { message?: string };
            status?: number;
            statusText?: string;
          };
        };
        setError(
          axiosError.message ||
            (axiosError.response?.status === 409
              ? '用户名或邮箱已被使用'
              : axiosError.response?.statusText) ||
            '注册失败，请稍后重试',
        );
        handleError(err, '注册提交');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData, confirmPassword, fieldErrors, mailEnabled, requireEmailVerification, smsEnabled, requirePhoneVerification, isWechatRegister, navigate, registerUser],
  );

  return {
    formData,
    setFormData,
    confirmPassword,
    setConfirmPassword,
    loading,
    error,
    setError,
    fieldErrors,
    setFieldErrors,
    touched,
    focusedField,
    setFocusedField,
    currentStep,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    handleChange,
    handleBlur,
    handleNext,
    handleBack,
    handleSubmit,
  };
}

/** Parse WeChat nickname from JWT temp token */
function useWechatNickname(isWechatRegister: boolean): string {
  if (!isWechatRegister) return '';

  const wechatTempToken = sessionStorage.getItem('wechatTempToken');
  if (!wechatTempToken) return '';

  try {
    const tokenPart = wechatTempToken.split('.')[1];
    if (!tokenPart) return '';

    const base64 = tokenPart.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const payload = JSON.parse(jsonStr);
    return payload.nickname || '';
  } catch {
    return '';
  }
}
