import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useAccountCredentials } from './useAccountCredentials'
import type { UserProfile } from './useProfileData'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerBindPhone: vi.fn(),
  authControllerRebindEmail: vi.fn(),
  authControllerRebindPhone: vi.fn(),
  authControllerSendBindEmailCode: vi.fn(),
  authControllerSendSmsCode: vi.fn(),
  authControllerSendUnbindEmailCode: vi.fn(),
  authControllerSendUnbindPhoneCode: vi.fn(),
  authControllerUnbindEmail: vi.fn(),
  authControllerUnbindPhone: vi.fn(),
  authControllerVerifyBindEmail: vi.fn(),
  authControllerVerifyUnbindEmailCode: vi.fn(),
  authControllerVerifyUnbindPhoneCode: vi.fn(),
}))
vi.mock('vant', () => ({ showSuccessToast: vi.fn() }))

import {
  authControllerBindPhone,
  authControllerRebindEmail,
  authControllerSendSmsCode,
  authControllerSendUnbindEmailCode,
  authControllerUnbindEmail,
  authControllerUnbindPhone,
  authControllerVerifyUnbindEmailCode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showSuccessToast } from 'vant'

// vi.mock 后 SDK 函数丢失 mock 类型，统一用 vi.mocked 恢复（同 useLibrary.spec 写法）
function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

function setup(initial: UserProfile) {
  const refresh = vi.fn().mockResolvedValue(undefined)
  const profile = ref<UserProfile>(initial)
  return { ...useAccountCredentials(profile, refresh), profile, refresh }
}

