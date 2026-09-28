import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useProfileDeactivate } from './useProfileDeactivate'
import type { UserProfile } from './useProfileData'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  authControllerResendVerification: vi.fn(),
  authControllerSendSmsCode: vi.fn(),
  usersControllerDeactivateAccount: vi.fn(),
}))
vi.mock('@/composables/useRuntimeConfig', () => ({
  useRuntimeConfig: () => ({ config: { value: { userCancelGraceDays: 7 } } }),
}))

import {
  authControllerResendVerification,
  authControllerSendSmsCode,
  usersControllerDeactivateAccount,
} from '@cloudcad/api-sdk/sdk.gen'

// vi.mock 后 SDK 函数丢失 mock 类型，统一用 vi.mocked 恢复（同 useAccountCredentials.spec 写法）
function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

function setup(profile: UserProfile) {
  const onDeactivated = vi.fn()
  const c = useProfileDeactivate(ref(profile), onDeactivated)
  return { c, onDeactivated }
}

const fullUser: UserProfile = {
  hasPassword: true,
  phone: '13800138000',
  phoneVerified: true,
  email: 'me@example.com',
  wechatId: 'openid-123',
}

describe('useProfileDeactivate 账号注销', () => {
  let warnSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // useCountdown 在 composable 里注册 onUnmounted，测试里没有活动组件实例（同 useAccountCredentials.spec）
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warnSpy.mockRestore()
    vi.useRealTimers()
  })

  it('验证方式按用户数据动态生成（未绑定/未验证的选项不出现）', () => {
    const { c } = setup(fullUser)
    expect(c.methodOptions.value.map((o) => o.value)).toEqual(['password', 'phone', 'email', 'wechat'])
  })

  it('无密码 + 手机未验证 + 无微信 → 只剩邮箱选项', () => {
    const { c } = setup({ hasPassword: false, phone: '13800138000', phoneVerified: false, email: 'me@example.com' })
    expect(c.methodOptions.value.map((o) => o.value)).toEqual(['email'])
  })

  it('open 默认选中第一个可用选项（优先级 密码>手机>邮箱>微信）', () => {
    const { c } = setup({ hasPassword: false, phone: '13800138000', phoneVerified: true })
    c.open()
    expect(c.method.value).toBe('phone')
    expect(c.showSheet.value).toBe(true)
  })

  it('open 重置上一轮输入与确认态', () => {
    const { c } = setup(fullUser)
    c.open()
    c.password.value = 'secret'
    c.confirmed.value = true
    c.error.value = '上次错误'
    c.open()
    expect(c.password.value).toBe('')
    expect(c.confirmed.value).toBe(false)
    expect(c.error.value).toBe('')
  })

  it("open('wechat') 预设微信验证（授权回跳场景）", () => {
    const { c } = setup(fullUser)
    c.open('wechat')
    expect(c.method.value).toBe('wechat')
  })

  it('setWechatCode 写回 code 并切到微信验证', () => {
    const { c } = setup(fullUser)
    c.open()
    c.setWechatCode('wx-code')
    expect(c.wechatCode.value).toBe('wx-code')
    expect(c.method.value).toBe('wechat')
  })

  it('canSubmit 按当前方式校验对应输入', () => {
    const { c } = setup(fullUser)
    c.open()
    expect(c.canSubmit.value).toBe(false) // 密码空
    c.password.value = 'secret'
    expect(c.canSubmit.value).toBe(true)

    c.method.value = 'phone'
    expect(c.canSubmit.value).toBe(false)
    c.phoneCode.value = '12345'
    expect(c.canSubmit.value).toBe(false)
    c.phoneCode.value = '123456'
    expect(c.canSubmit.value).toBe(true)
  })

  it('未勾选确认 → 不调 API', async () => {
    const { c } = setup(fullUser)
    c.open()
    c.password.value = 'secret'
    await c.submit()
    expect(usersControllerDeactivateAccount).not.toHaveBeenCalled()
  })

  it('密码验证提交 → body 只带 password', async () => {
    const { c } = setup(fullUser)
    resolveWith(usersControllerDeactivateAccount, { data: { message: 'ok' } })
    c.open()
    c.password.value = 'secret'
    c.confirmed.value = true
    await c.submit()
    expect(vi.mocked(usersControllerDeactivateAccount)).toHaveBeenCalledWith({
      body: { password: 'secret', phoneCode: undefined, emailCode: undefined, wechatCode: undefined },
    })
  })

  it('手机验证提交 → body 只带 phoneCode', async () => {
    const { c } = setup(fullUser)
    resolveWith(usersControllerDeactivateAccount, { data: { message: 'ok' } })
    c.open('phone')
    c.phoneCode.value = ' 123456 '
    c.confirmed.value = true
    await c.submit()
    expect(vi.mocked(usersControllerDeactivateAccount)).toHaveBeenCalledWith({
      body: { password: undefined, phoneCode: '123456', emailCode: undefined, wechatCode: undefined },
    })
  })

  it('成功 → 冷静期文案 + 1.5s 后 onDeactivated（同 PC）', async () => {
    const { c, onDeactivated } = setup(fullUser)
    resolveWith(usersControllerDeactivateAccount, { data: { message: 'ok' } })
    c.open()
    c.password.value = 'secret'
    c.confirmed.value = true
    await c.submit()
    expect(c.successMsg.value).toContain('7 天内重新登录可自动取消注销')
    expect(onDeactivated).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500)
    expect(onDeactivated).toHaveBeenCalledTimes(1)
  })

  it('注销失败（result.error）→ 错误提示', async () => {
    const { c } = setup(fullUser)
    resolveWith(usersControllerDeactivateAccount, { error: { code: 'BAD_REQUEST', message: '密码错误' } })
    c.open()
    c.password.value = 'wrong'
    c.confirmed.value = true
    await c.submit()
    expect(c.error.value).toBe('密码错误')
    expect(c.successMsg.value).toBe('')
  })

  it('发手机码：无手机号 → 「手机号不存在」；成功 → 启动倒计时', async () => {
    const noPhone = setup({ hasPassword: true, email: 'me@example.com' })
    noPhone.c.open()
    noPhone.c.method.value = 'phone'
    await noPhone.c.sendPhoneCode()
    expect(noPhone.c.error.value).toBe('手机号不存在')
    expect(authControllerSendSmsCode).not.toHaveBeenCalled()

    const { c } = setup(fullUser)
    resolveWith(authControllerSendSmsCode, { data: undefined })
    c.open('phone')
    await c.sendPhoneCode()
    expect(vi.mocked(authControllerSendSmsCode)).toHaveBeenCalledWith({
      body: { phone: '13800138000', scene: 'bind' },
    })
    expect(c.phoneCountdown.value).toBe(60)
  })

  it('发邮箱码：成功调 resend-verification 并启动倒计时', async () => {
    const { c } = setup(fullUser)
    resolveWith(authControllerResendVerification, { data: undefined })
    c.open('email')
    await c.sendEmailCode()
    expect(vi.mocked(authControllerResendVerification)).toHaveBeenCalledWith({ body: { email: 'me@example.com' } })
    expect(c.emailCountdown.value).toBe(60)
  })
})
