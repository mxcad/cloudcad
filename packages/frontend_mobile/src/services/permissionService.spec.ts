import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}))
vi.mock('../composables/useEditorState', () => ({ useEditorState: vi.fn() }))
vi.mock('../composables/useUser', () => ({ useUser: vi.fn() }))
vi.mock('vant', () => ({ showToast: vi.fn() }))
vi.mock('@/languages', () => ({
  t: (key: string) => key,
}))

import { showToast } from 'vant'
import { canExportDownloadGate } from './permissionService'

const DAY = 86400000

describe('canExportDownloadGate 导出下载会员预检', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有效 VIP（未到期）放行，不弹提示', () => {
    const user = { membershipTierLevel: 1, membershipExpiresAt: new Date(Date.now() + 30 * DAY).toISOString() }
    expect(canExportDownloadGate(user, false)).toBe(true)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('回归：已到期 VIP 必须拦截（收敛前只看 tierLevel 漏判 expiresAt，过期会员被放行）', () => {
    const user = { membershipTierLevel: 1, membershipExpiresAt: new Date(Date.now() - DAY).toISOString() }
    expect(canExportDownloadGate(user, false)).toBe(false)
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('永久会员（expiresAt 为 null）放行', () => {
    const user = { membershipTierLevel: 2, membershipExpiresAt: null }
    expect(canExportDownloadGate(user, false)).toBe(true)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('非会员（tierLevel = 0）拦截并提示', () => {
    expect(canExportDownloadGate({ membershipTierLevel: 0, membershipExpiresAt: null }, false)).toBe(false)
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('运行时开关开放时非会员也放行', () => {
    expect(canExportDownloadGate({ membershipTierLevel: 0, membershipExpiresAt: null }, true)).toBe(true)
    expect(showToast).not.toHaveBeenCalled()
  })

  it('user 缺失 / tierLevel 非数字 → 按非会员拦截', () => {
    expect(canExportDownloadGate(null, false)).toBe(false)
    expect(canExportDownloadGate(undefined, false)).toBe(false)
    expect(canExportDownloadGate({ membershipExpiresAt: new Date(Date.now() + DAY).toISOString() }, false)).toBe(false)
    expect(showToast).toHaveBeenCalledTimes(3)
  })
})
