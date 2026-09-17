<script setup lang="ts">
/**
 * 原生登录页（ADR-0062 升级：移动端不再跳 PC 登录页，改为页内登录）。
 *
 * 两个 tab（与 PC Login 页对齐）：
 *   - 账号登录：用户名 / 邮箱 / 手机号 + 密码 → authControllerLogin
 *   - 手机登录：手机号 + 短信验证码 → authControllerLoginByPhone
 *
 * 成功后经 applyAuthResponse 写入会话，再跳回 redirect 目标（守卫带入的 fullPath）或壳根。
 * 「立即注册」跳原生 /register（带同一路由 redirect 透传）。
 */
import { ref, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerLogin,
  authControllerLoginByPhone,
  authControllerSendSmsCode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showSuccessToast } from 'vant'
import { t } from '@/languages'
import { applyAuthResponse, resolveRedirectTarget } from '@/utils/authSession'

const route = useRoute()
const router = useRouter()

const activeTab = ref<'account' | 'phone'>('account')
const loading = ref(false)
const error = ref('')

// ── 账号登录 ──
const account = ref('')
const password = ref('')
const showPassword = ref(false)

// ── 手机登录 ──
const phone = ref('')
const code = ref('')
const sendingCode = ref(false)
const countdown = ref(0)

let countdownTimer: ReturnType<typeof setInterval> | null = null

const PHONE_RE = /^1[3-9]\d{9}$/
const CODE_RE = /^\d{6}$/
const phoneValid = computed(() => PHONE_RE.test(phone.value))
const codeValid = computed(() => CODE_RE.test(code.value))

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

/** 登录成功：写入会话后跳回 redirect 目标（或壳根） */
function finishLogin() {
  const target = resolveRedirectTarget(route.query.redirect)
  // 整串字符串传（含 query），避免 { path } 把 query 当路径解析而静默丢弃
  void router.replace(target)
}

async function handleAccountLogin() {
  if (!account.value.trim() || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await authControllerLogin({
      body: { account: account.value.trim(), password: password.value },
    })
    const data = unwrap<{ accessToken: string; refreshToken?: string; user: unknown; restored?: boolean }>(res)
    applyAuthResponse(data)
    showSuccessToast(data.restored ? t('您的账户已自动恢复，注销已取消') : t('登录成功'))
    finishLogin()
  } catch (e) {
    error.value = errMsg(e, t('登录失败，请检查账号和密码'))
  } finally {
    loading.value = false
  }
}

async function handleSendCode() {
  if (!phoneValid.value || sendingCode.value) return
  sendingCode.value = true
  error.value = ''
  try {
    const res = await authControllerSendSmsCode({ body: { phone: phone.value, scene: 'login' } })
    unwrap(res)
    showSuccessToast(t('验证码已发送'))
    startCountdown()
  } catch (e) {
    error.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sendingCode.value = false
  }
}

async function handlePhoneLogin() {
  if (!phoneValid.value || !codeValid.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await authControllerLoginByPhone({ body: { phone: phone.value, code: code.value } })
    const data = unwrap<{ accessToken: string; refreshToken?: string; user: unknown; restored?: boolean }>(res)
    applyAuthResponse(data)
    showSuccessToast(data.restored ? t('您的账户已自动恢复，注销已取消') : t('登录成功'))
    finishLogin()
  } catch (e) {
    error.value = errMsg(e, t('登录失败，请重试'))
  } finally {
    loading.value = false
  }
}

function goRegister() {
  const redirect = resolveRedirectTarget(route.query.redirect)
  void router.replace({
    path: '/register',
    query: redirect !== '/shell' ? { redirect } : {},
  })
}

onUnmounted(stopCountdown)
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">{{ t('登录') }}</h1>
        <p class="auth-subtitle">{{ t('欢迎回来，请登录您的账户') }}</p>
      </div>

      <van-tabs v-model:active="activeTab" class="auth-tabs">
        <van-tab :title="t('账号登录')" name="account">
          <div class="tab-body">
            <van-field
              v-model="account"
              :label="t('账号')"
              :placeholder="t('请输入用户名、邮箱或手机号')"
              clearable
              @keyup.enter="handleAccountLogin"
            />
            <van-field
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              :label="t('密码')"
              :placeholder="t('请输入密码')"
              clearable
              @keyup.enter="handleAccountLogin"
            >
              <template #right-icon>
                <van-icon :name="showPassword ? 'eye' : 'eye-o'" @click="showPassword = !showPassword" />
              </template>
            </van-field>
            <button class="primary-btn" :disabled="loading || !account.trim() || !password" @click="handleAccountLogin">
              {{ loading ? t('登录中…') : t('立即登录') }}
            </button>
          </div>
        </van-tab>

        <van-tab :title="t('手机登录')" name="phone">
          <div class="tab-body">
            <van-field v-model="phone" type="tel" :label="t('手机号')" :placeholder="t('请输入手机号')" maxlength="11" clearable />
            <van-field
              v-model="code"
              type="digit"
              :label="t('验证码')"
              :placeholder="t('请输入验证码')"
              maxlength="6"
              clearable
              @keyup.enter="handlePhoneLogin"
            >
              <template #button>
                <button class="code-btn" :disabled="countdown > 0 || sendingCode || !phoneValid" @click="handleSendCode">
                  {{ countdown > 0 ? `${countdown}s` : t('获取验证码') }}
                </button>
              </template>
            </van-field>
            <button class="primary-btn" :disabled="loading || !phoneValid || !codeValid" @click="handlePhoneLogin">
              {{ loading ? t('登录中…') : t('立即登录') }}
            </button>
          </div>
        </van-tab>
      </van-tabs>

      <div v-if="error" class="auth-error">{{ error }}</div>

      <div class="auth-footer">
        <span>{{ t('还没有账号？') }}</span>
        <button class="link-btn" @click="goRegister">{{ t('立即注册') }}</button>
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
  padding: 16px;
  overflow-y: auto;
}

/* label 只有 2 个字，vant 默认给 label 留 6.2em，把「请输入用户名、邮箱或手机号」
   的尾部挤到卡片外被截断；收窄 label 列并减小水平内边距，把宽度让给输入区 */
.auth-page .van-field {
  --van-field-label-width: 5.5em;
  --van-field-padding-horizontal: 12px;
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

.auth-tabs {
  .tab-body {
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
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
