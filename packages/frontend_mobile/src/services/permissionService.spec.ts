import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}))
vi.mock('@/stores/editor', () => ({ useEditorStore: vi.fn() }))
vi.mock('../composables/useUser', () => ({ useUser: vi.fn() }))
vi.mock('vant', () => ({ showToast: vi.fn() }))
vi.mock('@/languages', () => ({
  t: (key: string) => key,
}))

import { showToast } from 'vant'
import { canExportDownloadGate, loadProjectPermissions, invalidateProjectPermissions } from './permissionService'
import { memberControllerGetUserProjectPermissions } from '../api-sdk'

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

describe('loadProjectPermissions 项目权限加载（TTL 缓存 + 失败回退 + 失效）', () => {
  const api = memberControllerGetUserProjectPermissions as unknown as ReturnType<typeof vi.fn>
  const T0 = 1_000_000

  beforeEach(() => {
    vi.clearAllMocks()
    invalidateProjectPermissions()
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('成功：返回权限并写缓存；TTL 内二次调用命中缓存不再请求', async () => {
    api.mockResolvedValue({ error: null, data: { permissions: ['CAD_SAVE'] } })
    expect(await loadProjectPermissions('p1')).toEqual(['CAD_SAVE'])
    expect(await loadProjectPermissions('p1')).toEqual(['CAD_SAVE'])
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('缓存过期后重新拉取；拉取失败回退既有（过期）缓存，保留旧权限', async () => {
    api.mockResolvedValueOnce({ error: null, data: { permissions: ['CAD_SAVE'] } })
    await loadProjectPermissions('p1')
    vi.setSystemTime(T0 + 6 * 60 * 1000) // 越过 5min TTL
    api.mockRejectedValueOnce(new Error('network'))
    expect(await loadProjectPermissions('p1')).toEqual(['CAD_SAVE'])
  })

  it('无缓存且拉取失败：返回空数组', async () => {
    api.mockRejectedValue(new Error('network'))
    expect(await loadProjectPermissions('p2')).toEqual([])
  })

  it('invalidateProjectPermissions 失效后重新拉取', async () => {
    api.mockResolvedValueOnce({ error: null, data: { permissions: ['CAD_SAVE'] } })
    await loadProjectPermissions('p1')
    invalidateProjectPermissions('p1')
    api.mockResolvedValueOnce({ error: null, data: { permissions: ['FILE_DOWNLOAD'] } })
    expect(await loadProjectPermissions('p1')).toEqual(['FILE_DOWNLOAD'])
    expect(api).toHaveBeenCalledTimes(2)
  })
})
