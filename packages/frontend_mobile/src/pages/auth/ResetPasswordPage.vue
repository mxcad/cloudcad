<script setup lang="ts">
/**
 * 重置密码页（对齐 PC ResetPassword）。
 *
 * 联系类型与联系值由 ForgotPasswordPage 写进 sessionStorage（非路由 state，
 * hash 路由 state 在整页刷新后丢失）。验证码由 authControllerForgotPassword 签发，
 * 重发即重调该接口（后端 email/sms 两条路径共用同一 verificationCode 表）。
 *
 * 提交前做确认密码一致性校验（与 PC schema 同口径），错误优先级低于后端返回。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerForgotPassword,
  authControllerResetPassword,
} from '@cloudcad/api-sdk/sdk.gen'
import { showToast } from 'vant'
import { t } from '@/languages'
import { toError, unwrap, errMsg } from '@/utils/authFeedback'
import { isCode, getPasswordStrength, isContactType, type ContactType } from '@/utils/authValidation'
import { CODE_COOLDOWN_SECONDS, useCountdown } from '@/composables/useCountdown'

const CONTACT_TYPE_KEY = 'forgotContactType'
const CONTACT_VALUE_KEY = 'forgotContactValue'

const route = useRoute()
const router = useRouter()

const contactType = ref<ContactType>('email')
const contact = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)

const submitting = ref(false)
const sending = ref(false)
const error = ref('')
const { countdown, start: countdownStart, isReady } = useCountdown(CODE_COOLDOWN_SECONDS)

const strength = computed(() => getPasswordStrength(newPassword.value))
const passwordValid = computed(() => newPassword.value.length >= 6)
const confirmMatch = computed(() => confirmPassword.value === newPassword.value)
const canSubmit = computed(() => isCode(code.value) && passwordValid.value && confirmMatch.value)

onMounted(() => {
  const storedType = sessionStorage.getItem(CONTACT_TYPE_KEY)
  const storedValue = sessionStorage.getItem(CONTACT_VALUE_KEY)
  if (isContactType(storedType)) contactType.value = storedType
  contact.value = storedValue || ''
})

function buildBody(extra: { code?: string; newPassword?: string; confirmPassword?: string }) {
  return {
    email: contactType.value === 'email' ? contact.value.trim() || undefined : undefined,
    phone: contactType.value === 'phone' ? contact.value.trim() || undefined : undefined,
    validateContact: '',
    ...extra,
  }
}

async function handleResend() {
  if (!isReady() || sending.value || !contact.value.trim()) return
  sending.value = true
  error.value = ''
  try {
    const res = await authControllerForgotPassword({ body: buildBody({}) })
    unwrap(res)
    showToast(t('验证码已发送'))
    countdownStart()
  } catch (e) {
    error.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sending.value = false
  }
}

function clearContact() {
  sessionStorage.removeItem(CONTACT_TYPE_KEY)
  sessionStorage.removeItem(CONTACT_VALUE_KEY)
}

async function handleSubmit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await authControllerResetPassword({
      body: buildBody({
        code: code.value.trim(),
        newPassword: newPassword.value,
        confirmPassword: confirmPassword.value,
      }),
    })
    unwrap(res)
    clearContact()
    showToast(t('密码重置成功'))
    goLogin()
  } catch (e) {
    error.value = errMsg(toError(e), t('重置密码失败，请检查验证码'))
  } finally {
    submitting.value = false
  }
}

function goLogin() {
  clearContact()
  const redirect = (route.query.redirect as string) || ''
  void router.replace({
    path: '/login',
    query: redirect && redirect !== '/shell' ? { redirect } : {},
  })
}

function goForgot() {
  void router.replace({ path: '/forgot-password' })
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <template v-if="!contact">
        <div class="auth-header">
          <h1 class="auth-title">{{ t('重置密码') }}</h1>
          <p class="auth-subtitle">{{ t('请先通过忘记密码页面获取验证码') }}</p>
        </div>
        <div class="form-body">
          <button class="primary-btn" type="button" @click="goForgot">{{ t('去发送验证码') }}</button>
          <button class="link-btn link-btn-right" type="button" @click="goLogin">{{ t('返回登录') }}</button>
        </div>
      </template>

      <template v-else>
        <div class="auth-header">
          <h1 class="auth-title">{{ t('重置密码') }}</h1>
          <p class="auth-subtitle">
            {{ t('验证码已发送至') }} {{ contact }}
          </p>
        </div>

        <div class="form-body">
          <van-field
            v-model="code"
            type="digit"
            :label="t('验证码')"
            :placeholder="t('请输入验证码')"
            maxlength="6"
            clearable
            @keyup.enter="handleSubmit"
          >
            <template #button>
              <button
                class="code-btn"
                type="button"
                :disabled="countdown > 0 || sending"
                @click="handleResend"
              >
                {{ countdown > 0 ? `${countdown}s` : t('重新发送验证码') }}
              </button>
            </template>
          </van-field>
          <van-field
            v-model="newPassword"
            :type="showPassword ? 'text' : 'password'"
            :label="t('新密码')"
            :placeholder="t('至少 6 位')"
            clearable
          >
            <template #right-icon>
              <van-icon
                :name="showPassword ? 'eye' : 'eye-o'"
                @click="showPassword = !showPassword"
              />
            </template>
          </van-field>
          <template v-if="newPassword && strength.score > 0">
            <div class="strength-bar">
              <div
                class="strength-fill"
                :style="{ width: `${(strength.score / 4) * 100}%`, background: strength.color }"
              />
            </div>
            <p class="hint" :style="{ color: strength.color }">
              {{ t('密码强度：') }}{{ strength.label }}
            </p>
          </template>
          <van-field
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            :label="t('确认密码')"
            :placeholder="t('请再次输入新密码')"
            clearable
            @keyup.enter="handleSubmit"
          />

          <div
            v-if="newPassword && confirmPassword && !confirmMatch"
            class="auth-error"
          >
            {{ t('两次输入的密码不一致') }}
          </div>
          <div v-if="error" class="auth-error">{{ error }}</div>

          <button class="primary-btn" type="button" :disabled="!canSubmit || submitting" @click="handleSubmit">
            {{ submitting ? t('重置中…') : t('重置密码') }}
          </button>

          <button class="link-btn link-btn-right" type="button" @click="goLogin">
            {{ t('返回登录') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/pages/auth/auth-common.scss';

.strength-bar {
  margin-top: 6px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-light);
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.2s ease, background 0.2s ease;
}
</style>
