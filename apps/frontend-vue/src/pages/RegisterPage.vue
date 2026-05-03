<template>
  <v-container v-if="registrationClosed" fluid class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4" class="text-center">
        <v-card rounded="lg" class="pa-8" elevation="2">
          <v-avatar size="64" color="warning" variant="flat" class="mb-4">
            <v-icon size="32" icon="mdi-shield-check" />
          </v-avatar>
          <div class="text-h5 font-weight-bold mb-2">{{ t('register.registrationClosed') }}</div>
          <div class="text-body-2 text-medium-emphasis mb-6">
            {{ t('register.registrationClosedMessage') }}
          </div>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="navigateToLogin">
            {{ t('register.backToLogin') }}
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>

  <v-container v-else fluid class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-card rounded="lg" class="pa-6 pa-md-8" elevation="2">
          <div class="text-center mb-6">
            <v-avatar size="56" color="primary" variant="flat" class="mb-3">
              <v-img v-if="appLogo" :src="appLogo" :alt="appName" />
              <v-icon v-else size="28" icon="mdi-vector-polygon" />
            </v-avatar>
            <div class="text-h5 font-weight-bold mb-1">{{ appName }}</div>
            <div class="text-body-2 text-medium-emphasis">
              {{ t('register.createAccount') }}
            </div>
          </div>

          <div class="d-flex align-center justify-center mb-6">
            <div class="d-flex flex-column align-center">
              <v-avatar
                size="28"
                :color="currentStep > 1 ? 'success' : 'primary'"
                variant="flat"
              >
                <v-icon v-if="currentStep > 1" size="16" icon="mdi-check-circle" />
                <span v-else class="text-caption font-weight-bold">1</span>
              </v-avatar>
              <span class="text-caption mt-1" :class="currentStep >= 1 ? 'text-primary' : 'text-medium-emphasis'">
                {{ t('register.basicInfo') }}
              </span>
            </div>
            <div class="flex-grow-1 mx-3 mb-4">
              <v-divider />
            </div>
            <div class="d-flex flex-column align-center">
              <v-avatar
                size="28"
                :color="currentStep >= 2 ? 'primary' : 'default'"
                :variant="currentStep >= 2 ? 'flat' : 'outlined'"
              >
                <span class="text-caption font-weight-bold">2</span>
              </v-avatar>
              <span class="text-caption mt-1" :class="currentStep >= 2 ? 'text-primary' : 'text-medium-emphasis'">
                {{ t('register.securitySettings') }}
              </span>
            </div>
          </div>

          <div class="text-center mb-4">
            <div class="text-h6 font-weight-bold">
              {{ currentStep === 1 ? t('register.createAccountTitle') : t('register.setPassword') }}
            </div>
            <div class="text-body-2 text-medium-emphasis">
              {{ currentStep === 1 ? t('register.enterBasicInfo') : t('register.setSecurePassword') }}
            </div>
          </div>

          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
            icon="mdi-alert-circle"
          >
            {{ error }}
          </v-alert>

          <v-form @submit.prevent="handleSubmit">
            <template v-if="currentStep === 1">
              <v-text-field
                :model-value="formData.username"
                :label="t('register.username')"
                :placeholder="t('register.enterUsername')"
                prepend-inner-icon="mdi-account"
                :error-messages="fieldErrors.username"
                required
                @blur="handleBlur('username', formData.username)"
                @update:model-value="(v: string) => handleChange('username', v)"
              />

              <v-text-field
                :model-value="formData.nickname"
                :label="t('register.nickname')"
                :placeholder="t('register.enterNicknameOptional')"
                prepend-inner-icon="mdi-sparkles"
                :error-messages="fieldErrors.nickname"
                @blur="handleBlur('nickname', formData.nickname || '')"
                @update:model-value="(v: string) => handleChange('nickname', v)"
              />

              <v-text-field
                v-if="showEmailField"
                :model-value="formData.email"
                :placeholder="t('register.enterEmail')"
                prepend-inner-icon="mdi-email"
                type="email"
                autocomplete="email"
                :required="requireEmailVerification"
                :error-messages="fieldErrors.email"
                @blur="handleBlur('email', formData.email)"
                @update:model-value="(v: string) => handleChange('email', v)"
              >
                <template #label>
                  {{ t('register.email') }}
                  <span v-if="requireEmailVerification" class="text-error ml-1">*</span>
                </template>
              </v-text-field>

              <template v-if="showPhoneFields">
                <v-text-field
                  :model-value="phoneForm.phone"
                  :placeholder="t('register.enterPhone')"
                  prepend-inner-icon="mdi-phone"
                  type="tel"
                  autocomplete="tel"
                  :maxlength="11"
                  :required="requirePhoneVerification"
                  :error-messages="fieldErrors.phone"
                  @blur="handleBlur('phone', phoneForm.phone)"
                  @update:model-value="(v: string) => handlePhoneChange('phone', v)"
                >
                  <template #label>
                    {{ t('register.phoneNumber') }}
                    <span v-if="requirePhoneVerification" class="text-error ml-1">*</span>
                  </template>
                </v-text-field>

                <v-text-field
                  :model-value="phoneForm.code"
                  :placeholder="t('register.enterCode')"
                  prepend-inner-icon="mdi-message-text"
                  type="text"
                  autocomplete="one-time-code"
                  :maxlength="6"
                  :required="requirePhoneVerification"
                  :error-messages="fieldErrors.code"
                  @blur="handleBlur('code', phoneForm.code)"
                  @update:model-value="(v: string) => handlePhoneChange('code', v)"
                >
                  <template #label>
                    {{ t('register.verificationCode') }}
                    <span v-if="requirePhoneVerification" class="text-error ml-1">*</span>
                  </template>
                  <template #append-inner>
                    <v-btn
                      size="small"
                      variant="tonal"
                      color="primary"
                      :disabled="countdown > 0 || sendingCode || phoneForm.phone.length !== 11"
                      :loading="sendingCode"
                      @click="handleSendCode"
                    >
                      <template v-if="countdown > 0">{{ countdown }}s</template>
                      <template v-else>{{ t('register.getCode') }}</template>
                    </v-btn>
                  </template>
                </v-text-field>
              </template>

              <v-btn
                color="primary"
                variant="flat"
                block
                size="large"
                append-icon="mdi-arrow-right"
                @click="handleNext"
              >
                {{ t('register.next') }}
              </v-btn>
            </template>

            <template v-if="currentStep === 2">
              <v-text-field
                :model-value="formData.password"
                :placeholder="t('register.passwordPlaceholder')"
                prepend-inner-icon="mdi-lock"
                :type="showPassword ? 'text' : 'password'"
                :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                autocomplete="new-password"
                required
                :error-messages="fieldErrors.password"
                @blur="handleBlur('password', formData.password)"
                @update:model-value="(v: string) => handleChange('password', v)"
                @click:append-inner="showPassword = !showPassword"
              >
                <template #label>
                  {{ t('register.password') }} <span class="text-error ml-1">*</span>
                </template>
              </v-text-field>

              <template v-if="formData.password">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-progress-linear
                    :model-value="(passwordStrength.strength / 4) * 100"
                    :color="passwordStrength.color"
                    height="3"
                    rounded
                    class="flex-grow-1"
                  />
                  <span
                    class="text-caption font-weight-medium"
                    :style="{ color: passwordStrength.color }"
                  >
                    {{ passwordStrength.label }}
                  </span>
                </div>
              </template>

              <v-text-field
                :model-value="confirmPassword"
                :placeholder="t('register.confirmPasswordPlaceholder')"
                prepend-inner-icon="mdi-check-circle"
                :type="showConfirmPassword ? 'text' : 'password'"
                :append-inner-icon="showConfirmPassword ? 'mdi-eye-off' : 'mdi-eye'"
                autocomplete="new-password"
                required
                :error-messages="fieldErrors.confirmPassword"
                @blur="handleBlur('confirmPassword', confirmPassword)"
                @update:model-value="(v: string) => handleChange('confirmPassword', v)"
                @click:append-inner="showConfirmPassword = !showConfirmPassword"
              >
                <template #label>
                  {{ t('register.confirmPassword') }} <span class="text-error ml-1">*</span>
                </template>
              </v-text-field>

              <div class="d-flex ga-3 mt-2">
                <v-btn
                  variant="outlined"
                  size="large"
                  prepend-icon="mdi-arrow-left"
                  @click="handleBack"
                >
                  {{ t('register.back') }}
                </v-btn>
                <v-btn
                  color="primary"
                  variant="flat"
                  size="large"
                  class="flex-grow-1"
                  type="submit"
                  :loading="loading"
                  append-icon="mdi-arrow-right"
                >
                  {{ t('register.registerNow') }}
                </v-btn>
              </div>
            </template>
          </v-form>

          <div class="text-center mt-4 pt-4" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
            <span class="text-body-2 text-medium-emphasis">
              {{ t('register.hasAccount') }}
              <v-btn variant="text" color="primary" size="small" class="font-weight-bold pa-0" @click="navigateToLogin">
                {{ t('register.loginNow') }}
              </v-btn>
            </span>
          </div>

          <div class="d-flex justify-center ga-4 mt-4 pt-4" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
            <v-tooltip :text="t('register.highPerformance')" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-avatar size="32" variant="outlined" v-bind="tooltipProps">
                  <v-icon size="14" icon="mdi-cpu-64-bit" />
                </v-avatar>
              </template>
            </v-tooltip>
            <v-tooltip :text="t('register.realTimeCollaboration')" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-avatar size="32" variant="outlined" v-bind="tooltipProps">
                  <v-icon size="14" icon="mdi-view-dashboard-outline" />
                </v-avatar>
              </template>
            </v-tooltip>
            <v-tooltip :text="t('register.enterpriseSecurity')" location="top">
              <template #activator="{ props: tooltipProps }">
                <v-avatar size="32" variant="outlined" v-bind="tooltipProps">
                  <v-icon size="14" icon="mdi-shield-check" />
                </v-avatar>
              </template>
            </v-tooltip>
          </div>
        </v-card>

        <div class="text-center mt-4 text-caption text-medium-emphasis">
          &copy; 2026 {{ appName }}. All rights reserved.
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useRegister } from '@/composables/useRegister';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

useDocumentTitle(t('register.title'));

const {
  appName,
  appLogo,
  requireEmailVerification,
  requirePhoneVerification,
  registrationClosed,
  formData,
  phoneForm,
  confirmPassword,
  countdown,
  sendingCode,
  loading,
  error,
  fieldErrors,
  currentStep,
  showPassword,
  showConfirmPassword,
  passwordStrength,
  showEmailField,
  showPhoneFields,
  handleChange,
  handlePhoneChange,
  handleBlur,
  handleSendCode,
  handleNext,
  handleBack,
  handleSubmit,
  navigateToLogin,
} = useRegister();
</script>
