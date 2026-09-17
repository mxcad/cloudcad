<script setup lang="ts">
/**
 * 手机号验证页（对齐 PC PhoneVerification）。
 *
 * 两种进入路径：
 *   1. 已注册未验证：登录报 PHONE_NOT_VERIFIED → state { phone }
 *      → 挂载时补发短信（scene='login'）→ authControllerVerifyPhone
 *   2. 补绑手机：登录报 PHONE_REQUIRED → state { tempToken, mode:'bind' }
 *      → 用户输入手机号 + 手动发送（scene='bind'）→ authControllerBindPhoneAndLogin
 * 两者都返回 AuthApiResponseDto，验证成功即登录。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerBindPhoneAndLogin,
  authControllerSendSmsCode,
  authControllerVerifyPhone,
} from '@cloudcad/api-sdk/sdk.gen'
import { showToast } from 'vant'
import { t } from '@/languages'
import { applyAuthResponse } from '@/utils/authSession'
import { navigateAfterAuth, redirectQueryOf } from '@/utils/authNavigate'
import { toError, unwrap, errMsg } from '@/utils/authFeedback'
import { isPhone, isCode } from '@/utils/authValidation'
import { CODE_COOLDOWN_SECONDS, useCountdown } from '@/composables/useCountdown'

interface VerifyPhoneState {
  phone?: string
  tempToken?: string
  mode?: 'bind'
}

const route = useRoute()
const router = useRouter()

const state = (route.state ?? {}) as VerifyPhoneState
const bindMode = state.mode === 'bind'
const tempToken = typeof state.tempToken === 'string' ? state.tempToken : ''

const phone = ref(typeof state.phone === 'string' ? state.phone : '')
const code = ref('')
const loading = ref(false)
const sending = ref(false)
const error = ref('')

const { countdown, start: startCountdown, isReady } = useCountdown(CODE_COOLDOWN_SECONDS)

const title = computed(() => (bindMode ? t('绑定手机号') : t('手机号验证')))
const subtitle = computed(() => {
  if (bindMode) return t('为当前账号绑定手机号后即可登录')
  return t('我们已向您注册的手机号发送验证码')
})

const canSend = computed(() => isPhone(phone.value) && !sending.value && isReady())
const canVerify = computed(() => isCode(code.value) && !loading.value)

async function handleSend() {
  if (!canSend.value) return
  sending.value = true
  error.value = ''
  try {
    const res = await authControllerSendSmsCode({
      body: { phone: phone.value.trim(), scene: bindMode ? 'bind' : 'login' },
    })
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
  if (bindMode && !isPhone(phone.value)) {
    error.value = t('请输入正确的手机号')
    return
  }
  loading.value = true
  error.value = ''
  try {
    if (bindMode) {
      const res = await authControllerBindPhoneAndLogin({
        body: { tempToken, phone: phone.value.trim(), code: code.value.trim() },
      })
      applyAuthResponse(unwrap(res))
    } else {
      const res = await authControllerVerifyPhone({
        body: { phone: phone.value.trim(), code: code.value.trim() },
      })
      applyAuthResponse(unwrap(res))
    }
    showToast(bindMode ? t('手机号绑定成功') : t('手机号验证成功'))
    navigateAfterAuth(route.query as Record<string, unknown>)
  } catch (e) {
    error.value = errMsg(toError(e), t('验证失败，请检查验证码是否正确或已过期'))
  } finally {
    loading.value = false
  }
}

function goLogin() {
  void router.replace({ path: '/login', query: { ...redirectQueryOf(route.query) } })
}

onMounted(() => {
  if (bindMode || !isPhone(phone.value)) return
  startCountdown()
  authControllerSendSmsCode({ body: { phone: phone.value.trim(), scene: 'login' } })
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
          v-if="bindMode"
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
          :placeholder="t('请输入6位数字验证码')"
          maxlength="6"
          clearable
          @keyup.enter="handleVerify"
        >
          <template #button>
            <button
              class="code-btn"
              type="button"
              :disabled="countdown > 0 || sending || !isPhone(phone)"
              @click="handleSend"
            >
              {{ countdown > 0 ? `${countdown}s` : t('重新发送验证码') }}
            </button>
          </template>
        </van-field>

        <div v-if="error" class="auth-error">{{ error }}</div>

        <button class="primary-btn" type="button" :disabled="!canVerify" @click="handleVerify">
          {{ loading ? t('验证中…') : t('验证') }}
        </button>

        <p class="hint">{{ t('验证码为6位数字，15分钟内有效') }}</p>

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