describe('useAccountCredentials 绑定·换绑·解绑流程', () => {
  let warnSpy: { mockRestore: () => void } | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    // useCountdown 在 composable 里注册 onUnmounted，测试里没有活动组件实例，
    // 该警告是预期的（生产由页面卸载触发清理）。须放在 beforeEach：
    // vitest 的 console 捕获在测试开始时重装，describe 体内装的 spy 会被覆盖
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warnSpy?.mockRestore()
  })

  it('已绑定邮箱 → openCodeEditor 从「验证原值」步骤开始', () => {
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')
    expect(c.showCodeDialog.value).toBe(true)
    expect(c.codeFeature.value).toBe('email')
    expect(c.codeStep.value).toBe('verifyOld')
    expect(c.isReassign.value).toBe(true)
    // 重置：上一次的输入与错误不能残留
    expect(c.newAccountValue.value).toBe('')
    expect(c.codeErr.value).toBe('')
  })

  it('未绑定手机号 → 直接进「输入新值」步骤', () => {
    const c = setup({ phone: null })
    c.openCodeEditor('phone')
    expect(c.codeStep.value).toBe('inputNew')
    expect(c.isReassign.value).toBe(false)
  })

  it('isReassign 跟随 profile 响应式变化', () => {
    const c = setup({})
    expect(c.isReassign.value).toBe(false)
    c.profile.value.email = 'a@b.com'
    c.codeFeature.value = 'email'
    expect(c.isReassign.value).toBe(true)
  })

  it('canSubmitCode 按步骤各自校验：旧值验证码 6 位 / 新值合法 / 新验证码 6 位', () => {
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')

    c.oldCode.value = '12345'
    expect(c.canSubmitCode.value).toBe(false)
    c.oldCode.value = '123456'
    expect(c.canSubmitCode.value).toBe(true)

    c.codeStep.value = 'inputNew'
    c.newAccountValue.value = 'not-an-email'
    expect(c.canSubmitCode.value).toBe(false)
    c.newAccountValue.value = 'new@x.com'
    expect(c.canSubmitCode.value).toBe(true)

    c.codeStep.value = 'verifyNew'
    c.newCode.value = 'abcd'
    expect(c.canSubmitCode.value).toBe(false)
    c.newCode.value = '123456'
    expect(c.canSubmitCode.value).toBe(true)
  })

  it('新值校验走唯一出口 authValidation（手机号 11 位大陆号段）', () => {
    const c = setup({ phone: null })
    c.openCodeEditor('phone')
    c.newAccountValue.value = '12345'
    expect(c.canSubmitCode.value).toBe(false)
    c.newAccountValue.value = '13800138000'
    expect(c.canSubmitCode.value).toBe(true)
  })

  it('onCodePrimary 在新值非法时不发请求，只写错误提示', async () => {
    const c = setup({ phone: null })
    c.openCodeEditor('phone')
    c.newAccountValue.value = '12345'
    await c.onCodePrimary()
    expect(authControllerSendSmsCode).not.toHaveBeenCalled()
    expect(c.codeErr.value).toBeTruthy()
    expect(c.countdown.value).toBe(0)
  })

  it('换绑发旧值验证码：启动倒计时，关闭弹窗清零', async () => {
    resolveWith(authControllerSendUnbindEmailCode, { data: {} })
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')

    await c.sendOldCode()
    expect(authControllerSendUnbindEmailCode).toHaveBeenCalledTimes(1)
    expect(c.codeMsg.value).toBeTruthy()
    expect(c.countdown.value).toBe(60)

    c.closeCodeDialog()
    expect(c.showCodeDialog.value).toBe(false)
    expect(c.countdown.value).toBe(0)
  })

  it('换绑新值：先验证原值取令牌，再带令牌提交 rebind-email', async () => {
    resolveWith(authControllerVerifyUnbindEmailCode, { data: { success: true, message: '', token: 'tok-1' } })
    resolveWith(authControllerRebindEmail, { data: { success: true, message: '' } })
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')

    // 第一步：验证原值换取令牌，进入输入新值步
    c.oldCode.value = '111111'
    await c.onCodePrimary()
    expect(authControllerVerifyUnbindEmailCode).toHaveBeenCalledWith({ body: { code: '111111' } })
    expect(c.codeStep.value).toBe('inputNew')

    // 第二步：填新值 + 新验证码后提交，必须带上令牌
    c.newAccountValue.value = 'new@x.com'
    c.codeStep.value = 'verifyNew'
    c.newCode.value = '123456'
    await c.onCodePrimary()

    expect(authControllerRebindEmail).toHaveBeenCalledWith({
      body: { email: 'new@x.com', code: '123456', token: 'tok-1' },
    })
    expect(c.showCodeDialog.value).toBe(false)
    expect(c.refresh).toHaveBeenCalledTimes(1)
    expect(showSuccessToast).toHaveBeenCalled()
  })

  it('验证原值未返回令牌 → 停在原步骤并提示失败', async () => {
    resolveWith(authControllerVerifyUnbindEmailCode, { data: { success: true, message: '无令牌' } })
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')
    c.oldCode.value = '123456'

    await c.onCodePrimary()

    expect(c.codeStep.value).toBe('verifyOld')
    expect(c.codeErr.value).toBeTruthy()
  })

  it('换绑缺令牌 → 拒绝提交并提示先验证原值', async () => {
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')
    c.codeStep.value = 'verifyNew'
    c.newAccountValue.value = 'new@x.com'
    c.newCode.value = '123456'

    await c.onCodePrimary()

    expect(authControllerRebindEmail).not.toHaveBeenCalled()
    expect(c.codeErr.value).toBeTruthy()
  })

  it('新绑手机走 bind-phone（不带令牌），成功后关弹窗并回读资料', async () => {
    resolveWith(authControllerSendSmsCode, { data: {} })
    resolveWith(authControllerBindPhone, { data: { success: true, message: '' } })
    const c = setup({ phone: null })
    c.openCodeEditor('phone')
    c.newAccountValue.value = '13800138000'

    // inputNew 步主按钮 = 发验证码并进入 verifyNew
    await c.onCodePrimary()
    expect(authControllerSendSmsCode).toHaveBeenCalledWith({ body: { phone: '13800138000', scene: 'bind' } })
    expect(c.codeStep.value).toBe('verifyNew')

    c.newCode.value = '123456'
    await c.onCodePrimary()

    expect(authControllerBindPhone).toHaveBeenCalledWith({ body: { phone: '13800138000', code: '123456' } })
    expect(c.showCodeDialog.value).toBe(false)
    expect(c.refresh).toHaveBeenCalledTimes(1)
  })

  it('已绑定 → ActionSheet 给「更换/解绑」两项；未绑定只给「绑定」', () => {
    const bound = setup({ phone: '13800138000' })
    bound.openAccountSheet('phone')
    expect(bound.showAccountSheet.value).toBe(true)
    expect(bound.accountSheetActions.value.map((a) => a.key)).toEqual(['reassign', 'unbind'])

    const fresh = setup({ phone: null })
    fresh.openAccountSheet('phone')
    expect(fresh.accountSheetActions.value.map((a) => a.key)).toEqual(['bind'])
  })

  it('ActionSheet 选「解绑」进解绑弹窗，选「更换」进绑定换绑弹窗', () => {
    const c = setup({ email: 'me@x.com' })
    c.openAccountSheet('email')

    c.onAccountSheetSelect({ key: 'unbind' })
    expect(c.showAccountSheet.value).toBe(false)
    expect(c.showUnbindDialog.value).toBe(true)
    expect(c.showCodeDialog.value).toBe(false)

    c.onAccountSheetSelect({ key: 'reassign' })
    expect(c.showCodeDialog.value).toBe(true)
    expect(c.codeStep.value).toBe('verifyOld')
  })

  it('解绑：校验 6 位码后直接解绑，无需令牌，成功后关弹窗并回读', async () => {
    resolveWith(authControllerUnbindEmail, { data: { success: true, message: '' } })
    const c = setup({ email: 'me@x.com' })
    c.openUnbind('email')

    c.unbindCode.value = '12345'
    expect(c.canSubmitUnbind.value).toBe(false)
    c.unbindCode.value = '123456'
    expect(c.canSubmitUnbind.value).toBe(true)

    await c.confirmUnbind()

    expect(authControllerUnbindEmail).toHaveBeenCalledWith({ body: { code: '123456' } })
    expect(authControllerRebindEmail).not.toHaveBeenCalled()
    expect(c.showUnbindDialog.value).toBe(false)
    expect(c.refresh).toHaveBeenCalledTimes(1)
    expect(showSuccessToast).toHaveBeenCalled()
  })

  it('解绑失败时保留弹窗并写后端文案', async () => {
    resolveWith(authControllerUnbindPhone, {
      error: { code: 'LOGIN_METHOD_REQUIRED', message: '请至少保留一种登录方式' },
    })
    const c = setup({ phone: '13800138000' })
    c.openUnbind('phone')
    c.unbindCode.value = '123456'

    await c.confirmUnbind()

    expect(c.showUnbindDialog.value).toBe(true)
    expect(c.unbindErr.value).toContain('保留')
    expect(c.refresh).not.toHaveBeenCalled()
  })

  it('提交中的在途请求不被重复触发（防抖）', async () => {
    let release!: () => void
    vi.mocked(authControllerVerifyUnbindEmailCode).mockReturnValue(
      new Promise<unknown>((resolve) => {
        release = () => resolve({ data: { success: true, message: '', token: 'tok' } })
      }) as never,
    )
    const c = setup({ email: 'me@x.com' })
    c.openCodeEditor('email')
    c.oldCode.value = '123456'

    const first = c.onCodePrimary()
    expect(c.submittingCode.value).toBe(true)
    await c.onCodePrimary() // 在途期间再次点击必须被忽略
    expect(authControllerVerifyUnbindEmailCode).toHaveBeenCalledTimes(1)

    release()
    await first
    expect(c.submittingCode.value).toBe(false)
    expect(c.codeStep.value).toBe('inputNew')
  })
})
