import { ref, reactive, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { validateField, validateRegisterForm } from '@/utils/validation';
import { authApi } from '@/services/authApi';

interface RegisterFormData {
  email: string;
  password: string;
  username: string;
  nickname: string;
}

interface PhoneFormData {
  phone: string;
  code: string;
}

export function useRegisterForm(options: {
  mailEnabled: boolean;
  requireEmailVerification: boolean;
  smsEnabled: boolean;
  requirePhoneVerification: boolean;
  wechatNickname?: string;
}) {
  const route = useRoute();

  const formData = reactive<RegisterFormData>({
    email: '',
    password: '',
    username: '',
    nickname: options.wechatNickname || '',
  });

  const phoneForm = reactive<PhoneFormData>({
    phone: '',
    code: '',
  });

  const countdown = ref(0);
  const sendingCode = ref(false);
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  const confirmPassword = ref('');
  const error = ref<string | null>(null);
  const fieldErrors = reactive<Record<string, string>>({});
  const touched = reactive<Record<string, boolean>>({});
  const currentStep = ref(1);
  const showPassword = ref(false);
  const showConfirmPassword = ref(false);

  const passwordStrength = computed(() => {
    const password = formData.password;
    if (!password) return { strength: 0, label: '', color: '' };

    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const levels = [
      { label: '太弱', color: '#ef4444' },
      { label: '较弱', color: '#f97316' },
      { label: '一般', color: '#eab308' },
      { label: '较强', color: '#22c55e' },
      { label: '很强', color: '#10b981' },
    ];
    const level = levels[score] ?? levels[0]!;
    return { strength: score, label: level.label, color: level.color };
  });

  const showEmailField = computed(
    () => options.mailEnabled && options.requireEmailVerification,
  );
  const showPhoneFields = computed(
    () => options.smsEnabled && options.requirePhoneVerification,
  );

  const sendCodeButtonText = computed(() => {
    if (sendingCode.value) return '发送中';
    if (countdown.value > 0) return `${countdown.value}s`;
    return '获取验证码';
  });

  function startCountdown(): void {
    countdown.value = 60;
    countdownTimer = setInterval(() => {
      if (countdown.value <= 1) {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        countdown.value = 0;
      } else {
        countdown.value--;
      }
    }, 1000);
  }

  function handlePhoneChange(name: string, value: string): void {
    if (name === 'phone' && value && !/^\d*$/.test(value)) return;
    if (name === 'code' && value && !/^\d*$/.test(value)) return;
    (phoneForm as Record<string, string>)[name] = value;
    if (fieldErrors[name]) {
      delete fieldErrors[name];
    }
  }

  function handleChange(name: string, value: string): void {
    if (name === 'confirmPassword') {
      confirmPassword.value = value;
      if (touched.confirmPassword) {
        if (value && formData.password !== value) {
          fieldErrors.confirmPassword = '两次输入的密码不一致';
        } else {
          delete fieldErrors.confirmPassword;
        }
      }
    } else {
      (formData as Record<string, string>)[name] = value;
      if (touched[name]) {
        const fieldError = validateField(
          name as keyof typeof import('@/utils/validation').ValidationRules,
          value,
        );
        if (fieldError) {
          fieldErrors[name] = fieldError;
        } else {
          delete fieldErrors[name];
        }
      }
    }
    if (error.value) error.value = null;
  }

  function handleBlur(name: string, value: string): void {
    touched[name] = true;
    if (name === 'confirmPassword') {
      if (value && formData.password !== value) {
        fieldErrors.confirmPassword = '两次输入的密码不一致';
      } else {
        delete fieldErrors.confirmPassword;
      }
    } else {
      const fieldError = validateField(
        name as keyof typeof import('@/utils/validation').ValidationRules,
        value,
      );
      if (fieldError) {
        fieldErrors[name] = fieldError;
      } else {
        delete fieldErrors[name];
      }
    }
  }

  async function validateStep(step: number): Promise<boolean> {
    if (step === 1) {
      const errors: Record<string, string> = {};
      if (!formData.username) errors.username = '请输入用户名';

      if (options.mailEnabled && options.requireEmailVerification) {
        if (!formData.email) {
          errors.email = '请输入邮箱';
        } else if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          errors.email = '请输入有效的邮箱地址';
        }
      }

      if (options.smsEnabled && options.requirePhoneVerification) {
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
          const checkResult = await authApi.checkField({
            username: formData.username,
            email: formData.email || undefined,
            phone: phoneForm.phone || undefined,
          });
          if (checkResult.data.usernameExists) {
            errors.username = '用户名已被使用';
          }
          if (checkResult.data.emailExists) {
            errors.email = '邮箱已被注册';
          }
          if (checkResult.data.phoneExists) {
            errors.phone = '手机号已被注册';
          }
        } catch (checkErr) {
          console.error('检查字段唯一性失败:', checkErr);
        }
      }

      Object.assign(fieldErrors, errors);
      return Object.keys(errors).length === 0;
    }
    return true;
  }

  async function handleSendCode(): Promise<void> {
    if (!phoneForm.phone || !/^1[3-9]\d{9}$/.test(phoneForm.phone)) {
      fieldErrors.phone = '请输入正确的手机号';
      return;
    }

    sendingCode.value = true;
    delete fieldErrors.phone;

    try {
      const checkResult = await authApi.checkField({ phone: phoneForm.phone });
      if (checkResult.data.phoneExists) {
        fieldErrors.phone = '该手机号已被注册';
        return;
      }

      const response = await authApi.sendSmsCode(phoneForm.phone);
      if (response.data?.success) {
        startCountdown();
      } else {
        fieldErrors.phone = response.data?.message || '发送验证码失败';
      }
    } catch (err) {
      const axiosError = err as Error & {
        response?: { data?: { message?: string } };
      };
      fieldErrors.phone =
        axiosError.response?.data?.message ||
        axiosError.message ||
        '发送验证码失败';
    } finally {
      sendingCode.value = false;
    }
  }

  function clearErrors(): void {
    Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
    error.value = null;
  }

  return {
    formData,
    phoneForm,
    confirmPassword,
    countdown,
    sendingCode,
    error,
    fieldErrors,
    touched,
    currentStep,
    showPassword,
    showConfirmPassword,
    passwordStrength,
    showEmailField,
    showPhoneFields,
    sendCodeButtonText,
    handlePhoneChange,
    handleChange,
    handleBlur,
    validateStep,
    handleSendCode,
    clearErrors,
  };
}