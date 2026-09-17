<script setup lang="ts">
/**
 * 忘记密码页（对齐 PC ForgotPassword）。
 *
 * 选邮箱/手机号 → authControllerForgotPassword 发送验证码 → 跳重置页。
 * 渠道可用性由运行时配置决定；两者都关时不渲染表单，改为客服联系视图
 * （与 PC NoChannelView 同口径，联系方式读运行时配置）。
 *
 * 联系类型与联系值存 sessionStorage（而非路由 state）：hash 路由的 state
 * 在整页刷新后丢失，而用户提交验证码前刷新页面很常见。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authControllerForgotPassword } from '@cloudcad/api-sdk/sdk.gen'
import { t } from '@/languages'
import { toError, unwrap, errMsg } from '@/utils/authFeedback'
import { isEmail, isPhone, isContactType, type ContactType } from '@/utils/authValidation'
import { useRuntimeConfig } from '@/composables/useRuntimeConfig'

const CONTACT_TYPE_KEY = 'forgotContactType'
const CONTACT_VALUE_KEY = 'forgotContactValue'

const route = useRoute()
const router = useRouter()
const { config } = useRuntimeConfig()

const mailAvailable = computed(() => config.value.mailEnabled)
const phoneAvailable = computed(() => config.value.smsEnabled)
const noChannel = computed(() => !mailAvailable.value && !phoneAvailable.value)

const contactType = ref<ContactType>('email')
const contact = ref('')
const submitting = ref(false)
const error = ref('')
const sent = ref(false)
const sentContact = ref('')

const contactValid = computed(() =>
  contactType.value === 'email' ? isEmail(contact.value) : isPhone(contact.value)
)

function readStoredContact() {
  const storedType = sessionStorage.getItem(CONTACT_TYPE_KEY)
  const storedValue = sessionStorage.getItem(CONTACT_VALUE_KEY)
  if (isContactType(storedType)) contactType.value = storedType
  if (storedValue) {
    contact.value = storedValue
    sentContact.value = storedValue
    sent.value = true
  }
}

onMounted(() => {
  contactType.value = mailAvailable.value ? 'email' : 'phone'
  readStoredContact()
})

async function handleSubmit() {
  if (!contactValid.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await authControllerForgotPassword({
      body: {
        email: contactType.value === 'email' ? contact.value.trim() : undefined,
        phone: contactType.value === 'phone' ? contact.value.trim() : undefined,
        validateContact: '',
      },
    })
    const data = unwrap<{ mailEnabled?: boolean; smsEnabled?: boolean }>(res)
    // 后端可能在此时把渠道关掉：无可用渠道时不给「去重置」入口
    if (data.mailEnabled === false && data.smsEnabled === false) {
      error.value = t('当前没有可用的验证码渠道，请联系客服重置密码')
      return
    }
    sessionStorage.setItem(CONTACT_TYPE_KEY, contactType.value)
    sessionStorage.setItem(CONTACT_VALUE_KEY, contact.value.trim())
    sentContact.value = contact.value.trim()
    sent.value = true
  } catch (e) {
    error.value = errMsg(toError(e), t('发送验证码失败，请稍后重试'))
  } finally {
    submitting.value = false
  }
}

function goReset() {
  void router.replace({ path: '/reset-password' })
}

function goLogin() {
  sessionStorage.removeItem(CONTACT_TYPE_KEY)
  sessionStorage.removeItem(CONTACT_VALUE_KEY)
  const redirect = (route.query.redirect as string) || ''
  void router.replace({
    path: '/login',
    query: redirect && redirect !== '/shell' ? { redirect } : {},
  })
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <template v-if="noChannel">
        <div class="auth-header">
          <h1 class="auth-title">{{ t('无法重置密码') }}</h1>
          <p class="auth-subtitle">{{ t('当前系统未开启验证码渠道，请联系客服重置密码') }}</p>
        </div>
        <div class="form-body">
          <div class="contact-block">
            <div class="contact-row">
              <span class="contact-label">{{ t('客服邮箱：') }}</span>
              <a :href="`mailto:${config.supportEmail || 'support@cloudcad.com'}`">
                {{ config.supportEmail || 'support@cloudcad.com' }}
              </a>
            </div>
            <div class="contact-row">
              <span class="contact-label">{{ t('客服电话：') }}</span>
              <a :href="`tel:${config.supportPhone || '400-123-4567'}`">
                {{ config.supportPhone || '400-123-4567' }}
              </a>
            </div>
            <div class="contact-row">
              <span class="contact-label">{{ t('工作时间：') }}</span>
              <span class="contact-value">{{ t('周一至周五 9:00-18:00') }}</span>
            </div>
          </div>
          <button class="primary-btn" type="button" @click="goLogin">{{ t('返回登录') }}</button>
        </div>
      </template>

      <template v-else>
        <div class="auth-header">
          <h1 class="auth-title">{{ t('忘记密码') }}</h1>
          <p class="auth-subtitle">{{ t('通过邮箱或手机号验证身份后重置密码') }}</p>
        </div>

        <div class="form-body">
          <!-- 只有一个渠道时不渲染 tab（单个 tab 的 vant tabs 会渲染空白栏） -->
          <van-tabs v-if="mailAvailable && phoneAvailable" v-model:active="contactType">
            <van-tab :title="t('邮箱')" name="email" />
            <van-tab :title="t('手机号')" name="phone" />
          </van-tabs>

          <van-field
            v-if="contactType === 'email'"
            v-model="contact"
            type="text"
            :label="t('邮箱')"
            :placeholder="t('请输入注册邮箱')"
            clearable
            @keyup.enter="handleSubmit"
          />
          <van-field
            v-else
            v-model="contact"
            type="tel"
            :label="t('手机号')"
            :placeholder="t('请输入注册手机号')"
            maxlength="11"
            clearable
            @keyup.enter="handleSubmit"
          />

          <template v-if="sent">
            <div class="notice">
              {{ t('验证码已发送至') }} {{ sentContact }}
            </div>
            <button class="primary-btn" type="button" @click="goReset">{{ t('前往重置密码') }}</button>
          </template>
          <template v-else>
            <button
              class="primary-btn"
              type="button"
              :disabled="!contactValid || submitting"
              @click="handleSubmit"
            >
              {{ submitting ? t('发送中…') : t('发送验证码') }}
            </button>
          </template>

          <div v-if="error" class="auth-error">{{ error }}</div>

          <button class="link-btn link-btn-right" type="button" @click="goLogin">{{ t('返回登录') }}</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/pages/auth/auth-common.scss';

.contact-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  line-height: 1.7;

  a {
    color: var(--primary);
    word-break: break-all;
  }
}

.contact-label {
  color: var(--text-tertiary);
  min-width: 6em;
}

.contact-value {
  color: var(--text-secondary);
}
</style>
