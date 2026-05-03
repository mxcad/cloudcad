<template>
  <!-- 来源：apps/frontend/src/pages/EmailVerification.tsx -->
  <!-- 成功状态：照搬 React 行215-252 -->
  <template v-if="success">
    <v-container fill-height fluid class="d-flex flex-column align-center justify-center">
      <v-card rounded="xl" elevation="2" class="pa-8" max-width="420" width="100%">
        <div class="text-center pa-4">
          <v-avatar size="80" color="success" class="mb-6">
            <v-icon size="40" icon="mdi-check-circle" />
          </v-avatar>
          <div class="text-h5 font-weight-bold mb-2">{{ t('verifyEmail.successTitle') }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ t('verifyEmail.successMessage') }}
          </div>
        </div>
      </v-card>
    </v-container>
  </template>

  <!-- 主表单：照搬 React 行254-487 -->
  <template v-else>
    <v-container fill-height fluid class="d-flex flex-column align-center justify-center">
      <v-card rounded="xl" elevation="2" class="pa-6 pa-md-8" max-width="420" width="100%">

        <!-- Logo 区域 — 照搬 React 行265-271 -->
        <div class="text-center mb-6">
          <v-avatar size="72" class="mb-3">
            <v-img :src="appLogo" :alt="appName" />
          </v-avatar>
          <div class="text-h5 font-weight-bold">{{ appName }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ getSubtitle() }}
          </div>
        </div>

        <!-- 邮件提示 — 照搬 React 行274-291 -->
        <v-sheet color="surface-variant" rounded="lg" class="pa-4 mb-5 text-center">
          <v-avatar size="48" color="primary" class="mb-2">
            <v-icon icon="mdi-email-outline" />
          </v-avatar>
          <div class="text-body-2">
            <template v-if="bindMode && !emailSent">
              {{ t('verifyEmail.bindModePrompt') }}
            </template>
            <template v-else-if="phoneRegisterData && !email">
              {{ t('verifyEmail.phoneRegisterPrompt') }}
            </template>
            <template v-else-if="email">
              {{ t('verifyEmail.codeSentTo', { email }) }}
            </template>
            <template v-else>
              {{ t('verifyEmail.enterCodePrompt') }}
            </template>
          </div>
        </v-sheet>

        <!-- 绑定/手机注册模式：邮箱输入框 — 照搬 React 行293-313 -->
        <template v-if="(bindMode || phoneRegisterData) && !emailSent">
          <v-text-field
            v-model="email"
            :label="t('verifyEmail.emailAddress')"
            :placeholder="t('verifyEmail.enterEmailAddress')"
            type="email"
            :disabled="loading"
            prepend-inner-icon="mdi-email-outline"
            variant="outlined"
            density="comfortable"
            class="mb-4"
            @update:model-value="error = null"
          />
        </template>

        <!-- 错误提示 — 照搬 React 行315-321 -->
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="comfortable"
          class="mb-4"
          closable
        >
          {{ error }}
        </v-alert>

        <!-- 成功提示 — 照搬 React 行323-329 -->
        <v-alert
          v-if="resendSuccess"
          type="success"
          variant="tonal"
          density="comfortable"
          class="mb-4"
        >
          {{ t('verifyEmail.resendSuccess') }}
        </v-alert>

        <!-- 验证码输入 — 照搬 React 行331-353，只有输入了邮箱后才显示 -->
        <template v-if="email">
          <v-otp-input
            v-model="verificationCode"
            :length="6"
            type="number"
            :disabled="loading"
            variant="outlined"
            class="mb-1"
            @update:model-value="error = null"
          />
          <div class="text-caption text-medium-emphasis text-center mb-5">
            {{ t('verifyEmail.checkEmail') }}
          </div>
        </template>

        <!-- 验证按钮 — 照搬 React 行355-372 -->
        <v-btn
          color="primary"
          variant="flat"
          size="large"
          block
          :loading="loading"
          :disabled="!email || verificationCode.length !== 6"
          @click="handleVerifyCode"
        >
          <template #loader>
            <v-progress-circular indeterminate size="20" width="2" class="mr-2" />
            {{ t('verifyEmail.verifying') }}
          </template>
          {{ t('verifyEmail.verify') }}
        </v-btn>

        <!-- 帮助信息 — 照搬 React 行374-382 -->
        <v-sheet color="surface-variant" rounded="lg" class="pa-3 mt-5 mb-4">
          <div class="text-caption font-weight-bold mb-1">{{ t('verifyEmail.noEmailTitle') }}</div>
          <ul class="text-caption text-medium-emphasis pl-4" style="list-style: disc;">
            <li>{{ t('verifyEmail.checkSpam') }}</li>
            <li>{{ t('verifyEmail.confirmEmail') }}</li>
            <li>{{ t('verifyEmail.codeValidTime') }}</li>
          </ul>
        </v-sheet>

        <!-- 重发和返回按钮 — 照搬 React 行384-413 -->
        <div class="d-flex flex-column ga-2 mb-4">
          <v-btn
            variant="outlined"
            :loading="resendLoading"
            :disabled="resendCooldown > 0 || !email"
            @click="handleResendEmail"
          >
            <template #loader>
              <v-progress-circular indeterminate size="16" width="2" class="mr-2" />
              {{ t('verifyEmail.sending') }}
            </template>
            <template v-if="resendCooldown > 0">
              <v-icon icon="mdi-refresh" start size="16" />
              {{ t('verifyEmail.resendCooldown', { seconds: resendCooldown }) }}
            </template>
            <template v-else>
              <v-icon icon="mdi-refresh" start size="16" />
              {{ getResendButtonText() }}
            </template>
          </v-btn>

          <v-btn
            variant="text"
            @click="router.push('/login')"
          >
            <v-icon icon="mdi-arrow-left" start size="16" />
            {{ t('common.backToLogin') }}
          </v-btn>
        </div>

      </v-card>

      <div class="text-caption text-medium-emphasis mt-6">
        &copy; 2026 {{ appName }}. All rights reserved.
      </div>
    </v-container>
  </template>
