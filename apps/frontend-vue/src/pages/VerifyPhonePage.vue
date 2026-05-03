<template>
  <!-- 来源：apps/frontend/src/pages/PhoneVerification.tsx -->
  <!-- 成功状态：照搬 React 行179-216 -->
  <template v-if="success">
    <v-container fill-height fluid class="d-flex flex-column align-center justify-center">
      <v-card rounded="xl" elevation="2" class="pa-8" max-width="420" width="100%">
        <div class="text-center pa-4">
          <v-avatar size="80" color="success" class="mb-6">
            <v-icon size="40" icon="mdi-check-circle" />
          </v-avatar>
          <div class="text-h5 font-weight-bold mb-2">{{ t('verifyPhone.successTitle') }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ t('verifyPhone.successMessage') }}
          </div>
        </div>
      </v-card>
    </v-container>
  </template>

  <!-- 主表单：照搬 React 行218-448 -->
  <template v-else>
    <v-container fill-height fluid class="d-flex flex-column align-center justify-center">
      <v-card rounded="xl" elevation="2" class="pa-6 pa-md-8" max-width="420" width="100%">

        <!-- Logo 区域 — 照搬 React 行228-236 -->
        <div class="text-center mb-6">
          <v-avatar size="72" class="mb-3">
            <v-img :src="appLogo" :alt="appName" />
          </v-avatar>
          <div class="text-h5 font-weight-bold">{{ appName }}</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ bindMode ? t('verifyPhone.bindSubtitle') : t('verifyPhone.verifySubtitle') }}
          </div>
        </div>

        <!-- 手机号提示 — 照搬 React 行238-253 -->
        <v-sheet color="surface-variant" rounded="lg" class="pa-4 mb-5 text-center">
          <v-avatar size="48" color="primary" class="mb-2">
            <v-icon icon="mdi-phone-outline" />
          </v-avatar>
          <div class="text-body-2">
            <template v-if="bindMode && !codeSent">
              {{ t('verifyPhone.bindModePrompt') }}
            </template>
            <template v-else-if="phone">
              {{ t('verifyPhone.codeSentTo', { phone }) }}
            </template>
            <template v-else>
              {{ t('verifyPhone.enterCodePrompt') }}
            </template>
          </div>
        </v-sheet>

        <!-- 绑定模式：手机号输入框 — 照搬 React 行255-277 -->
        <template v-if="bindMode && !codeSent">
          <v-text-field
            v-model="phone"
            :label="t('verifyPhone.phoneNumber')"
            :placeholder="t('verifyPhone.enterPhoneNumber')"
            :disabled="loading"
            :maxlength="11"
            prepend-inner-icon="mdi-phone-outline"
            variant="outlined"
            density="comfortable"
            class="mb-4"
            @update:model-value="onPhoneInput"
          />
        </template>

        <!-- 错误提示 — 照搬 React 行279-285 -->
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

        <!-- 成功提示 — 照搬 React 行287-293 -->
        <v-alert
          v-if="resendSuccess"
          type="success"
          variant="tonal"
          density="comfortable"
          class="mb-4"
        >
          {{ t('verifyPhone.resendSuccess') }}
        </v-alert>

        <!-- 验证码输入 — 照搬 React 行295-315 -->
        <v-otp-input
          v-model="verificationCode"
          :length="6"
          type="number"
          :disabled="loading"
          variant="outlined"
          class="mb-1"
          @update:model-value="onCodeInput"
        />
        <div class="text-caption text-medium-emphasis text-center mb-5">
          {{ t('verifyPhone.checkSms') }}
        </div>

        <!-- 验证按钮 — 照搬 React 行317-334 -->
        <v-btn
          color="primary"
          variant="flat"
          size="large"
          block
          :loading="loading"
          :disabled="verificationCode.length !== 6"
          @click="handleVerifyCode"
        >
          <template #loader>
            <v-progress-circular indeterminate size="20" width="2" class="mr-2" />
            {{ t('verifyPhone.verifying') }}
          </template>
          {{ t('verifyPhone.verify') }}
        </v-btn>

        <!-- 帮助信息 — 照搬 React 行336-344 -->
        <v-sheet color="surface-variant" rounded="lg" class="pa-3 mt-5 mb-4">
          <div class="text-caption font-weight-bold mb-1">{{ t('verifyPhone.noCodeTitle') }}</div>
          <ul class="text-caption text-medium-emphasis pl-4" style="list-style: disc;">
            <li>{{ t('verifyPhone.checkPhone') }}</li>
            <li>{{ t('verifyPhone.checkSmsBlocked') }}</li>
            <li>{{ t('verifyPhone.codeValidTime') }}</li>
          </ul>
        </v-sheet>

        <!-- 重发和返回按钮 — 照搬 React 行346-375 -->
        <div class="d-flex flex-column ga-2 mb-4">
          <v-btn
            variant="outlined"
            :loading="resendLoading"
            :disabled="resendCooldown > 0 || !phone"
            @click="handleResendCode"
          >
            <template #loader>
              <v-progress-circular indeterminate size="16" width="2" class="mr-2" />
              {{ t('verifyPhone.sending') }}
            </template>
            <template v-if="resendCooldown > 0">
              <v-icon icon="mdi-refresh" start size="16" />
              {{ t('verifyPhone.resendCooldown', { seconds: resendCooldown }) }}
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
 * VerifyPhonePage — 手机号验证页面
 *
 * 来源：apps/frontend/src/pages/PhoneVerification.tsx
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
const { verifyPhoneAndLogin, isAuthenticated } = useAuth();
const { config: brandConfig } = useBrandConfig();
useDocumentTitle(t('verifyPhone.title'));

