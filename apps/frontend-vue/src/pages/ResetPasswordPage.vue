<!--
  重置密码页面 — 来源：apps/frontend/src/pages/ResetPassword.tsx
  业务逻辑完全照搬 React 版，UI 使用 Vuetify 3 组件
-->
<template>
  <!-- 成功状态：来源 ResetPassword.tsx 行120-157 -->
  <div v-if="success" class="text-center py-6">
    <v-icon size="64" color="success" class="mb-4">mdi-check-circle</v-icon>
    <div class="text-h5 font-weight-bold mb-2">{{ t('resetPassword.successTitle') }}</div>
    <div class="text-body-2 text-medium-emphasis">{{ t('resetPassword.successMessage') }}</div>
  </div>

  <!-- 表单状态：来源 ResetPassword.tsx 行159-432 -->
  <div v-else>
    <!-- 表单头部：来源 ResetPassword.tsx 行180-183 -->
    <div class="text-center mb-6">
      <div class="text-h6 font-weight-bold mb-1">{{ t('resetPassword.title') }}</div>
      <div class="text-body-2 text-medium-emphasis">{{ t('resetPassword.subtitle') }}</div>
    </div>

    <!-- 错误提示：来源 ResetPassword.tsx 行186-191 -->
    <v-alert
      v-if="error"
      type="error"
      variant="tonal"
      density="comfortable"
      class="mb-4"
      closable
      @click:close="error = null"
    >
      {{ error }}
    </v-alert>

    <!-- 表单：来源 ResetPassword.tsx 行194-335 -->
    <v-form @submit.prevent="handleSubmit">
      <!-- 邮箱/手机号字段：来源 ResetPassword.tsx 行195-239 -->
      <v-text-field
        v-if="contactType === 'email'"
        :model-value="formData.email"
        :label="t('resetPassword.emailAddress')"
        prepend-inner-icon="mdi-email-outline"
        variant="outlined"
        density="comfortable"
        readonly
        class="mb-3"
      />
      <v-text-field
        v-else
        :model-value="formData.phone"
        :label="t('resetPassword.phoneNumber')"
        prepend-inner-icon="mdi-phone-outline"
        variant="outlined"
        density="comfortable"
        readonly
        class="mb-3"
      />

      <!-- 验证码字段：来源 ResetPassword.tsx 行241-260 -->
      <v-text-field
        v-model="formData.code"
        :label="t('resetPassword.verificationCode')"
        prepend-inner-icon="mdi-key-variant"
        variant="outlined"
        density="comfortable"
        maxlength="6"
        :placeholder="t('resetPassword.enterCode')"
        class="mb-3"
        @update:model-value="clearError"
      />

      <!-- 新密码字段：来源 ResetPassword.tsx 行262-288 -->
      <v-text-field
        v-model="formData.newPassword"
        :label="t('resetPassword.newPassword')"
        prepend-inner-icon="mdi-lock-outline"
        :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
        :type="showPassword ? 'text' : 'password'"
        variant="outlined"
        density="comfortable"
        autocomplete="new-password"
        :placeholder="t('resetPassword.enterNewPassword')"
        class="mb-3"
        @click:append-inner="showPassword = !showPassword"
        @update:model-value="clearError"
      />

      <!-- 确认新密码字段：来源 ResetPassword.tsx 行290-320 -->
      <v-text-field
        v-model="formData.confirmPassword"
        :label="t('resetPassword.confirmNewPassword')"
        prepend-inner-icon="mdi-lock-outline"
        :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
        :type="showConfirmPassword ? 'text' : 'password'"
        variant="outlined"
        density="comfortable"
        autocomplete="new-password"
        :placeholder="t('resetPassword.confirmPassword')"
        class="mb-4"
        @click:append-inner="showConfirmPassword = !showConfirmPassword"
        @update:model-value="clearError"
      />

      <!-- 提交按钮：来源 ResetPassword.tsx 行322-334 -->
      <v-btn
        type="submit"
        color="primary"
        variant="flat"
        block
        size="large"
        :loading="loading"
        :disabled="loading"
      >
        {{ t('resetPassword.submit') }}
      </v-btn>
    </v-form>

    <!-- 返回登录：来源 ResetPassword.tsx 行338-343 -->
    <div class="text-center mt-6 pt-4" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
      <v-btn
        variant="text"
        size="small"
        color="primary"
        @click="router.push('/login')"
      >
        <v-icon start>mdi-arrow-left</v-icon>
        {{ t('common.backToLogin') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 重置密码页面
 *
 * 业务逻辑来源：apps/frontend/src/pages/ResetPassword.tsx
 * 逐行对照迁移，不添加/省略任何逻辑
 */
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { authApi } from '@/services/authApi';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useBrandConfig } from '@/composables/useBrandConfig';
import { useTheme } from '@/composables/useTheme';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

// 来源：ResetPassword.tsx 行43-47
useDocumentTitle(t('resetPassword.documentTitle'));
const router = useRouter();
const route = useRoute();
const { config: brandConfig } = useBrandConfig();
const { isDark } = useTheme();

// 来源：ResetPassword.tsx 行49-54 — 从路由 state 获取 email/phone
interface LocationState {
  email?: string;
  phone?: string;
}

const emailFromState = (route.state as LocationState)?.email || '';
const phoneFromState = (route.state as LocationState)?.phone || '';
const contactType = computed(() => emailFromState ? 'email' : 'phone');

// 来源：ResetPassword.tsx 行56-67 — 状态定义
const formData = ref({
  email: emailFromState,
  phone: phoneFromState,
  code: '',
  newPassword: '',
  confirmPassword: '',
});
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// 来源：ResetPassword.tsx 行69-73 — 输入时清除错误
function clearError() {
  if (error.value) error.value = null;
}

// 来源：ResetPassword.tsx 行75-117 — 提交逻辑
async function handleSubmit() {
  loading.value = true;
  error.value = null;

  // 来源：ResetPassword.tsx 行80-84 — 密码不一致校验
  if (formData.value.newPassword !== formData.value.confirmPassword) {
    error.value = t('resetPassword.passwordMismatch');
    loading.value = false;
    return;
  }

  // 来源：ResetPassword.tsx 行86-90 — 密码长度校验
  if (formData.value.newPassword.length < 6) {
    error.value = t('resetPassword.passwordTooShort');
    loading.value = false;
    return;
  }

  try {
    // 来源：ResetPassword.tsx 行93-100 — 调用 API
    await authApi.resetPassword({
      email: formData.value.email || undefined,
      phone: formData.value.phone || undefined,
      code: formData.value.code,
      newPassword: formData.value.newPassword,
      confirmPassword: formData.value.confirmPassword,
      validateContact: '',
    });

    // 来源：ResetPassword.tsx 行101-106 — 成功后 2s 跳转登录页
    success.value = true;
    setTimeout(() => {
      router.push({
        path: '/login',
        state: { message: t('resetPassword.resetSuccessMessage') },
      });
    }, 2000);
  } catch (err) {
    // 来源：ResetPassword.tsx 行107-113 — 错误处理
    const axiosErr = err as Error & { response?: { data?: { message?: string } } };
    error.value =
      axiosErr.response?.data?.message ||
      axiosErr.message ||
      t('resetPassword.resetFailed');
  } finally {
    // 来源：ResetPassword.tsx 行114-116
    loading.value = false;
  }
}
</script>