</template>

<script setup lang="ts">
/**
 * VerifyEmailPage — 邮箱验证页面
 *
 * 来源：apps/frontend/src/pages/EmailVerification.tsx
 * 逻辑照搬全部业务分支，UI 用 Vuetify 组件重写
 */
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { authApi } from '@/services/authApi';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useBrandConfig } from '@/composables/useBrandConfig';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

// ——— 常量 ——— 照搬 React 行22
const RESEND_COOLDOWN_SECONDS = 60;

// ——— 组合式函数 ———
const router = useRouter();
const route = useRoute();
const { verifyEmailAndLogin, isAuthenticated } = useAuth();
const { config: brandConfig } = useBrandConfig();
useDocumentTitle(t('verifyEmail.title'));

// ——— 品牌配置 ——— 照搬 React 行42-43
const appName = computed(() => brandConfig.value?.title || 'CloudCAD');
const appLogo = computed(() => brandConfig.value?.logo || '/logo.png');

// ——— 路由状态 ——— 照搬 React 行45-56
const routeState = route.query as Record<string, string | undefined>;
// 也从 hash state（router push state）读取
const state = (history.state || {}) as Record<string, unknown>;
const stateEmail = (state.email as string) || routeState.email || '';
const stateMode = (state.mode as string) || routeState.mode || '';
const stateTempToken = (state.tempToken as string) || routeState.tempToken || '';
const statePhone = (state.phone as string) || routeState.phone || '';
const stateCode = (state.code as string) || routeState.code || '';
const stateUsername = (state.username as string) || routeState.username || '';
const statePassword = (state.password as string) || routeState.password || '';
const stateNickname = (state.nickname as string) || routeState.nickname || '';

// 绑定模式 — 照搬 React 行46
const bindMode = stateMode === 'bind';
const tempToken = stateTempToken || '';

// 手机号注册数据 — 照搬 React 行49-56
const phoneRegisterData = statePhone ? {
  phone: statePhone,
  code: stateCode,
  username: stateUsername,
  password: statePassword,
  nickname: stateNickname,
} : null;

// ——— 响应式状态 ——— 照搬 React 行58-68
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);
const email = ref('');
const emailSent = ref(false);
const verificationCode = ref('');

// 重发相关 — 照搬 React 行66-68
const resendLoading = ref(false);
const resendCooldown = ref(0);
const resendSuccess = ref(false);

// 防止重复自动发送 — 照搬 React 行70
const hasAutoSent = ref(false);

// ——— 辅助函数 ———
function getSubtitle() {
  if (bindMode) {
    return t('verifyEmail.bindModeSubtitle');
  }
  if (phoneRegisterData) {
    return t('verifyEmail.phoneRegisterSubtitle');
  }
  return t('verifyEmail.verifySubtitle');
}

