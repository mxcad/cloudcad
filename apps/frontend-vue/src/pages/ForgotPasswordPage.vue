<template>
  <!--
    ForgotPasswordPage — 照搬 ForgotPassword.tsx 全部逻辑
    来源：apps/frontend/src/pages/ForgotPassword.tsx
  -->
  <v-container fill-height fluid class="forgot-password-page">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card rounded="xl" elevation="2" class="pa-8 auth-card">

          <!-- Logo 区域 — 照搬 React 行113-119 / 行218-224 / 行342-349 -->
          <div class="text-center mb-6">
            <v-avatar size="72" rounded="lg" class="mb-3">
              <v-img :src="appLogo" :alt="appName" />
            </v-avatar>
            <div class="text-h5 font-weight-bold app-title">{{ appName }}</div>
            <!-- 默认表单状态时显示副标题 — 照搬 React 行348 -->
            <div v-if="!supportInfo && !success" class="text-body-2 text-medium-emphasis mt-1">
              {{ t('forgotPassword.recoverPassword') }}
            </div>
          </div>

          <!-- ==================== 状态一：客服联系页面 ==================== -->
          <!-- 照搬 React 行101-203: supportInfo 存在时显示 -->
          <template v-if="supportInfo">
            <div class="text-center">
              <v-avatar size="64" color="warning" class="mb-4">
                <v-icon size="28" icon="mdi-phone" color="white" />
              </v-avatar>
              <div class="text-h6 font-weight-bold mb-2">{{ t('forgotPassword.emailServiceDisabled') }}</div>
              <div class="text-body-2 text-medium-emphasis mb-6">
                {{ t('forgotPassword.contactSupportForReset') }}
              </div>

              <v-sheet rounded="lg" class="pa-5 mb-6" color="surface-variant">
                <div class="text-subtitle-2 font-weight-bold mb-3 text-left">{{ t('forgotPassword.contactInfo') }}</div>
                <div class="d-flex flex-column ga-3">
                  <!-- 照搬 React 行134-140: supportEmail -->
                  <a
                    v-if="supportInfo.supportEmail"
                    :href="'mailto:' + supportInfo.supportEmail"
                    class="support-item"
                  >
                    <v-icon size="18" icon="mdi-email-outline" />
                    <span>{{ supportInfo.supportEmail }}</span>
                  </a>
                  <!-- 照搬 React 行141-147: supportPhone -->
                  <a
                    v-if="supportInfo.supportPhone"
                    :href="'tel:' + supportInfo.supportPhone"
                    class="support-item"
                  >
                    <v-icon size="18" icon="mdi-phone-outline" />
                    <span>{{ supportInfo.supportPhone }}</span>
                  </a>
                  <!-- 照搬 React 行148-155: 两者都没有 -->
                  <p
                    v-if="!supportInfo.supportEmail && !supportInfo.supportPhone"
                    class="text-body-2 text-medium-emphasis mb-0"
                  >
                    {{ t('forgotPassword.noContactInfo') }}
                  </p>
                </div>
              </v-sheet>

              <!-- 照搬 React 行160-166: 返回登录按钮 -->
              <v-btn
                variant="outlined"
                block
                size="large"
                rounded="lg"
                @click="router.push('/login')"
              >
                <v-icon start icon="mdi-arrow-left" />
                {{ t('common.backToLogin') }}
              </v-btn>
            </div>
          </template>

          <!-- ==================== 状态二：发送成功页面 ==================== -->
          <!-- 照搬 React 行206-328: success 为 true 时显示 -->
          <template v-else-if="success">
            <div class="text-center">
              <v-avatar size="64" color="success" class="mb-4">
                <v-icon size="32" icon="mdi-check-circle" color="white" />
              </v-avatar>
              <div class="text-h6 font-weight-bold mb-2">{{ t('forgotPassword.codeSent') }}</div>
              <!-- 照搬 React 行232-238 -->
              <div class="text-body-2 text-medium-emphasis mb-6">
                {{ t('forgotPassword.codeSentTo', { contact: contactType === 'email' ? email : phone }) }}
              </div>

              <!-- 照搬 React 行240-247: 提示卡片 -->
              <v-sheet rounded="lg" class="pa-4 mb-6" color="success" style="opacity: 0.9;">
                <div class="d-flex align-center justify-center ga-2 text-success">
                  <v-icon size="16" icon="mdi-alert-circle-outline" />
                  <span>{{ t('forgotPassword.useCodeToReset') }}</span>
                </div>
              </v-sheet>

              <!-- 照搬 React 行249-263: 前往重置密码按钮 -->
              <div class="d-flex flex-column ga-3">
                <v-btn
                  color="primary"
                  variant="flat"
                  block
                  size="large"
                  rounded="lg"
                  @click="goToResetPassword"
                >
                  {{ t('forgotPassword.goToResetPassword') }}
                  <v-icon end icon="mdi-arrow-right" />
                </v-btn>

                <!-- 照搬 React 行265-272: 返回登录按钮 -->
                <v-btn
                  variant="outlined"
                  block
                  size="large"
                  rounded="lg"
                  @click="router.push('/login')"
                >
                  <v-icon start icon="mdi-arrow-left" />
                  {{ t('common.backToLogin') }}
                </v-btn>
              </div>
            </div>

            <!-- 照搬 React 行275-286: 特性图标栏 -->
            <div class="d-flex justify-center ga-3 mt-6 pt-6 border-t">
              <v-tooltip :text="t('common.highPerformance')">
                <template #activator="{ props: tooltipProps }">
                  <v-avatar size="32" variant="outlined" v-bind="tooltipProps" class="feature-dot">
                    <v-icon size="14" icon="mdi-chip" />
                  </v-avatar>
                </template>
              </v-tooltip>
              <v-tooltip :text="t('common.realTimeCollab')">
                <template #activator="{ props: tooltipProps }">
                  <v-avatar size="32" variant="outlined" v-bind="tooltipProps" class="feature-dot">
                    <v-icon size="14" icon="mdi-view-dashboard-outline" />
                  </v-avatar>
                </template>
              </v-tooltip>
              <v-tooltip :text="t('common.enterpriseSecurity')">
                <template #activator="{ props: tooltipProps }">
                  <v-avatar size="32" variant="outlined" v-bind="tooltipProps" class="feature-dot">
                    <v-icon size="14" icon="mdi-shield-check-outline" />
                  </v-avatar>
                </template>
              </v-tooltip>
            </div>
          </template>

          <!-- ==================== 状态三：默认表单 ==================== -->
          <!-- 照搬 React 行331-763: 默认表单状态 -->
          <template v-else>
            <!-- 照搬 React 行351-357: 表单标题 -->
            <div class="text-center mb-6">
              <div class="text-h6 font-weight-bold">{{ t('forgotPassword.forgotPassword') }}</div>
              <div class="text-body-2 text-medium-emphasis">
                {{ t('forgotPassword.receiveCodeBy', { type: contactType === 'email' ? t('forgotPassword.email') : t('forgotPassword.phone') }) }}
              </div>
            </div>

            <!-- 照搬 React 行360-377: 联系方式切换按钮 -->
            <v-btn-toggle
              v-model="contactType"
              mandatory
              divided
              rounded="lg"
              variant="outlined"
              density="comfortable"
              class="mb-5 w-100"
              @update:model-value="onContactTypeChange"
            >
              <v-btn value="email" class="flex-grow-1">
                <v-icon start icon="mdi-email-outline" />
                {{ t('forgotPassword.email') }}
              </v-btn>
              <v-btn value="phone" class="flex-grow-1">
                <v-icon start icon="mdi-phone-outline" />
                {{ t('forgotPassword.phone') }}
              </v-btn>
            </v-btn-toggle>

            <!-- 照搬 React 行379-399: 忘记联系方式链接 -->
            <div class="text-right mb-5">
              <v-btn
                variant="text"
                size="small"
                color="primary"
                @click="showSupportModal = true"
              >
                {{ contactType === 'email' ? t('forgotPassword.forgotEmail') : t('forgotPassword.forgotPhone') }}
              </v-btn>
            </div>

            <!-- 照搬 React 行402-407: 错误提示 -->
            <v-alert
              v-if="error"
              type="error"
              variant="tonal"
              rounded="lg"
              class="mb-5"
              closable
              @click:close="error = null"
            >
              {{ error }}
            </v-alert>

            <!-- 照搬 React 行410-468: 表单 -->
            <v-form @submit.prevent="handleSubmit">
              <!-- 照搬 React 行411-430: 邮箱输入 -->
              <v-text-field
                v-if="contactType === 'email'"
                v-model="email"
                :label="t('forgotPassword.emailAddress')"
                type="email"
                autocomplete="email"
                :placeholder="t('forgotPassword.enterEmailAddress')"
                prepend-inner-icon="mdi-email-outline"
                variant="outlined"
                rounded="lg"
                :rules="[v => !!v || t('forgotPassword.pleaseEnterEmail')]"
                class="mb-4"
              />
              <!-- 照搬 React 行432-452: 手机号输入 -->
              <v-text-field
                v-else
                v-model="phone"
                :label="t('forgotPassword.phoneNumber')"
                type="tel"
                autocomplete="tel"
                :placeholder="t('forgotPassword.enterPhoneNumber')"
                prepend-inner-icon="mdi-phone-outline"
                variant="outlined"
                rounded="lg"
                :rules="[v => !!v || t('forgotPassword.pleaseEnterPhone')]"
                class="mb-4"
              />

              <!-- 照搬 React 行455-467: 提交按钮 -->
              <v-btn
                type="submit"
                color="primary"
                variant="flat"
                block
                size="large"
                rounded="lg"
                :loading="loading"
                :disabled="loading"
              >
                <template v-if="!loading">
                  {{ t('forgotPassword.sendCode') }}
                  <v-icon end icon="mdi-arrow-right" />
                </template>
                <template v-else>
                  {{ t('forgotPassword.sending') }}
                </template>
              </v-btn>
            </v-form>

            <!-- 照搬 React 行471-476: 返回登录链接 -->
            <div class="text-center mt-6 pt-6 border-t">
              <v-btn
                variant="text"
                size="small"
                @click="router.push('/login')"
              >
                <v-icon start icon="mdi-arrow-left" size="16" />
                {{ t('common.backToLogin') }}
              </v-btn>
            </div>

            <!-- 照搬 React 行478-489: 特性图标栏 -->
            <div class="d-flex justify-center ga-3 mt-6 pt-6 border-t">
              <v-tooltip :text="t('common.highPerformance')">
                <template #activator="{ props: tooltipProps }">
                  <v-avatar size="32" variant="outlined" v-bind="tooltipProps" class="feature-dot">
                    <v-icon size="14" icon="mdi-chip" />
                  </v-avatar>
                </template>
              </v-tooltip>
              <v-tooltip :text="t('common.realTimeCollab')">
                <template #activator="{ props: tooltipProps }">
                  <v-avatar size="32" variant="outlined" v-bind="tooltipProps" class="feature-dot">
                    <v-icon size="14" icon="mdi-view-dashboard-outline" />
                  </v-avatar>
                </template>
              </v-tooltip>
              <v-tooltip :text="t('common.enterpriseSecurity')">
                <template #activator="{ props: tooltipProps }">
                  <v-avatar size="32" variant="outlined" v-bind="tooltipProps" class="feature-dot">
                    <v-icon size="14" icon="mdi-shield-check-outline" />
                  </v-avatar>
                </template>
              </v-tooltip>
            </div>
          </template>
        </v-card>

        <!-- 照搬 React 行169 / 行288 / 行492: 版权信息 -->
        <div class="text-center mt-6 text-caption text-medium-emphasis">
          &copy; 2026 {{ appName }}. All rights reserved.
        </div>
      </v-col>
    </v-row>

    <!-- ==================== 联系客服弹框 ==================== -->
    <!-- 照搬 React 行496-543: showSupportModal 弹框 -->
    <v-dialog v-model="showSupportModal" max-width="400">
      <v-card rounded="lg">
        <!-- 照搬 React 行498-507: 弹框头部 -->
        <v-card-title class="d-flex align-center justify-space-between pa-4">
          <span class="text-subtitle-1 font-weight-bold">{{ t('forgotPassword.contactSupport') }}</span>
          <v-btn icon variant="text" size="small" @click="showSupportModal = false">
            <v-icon icon="mdi-close" />
          </v-btn>
        </v-card-title>

        <v-divider />

        <!-- 照搬 React 行508-531: 弹框内容 -->
        <v-card-text class="pa-5">
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ t('forgotPassword.contactSupportMessage') }}
          </p>
          <v-sheet rounded="lg" class="pa-4" color="surface-variant">
            <div class="d-flex align-center mb-3">
              <span class="text-body-2 text-medium-emphasis" style="width: 80px; flex-shrink: 0;">{{ t('forgotPassword.supportEmail') }}：</span>
              <a href="mailto:support@cloudcad.com" class="text-primary text-body-2 text-decoration-none">support@cloudcad.com</a>
            </div>
            <div class="d-flex align-center mb-3">
              <span class="text-body-2 text-medium-emphasis" style="width: 80px; flex-shrink: 0;">{{ t('forgotPassword.supportPhone') }}：</span>
              <a href="tel:400-123-4567" class="text-primary text-body-2 text-decoration-none">400-123-4567</a>
            </div>
            <div class="d-flex align-center">
              <span class="text-body-2 text-medium-emphasis" style="width: 80px; flex-shrink: 0;">{{ t('forgotPassword.workingHours') }}：</span>
              <span class="text-body-2">{{ t('forgotPassword.workingHoursValue') }}</span>
            </div>
          </v-sheet>
        </v-card-text>

        <v-divider />

        <!-- 照搬 React 行533-540: 弹框底部 -->
        <v-card-actions class="pa-4 justify-end">
          <v-btn color="primary" variant="flat" rounded="lg" @click="showSupportModal = false">
            {{ t('common.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
/**
 * ForgotPasswordPage — 照搬 ForgotPassword.tsx 全部逻辑
 *
 * 来源：apps/frontend/src/pages/ForgotPassword.tsx
 * 业务逻辑完全照搬 React 版，UI 使用 Vuetify 组件
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { authApi } from '@/services/authApi';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useBrandConfig } from '@/composables/useBrandConfig';
import { useTheme } from '@/composables/useTheme';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

useDocumentTitle(t('forgotPassword.title'));

const router = useRouter();
const { config: runtimeConfig } = useRuntimeConfig();
const { config: brandConfig } = useBrandConfig();
const { isDark } = useTheme();

// 照搬 React 行42-43: appName / appLogo
const appName = computed(() => brandConfig.value?.title || 'CloudCAD');
const appLogo = computed(() => brandConfig.value?.logo || '/logo.png');

// ==================== 响应式状态 ====================
// 照搬 React 行45-55: 全部 state

const contactType = ref<'email' | 'phone'>('email');
const email = ref('');
const phone = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);
const supportInfo = ref<{
  supportEmail?: string;
  supportPhone?: string;
} | null>(null);
const showSupportModal = ref(false);

// ==================== 联系方式切换处理 ====================
// 照搬 React 行364/372: setContactType 时清空另一个字段

function onContactTypeChange(val: 'email' | 'phone'): void {
  if (val === 'email') {
    phone.value = '';
  } else {
    email.value = '';
  }
}

// ==================== 提交表单 ====================
// 照搬 React 行57-98: handleSubmit

async function handleSubmit(): Promise<void> {
  loading.value = true;
  error.value = null;

  try {
    // 照搬 React 行63-67: 调用 authApi.forgotPassword
    const response = await authApi.forgotPassword({
      email: contactType.value === 'email' ? email.value : undefined,
      phone: contactType.value === 'phone' ? phone.value : undefined,
      validateContact: '',
    });
    const data = response.data;

    // 照搬 React 行70-77: 判断 mailEnabled 和 smsEnabled
    if (data.mailEnabled === false && data.smsEnabled === false) {
      supportInfo.value = {
        supportEmail: data.supportEmail ?? undefined,
        supportPhone: data.supportPhone ?? undefined,
      };
    } else {
      success.value = true;
    }
  } catch (err) {
    // 照搬 React 行78-94: 错误处理
    const axiosErr = err as Error & { response?: { data?: { message?: string } } };
    const errorMessage =
      axiosErr.response?.data?.message ||
      (err as Error).message ||
      t('forgotPassword.sendCodeFailed');

    // 照搬 React 行87-91: 账号已被禁用 → 显示联系客服信息
    if (errorMessage.includes('账号已被禁用')) {
      supportInfo.value = {
        supportEmail: 'support@cloudcad.com',
        supportPhone: '400-123-4567',
      };
    } else {
      error.value = errorMessage;
    }
  } finally {
    loading.value = false;
  }
}

// ==================== 前往重置密码 ====================
// 照搬 React 行251-257: navigate('/reset-password', { state: ... })

function goToResetPassword(): void {
  router.push({
    path: '/reset-password',
    state: {
      email: contactType.value === 'email' ? email.value : undefined,
      phone: contactType.value === 'phone' ? phone.value : undefined,
    },
  });
}
</script>

<style scoped>
.forgot-password-page {
  min-height: 100vh;
  display: flex;
}

.auth-card {
  animation: card-appear 0.6s ease-out;
}

@keyframes card-appear {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.app-title {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.support-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-border, rgba(0, 0, 0, 0.12)));
  border-radius: 10px;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  transition: all 0.2s;
}

.support-item:hover {
  transform: translateX(4px);
  background: rgb(var(--v-theme-surface-variant));
}

.feature-dot {
  transition: all 0.2s;
}

.feature-dot:hover {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary)));
  border-color: transparent;
  transform: translateY(-2px);
}
</style>
