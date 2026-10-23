import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import { authControllerCheckFieldUniqueness } from '@/api-sdk';
import type { RegisterDto } from '@/api-sdk';
import { t } from '@/languages';
import { usePasswordPolicy } from '@/lib/passwordPolicy';
import {
  step1Schema,
  makeStep2Schema,
  makeRegisterFormSchema,
  type RegisterFormValues,
} from './registerFormSchema';
import { read, erase } from '@/lib/browserStorage';
import { focusFirstInvalid } from '@/lib/formErrors';
import { getErrorMessage } from '@/utils/errorHandler';

/** 字段在页面上的实际顺序，校验失败后据此聚焦第一个出错字段 */
const FIELD_ORDER = [
  'username',
  'nickname',
  'email',
  'phone',
  'code',
  'password',
  'confirmPassword',
  'agreedToTerms',
] as const;

// ──────────────────────────────────────────────
// Options & return type
// ──────────────────────────────────────────────

interface UseRegisterFormOptions {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  isWechatRegister: boolean;
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
  setExternalErrors: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;

  // Actions
  handleNext: (phoneForm: { phone: string; code: string }) => Promise<void>;
  handleBack: () => void;
  handleFormSubmit: (
    e: React.FormEvent,
    phoneForm: { phone: string; code: string }
  ) => Promise<void>;
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useRegisterForm(
  options: UseRegisterFormOptions
): UseRegisterFormReturn {
  const {
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    isWechatRegister,
  } = options;

  const navigate = useNavigate();
  const { register: registerUser, registerByPhone } = useAuth();
  const { showConfirm } = useConfirmDialog();

  const wechatNickname = useWechatNickname(isWechatRegister);

  // ── Local UI state ─────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalErrors, setExternalErrors] = useState<Record<string, string>>(
    {}
  );

  // ── 口令策略（生效值经 /runtime-config/public 下发，schema 据此构建） ──
  const policy = usePasswordPolicy();
  const registerSchema = useMemo(
    () => makeRegisterFormSchema(policy),
    [policy.minLength, policy.minCategories]
  );
  const step2 = useMemo(
    () => makeStep2Schema(policy),
    [policy.minLength, policy.minCategories]
  );

