import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { authApi } from '@/services/authApi';

export function useLogin() {
  const router = useRouter();
  const route = useRoute();
  const {
    login,
    loginByPhone,
    loginWithWechat,
    isAuthenticated,
    loading: authLoading,
    error: authError,
    setError: setAuthError,
  } = useAuth();
  const { config: runtimeConfig } = useRuntimeConfig();

  const smsEnabled = computed(() => runtimeConfig.value?.smsEnabled ?? false);
  const mailEnabled = computed(() => runtimeConfig.value?.mailEnabled ?? false);
  const wechatEnabled = computed(() => runtimeConfig.value?.wechatEnabled ?? false);

  const accountLoginLabel = computed(() => {
    if (smsEnabled.value && mailEnabled.value) return '手机号、邮箱或用户名';
    if (smsEnabled.value) return '手机号或用户名';
    if (mailEnabled.value) return '邮箱或用户名';
    return '用户名';
  });

  const accountLoginPlaceholder = computed(() => {
    if (smsEnabled.value && mailEnabled.value) return '请输入手机号、邮箱或用户名';
    if (smsEnabled.value) return '请输入手机号或用户名';
    if (mailEnabled.value) return '请输入邮箱或用户名';
    return '请输入用户名';
  });

  type LoginTab = 'account' | 'phone';
  const activeTab = ref<LoginTab>('account');
  const formData = ref({ account: '', password: '' });
  const phoneForm = ref({ phone: '', code: '' });
  const loading = ref(false);
  const error = ref<string | null>(null);
  const success = ref<string | null>(null);
  const showPassword = ref(false);

  const countdown = ref(0);
  const sendingCode = ref(false);
  let countdownTimer: ReturnType<typeof setInterval> | null = null;

  const sendCodeButtonText = computed(() => {
    if (sendingCode.value) return '发送中';
    if (countdown.value > 0) return `${countdown.value}s`;
    return '获取验证码';
  });

  function startCountdown(): void {
    countdown.value = 60;
    countdownTimer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) {
        if (countdownTimer) clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }, 1000);
  }

  onUnmounted(() => {
    if (countdownTimer) clearInterval(countdownTimer);
  });

  function clearError(): void {
    error.value = null;
    setAuthError(null);
  }

  function onTabChange(): void {
    error.value = null;
    success.value = null;
    setAuthError(null);
  }

  function onPhoneInput(value: string, field: 'phone' | 'code'): void {
    if (field === 'phone' && value && !/^\d*$/.test(value)) return;
    if (field === 'code' && value && !/^\d*$/.test(value)) return;
    phoneForm.value[field] = value;
    if (error.value) error.value = null;
  }

  async function handleSendCode(): Promise<void> {
    if (!phoneForm.value.phone || !/^1[3-9]\d{9}$/.test(phoneForm.value.phone)) {
      error.value = '请输入正确的手机号';
      return;
    }

    sendingCode.value = true;
    error.value = null;

    try {
      const response = await authApi.sendSmsCode(phoneForm.value.phone);
      if (response.data?.success) {
        success.value = '验证码已发送';
        startCountdown();
      } else {
        error.value = response.data?.message || '发送验证码失败';
      }
    } catch (err: unknown) {
      const axiosErr = err as Error & { response?: { data?: { message?: string } } };
      error.value =
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        '发送验证码失败';
    } finally {
      sendingCode.value = false;
    }
  }

  const showSupportModal = ref(false);

  async function handleAccountSubmit(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      await login(formData.value.account, formData.value.password);
      router.push('/');
    } catch (err: unknown) {
      const errorData = (
        err as Error & {
          response?: {
            data?: {
              code?: string;
              message?: string;
              email?: string;
              phone?: string;
              tempToken?: string;
            };
          };
        }
      ).response?.data;
      const errorMessage =
        errorData?.message || (err as Error).message || '登录失败，请检查账号和密码';

      if (errorMessage.includes('账号已被禁用')) {
        showSupportModal.value = true;
        return;
      }

      if (errorData?.code === 'EMAIL_NOT_VERIFIED') {
        router.push({ path: '/verify-email', state: { email: errorData.email || '' } });
        return;
      }

      if (errorData?.code === 'EMAIL_REQUIRED') {
        router.push({
          path: '/verify-email',
          state: { tempToken: errorData.tempToken, mode: 'bind' },
        });
        return;
      }

      if (errorData?.code === 'PHONE_NOT_VERIFIED') {
        router.push({ path: '/verify-phone', state: { phone: errorData.phone || '' } });
        return;
      }

      if (errorData?.code === 'PHONE_REQUIRED') {
        router.push({
          path: '/verify-phone',
          state: { tempToken: errorData.tempToken, mode: 'bind' },
        });
        return;
      }

      error.value = errorMessage;
    } finally {
      loading.value = false;
    }
  }

  async function handlePhoneSubmit(): Promise<void> {
    loading.value = true;
    error.value = null;

    if (!phoneForm.value.phone || !/^1[3-9]\d{9}$/.test(phoneForm.value.phone)) {
      error.value = '请输入正确的手机号';
      loading.value = false;
      return;
    }

    if (!phoneForm.value.code || !/^\d{6}$/.test(phoneForm.value.code)) {
      error.value = '请输入6位数字验证码';
      loading.value = false;
      return;
    }

    try {
      await loginByPhone(phoneForm.value.phone, phoneForm.value.code);
      router.push('/');
    } catch (err: unknown) {
      const errorData = (
        err as Error & {
          response?: { data?: { code?: string; message?: string; phone?: string } };
        }
      ).response?.data;
      const errorCode = errorData?.code;
      const errorMessage =
        errorData?.message || (err as Error).message || '登录失败，请重试';

      if (errorMessage.includes('账号已被禁用')) {
        showSupportModal.value = true;
        return;
      }

      if (errorCode === 'PHONE_NOT_REGISTERED') {
        router.push({
          path: '/register',
          state: {
            prefillPhone: phoneForm.value.phone,
            prefillCode: phoneForm.value.code,
          },
        });
        return;
      }

      error.value = errorMessage;
    } finally {
      loading.value = false;
    }
  }

  async function handleWechatLogin(): Promise<void> {
    try {
      setAuthError(null);
      await loginWithWechat();
    } catch (err: unknown) {
      const axiosErr = err as Error & { response?: { data?: { message?: string } } };
      const errorMessage =
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        '微信登录失败';
      setAuthError(errorMessage);
    }
  }

  function handleWechatCallback(): void {
    const hash = window.location.hash;
    if (hash.includes('wechat_result')) {
      try {
        const hashValue = hash.split('wechat_result=')[1];
        if (hashValue) {
          const result = JSON.parse(decodeURIComponent(hashValue));
          window.history.replaceState(null, '', window.location.pathname);

          const isPopup = result.isPopup === true;

          if (isPopup) {
            localStorage.setItem('wechat_auth_result', JSON.stringify(result));
            window.close();
          } else {
            if (result.error) {
              alert(`微信登录失败：${result.error}`);
            } else if (result.needRegister) {
              sessionStorage.setItem('wechatTempToken', result.tempToken);
              router.push('/register?wechat=1');
            } else if (result.accessToken) {
              localStorage.setItem('accessToken', result.accessToken);
              localStorage.setItem('refreshToken', result.refreshToken);
              localStorage.setItem('user', JSON.stringify(result.user));
              window.location.href = '/';
            }
          }
        }
      } catch (e) {
        console.error('解析微信登录结果失败', e);
      }
    }
  }

  function handleLocationState(): void {
    const state = window.history.state as { message?: string } | null;
    if (state?.message) {
      success.value = state.message;
      window.history.replaceState({}, '');
    }
  }

  watch(
    () => [isAuthenticated.value, authLoading.value],
    ([authed, authing]) => {
      if (authed && !authing) {
        const state = window.history.state as { from?: string } | null;
        const from = state?.from || '/';
        router.push(from);
      }
    },
    { immediate: true },
  );

  return {
    smsEnabled,
    mailEnabled,
    wechatEnabled,
    accountLoginLabel,
    accountLoginPlaceholder,
    activeTab,
    formData,
    phoneForm,
    loading,
    error,
    success,
    showPassword,
    countdown,
    sendingCode,
    sendCodeButtonText,
    showSupportModal,
    authError,
    onTabChange,
    onPhoneInput,
    handleSendCode,
    handleAccountSubmit,
    handlePhoneSubmit,
    handleWechatLogin,
    handleWechatCallback,
    handleLocationState,
    clearError,
  };
}