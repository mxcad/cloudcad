<script setup lang="ts">
/**
 * 原生注册页（ADR-0062 升级：移动端不再跳 PC 注册页，改为页内注册）。
 *
 * 手机号 + 短信验证码 + 用户名 + 密码（+ 可选昵称）→ authControllerRegisterByPhone。
 * 成功后经 applyAuthResponse 写入会话（后端注册即签发 token），再跳回 redirect 目标或壳根。
 */
import { ref, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerRegisterByPhone,
  authControllerSendSmsCode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showSuccessToast } from 'vant'
import { t } from '@/languages'
import { applyAuthResponse, resolveRedirectTarget } from '@/utils/authSession'

const route = useRoute()
const router = useRouter()

const phone = ref('')
const code = ref('')
const username = ref('')
const password = ref('')
const nickname = ref('')
const showPassword = ref(false)

const submitting = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const error = ref('')

let countdownTimer: ReturnType<typeof setInterval> | null = null

const PHONE_RE = /^1[3-9]\d{9}$/
const CODE_RE = /^\d{6}$/
const phoneValid = computed(() => PHONE_RE.test(phone.value))
const codeValid = computed(() => CODE_RE.test(code.value))
const usernameValid = computed(() => username.value.trim().length >= 3)
const passwordValid = computed(() => password.value.length >= 6)
const canSubmit = computed(
  () => phoneValid.value && codeValid.value && usernameValid.value && passwordValid.value
)

function startCountdown() {
  stopCountdown()
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value = Math.max(0, countdown.value - 1)
    if (countdown.value === 0) stopCountdown()
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err
  const raw = err as Record<string, unknown> | null
  if (raw && typeof raw.message === 'string' && raw.message) return new Error(raw.message)
  return new Error(String(err))
}

function unwrap<T>(res: { error?: unknown; data?: unknown }): T {
  if (res.error) throw toError(res.error)
  return (res.data ?? {}) as T
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  const raw = e as Record<string, unknown> | null
  if (raw && typeof raw.message === 'string' && raw.message) return raw.message
  return fallback
}

function finishRegister() {
  const target = resolveRedirectTarget(route.query.redirect)
  // 整串字符串传（含 query），避免 { path } 把 query 当路径解析而静默丢弃
  void router.replace(target)
}

async function handleSendCode() {
  if (!phoneValid.value || sendingCode.value) return
  sendingCode.value = true
  error.value = ''
  try {
    const res = await authControllerSendSmsCode({ body: { phone: phone.value, scene: 'register' } })
    unwrap(res)
    showSuccessToast(t('验证码已发送'))
    startCountdown()
  } catch (e) {
    error.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function handleRegister() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await authControllerRegisterByPhone({
      body: {
        phone: phone.value,
        code: code.value,
        username: username.value.trim(),
        password: password.value,
        nickname: nickname.value.trim() || undefined,
      },
    })
    const data = unwrap<{ accessToken: string; refreshToken?: string; user: unknown }>(res)
    applyAuthResponse(data)
    showSuccessToast(t('注册成功'))
    finishRegister()
  } catch (e) {
    error.value = errMsg(e, t('注册失败，请重试'))
  } finally {
    submitting.value = false
  }
}

function goLogin() {
  const redirect = resolveRedirectTarget(route.query.redirect)
  void router.replace({
    path: '/login',
    query: redirect !== '/shell' ? { redirect } : {},
  })
}

onUnmounted(stopCountdown)
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">{{ t('注册') }}</h1>
        <p class="auth-subtitle">{{ t('创建账户，开始使用 CloudCAD') }}</p>
      </div>

      <div class="form-body">
        <van-field v-model="phone" type="tel" :label="t('手机号')" :placeholder="t('请输入手机号')" maxlength="11" clearable />
        <van-field
          v-model="code"
          type="digit"
          :label="t('验证码')"
          :placeholder="t('请输入验证码')"
          maxlength="6"
          clearable
        >
          <template #button>
            <button class="code-btn" :disabled="countdown > 0 || sendingCode || !phoneValid" @click="handleSendCode">
              {{ countdown > 0 ? `${countdown}s` : t('获取验证码') }}
            </button>
          </template>
        </van-field>
        <van-field v-model="username" :label="t('用户名')" :placeholder="t('请输入用户名（3-20 个字符）')" maxlength="20" clearable />
        <van-field
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          :label="t('密码')"
          :placeholder="t('至少 6 位')"
          clearable
        >
          <template #right-icon>
            <van-icon :name="showPassword ? 'eye' : 'eye-o'" @click="showPassword = !showPassword" />
          </template>
        </van-field>
        <van-field v-model="nickname" :label="t('昵称')" :placeholder="t('选填，最多 50 个字符')" maxlength="50" clearable />

        <button class="primary-btn" :disabled="!canSubmit || submitting" @click="handleRegister">
          {{ submitting ? t('注册中…') : t('立即注册') }}
        </button>
      </div>

      <div v-if="error" class="auth-error">{{ error }}</div>

      <div class="auth-footer">
        <span>{{ t('已有账号？') }}</span>
        <button class="link-btn" @click="goLogin">{{ t('去登录') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-page {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-header {
  text-align: center;
}

.auth-title {
  margin: 0;
  font-size: var(--font-size-page-title);
  font-weight: 700;
  color: var(--text-primary);
}

.auth-subtitle {
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.form-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.code-btn {
  margin: 0;
  padding: 0 12px;
  height: 28px;
  border: 1px solid var(--accent);
  border-radius: 14px;
  background: transparent;
  color: var(--accent);
  font-size: var(--font-size-sm);

  &:not(:disabled) {
    cursor: pointer;
  }

  &:disabled {
    color: var(--text-tertiary);
    border-color: var(--border-default);
    cursor: default;
  }
}

.primary-btn {
  margin-top: 4px;
  padding: 12px;
  border: none;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #00a99e 0%, #007a6f 100%);
  color: #fff;
  font-size: var(--font-size-body-lg);
  font-weight: 600;

  &:not(:disabled) {
    cursor: pointer;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.auth-error {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.3);
  font-size: var(--font-size-sm);
  color: #ff4444;
}

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--accent);

  &:not(:disabled) {
    cursor: pointer;
  }
}
</style>
