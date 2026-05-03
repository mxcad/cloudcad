import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useRegisterConfig } from '@/composables/useRegisterConfig';
import { useRegisterForm } from '@/composables/useRegisterForm';
import { useRegisterSubmit } from '@/composables/useRegisterSubmit';

export function useRegister() {
  const router = useRouter();
  const route = useRoute();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const {
    appName,
    appLogo,
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    configLoading,
    registrationClosed,
  } = useRegisterConfig();

  const isWechatEntry = route.query.wechat === '1';
  if (!isWechatEntry) {
    sessionStorage.removeItem('wechatTempToken');
  }
  const wechatTempToken = sessionStorage.getItem('wechatTempToken') || '';
  const isWechatRegister = !!wechatTempToken;

  let wechatNickname = '';
  if (isWechatRegister && wechatTempToken) {
    try {
      const tokenPart = wechatTempToken.split('.')[1];
      if (tokenPart) {
        const base64 = tokenPart.replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join(''),
        );
        const payload = JSON.parse(jsonStr);
        wechatNickname = payload.nickname || '';
      }
    } catch {
      /* ignore */
    }
  }

  const {
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
  } = useRegisterForm({
    mailEnabled: mailEnabled.value,
    requireEmailVerification: requireEmailVerification.value,
    smsEnabled: smsEnabled.value,
    requirePhoneVerification: requirePhoneVerification.value,
    wechatNickname,
  });

  const { loading, handleSubmit } = useRegisterSubmit({
    mailEnabled: mailEnabled.value,
    requireEmailVerification: requireEmailVerification.value,
    smsEnabled: smsEnabled.value,
    requirePhoneVerification: requirePhoneVerification.value,
  });

  watch(
    () => [isAuthenticated.value, authLoading.value],
    ([authed, authLoad]) => {
      if (authed && !authLoad) {
        router.replace('/');
      }
    },
  );

  onMounted(() => {
    const state = route.query as Record<string, string>;
    const prefillPhone = state.prefillPhone;
    const prefillCode = state.prefillCode;
    if (prefillPhone) {
      phoneForm.phone = prefillPhone;
      phoneForm.code = prefillCode || '';
      router.replace({ query: {} });
    }
  });

  async function handleNext(): Promise<void> {
    const isValid = await validateStep(currentStep.value);
    if (isValid) {
      currentStep.value++;
    }
  }

  function handleBack(): void {
    currentStep.value--;
  }

  async function handleFormSubmit(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await handleSubmit({
        formData,
        phoneForm,
        confirmPassword: confirmPassword.value,
        isWechatRegister,
        wechatTempToken,
        fieldErrors,
      });
    } catch (err) {
      error.value = (err as Error).message || '注册失败，请稍后重试';
    } finally {
      loading.value = false;
    }
  }

  function navigateToLogin(): void {
    router.push('/login');
  }

  onUnmounted(() => {
    sessionStorage.removeItem('wechatTempToken');
  });

  return {
    appName,
    appLogo,
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    configLoading,
    registrationClosed,
    isWechatRegister,
    formData,
    phoneForm,
    confirmPassword,
    countdown,
    sendingCode,
    loading,
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
    handleChange,
    handlePhoneChange,
    handleBlur,
    handleSendCode,
    handleNext,
    handleBack,
    handleSubmit: handleFormSubmit,
    navigateToLogin,
    clearErrors,
  };
}