/**
 * 邮箱 / 手机号 绑定 · 换绑 · 解绑（验证码流程）+ 入口分发。
 *
 * 端点：
 *   换绑三步：POST /auth/unbind-email|phone/send-code → verify（取 token）→ rebind-email|phone
 *   新绑两步：POST /auth/email/bind/code（或 /auth/phone/send-code）→ verify-bind-email|bind-phone
 *   解绑两步：POST /auth/unbind-email|phone/send-code → unbind-email|unbind-phone
 *
 * 邮箱与手机共用一套弹窗与倒计时，仅 codeFeature 决定走 email 还是 phone 分支。
 * 后端要求账号至少保留一种登录方式（密码/手机/微信），违规由后端 400 兜底。
 */
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import {
  authControllerBindPhone,
  authControllerRebindEmail,
  authControllerRebindPhone,
  authControllerSendBindEmailCode,
  authControllerSendSmsCode,
  authControllerSendUnbindEmailCode,
  authControllerSendUnbindPhoneCode,
  authControllerUnbindEmail,
  authControllerUnbindPhone,
  authControllerVerifyBindEmail,
  authControllerVerifyUnbindEmailCode,
  authControllerVerifyUnbindPhoneCode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showSuccessToast } from 'vant'
import { t } from '@/languages'
import { unwrap, errMsg } from '@/utils/apiError'
import { maskPhone } from '@/utils/profileDisplay'
import { useCountdown } from './useCountdown'
import { isCode, isEmail, isPhone, type ContactType } from '@/utils/authValidation'
import type { UserProfile } from './useProfileData'

type CodeStep = 'verifyOld' | 'inputNew' | 'verifyNew'

