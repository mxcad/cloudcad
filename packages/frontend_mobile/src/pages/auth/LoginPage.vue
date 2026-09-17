<script setup lang="ts">
/**
 * 原生登录页（ADR-0062 升级：移动端不再跳 PC 登录页，改为页内登录）。
 *
 * 两个 tab（与 PC Login 页对齐）：
 *   - 账号登录：用户名 / 邮箱 / 手机号 + 密码 → authControllerLogin
 *   - 手机登录：手机号 + 短信验证码 → authControllerLoginByPhone
 *
 * 账号登录的错误分支与 PC useLoginForm 同口径（业务码驱动，不靠文案匹配）：
 *   ACCOUNT_DEACTIVATED → 客服弹窗；EMAIL_NOT_VERIFIED / EMAIL_REQUIRED → 邮箱验证页
 *   （后者是补绑模式，带 tempToken）；PHONE_NOT_VERIFIED / PHONE_REQUIRED → 手机验证页。
 *
 * 微信登录走整页跳转 + 事务轮询（client='mobile' → 后端选 snsapi_userinfo），
 * 回调落在 `#/login?wechat_txn=<txn>`，由 useWechatLogin 轮询后分流。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerLogin,
  authControllerLoginByPhone,
  authControllerSendSmsCode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showToast } from 'vant'
import { t } from '@/languages'
import { applyAuthResponse } from '@/utils/authSession'
import { navigateAfterAuth, redirectQueryOf } from '@/utils/authNavigate'
import {
  toError,
  unwrap,
  errMsg,
  errorCode,
  errorDetail,
  showAccountDeactivatedDialog,
} from '@/utils/authFeedback'
import { isPhone, isCode } from '@/utils/authValidation'
import { useCountdown } from '@/composables/useCountdown'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'
import { useWechatLogin, takeWechatTxn } from '@/composables/useWechatLogin'

const route = useRoute()
const router = useRouter()
const { config } = useRuntimeConfig()

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
const { countdown, start: countdownStart } = useCountdown()

const phoneValid = computed(() => isPhone(phone.value))
const codeValid = computed(() => isCode(code.value))

/** 登录成功：写入会话后按 redirect 落点 */
function finishLogin(data: {
  accessToken: string
  refreshToken?: string
  user?: unknown
  restored?: boolean
}) {
  applyAuthResponse(data)
  showToast(data.restored ? t('您的账户已自动恢复，注销已取消') : t('登录成功'))
  navigateAfterAuth(route.query as Record<string, unknown>)
}

/** 验证页表单数据走 state（不进地址栏），但 redirect 必须走 query：
 *  验证页靠 route.query 调 navigateAfterAuth 落点，塞进 state 会丢失、只能回壳根 */
function gotoVerifyEmail(state: { email?: string; tempToken?: string; mode?: 'bind' }) {
  void router.replace({
    path: '/verify-email',
    query: { ...redirectQueryOf(route.query) },
    state,
  })
}

function gotoVerifyPhone(state: { phone?: string; tempToken?: string; mode?: 'bind' }) {
  void router.replace({
    path: '/verify-phone',
    query: { ...redirectQueryOf(route.query) },
    state,
  })
}

/**
 * 账号登录的错误分流（业务码 → 页面跳转）。
 * 后端把业务码放在 error body 的 code 字段，message 是本地化中文不含字面码，
 * 所以只能读 code；文案展示用 message。
 */
function handleLoginError(e: unknown, fallback: string) {
  const body = toError(e)
  switch (errorCode(body)) {
    case 'ACCOUNT_DEACTIVATED':
      error.value = ''
      showAccountDeactivatedDialog(errorDetail(body, 'cleanupDays'))
      return
    case 'EMAIL_NOT_VERIFIED':
      gotoVerifyEmail({ email: errorDetail(body, 'email') })
      return
    case 'EMAIL_REQUIRED':
      gotoVerifyEmail({ tempToken: errorDetail(body, 'tempToken'), mode: 'bind' })
      return
    case 'PHONE_NOT_VERIFIED':
      gotoVerifyPhone({ phone: errorDetail(body, 'phone') })
      return
    case 'PHONE_REQUIRED':
      gotoVerifyPhone({ tempToken: errorDetail(body, 'tempToken'), mode: 'bind' })
      return
    default:
      error.value = errMsg(body, fallback)
  }
}