function getResendButtonText() {
  if (!emailSent && (bindMode || phoneRegisterData)) {
    return t('verifyEmail.sendCode');
  }
  return t('verifyEmail.resendCode');
}

// ——— 倒计时定时器 ——— 照搬 React 行98-109
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

watch(resendCooldown, (val) => {
  if (val <= 0) {
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    return;
  }
  if (cooldownTimer) return; // 已在计时
  cooldownTimer = setInterval(() => {
    resendCooldown.value = Math.max(0, resendCooldown.value - 1);
  }, 1000);
});

onUnmounted(() => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
});

// ——— 初始化：已认证跳转 + 自动发送 ——— 照搬 React 行72-96
onMounted(() => {
  if (isAuthenticated.value) {
    router.replace('/');
    return;
  }

  if (stateEmail) {
    email.value = stateEmail;
    // 非绑定模式下已有邮箱，自动发送验证码 — 照搬 React 行82-94
    if (stateMode !== 'bind' && !hasAutoSent.value) {
      hasAutoSent.value = true;
      emailSent.value = true;
      resendCooldown.value = RESEND_COOLDOWN_SECONDS;
      authApi.resendVerification(stateEmail).catch((err: unknown) => {
        const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage =
          axiosErr.response?.data?.message ||
          axiosErr.message ||
          t('verifyEmail.autoSendFailed');
        error.value = errorMessage;
      });
    }
  }
});

// ——— 提取错误信息辅助 ———
function extractError(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
  return axiosErr.response?.data?.message || axiosErr.message || fallback;
}

// ——— 验证码提交 ——— 照搬 React 行111-176
async function handleVerifyCode(): Promise<void> {
  // 照搬 React 行112-123 校验
  if (!verificationCode.value.trim()) {
    error.value = t('verifyEmail.pleaseEnterCode');
    return;
  }
  if (verificationCode.value.length !== 6) {
    error.value = t('verifyEmail.codeShouldBe6Digits');
    return;
  }
  if (!email.value) {
    error.value = bindMode ? t('verifyEmail.pleaseEnterEmail') : t('verifyEmail.emailMissing');
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    if (bindMode) {
      // 绑定模式 — 照搬 React 行129-140
      const response = await authApi.bindEmailAndLogin(tempToken, email.value, verificationCode.value.trim());
      const data = (response.data || response) as { accessToken: string; refreshToken: string; user: unknown };
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      // 直接刷新页面 — 照搬 React 行139
      window.location.href = '/';
      return;
    } else if (phoneRegisterData) {
      // 手机号注册场景 — 照搬 React 行141-156
      const response = await authApi.verifyEmailAndRegisterPhone(
        email.value,
        verificationCode.value.trim(),
        phoneRegisterData,
      );
      const data = (response.data || response) as { accessToken: string; refreshToken: string; user: unknown };
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/';
      return;
    } else {
      // 验证模式 — 照搬 React 行157-160
      await verifyEmailAndLogin(email.value, verificationCode.value.trim());
    }

    success.value = true;
    // 照搬 React 行162-165，1.5 秒后跳转
    setTimeout(() => {
      router.replace('/');
    }, 1500);
  } catch (err) {
    error.value = extractError(err, t('verifyEmail.verifyFailed'));
  } finally {
    loading.value = false;
  }
}

// ——— 重发验证邮件 ——— 照搬 React 行178-212
async function handleResendEmail(): Promise<void> {
  // 照搬 React 行179-181
  if (!email.value) {
    error.value = t('verifyEmail.pleaseEnterEmailFirst');
    return;
  }

  // 照搬 React 行184-187 验证邮箱格式
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = t('verifyEmail.pleaseEnterValidEmail');
    return;
  }

  // 照搬 React 行189 冷却/加载检查
  if (resendCooldown.value > 0 || resendLoading.value) return;

  resendLoading.value = true;
  error.value = null;
  resendSuccess.value = false;

  try {
    await authApi.resendVerification(email.value);
    resendSuccess.value = true;
    emailSent.value = true;
    resendCooldown.value = RESEND_COOLDOWN_SECONDS;
    // 照搬 React 行201 5秒后隐藏成功提示
    setTimeout(() => { resendSuccess.value = false; }, 5000);
  } catch (err) {
    error.value = extractError(err, t('verifyEmail.resendFailed'));
  } finally {
    resendLoading.value = false;
  }
}
</script>