  // ── react-hook-form ────────────────────────────
  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState,
    watch,
    setError: setFieldError,
    getValues,
    setValue,
    trigger,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      nickname: wechatNickname || '',
      email: '',
      password: '',
      confirmPassword: '',
      agreedToTerms: false,
    },
    mode: 'onTouched',
  });

  // ── Combined field errors (zod + external) ─────
  const fieldErrors: Record<string, string> = { ...externalErrors };
  if (formState.errors.username)
    fieldErrors.username = formState.errors.username.message || '';
  if (formState.errors.nickname)
    fieldErrors.nickname = formState.errors.nickname.message || '';
  if (formState.errors.email)
    fieldErrors.email = formState.errors.email.message || '';
  if (formState.errors.password)
    fieldErrors.password = formState.errors.password.message || '';
  if (formState.errors.confirmPassword)
    fieldErrors.confirmPassword =
      formState.errors.confirmPassword.message || '';
  if (formState.errors.agreedToTerms)
    fieldErrors.agreedToTerms = formState.errors.agreedToTerms.message || '';

  // 外部错误（唯一性预检、短信验证码等）要按「写入时的值」判定时效：
  // 用户改动该字段后才失效，否则错误会在提交校验设置它的那一轮就被误清
  const valueWhenSetRef = useRef<Record<string, unknown>>({});
  const writeExternalErrors = useCallback(
    (updater: React.SetStateAction<Record<string, string>>) => {
      const values = getValues() as unknown as Record<string, unknown>;
      setExternalErrors((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const snapshot: Record<string, unknown> = {};
        Object.keys(next).forEach((key) => {
          snapshot[key] = values[key];
        });
        valueWhenSetRef.current = snapshot;
        return next;
      });
    },
    [getValues]
  );

  // 用户改动某字段后，该字段的外部错误自动失效——否则「改对了但提示还挂着」，
  // 用户会以为提交没反应
  const watchedValues = watch() as unknown as Record<string, unknown>;
  useEffect(() => {
    const snapshot = valueWhenSetRef.current;
    const stale = Object.keys(snapshot).filter(
      (key) => watchedValues[key] !== snapshot[key]
    );
    if (stale.length === 0) return;
    setExternalErrors((prev) => {
      if (!Object.keys(prev).some((key) => stale.includes(key))) return prev;
      const next = { ...prev };
      stale.forEach((key) => delete next[key]);
      return next;
    });
    const freshSnapshot: Record<string, unknown> = {};
    Object.keys(snapshot).forEach((key) => {
      if (!stale.includes(key)) freshSnapshot[key] = snapshot[key];
    });
    valueWhenSetRef.current = freshSnapshot;
  }, [watchedValues, setExternalErrors]);

  // ── 同步校验（无 IO）。提交闸门与内联提示共用实时结果，绝不读上次失败快照 ──
  // 两步的规则必须分开：step1 闸门若连 step2 的密码规则一起跑，step1 时密码必然
  // 为空 → errors.password 恒非空 → 「下一步」永远进不去，而密码框在 step1 不渲染，
  // 用户只会看到点击毫无反应。同理每个字段的门控必须与它实际渲染的步骤一致。
  const validateStep1Fields = useCallback(
    (values: RegisterFormValues): Record<string, string> => {
      const errors: Record<string, string> = {};

      const step1Result = step1Schema.safeParse({
        username: values.username,
        nickname: values.nickname || '',
        email: values.email || '',
        agreedToTerms: values.agreedToTerms,
      });
      if (!step1Result.success) {
        for (const issue of step1Result.error.issues) {
          const key = issue.path[0] as string;
          if (!errors[key]) errors[key] = issue.message || '';
        }
      }

      if (mailEnabled && requireEmailVerification && !values.email) {
        errors.email = t('请输入邮箱');
      }

      return errors;
    },
    [mailEnabled, requireEmailVerification]
  );

  const validateFormNow = useCallback(
    (
      values: RegisterFormValues,
      phoneForm?: { phone: string; code: string }
    ): Record<string, string> => {
      const errors = { ...validateStep1Fields(values) };

      if (phoneForm && smsEnabled && requirePhoneVerification) {
        if (!phoneForm.phone) {
          errors.phone = t('请输入手机号');
        } else if (!/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
          errors.phone = t('请输入正确的手机号');
        }
        if (!phoneForm.code) {
          errors.code = t('请输入验证码');
        }
      }

      const step2Result = step2.safeParse({
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      if (!step2Result.success) {
        for (const issue of step2Result.error.issues) {
          const key = issue.path[0] as string;
          if (!errors[key]) errors[key] = issue.message || '';
        }
      }

      return errors;
    },
    [validateStep1Fields, step2, smsEnabled, requirePhoneVerification]
  );

  // ── Step 1 validation (Zod + async uniqueness) ─
  const validateStep1 = useCallback(async (): Promise<boolean> => {
    const values = getValues();
    const errors = validateStep1Fields(values);

    if (values.username || values.email) {
      try {
        const response = await authControllerCheckFieldUniqueness({
          throwOnError: true,
          body: {
            username: values.username || undefined,
            email: values.email || undefined,
          },
        });
        // SDK 默认不抛错：失败时错误在 result.error，静默跳过会漏掉用户名/邮箱冲突预检
        const checkResult = response.data as {
          usernameExists?: boolean;
          emailExists?: boolean;
          phoneExists?: boolean;
        };
        if (checkResult.usernameExists) errors.username = t('用户名已被使用');
        if (checkResult.emailExists) errors.email = t('邮箱已被注册');
      } catch (err) {
        console.error('检查字段唯一性失败:', err);
      }
    }

    writeExternalErrors(errors);
    return Object.keys(errors).length === 0;
  }, [getValues, validateStep1Fields, writeExternalErrors]);

  // ── Step navigation ────────────────────────────
  const handleNext = useCallback(
    async (phoneForm: { phone: string; code: string }) => {
      if (smsEnabled && requirePhoneVerification) {
        const phoneErrors: Record<string, string> = {};
        if (!phoneForm.phone) {
          phoneErrors.phone = t('请输入手机号');
        } else if (!/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
          phoneErrors.phone = t('请输入正确的手机号');
        }
        if (!phoneForm.code) {
          phoneErrors.code = t('请输入验证码');
        }
        if (Object.keys(phoneErrors).length > 0) {
          writeExternalErrors((prev) => ({ ...prev, ...phoneErrors }));
          return;
        }
        writeExternalErrors((prev) => {
          const next = { ...prev };
          delete next.phone;
          delete next.code;
          return next;
        });
      }

      // 未勾选协议不直接报错拦截：弹确认框，用户确认后自动勾选并继续
      if (!getValues().agreedToTerms) {
        const confirmed = await showConfirm({
          title: t('注册确认'),
          message: t('请先阅读并同意《用户协议》和《隐私政策》'),
          confirmText: t('同意并继续'),
          type: 'info',
        });
        if (!confirmed) {
          writeExternalErrors((prev) => ({
            ...prev,
            agreedToTerms: t('请先阅读并同意《用户协议》和《隐私政策》'),
          }));
          return;
        }
        setValue('agreedToTerms', true);
      }

      const isValid = await validateStep1();
      if (isValid) {
        writeExternalErrors({});
        setCurrentStep((prev) => prev + 1);
      }
    },
    [
      validateStep1,
      smsEnabled,
      requirePhoneVerification,
      showConfirm,
      setValue,
      getValues,
      writeExternalErrors,
    ]
  );

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
  }, []);

  // ── Final submit ───────────────────────────────
  const handleFormSubmit = useCallback(
    async (
      e: React.FormEvent,
      currentPhoneForm: { phone: string; code: string }
    ) => {
      e.preventDefault();

      const values = getValues();

      // 提交闸门 = 本次实时校验结果。失败只走字段内联提示 + 聚焦首个出错字段，
      // 不再拼「请修正以下字段：X」——那只是把字段名重复一遍，没有可执行信息
      const errors = validateFormNow(values, currentPhoneForm);
      if (Object.keys(errors).length > 0) {
        writeExternalErrors(errors);
        focusFirstInvalid(errors, FIELD_ORDER);
        return;
      }

      setLoading(true);
      setError(null);

      // Get wechat temp token from session storage
      const wechatTempToken = read('wechatTempToken', 'session');

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
                message: t('请先验证邮箱，完成注册'),
              },
            });
            return;
          }

          // 手机号注册：token 写入由 AuthContext.registerByPhone 统一处理，
          // 保证 React token state 同步更新（直接写 localStorage 会导致
          // context token 恒 null → 新用户被 ProtectedRoute 弹回 /login，T4 修复）
          await registerByPhone({
            phone: currentPhoneForm.phone,
            code: currentPhoneForm.code,
            username: values.username,
            password: values.password,
            nickname: values.nickname || undefined,
          });

          if (isWechatRegister) {
            erase('wechatTempToken', 'session');
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
            erase('wechatTempToken', 'session');
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
        // 服务端错误保留通栏提示，并带上后端 errors[] 里的字段级原因
        // （此前只有一句「请求参数验证失败」，用户不知道哪一项没过）
        const httpStatus =
          (err as { status?: number; statusCode?: number }).status ??
          (err as { statusCode?: number }).statusCode;
        setError(
          httpStatus === 409
            ? t('用户名或邮箱已被使用')
            : getErrorMessage(err) || t('注册失败，请稍后重试')
        );
      } finally {
        setLoading(false);
      }
    },
    [
      getValues,
      validateFormNow,
      writeExternalErrors,
      mailEnabled,
      requireEmailVerification,
      smsEnabled,
      requirePhoneVerification,
      isWechatRegister,
      navigate,
      registerUser,
      registerByPhone,
    ]
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
    setExternalErrors: writeExternalErrors,
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

  const wechatTempToken = read('wechatTempToken', 'session');
  if (!wechatTempToken) return '';

  try {
    const tokenPart = wechatTempToken.split('.')[1];
    if (!tokenPart) return '';

    const base64 = tokenPart.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonStr);
    return payload.nickname || '';
  } catch {
    return '';
  }
}