async function handleAccountLogin() {
  if (!account.value.trim() || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await authControllerLogin({
      body: { account: account.value.trim(), password: password.value },
    })
    const data = unwrap<{ accessToken: string; refreshToken?: string; user?: unknown; restored?: boolean }>(res)
    finishLogin(data)
  } catch (e) {
    handleLoginError(e, t('登录失败，请检查账号和密码'))
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
    showToast(t('验证码已发送'))
    countdownStart()
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
    const data = unwrap<{ accessToken: string; refreshToken?: string; user?: unknown; restored?: boolean }>(res)
    finishLogin(data)
  } catch (e) {
    error.value = errMsg(e, t('登录失败，请重试'))
  } finally {
    loading.value = false
  }
}

function goRegister() {
  void router.replace({ path: '/register', query: { ...redirectQueryOf(route.query) } })
}

function goForgotPassword() {
  void router.replace({ path: '/forgot-password', query: { ...redirectQueryOf(route.query) } })
}

// ── 微信登录：入口由运行时配置控制，回调经事务轮询 ──
const wechat = useWechatLogin({
  onLoginSuccess: finishLogin,
  onNeedRegister: (tempToken) => {
    sessionStorage.setItem('wechatTempToken', tempToken)
    void router.replace({
      path: '/register',
      query: { wechat: '1', ...redirectQueryOf(route.query) },
    })
  },
  onNeedBindEmail: (tempToken) => gotoVerifyEmail({ tempToken, mode: 'bind' }),
  onNeedBindPhone: (tempToken) => gotoVerifyPhone({ tempToken, mode: 'bind' }),
  onError: (message) => {
    error.value = message
  },
})
// 模板绑定须解构成顶层 ref 才会自动解包（对象属性里的 ref 不解包）
const wechatOpening = wechat.opening

onMounted(() => {
  const errorParam = route.query.wechat_error
  if (typeof errorParam === 'string' && errorParam) {
    void router.replace({ path: '/login', query: { ...redirectQueryOf(route.query) } })
    error.value = `${t('微信登录失败')}：${decodeURIComponent(errorParam)}`
    return
  }
  const txn = takeWechatTxn(route)
  if (!txn) return
  void router.replace({ path: '/login', query: { ...redirectQueryOf(route.query) } })
  void wechat.poll(txn, 0)
})
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
                <van-icon
                  :name="showPassword ? 'eye' : 'eye-o'"
                  @click="showPassword = !showPassword"
                />
              </template>
            </van-field>
            <button
              class="primary-btn"
              type="button"
              :disabled="loading || !account.trim() || !password"
              @click="handleAccountLogin"
            >
              {{ loading ? t('登录中…') : t('立即登录') }}
            </button>
            <button class="link-btn link-btn-right" type="button" @click="goForgotPassword">
              {{ t('忘记密码？') }}
            </button>
          </div>
        </van-tab>

        <van-tab :title="t('手机登录')" name="phone">
          <div class="tab-body">
            <van-field
              v-model="phone"
              type="tel"
              :label="t('手机号')"
              :placeholder="t('请输入手机号')"
              maxlength="11"
              clearable
            />
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
                <button
                  class="code-btn"
                  type="button"
                  :disabled="countdown > 0 || sendingCode || !phoneValid"
                  @click="handleSendCode"
                >
                  {{ countdown > 0 ? `${countdown}s` : t('获取验证码') }}
                </button>
              </template>
            </van-field>
            <button
              class="primary-btn"
              type="button"
              :disabled="loading || !phoneValid || !codeValid"
              @click="handlePhoneLogin"
            >
              {{ loading ? t('登录中…') : t('立即登录') }}
            </button>
          </div>
        </van-tab>
      </van-tabs>

      <div v-if="error" class="auth-error">{{ error }}</div>

      <template v-if="config.wechatEnabled">
        <div class="auth-divider">
          <span>{{ t('其他方式登录') }}</span>
        </div>
        <button class="wechat-btn" type="button" :disabled="wechatOpening" @click="wechat.open">
          <van-icon name="chat-o" />
          {{ wechatOpening ? t('正在跳转…') : t('微信登录') }}
        </button>
      </template>

      <div class="auth-footer">
        <template v-if="config.allowRegister">
          <span>{{ t('还没有账号？') }}</span>
          <button class="link-btn" type="button" @click="goRegister">{{ t('立即注册') }}</button>
        </template>
        <template v-else>
          <span>{{ t('注册已关闭') }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/pages/auth/auth-common.scss';

.auth-tabs {
  .tab-body {
    padding-top: 16px;
  }
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: var(--font-size-caption);

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light);
  }
}

.wechat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: var(--font-size-body-lg);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
</style>