// ——— 品牌配置 ——— 照搬 React 行37-38
const appName = computed(() => brandConfig.value?.title || 'CloudCAD');
const appLogo = computed(() => brandConfig.value?.logo || '/logo.png');

// ——— 路由状态 ——— 照搬 React 行40-42
const state = (history.state || {}) as Record<string, unknown>;
const statePhone = (state.phone as string) || '';
const stateMode = (state.mode as string) || '';
const stateTempToken = (state.tempToken as string) || '';

// 绑定模式 — 照搬 React 行41
const bindMode = stateMode === 'bind';
const tempToken = stateTempToken || '';

// ——— 响应式状态 ——— 照搬 React 行44-54
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);
const phone = ref('');
const codeSent = ref(false);
const verificationCode = ref('');

// 重发相关 — 照搬 React 行52-54
const resendLoading = ref(false);
const resendCooldown = ref(0);
const resendSuccess = ref(false);

// ——— 辅助函数 ———
function getResendButtonText() {
  if (!codeSent && bindMode) {
    return t('verifyPhone.sendCode');
  }
  return t('verifyPhone.resendCode');
}

// ——— 倒计时定时器 ——— 照搬 React 行72-83
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

watch(resendCooldown, (val) => {
  if (val <= 0) {
    if (cooldownTimer) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    return;
  }
  if (cooldownTimer) return;
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

// ——— 初始化：已认证跳转 + 自动设置手机号 ——— 照搬 React 行56-70
onMounted(() => {
  if (isAuthenticated.value) {
    router.replace('/');
    return;
  }

  if (statePhone) {
    phone.value = statePhone;
    // 照搬 React 行65-68 非绑定模式下已有手机号，标记已发送
    if (stateMode !== 'bind') {
      codeSent.value = true;
    }
  }
});

// ——— 手机号输入处理（只允许数字） ——— 照搬 React 行266-270
function onPhoneInput(val: string | number): void {
  const digits = String(val).replace(/\D/g, '');
  phone.value = digits;
  if (error.value) error.value = null;
}

// ——— 验证码输入处理（只允许数字） ——— 照搬 React 行305-309
function onCodeInput(val: string | number): void {
  const digits = String(val).replace(/\D/g, '');
  verificationCode.value = digits;
  if (error.value) error.value = null;
}

// ——— 提取错误信息辅助 ———
function extractError(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
  return axiosErr.response?.data?.message || axiosErr.message || fallback;
}

// ——— 验证码提交 ——— 照搬 React 行85-140
async function handleVerifyCode(): Promise<void> {
  // 照搬 React 行86-97 校验
  if (!verificationCode.value.trim()) {
    error.value = t('verifyPhone.pleaseEnterCode');
    return;
  }
  if (verificationCode.value.length !== 6) {
    error.value = t('verifyPhone.codeShouldBe6Digits');
    return;
  }
  if (!phone.value) {
    error.value = bindMode ? t('verifyPhone.pleaseEnterPhone') : t('verifyPhone.phoneMissing');
    return;
  }

  // 照搬 React 行99-103 绑定模式下验证手机号格式
  if (bindMode && !/^1[3-9]\d{9}$/.test(phone.value)) {
    error.value = t('verifyPhone.pleaseEnterValidPhone');
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    if (bindMode) {
      // 绑定模式 — 照搬 React 行109-121
      const response = await authApi.bindPhoneAndLogin(tempToken, phone.value, verificationCode.value.trim());
      const data = (response.data || response) as { accessToken: string; refreshToken: string; user: unknown };
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      // 直接刷新页面 — 照搬 React 行119
      window.location.href = '/';
      return;
    } else {
      // 验证模式 — 照搬 React 行122-124
      await verifyPhoneAndLogin(phone.value, verificationCode.value.trim());
    }

    success.value = true;
    // 照搬 React 行126-129，1.5 秒后跳转
    setTimeout(() => {
      router.replace('/');
    }, 1500);
  } catch (err) {
    error.value = extractError(err, t('verifyPhone.verifyFailed'));
  } finally {
    loading.value = false;
  }
}

// ——— 重发验证码 ——— 照搬 React 行142-176
async function handleResendCode(): Promise<void> {
  // 照搬 React 行143-146
  if (!phone.value) {
    error.value = bindMode ? t('verifyPhone.pleaseEnterPhoneFirst') : t('verifyPhone.phoneMissing');
    return;
  }

  // 照搬 React 行148-152 验证手机号格式
  if (!/^1[3-9]\d{9}$/.test(phone.value)) {
    error.value = t('verifyPhone.pleaseEnterValidPhone');
    return;
  }

  // 照搬 React 行154 冷却/加载检查
  if (resendCooldown.value > 0 || resendLoading.value) return;

  resendLoading.value = true;
  error.value = null;
  resendSuccess.value = false;

  try {
    await authApi.sendSmsCode(phone.value);
    resendSuccess.value = true;
    codeSent.value = true;
    resendCooldown.value = RESEND_COOLDOWN_SECONDS;
    // 照搬 React 行165 5秒后隐藏成功提示
    setTimeout(() => { resendSuccess.value = false; }, 5000);
  } catch (err) {
    error.value = extractError(err, t('verifyPhone.resendFailed'));
  } finally {
    resendLoading.value = false;
  }
}
</script>
