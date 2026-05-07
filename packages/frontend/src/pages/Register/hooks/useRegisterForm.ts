import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { authControllerCheckFieldUniqueness, authControllerRegisterByPhone } from '@/api-sdk';
import type { RegisterDto } from '@/api-sdk';
import {
  step1Schema,
  step2Schema,
  registerFormSchema,
  type RegisterFormValues,
} from './registerFormSchema';

// ──────────────────────────────────────────────
// Options & return type
// ──────────────────────────────────────────────

interface UseRegisterFormOptions {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  isWechatRegister: boolean;
  phoneForm: { phone: string; code: string };
}

export interface UseRegisterFormReturn {
  register: ReturnType<typeof useForm<RegisterFormValues>>['register'];
  handleSubmit: ReturnType<typeof useForm<RegisterFormValues>>['handleSubmit'];
  formState: ReturnType<typeof useForm<RegisterFormValues>>['formState'];
  watch: ReturnType<typeof useForm<RegisterFormValues>>['watch'];

  // Multi-step UI state
  currentStep: number;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPassword: boolean;
  setShowConfirmPassword: React.Dispatch<React.SetStateAction<boolean>>;
  focusedField: string | null;
  setFocusedField: React.Dispatch<React.SetStateAction<string | null>>;

  // Async / submit state
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  fieldErrors: Record<string, string>;
  setExternalErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // Actions
  handleNext: (phoneForm: { phone: string; code: string }) => Promise<void>;
  handleBack: () => void;
  handleFormSubmit: (e: React.FormEvent) => Promise<void>;
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useRegisterForm(options: UseRegisterFormOptions): UseRegisterFormReturn {
  const {
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    isWechatRegister,
    phoneForm,
  } = options;

  const navigate = useNavigate();
  const { register: registerUser } = useAuth();

  const wechatNickname = useWechatNickname(isWechatRegister);

  // ── Local UI state ─────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalErrors, setExternalErrors] = useState<Record<string, string>>({});

  // ── react-hook-form ────────────────────────────
  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState,
    watch,
    setError: setFieldError,
    getValues,
    trigger,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: '',
      nickname: wechatNickname || '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onTouched',
  });

  // ── Combined field errors (zod + external) ─────
  const fieldErrors: Record<string, string> = { ...externalErrors };
  if (formState.errors.username) fieldErrors.username = formState.errors.username.message || '';
  if (formState.errors.nickname) fieldErrors.nickname = formState.errors.nickname.message || '';
  if (formState.errors.email) fieldErrors.email = formState.errors.email.message || '';
  if (formState.errors.password) fieldErrors.password = formState.errors.password.message || '';
  if (formState.errors.confirmPassword) fieldErrors.confirmPassword = formState.errors.confirmPassword.message || '';

  // ── Step 1 validation (Zod + async uniqueness) ─
  const validateStep1 = useCallback(async (): Promise<boolean> => {
    const values = getValues();

    const step1Result = step1Schema.safeParse({
      username: values.username,
      nickname: values.nickname || '',
      email: values.email || '',
    });

    const errors: Record<string, string> = {};
    if (!step1Result.success) {
      for (const issue of step1Result.error.issues) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = issue.message || '';
      }
    }

    if (mailEnabled && requireEmailVerification && !values.email) {
      errors.email = '请输入邮箱';
    }

    if (values.username || values.email) {
      try {
        const response = await authControllerCheckFieldUniqueness({
          body: {
            username: values.username || undefined,
            email: values.email || undefined,
          },
        });
        const checkResult = response.data as {
          usernameExists?: boolean;
          emailExists?: boolean;
          phoneExists?: boolean;
        };
        if (checkResult.usernameExists) errors.username = '用户名已被使用';
        if (checkResult.emailExists) errors.email = '邮箱已被注册';
      } catch (err) {
        console.error('检查字段唯一性失败:', err);
      }
    }

    setExternalErrors(errors);
    return Object.keys(errors).length === 0;
  }, [getValues, mailEnabled, requireEmailVerification, smsEnabled, requirePhoneVerification]);

  // ── Step navigation ────────────────────────────
  const handleNext = useCallback(
    async (phoneForm: { phone: string; code: string }) => {
      if (smsEnabled && requirePhoneVerification) {
        const phoneErrors: Record<string, string> = {};
        if (!phoneForm.phone) {
          phoneErrors.phone = '请输入手机号';
        } else if (!/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
          phoneErrors.phone = '请输入正确的手机号';
        }
        if (!phoneForm.code) {
          phoneErrors.code = '请输入验证码';
        }
        if (Object.keys(phoneErrors).length > 0) {
          setExternalErrors((prev) => ({ ...prev, ...phoneErrors }));
          return;
        }
        setExternalErrors((prev) => {
          const next = { ...prev };
          delete next.phone;
          delete next.code;
          return next;
        });
      }

      const isValid = await validateStep1();
      if (isValid) {
        setExternalErrors({});
        setCurrentStep((prev) => prev + 1);
      }
    },
    [validateStep1, smsEnabled, requirePhoneVerification],
  );

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
  }, []);

  // ── Final submit ───────────────────────────────
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const values = getValues();

      const step2Result = step2Schema.safeParse({
        password: values.password,
        confirmPassword: values.confirmPassword,
      });

      if (!step2Result.success) {
        const step2Errors: Record<string, string> = {};
        for (const issue of step2Result.error.issues) {
          const key = issue.path[0] as string;
          if (!step2Errors[key]) step2Errors[key] = issue.message || '';
        }
        setExternalErrors(step2Errors);
        const labels: Record<string, string> = {
          password: '密码',
          confirmPassword: '确认密码',
        };
        const errorFields = Object.keys(step2Errors).map((k) => labels[k] || k);
        setError(`请修正以下字段：${errorFields.join('、')}`);
        return;
      }

      const allRelevantErrors = Object.entries(fieldErrors).filter(
        ([, v]) => v && v.trim(),
      );
      if (allRelevantErrors.length > 0) {
        const labels: Record<string, string> = {
          username: '用户名',
          password: '密码',
          confirmPassword: '确认密码',
          nickname: '昵称',
          email: '邮箱',
          phone: '手机号',
          code: '验证码',
        };
        const errorFields = allRelevantErrors.map(([k]) => labels[k] || k);
        setError(`请修正以下字段：${errorFields.join('、')}`);
        return;
      }

      setLoading(true);
      setError(null);

      // Get current phone form from options
      const currentPhoneForm = options.phoneForm;
      // Get wechat temp token from session storage
      const wechatTempToken = sessionStorage.getItem('wechatTempToken');

      try {
        if (
          currentPhoneForm.phone &&
          currentPhoneForm.code &&
          smsEnabled &&
          requirePhoneVerification
        ) {
          if (mailEnabled && requireEmailVerification) {
            navigate('/verify-email', {
              state: {
                email: values.email,
                phone: currentPhoneForm.phone,
                code: currentPhoneForm.code,
                username: values.username,
                password: values.password,
                nickname: values.nickname,
                message: '请先验证邮箱，完成注册',
              },
            });
            return;
          }

          const response = await authControllerRegisterByPhone({
            body: {
              phone: currentPhoneForm.phone,
              code: currentPhoneForm.code,
              username: values.username,
              password: values.password,
              nickname: values.nickname || undefined,
            },
          });

          const authData = response.data as {
            accessToken?: string;
            refreshToken?: string;
            user?: Record<string, unknown>;
          };

          if (authData.accessToken) {
            localStorage.setItem('accessToken', authData.accessToken);
            localStorage.setItem('refreshToken', authData.refreshToken || '');
            localStorage.setItem('user', JSON.stringify(authData.user));
          }

          if (isWechatRegister) {
            sessionStorage.removeItem('wechatTempToken');
          }
          navigate('/');
        } else {
          const needEmail = mailEnabled && requireEmailVerification;
          const registerData: RegisterDto = {
            username: values.username,
            password: values.password,
            nickname: values.nickname || undefined,
            email: needEmail ? values.email : undefined,
            wechatTempToken: wechatTempToken || undefined,
          };
          const result = await registerUser(registerData);

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
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      getValues,
      fieldErrors,
      mailEnabled,
      requireEmailVerification,
      smsEnabled,
      requirePhoneVerification,
      isWechatRegister,
      navigate,
      registerUser,
      options.phoneForm,
    ],
  );

  return {
    register,
    handleSubmit: rhfHandleSubmit,
    formState,
    watch,
    currentStep,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    focusedField,
    setFocusedField,
    loading,
    error,
    setError,
    fieldErrors,
    setExternalErrors,
    handleNext,
    handleBack,
    handleFormSubmit,
  };
}

// ──────────────────────────────────────────────
// WeChat nickname helper
// ──────────────────────────────────────────────

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
