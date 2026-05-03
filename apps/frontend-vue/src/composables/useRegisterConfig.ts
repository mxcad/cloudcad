import { computed } from 'vue';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { useBrandConfig } from '@/composables/useBrandConfig';

export function useRegisterConfig() {
  const { config: runtimeConfig, loading: configLoading } = useRuntimeConfig();
  const { config: brandConfig } = useBrandConfig();

  const appName = computed(() => brandConfig.value?.title || 'CloudCAD');
  const appLogo = computed(() => brandConfig.value?.logo || '/logo.png');
  const mailEnabled = computed(() => runtimeConfig.value.mailEnabled);
  const requireEmailVerification = computed(
    () => runtimeConfig.value.requireEmailVerification ?? false,
  );
  const smsEnabled = computed(() => runtimeConfig.value.smsEnabled ?? false);
  const requirePhoneVerification = computed(
    () => runtimeConfig.value.requirePhoneVerification ?? false,
  );
  const registrationClosed = computed(
    () => !configLoading.value && !runtimeConfig.value.allowRegister,
  );

  return {
    appName,
    appLogo,
    mailEnabled,
    requireEmailVerification,
    smsEnabled,
    requirePhoneVerification,
    configLoading,
    registrationClosed,
  };
}