export function useAccountCredentials(profile: Ref<UserProfile>, refresh: () => Promise<unknown>) {
  // ═══ 邮箱 / 手机号 绑定·换绑（验证码）═══
  const showCodeDialog = ref(false)
  const codeFeature = ref<ContactType>('email')
  const codeStep = ref<CodeStep>('inputNew')
  const newAccountValue = ref('')
  const oldCode = ref('')
  const newCode = ref('')
  const unbindToken = ref('')
  const codeMsg = ref('')
  const codeErr = ref('')
  const sendingCode = ref(false)
  const submittingCode = ref(false)
  const { countdown, start: startCountdown, stop: stopCountdown } = useCountdown()

  // 倒计时由两个弹窗（绑定换绑 / 解绑）共用：关弹窗时清零并停表，
  // 避免上一轮的秒数残留到下一次打开
  function resetCountdown() {
    stopCountdown()
    countdown.value = 0
  }

  const isReassign = computed(() => (codeFeature.value === 'email'
    ? !!profile.value.email
    : !!profile.value.phone
  ))

  const accountLabel = computed(() => (codeFeature.value === 'email' ? t('邮箱') : t('手机号')))
  const oldTargetLabel = computed(() =>
    codeFeature.value === 'email'
      ? (profile.value.email ?? t('原邮箱'))
      : (maskPhone(profile.value.phone) || t('原手机号'))
  )
  const codeDialogTitle = computed(() =>
    isReassign.value ? t('更换') + accountLabel.value : t('绑定') + accountLabel.value
  )
  const codePrimaryLabel = computed(() => {
    if (codeStep.value === 'verifyOld') return submittingCode.value ? t('验证中…') : t('验证')
    if (codeStep.value === 'inputNew') return sendingCode.value ? t('发送中…') : t('发送验证码')
    return submittingCode.value ? t('提交中…') : (isReassign.value ? t('确认更换') : t('确认绑定'))
  })
  const canSubmitCode = computed(() => {
    if (codeStep.value === 'verifyOld') return isCode(oldCode.value)
    if (codeStep.value === 'inputNew') return validNewValue()
    return isCode(newCode.value)
  })

  function validNewValue(): boolean {
    const v = newAccountValue.value.trim()
    if (!v) return false
    return codeFeature.value === 'phone' ? isPhone(v) : isEmail(v)
  }

  function openCodeEditor(feature: ContactType) {
    codeFeature.value = feature
    newAccountValue.value = ''
    oldCode.value = ''
    newCode.value = ''
    unbindToken.value = ''
    codeMsg.value = ''
    codeErr.value = ''
    resetCountdown()
    codeStep.value = isReassign.value ? 'verifyOld' : 'inputNew'
    showCodeDialog.value = true
  }

  function closeCodeDialog() {
    resetCountdown()
    showCodeDialog.value = false
  }

  /** 换绑第一步：发码到原值并验证，换取换绑令牌 */
  async function sendOldCode() {
    if (sendingCode.value) return
    codeErr.value = ''
    sendingCode.value = true
    try {
      const res = codeFeature.value === 'email'
        ? await authControllerSendUnbindEmailCode()
        : await authControllerSendUnbindPhoneCode()
      unwrap(res)
      codeMsg.value = t('验证码已发送')
      startCountdown()
    } catch (e) {
      codeMsg.value = ''
      codeErr.value = errMsg(e, t('验证码发送失败'))
    } finally {
      sendingCode.value = false
    }
  }

  async function submitOldCode() {
    if (!isCode(oldCode.value) || submittingCode.value) return
    submittingCode.value = true
    codeErr.value = ''
    try {
      const res = codeFeature.value === 'email'
        ? await authControllerVerifyUnbindEmailCode({ body: { code: oldCode.value } })
        : await authControllerVerifyUnbindPhoneCode({ body: { code: oldCode.value } })
      const data = unwrap<{ success?: boolean; message?: string; token?: string }>(res)
      if (!data.token) throw new Error(data.message || t('验证失败'))
      unbindToken.value = data.token
      oldCode.value = ''
      codeErr.value = ''
      codeMsg.value = t('验证通过')
      codeStep.value = 'inputNew'
    } catch (e) {
      codeErr.value = errMsg(e, t('验证失败'))
    } finally {
      submittingCode.value = false
    }
  }

  /** 发码到新值；advance=true 时发送成功后进入验证码步骤 */
  async function sendNewCode(advance: boolean) {
    if (!validNewValue()) {
      codeErr.value = codeFeature.value === 'phone' ? t('请输入正确的手机号') : t('请输入正确的邮箱')
      return
    }
    if (sendingCode.value) return
    codeErr.value = ''
    sendingCode.value = true
    try {
      const res = codeFeature.value === 'email'
        ? await authControllerSendBindEmailCode({
            body: { email: newAccountValue.value.trim(), isRebind: isReassign.value },
          })
        : await authControllerSendSmsCode({
            body: { phone: newAccountValue.value.trim(), scene: 'bind' },
          })
      unwrap(res)
      codeMsg.value = t('验证码已发送')
      startCountdown()
      if (advance) codeStep.value = 'verifyNew'
    } catch (e) {
      codeMsg.value = ''
      codeErr.value = errMsg(e, t('验证码发送失败'))
    } finally {
      sendingCode.value = false
    }
  }

  async function submitNewCode() {
    if (!validNewValue() || !isCode(newCode.value) || submittingCode.value) return
    if (isReassign.value && !unbindToken.value) {
      codeErr.value = t('请先验证原账号信息')
      return
    }
    submittingCode.value = true
    codeErr.value = ''
    try {
      const value = newAccountValue.value.trim()
      const res = codeFeature.value === 'email'
        ? (isReassign.value
            ? await authControllerRebindEmail({ body: { email: value, code: newCode.value, token: unbindToken.value } })
            : await authControllerVerifyBindEmail({ body: { email: value, code: newCode.value } }))
        : (isReassign.value
            ? await authControllerRebindPhone({ body: { phone: value, code: newCode.value, token: unbindToken.value } })
            : await authControllerBindPhone({ body: { phone: value, code: newCode.value } }))
      const data = unwrap<{ success?: boolean; message?: string }>(res)
      if (data.success === false) throw new Error(data.message || t('操作失败'))
      showSuccessToast(accountLabel.value + (isReassign.value ? t('已更换') : t('已绑定')))
      closeCodeDialog()
      await refresh()
    } catch (e) {
      codeErr.value = errMsg(e, t('操作失败'))
    } finally {
      submittingCode.value = false
    }
  }

  function onCodePrimary() {
    if (codeStep.value === 'verifyOld') return submitOldCode()
    if (codeStep.value === 'inputNew') return sendNewCode(true)
    return submitNewCode()
  }

  // ═══ 入口分发 ═══
  // 邮箱/手机已绑定时给「更换/解绑」两选项（ActionSheet 是移动端多选入口的标准形态）；
  // 未绑定时只有一个动作，直接进弹窗，不多加一层选择
  const showAccountSheet = ref(false)
  const accountSheetFeature = ref<ContactType>('email')

  function isAccountBound(feature: ContactType): boolean {
    return feature === 'email' ? !!profile.value.email : !!profile.value.phone
  }

  const accountSheetTitle = computed(() => (accountSheetFeature.value === 'email' ? t('邮箱') : t('手机号')))

  const accountSheetActions = computed(() =>
    isAccountBound(accountSheetFeature.value)
      ? [
          { key: 'reassign', name: t('更换') },
          { key: 'unbind', name: t('解绑'), color: '#ff4444' },
        ]
      : [{ key: 'bind', name: t('绑定') }]
  )

  function openAccountSheet(feature: ContactType) {
    accountSheetFeature.value = feature
    showAccountSheet.value = true
  }

  function onAccountSheetSelect(action: { key?: string }) {
    showAccountSheet.value = false
    if (action.key === 'unbind') return openUnbind(accountSheetFeature.value)
    openCodeEditor(accountSheetFeature.value)
  }

  // ═══ 解绑邮箱 / 手机号（D-05）═══
  // 流程与换绑第一步相同（发码到原值 → 输码），但校验通过后直接解绑、不换新值
  const showUnbindDialog = ref(false)
  const unbindFeature = ref<ContactType>('email')
  const unbindCode = ref('')
  const unbindMsg = ref('')
  const unbindErr = ref('')

  const unbindTitle = computed(() => (unbindFeature.value === 'email' ? t('解绑邮箱') : t('解绑手机号')))
  const unbindTargetLabel = computed(() =>
    unbindFeature.value === 'email' ? (profile.value.email ?? t('原邮箱')) : (maskPhone(profile.value.phone) || t('原手机号'))
  )
  const canSubmitUnbind = computed(() => isCode(unbindCode.value))

  function openUnbind(feature: ContactType) {
    unbindFeature.value = feature
    unbindCode.value = ''
    unbindMsg.value = ''
    unbindErr.value = ''
    resetCountdown()
    showUnbindDialog.value = true
  }

  async function sendUnbindCode() {
    if (sendingCode.value) return
    unbindErr.value = ''
    sendingCode.value = true
    try {
      const res = unbindFeature.value === 'email'
        ? await authControllerSendUnbindEmailCode()
        : await authControllerSendUnbindPhoneCode()
      unwrap(res)
      unbindMsg.value = t('验证码已发送')
      startCountdown()
    } catch (e) {
      unbindMsg.value = ''
      unbindErr.value = errMsg(e, t('验证码发送失败'))
    } finally {
      sendingCode.value = false
    }
  }

  async function confirmUnbind() {
    if (!canSubmitUnbind.value || submittingCode.value) return
    submittingCode.value = true
    unbindErr.value = ''
    try {
      const res = unbindFeature.value === 'email'
        ? await authControllerUnbindEmail({ body: { code: unbindCode.value } })
        : await authControllerUnbindPhone({ body: { code: unbindCode.value } })
      const data = unwrap<{ success?: boolean; message?: string }>(res)
      if (data.success === false) throw new Error(data.message || t('解绑失败'))
      showSuccessToast(t('已解绑'))
      closeUnbindDialog()
      await refresh()
    } catch (e) {
      unbindErr.value = errMsg(e, t('解绑失败'))
    } finally {
      submittingCode.value = false
    }
  }

  function closeUnbindDialog() {
    resetCountdown()
    showUnbindDialog.value = false
  }

  return {
    showCodeDialog,
    codeFeature,
    codeStep,
    newAccountValue,
    oldCode,
    newCode,
    codeMsg,
    codeErr,
    sendingCode,
    submittingCode,
    countdown,
    isReassign,
    accountLabel,
    oldTargetLabel,
    codeDialogTitle,
    codePrimaryLabel,
    canSubmitCode,
    openCodeEditor,
    closeCodeDialog,
    sendOldCode,
    sendNewCode,
    onCodePrimary,
    showAccountSheet,
    accountSheetTitle,
    accountSheetActions,
    openAccountSheet,
    onAccountSheetSelect,
    showUnbindDialog,
    unbindTitle,
    unbindTargetLabel,
    canSubmitUnbind,
    unbindCode,
    unbindMsg,
    unbindErr,
    openUnbind,
    sendUnbindCode,
    confirmUnbind,
    closeUnbindDialog,
  }
}
