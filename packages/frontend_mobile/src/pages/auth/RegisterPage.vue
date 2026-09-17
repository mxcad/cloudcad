<script setup lang="ts">
/**
 * 原生注册页（ADR-0062 升级：移动端不再跳 PC 注册页，改为页内注册）。
 *
 * 表单形态由运行时配置决定（与 PC useRegisterForm 同分支）：
 *   - smsEnabled && requirePhoneVerification → 手机号 + 短信验证码分支
 *       - 若同时 mailEnabled && requireEmailVerification → 先存注册凭证到 sessionStorage
 *         再跳 /verify-email，由邮箱验证页一步完成注册（verifyEmailAndRegisterPhone）
 *       - 否则直接 registerByPhone
 *   - 否则 → 用户名 + 密码（+ 邮箱，仅 requireEmailVerification 时）→ register
 *       - 后端返回 email 表示已发验证码待验证 → 跳 /verify-email
 *
 * allowRegister=false 时渲染注册关闭卡片（与 PC RegisterClosed 同文案）。
 * 微信入口：`?wechat=1` 时读 sessionStorage.wechatTempToken 随注册请求带上；
 * 非微信进入清掉旧值，避免上一轮微信授权残留污染普通注册。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  authControllerRegister,
  authControllerRegisterByPhone,
  authControllerSendSmsCode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showToast } from 'vant'
import { t } from '@/languages'
import {
  applyAuthResponse,
  setRegisterPhonePending,
} from '@/utils/authSession'
import { navigateAfterAuth, redirectQueryOf } from '@/utils/authNavigate'
import { toError, unwrap, errMsg } from '@/utils/authFeedback'
import { isPhone, isCode, isEmail, getPasswordStrength } from '@/utils/authValidation'
import { useCountdown } from '@/composables/useCountdown'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'

const route = useRoute()
const router = useRouter()
const { config } = useRuntimeConfig()

const phone = ref('')
const code = ref('')
const email = ref('')
const username = ref('')
const password = ref('')
const nickname = ref('')
const showPassword = ref(false)

const submitting = ref(false)
const sendingCode = ref(false)
const error = ref('')
const { countdown, start: countdownStart, isReady } = useCountdown()

// ── 分支开关（运行时配置驱动） ──
const closed = computed(() => !config.value.allowRegister)
const needEmail = computed(() => config.value.mailEnabled && config.value.requireEmailVerification)
const needPhoneCode = computed(() => config.value.smsEnabled && config.value.requirePhoneVerification)

const phoneValid = computed(() => isPhone(phone.value))
const codeValid = computed(() => isCode(code.value))
const emailValid = computed(() => !needEmail.value || isEmail(email.value))
const usernameValid = computed(
  () => username.value.trim().length >= 3 && username.value.trim().length <= 20
)
const passwordValid = computed(() => password.value.length >= 6)
const strength = computed(() => getPasswordStrength(password.value))

const canSubmit = computed(
  () =>
    usernameValid.value &&
    passwordValid.value &&
    emailValid.value &&
    (!needPhoneCode.value || (phoneValid.value && codeValid.value))
)

function handleSendCode() {
  if (!phoneValid.value || sendingCode.value || !isReady()) return
  sendingCode.value = true
  error.value = ''
  authControllerSendSmsCode({ body: { phone: phone.value.trim(), scene: 'register' } })
    .then((res) => {
      if (res.error) throw toError(res.error)
      showToast(t('验证码已发送'))
      countdownStart()
    })
    .catch((e) => {
      error.value = errMsg(e, t('验证码发送失败'))
    })
    .finally(() => {
      sendingCode.value = false
    })
}

function finishRegister(data: {
  accessToken: string
  refreshToken?: string
  user?: unknown
}) {
  applyAuthResponse(data)
  showToast(t('注册成功'))
  clearWechatTempToken()
  navigateAfterAuth(route.query as Record<string, unknown>)
}

function clearWechatTempToken() {
  if (route.query.wechat === '1') sessionStorage.removeItem('wechatTempToken')
}

async function handleRegister() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  const wechatTempToken = sessionStorage.getItem('wechatTempToken') || undefined
  try {
    if (needPhoneCode.value) {
      if (needEmail.value) {
        // 邮箱待验证：先记住注册凭证，邮箱验证页一步完成注册
        setRegisterPhonePending({
          phone: phone.value.trim(),
          code: code.value.trim(),
          username: username.value.trim(),
          password: password.value,
          nickname: nickname.value.trim() || undefined,
        })
        void router.replace({
          path: '/verify-email',
          query: { ...redirectQueryOf(route.query) },
          state: { message: t('请先验证邮箱，完成注册') },
        })
        return
      }

      const res = await authControllerRegisterByPhone({
        body: {
          phone: phone.value.trim(),
          code: code.value.trim(),
          username: username.value.trim(),
          password: password.value,
          nickname: nickname.value.trim() || undefined,
        },
      })
      const data = unwrap<{ accessToken: string; refreshToken?: string; user?: unknown }>(res)
      finishRegister(data)
    } else {
      const res = await authControllerRegister({
        body: {
          username: username.value.trim(),
          password: password.value,
          nickname: nickname.value.trim() || undefined,
          email: needEmail.value ? email.value.trim() : undefined,
          wechatTempToken,
        },
      })
      const data = unwrap<{ accessToken?: string; refreshToken?: string; user?: unknown; email?: string }>(
        res
      )
      // 后端返回 email 表示账号已建但邮箱未验证，需先去验证页拿 token
      if (data.email && !data.accessToken) {
        void router.replace({
          path: '/verify-email',
          query: { ...redirectQueryOf(route.query) },
          state: { email: data.email, message: t('请验证邮箱以完成注册') },
        })
        return
      }
      if (data.accessToken) {
        finishRegister({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        })
      } else {
        throw new Error(t('注册失败，请重试'))
      }
    }
  } catch (e) {
    error.value = errMsg(toError(e), t('注册失败，请重试'))
  } finally {
    submitting.value = false
  }
}

function goLogin() {
  void router.replace({ path: '/login', query: { ...redirectQueryOf(route.query) } })
}

onMounted(() => {
  if (route.query.wechat !== '1') sessionStorage.removeItem('wechatTempToken')
})
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <template v-if="closed">
        <div class="auth-header">
          <h1 class="auth-title">{{ t('注册已关闭') }}</h1>
          <p class="auth-subtitle">{{ t('系统管理员已关闭新用户注册功能。') }}</p>
        </div>
        <div class="form-body">
          <p class="notice">{{ t('如有疑问，请联系管理员。') }}</p>
          <button class="primary-btn" type="button" @click="goLogin">{{ t('返回登录') }}</button>
        </div>
      </template>

      <template v-else>
        <div class="auth-header">
          <h1 class="auth-title">{{ t('注册') }}</h1>
          <p class="auth-subtitle">{{ t('创建账户，开始使用 CloudCAD') }}</p>
        </div>

        <div class="form-body">
          <template v-if="needPhoneCode">
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
          </template>

          <van-field
            v-if="needEmail"
            v-model="email"
            type="text"
            :label="t('邮箱')"
            :placeholder="t('请输入邮箱地址')"
            clearable
          />
          <van-field
            v-model="username"
            :label="t('用户名')"
            :placeholder="t('请输入用户名（3-20 个字符）')"
            maxlength="20"
            clearable
          />
          <van-field
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            :label="t('密码')"
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
          <template v-if="password && strength.score > 0">
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
            v-model="nickname"
            :label="t('昵称')"
            :placeholder="t('选填，最多 50 个字符')"
            maxlength="50"
            clearable
          />

          <button class="primary-btn" type="button" :disabled="!canSubmit || submitting" @click="handleRegister">
            {{ submitting ? t('注册中…') : t('立即注册') }}
          </button>
        </div>

        <div v-if="error" class="auth-error">{{ error }}</div>

        <div class="auth-footer">
          <span>{{ t('已有账号？') }}</span>
          <button class="link-btn" type="button" @click="goLogin">{{ t('去登录') }}</button>
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
