<template>
  <v-alert
    v-if="success"
    type="success"
    variant="tonal"
    closable
    class="mb-4"
    density="compact"
    @click:close="success = null"
  >
    {{ success }}
  </v-alert>

  <v-alert
    v-if="error || authError"
    type="error"
    variant="tonal"
    closable
    class="mb-4"
    density="compact"
    @click:close="clearError()"
  >
    {{ error || authError }}
  </v-alert>

  <v-tabs
    v-if="smsEnabled"
    v-model="activeTab"
    grow
    density="comfortable"
    class="mb-4"
    @update:model-value="onTabChange"
  >
    <v-tab value="account">
      <v-icon start size="18">mdi-email-outline</v-icon>
      {{ t('login.accountLogin') }}
    </v-tab>
    <v-tab value="phone">
      <v-icon start size="18">mdi-phone-outline</v-icon>
      {{ t('login.phoneLogin') }}
    </v-tab>
  </v-tabs>

  <v-form v-if="activeTab === 'account'" @submit.prevent="handleAccountSubmit">
    <v-text-field
      v-model="formData.account"
      :label="accountLoginLabel"
      :placeholder="accountLoginPlaceholder"
      prepend-inner-icon="mdi-email-outline"
      autocomplete="email username tel"
      variant="outlined"
      density="comfortable"
      class="mb-3"
      hide-details="auto"
      required
    />

    <v-text-field
      v-model="formData.password"
      :type="showPassword ? 'text' : 'password'"
      :label="t('login.password')"
      :placeholder="t('login.enterPassword')"
      prepend-inner-icon="mdi-lock-outline"
      :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
      autocomplete="current-password"
      variant="outlined"
      density="comfortable"
      class="mb-1"
      hide-details="auto"
      required
      @click:append-inner="showPassword = !showPassword"
    />

    <div class="d-flex justify-end mb-3">
      <v-btn
        variant="text"
        size="small"
        color="primary"
        class="px-0"
        @click="router.push('/forgot-password')"
      >
        {{ t('login.forgotPassword') }}
      </v-btn>
    </div>

    <v-btn
      type="submit"
      color="primary"
      variant="flat"
      block
      size="large"
      :loading="loading"
      :disabled="loading"
    >
      {{ t('login.loginNow') }}
    </v-btn>
  </v-form>

  <v-form v-if="activeTab === 'phone'" @submit.prevent="handlePhoneSubmit">
    <v-text-field
      v-model="phoneForm.phone"
      :label="t('login.phoneNumber')"
      :placeholder="t('login.enterPhoneNumber')"
      prepend-inner-icon="mdi-phone-outline"
      type="tel"
      autocomplete="tel"
      :maxlength="11"
      variant="outlined"
      density="comfortable"
      class="mb-3"
      hide-details="auto"
      required
      @update:model-value="onPhoneInput($event, 'phone')"
    />

    <v-text-field
      v-model="phoneForm.code"
      :label="t('login.verificationCode')"
      :placeholder="t('login.enterVerificationCode')"
      prepend-inner-icon="mdi-message-text-outline"
      type="text"
      autocomplete="one-time-code"
      :maxlength="6"
      variant="outlined"
      density="comfortable"
      class="mb-3"
      hide-details="auto"
      required
      @update:model-value="onPhoneInput($event, 'code')"
    >
      <template #append-inner>
        <v-btn
          variant="tonal"
          size="small"
          color="primary"
          :loading="sendingCode"
          :disabled="countdown > 0 || sendingCode || phoneForm.phone.length !== 11"
          @click="handleSendCode"
        >
          {{ sendCodeButtonText }}
        </v-btn>
      </template>
    </v-text-field>

    <v-btn
      type="submit"
      color="primary"
      variant="flat"
      block
      size="large"
      :loading="loading"
      :disabled="loading"
    >
      {{ t('login.loginNow') }}
    </v-btn>
  </v-form>

  <div class="text-center mt-4 pt-4" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
    <span class="text-body-2 text-medium-emphasis">{{ t('login.noAccount') }}</span>
    <v-btn
      variant="text"
      size="small"
      color="primary"
      class="font-weight-bold pa-0"
      @click="router.push('/register')"
    >
      {{ t('login.registerNow') }}
    </v-btn>
  </div>

  <template v-if="wechatEnabled">
    <v-divider class="my-4">
      <span class="text-caption text-medium-emphasis px-2">{{ t('login.otherLoginMethods') }}</span>
    </v-divider>

    <v-btn
      variant="outlined"
      block
      size="large"
      prepend-icon="mdi-wechat"
      @click="handleWechatLogin"
    >
      {{ t('login.wechatLogin') }}
    </v-btn>
  </template>

  <v-dialog v-model="showSupportModal" max-width="480">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center justify-space-between pa-4">
        <span class="text-subtitle-1 font-weight-bold">{{ t('login.accountDisabled') }}</span>
        <v-btn icon size="small" variant="text" @click="showSupportModal = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <p class="text-body-2 mb-4">
          {{ t('login.accountDisabledMessage') }}
        </p>
        <div class="d-flex flex-column ga-2">
          <div class="d-flex align-center text-body-2">
            <span class="text-medium-emphasis mr-2" style="min-width: 80px">{{ t('login.supportEmail') }}</span>
            <a href="mailto:support@cloudcad.com" class="text-primary text-decoration-none">support@cloudcad.com</a>
          </div>
          <div class="d-flex align-center text-body-2">
            <span class="text-medium-emphasis mr-2" style="min-width: 80px">{{ t('login.supportPhone') }}</span>
            <a href="tel:400-123-4567" class="text-primary text-decoration-none">400-123-4567</a>
          </div>
          <div class="d-flex align-center text-body-2">
            <span class="text-medium-emphasis mr-2" style="min-width: 80px">{{ t('login.workingHours') }}</span>
            <span>{{ t('login.workingHoursValue') }}</span>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="justify-end pa-4">
        <v-btn color="primary" variant="flat" @click="showSupportModal = false">
          {{ t('common.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useLogin } from '@/composables/useLogin';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

useDocumentTitle(t('login.title'));

const router = useRouter();
const {
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
} = useLogin();

onMounted(() => {
  handleWechatCallback();
  handleLocationState();
});
</script>

<style scoped>
:deep(.mdi-wechat) {
  color: #07c160;
}
</style>
