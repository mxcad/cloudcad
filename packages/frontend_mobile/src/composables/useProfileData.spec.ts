import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProfileData } from './useProfileData'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  usersControllerGetDashboardStats: vi.fn(),
  usersControllerGetProfile: vi.fn(),
  usersControllerUpdateProfile: vi.fn(),
}))

import { usersControllerGetDashboardStats, usersControllerGetProfile, usersControllerUpdateProfile } from '@cloudcad/api-sdk/sdk.gen'

// vi.mock 后 SDK 函数丢失 mock 类型，统一用 vi.mocked 恢复（同 useLibrary.spec 写法）
function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

describe('useProfileData 资料读取与展示派生', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadProfile 成功解包资料，失败置错误态而非抛错', async () => {
    resolveWith(usersControllerGetProfile, { data: { username: 'alice' } })
    const d = useProfileData()
    await d.loadProfile()
    expect(d.profile.value.username).toBe('alice')
    expect(d.loading.value).toBe(false)
    expect(d.error.value).toBe('')

    resolveWith(usersControllerGetProfile, { error: { message: 'boom' } })
    await d.loadProfile()
    expect(d.error.value).toBeTruthy()
    expect(d.loading.value).toBe(false)
  })

  it('storagePercent 取后端 usagePercent，并把越界值夹在 0-100', () => {
    const d = useProfileData()

    d.storageInfo.value = { used: 1, total: 100, remaining: 99, usagePercent: 42 }
    expect(d.storagePercent.value).toBe(42)

    d.storageInfo.value = { used: 0, total: 100, remaining: 100, usagePercent: -5 }
    expect(d.storagePercent.value).toBe(0)

    d.storageInfo.value = { used: 250, total: 100, remaining: 0, usagePercent: 250 }
    expect(d.storagePercent.value).toBe(100)

    // 无配额数据：整块隐藏，不显示 0% 假进度
    d.storageInfo.value = null
    expect(d.storagePercent.value).toBeNull()
  })

  it('storageColor 按阈值切换（>90 红 / >70 橙 / 否则主题色）', () => {
    const d = useProfileData()
    d.storageInfo.value = { used: 0, total: 100, remaining: 100, usagePercent: 50 }
    expect(d.storageColor.value).toContain('accent')
    d.storageInfo.value = { used: 0, total: 100, remaining: 100, usagePercent: 75 }
    expect(d.storageColor.value).toContain('warning')
    d.storageInfo.value = { used: 0, total: 100, remaining: 100, usagePercent: 95 }
    expect(d.storageColor.value).toContain('error')
  })

  it('loadStats 失败静默降级为 null，不把整页打成错误态', async () => {
    resolveWith(usersControllerGetDashboardStats, { error: { message: 'nope' } })
    const d = useProfileData()
    await d.loadStats()
    expect(d.storageInfo.value).toBeNull()
    expect(d.error.value).toBe('')
  })

  it('总容量为 0 的配额不显示（storageInfo 保持 null）', async () => {
    resolveWith(usersControllerGetDashboardStats, { data: { storage: { total: 0 } } })
    const d = useProfileData()
    await d.loadStats()
    expect(d.storageInfo.value).toBeNull()
  })

  it('会员到期预警：仅剩 ≤7 天才预警，永久会员与已过期不算', () => {
    const day = 86400000
    const soon = new Date(Date.now() + 3 * day).toISOString()
    const far = new Date(Date.now() + 400 * day).toISOString()
    const past = new Date(Date.now() - day).toISOString()

    for (const [expiresAt, want] of [
      [soon, true],
      [far, false],
      // null = 永久会员，不计到期
      [null, false],
      [past, false],
    ] as const) {
      const d = useProfileData()
      d.profile.value = { isVip: true, membershipExpiresAt: expiresAt }
      expect(d.vipExpiringSoon.value).toBe(want)
    }

    // 非会员永不预警
    const free = useProfileData()
    free.profile.value = { isVip: false, membershipExpiresAt: soon }
    expect(free.vipExpiringSoon.value).toBe(false)

    // 时间非法 → 不预警、剩余天数 null
    const bad = useProfileData()
    bad.profile.value = { isVip: true, membershipExpiresAt: 'not-a-date' }
    expect(bad.vipExpiringSoon.value).toBe(false)
    expect(bad.vipDaysRemaining.value).toBeNull()
  })

  it('已验证标记：邮箱只看是否绑定，手机号还要求 phoneVerified', () => {
    const d = useProfileData()
    d.profile.value = { email: 'me@x.com', phone: '13800138000' }

    const email = d.accountGroup.value.find((e) => e.action === 'edit-email')!
    const phone = d.accountGroup.value.find((e) => e.action === 'edit-phone')!
    expect(email.verified).toBe(true)
    // 后台代绑/未验证的手机号不带标记
    expect(phone.verified).toBe(false)

    d.profile.value.phoneVerified = true
    expect(d.accountGroup.value.find((e) => e.action === 'edit-phone')!.verified).toBe(true)
  })

  it('账号信息行未绑定显示占位符，手机号脱敏展示', () => {
    const d = useProfileData()
    d.profile.value = { username: 'alice' }
    expect(d.accountGroup.value.find((e) => e.action === 'edit-nickname')!.value).toBe('—')
    expect(d.accountGroup.value.find((e) => e.action === 'edit-email')!.value).toBe('—')
    expect(d.accountGroup.value.find((e) => e.action === 'edit-phone')!.value).toBe('—')

    d.profile.value.phone = '13800138000'
    expect(d.accountGroup.value.find((e) => e.action === 'edit-phone')!.value).toBe('138****8000')
  })

  it('openTextEdit 用当前值回填，canSubmitText 按字段各自校验', () => {
    const d = useProfileData()
    d.profile.value = { username: 'alice', nickname: 'A' }

    d.openTextEdit('username')
    expect(d.editField.value).toBe('username')
    expect(d.editValue.value).toBe('alice')
    expect(d.textMaxLength.value).toBe(20)
    d.editValue.value = 'ab'
    expect(d.canSubmitText.value).toBe(false)
    d.editValue.value = 'bob'
    expect(d.canSubmitText.value).toBe(true)

    d.openTextEdit('nickname')
    expect(d.textMaxLength.value).toBe(50)
    d.editValue.value = 'n'
    expect(d.canSubmitText.value).toBe(true)
    d.editValue.value = '   '
    expect(d.canSubmitText.value).toBe(false)
  })

  it('保存用户名/昵称：调 PATCH 一次、成功提示后回读资料', async () => {
    resolveWith(usersControllerUpdateProfile, { data: {} })
    const d = useProfileData()
    d.profile.value = { username: 'alice' }

    d.openTextEdit('nickname')
    d.editValue.value = '   Ann   '
    await d.onTextConfirm()

    expect(usersControllerUpdateProfile).toHaveBeenCalledTimes(1)
    expect(usersControllerUpdateProfile).toHaveBeenCalledWith({ body: { nickname: 'Ann' } })
    expect(d.showTextDialog.value).toBe(false)
    // 成功后回读资料
    expect(usersControllerGetProfile).toHaveBeenCalledTimes(1)
  })

  it('提交中不重复发请求（savingText 防抖）', async () => {
    let release!: () => void
    vi.mocked(usersControllerUpdateProfile).mockReturnValue(
      new Promise<unknown>((resolve) => {
        release = () => resolve({ data: {} })
      }) as never,
    )
    const d = useProfileData()
    d.profile.value = { nickname: 'x' }
    d.openTextEdit('nickname')
    d.editValue.value = 'y'

    const first = d.onTextConfirm()
    expect(d.savingText.value).toBe(true)
    await d.onTextConfirm()
    expect(usersControllerUpdateProfile).toHaveBeenCalledTimes(1)

    release()
    await first
    expect(d.savingText.value).toBe(false)
  })
})
