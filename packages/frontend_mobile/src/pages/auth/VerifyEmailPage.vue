<script setup lang="ts">
/**
 * 邮箱验证页（对齐 PC EmailVerification）。
 *
 * 四种进入路径，最终都会拿到 accessToken 并写入会话：
 *   1. 注册后待验证：RegisterPage 提交带邮箱的注册请求 → state { email, message }
 *      → authControllerVerifyEmail
 *   2. 手机注册 + 邮箱待验证：RegisterPage 已验证短信 → sessionStorage 存注册凭证
 *      → authControllerVerifyEmailAndRegisterPhone（一步完成注册 + 签发 token）
 *   3. 补绑邮箱：登录报 EMAIL_REQUIRED → state { tempToken, mode:'bind' }
 *      → authControllerBindEmailAndLogin
 *   4. 已注册未验证：登录报 EMAIL_NOT_VERIFIED → state { email }
 *      → authControllerVerifyEmail
 *
 * 挂载时若已有邮箱且非补绑模式，自动补发一次验证码并起倒计时（PC 同行为）；
 * 补绑模式邮箱由用户输入，必须手动点发送。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerBindEmailAndLogin,
  authControllerResendVerification,
  authControllerVerifyEmail,
  authControllerVerifyEmailAndRegisterPhone,
} from '@cloudcad/api-sdk/sdk.gen'
import { showToast } from 'vant'
import { t } from '@/languages'
import {
  applyAuthResponse,
  clearRegisterPhonePending,
  getRegisterPhonePending,
} from '@/utils/authSession'
import { navigateAfterAuth } from '@/utils/authNavigate'
import { toError, unwrap, errMsg } from '@/utils/authFeedback'
import { isEmail, isCode } from '@/utils/authValidation'
import { CODE_COOLDOWN_SECONDS, useCountdown } from '@/composables/useCountdown'

interface VerifyEmailState {
  email?: string
  tempToken?: string
  mode?: 'bind'
  message?: string
}

const route = useRoute()
const router = useRouter()

// vue-router 的泛型路由类型上没有 state 字段，运行时确实有，显式取
const state = ((route as unknown as { state?: unknown }).state ?? {}) as VerifyEmailState
const bindMode = state.mode === 'bind'
const tempToken = typeof state.tempToken === 'string' ? state.tempToken : ''

// 手机注册凭证走 sessionStorage（跨刷新保留），非路由 state
const pending = getRegisterPhonePending()

const email = ref(typeof state.email === 'string' ? state.email : '')
const code = ref('')
const loading = ref(false)
const sending = ref(false)
const error = ref('')
const notice = computed(() =>
  state.message || (pending ? t('手机号已验证，还需验证邮箱才能完成注册') : '')
)

const { countdown, start: startCountdown, isReady } = useCountdown(CODE_COOLDOWN_SECONDS)

const title = computed(() => (bindMode ? t('绑定邮箱') : t('邮箱验证')))

const subtitle = computed(() => {
  if (bindMode) return t('为当前账号绑定邮箱后即可登录')
  if (pending) return t('手机号已验证，还需验证邮箱才能完成注册')
  return t('我们已向您注册的邮箱发送验证码')
})

/**
 * 邮箱锁定条件：只有「登录态已知邮箱」（EMAIL_NOT_VERIFIED / 带邮箱注册）才锁定；
 * 补绑模式与「手机已验证待邮箱」模式邮箱必须由用户在本页输入。
 */
const emailLocked = computed(() => !bindMode && !pending && !!state.email)
const canVerify = computed(() => email.value.trim().length > 0 && isCode(code.value) && !loading.value)

async function handleResend() {
  if (!isReady() || sending.value) return
  if (!isEmail(email.value)) {
    error.value = t('请输入正确的邮箱地址')
    return
  }
  sending.value = true
  error.value = ''
  try {
    const res = await authControllerResendVerification({ body: { email: email.value.trim() } })
    unwrap(res)
    showToast(t('验证码已发送'))
    startCountdown()
  } catch (e) {
    error.value = errMsg(e, t('验证码发送失败'))
  } finally {
    sending.value = false
  }
}

async function handleVerify() {
  if (!canVerify.value) return
  loading.value = true
  error.value = ''
  try {
    const codeTrimmed = code.value.trim()
    if (bindMode) {
      const res = await authControllerBindEmailAndLogin({
        body: { tempToken, email: email.value.trim(), code: codeTrimmed },
      })
      applyAuthResponse(unwrap(res))
    } else if (pending) {
      const res = await authControllerVerifyEmailAndRegisterPhone({
        body: {
          email: email.value.trim(),
          code: codeTrimmed,
          phone: pending.phone,
          phoneCode: pending.code,
          username: pending.username,
          password: pending.password,
          nickname: pending.nickname,
        },
      })
      applyAuthResponse(unwrap(res))
      clearRegisterPhonePending()
    } else {
      const res = await authControllerVerifyEmail({
        body: { email: email.value.trim(), code: codeTrimmed },
      })
      applyAuthResponse(unwrap(res))
    }
    showToast(pending ? t('注册成功') : t('邮箱验证成功'))
    navigateAfterAuth(route.query as Record<string, unknown>)
  } catch (e) {
    error.value = errMsg(toError(e), t('验证失败，请检查验证码是否正确或已过期'))
  } finally {
    loading.value = false
  }
}

function goLogin() {
  if (pending) clearRegisterPhonePending()
  void router.replace({ path: '/login' })
}

onMounted(() => {
  if (bindMode || !email.value || !isEmail(email.value)) return
  startCountdown()
  authControllerResendVerification({ body: { email: email.value.trim() } })
    .then((res) => {
      if (res.error) throw toError(res.error)
    })
    .catch((e) => {
      error.value = errMsg(e, t('验证码发送失败'))
    })
})
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">{{ title }}</h1>
        <p class="auth-subtitle">{{ subtitle }}</p>
      </div>

      <div class="form-body">
        <van-field
          v-model="email"
          type="text"
          :label="t('邮箱')"
          :placeholder="t('请输入邮箱地址')"
          :disabled="emailLocked"
          clearable
          @keyup.enter="handleVerify"
        />
        <van-field
          v-model="code"
          type="digit"
          :label="t('验证码')"
          :placeholder="t('请输入6位数字验证码')"
          maxlength="6"
          clearable
          @keyup.enter="handleVerify"
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

        <div v-if="notice" class="notice">{{ notice }}</div>
        <div v-if="error" class="auth-error">{{ error }}</div>

        <button class="primary-btn" type="button" :disabled="!canVerify" @click="handleVerify">
          {{ loading ? t('验证中…') : t('验证') }}
        </button>

        <button class="link-btn link-btn-right" type="button" @click="goLogin">
          {{ t('返回登录') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/pages/auth/auth-common.scss';
</style>
