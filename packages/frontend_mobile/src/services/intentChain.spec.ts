import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { value: null as Record<string, unknown> | null },
  auth: { value: false },
  free: { value: false },
  fileId: { value: '' },
  push: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: { push: h.push, replace: vi.fn(), currentRoute: { value: { fullPath: '/' } } },
}))
vi.mock('vant', () => ({
  showConfirmDialog: h.confirm,
  showToast: vi.fn(),
}))
vi.mock('@/languages', () => ({ t: (key: string) => key }))
vi.mock('@/composables/useUser', () => ({
  useUser: () => ({ user: h.user, isAuthenticated: h.auth }),
}))
vi.mock('@/composables/useRuntimeConfig', () => ({
  getRuntimeConfigSnapshot: () => ({ freeExportDownloadEnabled: h.free.value }),
}))
vi.mock('@/stores/editor', () => ({
  useEditorStore: () => ({ state: { fileId: h.fileId.value } }),
}))
vi.mock('../api-sdk', () => ({
  memberControllerGetUserProjectPermissions: vi.fn(),
}))

import {
  SAVE_CHAIN,
  SHARE_CHAIN,
  exportChainDef,
  beginIntent,
  resumeIntent,
  clearIntentChain,
  hasIntentChain,
  intentFacts,
  loginPromptRequired,
  cloudSaveConfirmRequired,
  resumeAction,
} from './intentChain'
import type { DownloadFormatPayload } from '@/pages/shell/components/DownloadFormatPopup.vue'

const DAY = 86400000
const VIP_USER = {
  membershipTierLevel: 1,
  membershipExpiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
}
const FREE_USER = { membershipTierLevel: 0, membershipExpiresAt: null }

// 复位收进函数：测试作用域里直接 `trigger.value = null` 会让 TS 控制流把
// 后续读取收窄成 null（?.id 报 never），跨函数赋值不受收窄影响
function resetTriggers() {
  loginPromptRequired.value = null
  cloudSaveConfirmRequired.value = null
  resumeAction.value = null
}

beforeEach(() => {
  vi.clearAllMocks()
  h.confirm.mockResolvedValue(undefined)
  sessionStorage.clear()
  h.user.value = FREE_USER
  h.auth.value = false
  h.free.value = false
  h.fileId.value = ''
  resetTriggers()
})

describe('intentFacts 前置事实', () => {
  it('登录态 / 云端节点 / 导出闸门（会员 ∨ 免费开关）', () => {
    h.auth.value = true
    h.fileId.value = 'n1'
    h.user.value = VIP_USER
    expect(intentFacts()).toEqual({ authenticated: true, hasCloudNode: true, isVip: true })

    h.user.value = FREE_USER
    expect(intentFacts().isVip).toBe(false)
    h.free.value = true
    expect(intentFacts().isVip).toBe(true)
  })
})

describe('beginIntent 挂起与分支', () => {
  it('未登录 → auth-blocked：链持久化 + 登录提示触发器置位', async () => {
    const start = await beginIntent(SAVE_CHAIN)
    expect(start).toBe('auth-blocked')
    expect(hasIntentChain()).toBe(true)
    expect(loginPromptRequired.value?.id).toBe(SAVE_CHAIN.id)
    const raw = JSON.parse(sessionStorage.getItem('cloudcad.pendingIntent')!)
    expect(raw.id).toBe('save-to-cloud')
  })

  it('已登录无云端节点（分享链）→ cloud-save-pending：确认触发器置位', async () => {
    h.auth.value = true
    const start = await beginIntent(SHARE_CHAIN)
    expect(start).toBe('cloud-save-pending')
    expect(cloudSaveConfirmRequired.value?.id).toBe(SHARE_CHAIN.id)
    expect(hasIntentChain()).toBe(true)
  })

  it('已登录非会员导出 → vip-blocked：弹购买引导，取消清链', async () => {
    h.auth.value = true
    h.confirm.mockRejectedValue(new Error('cancel'))
    const start = await beginIntent(exportChainDef({ format: 'pdf' }))
    expect(start).toBe('vip-blocked')
    await vi.waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(hasIntentChain()).toBe(false))
  })

  it('前置已满足 → cancelled 且清链（调用方应先直接执行）', async () => {
    h.auth.value = true
    h.user.value = VIP_USER
    const start = await beginIntent(exportChainDef({ format: 'pdf' }))
    expect(start).toBe('cancelled')
    expect(hasIntentChain()).toBe(false)
  })

  it('新意图覆盖旧链（后发生的用户意图优先）', async () => {
    await beginIntent(SAVE_CHAIN)
    await beginIntent(SHARE_CHAIN)
    const raw = JSON.parse(sessionStorage.getItem('cloudcad.pendingIntent')!)
    expect(raw.id).toBe(SHARE_CHAIN.id)
  })
})

describe('resumeIntent 续跑', () => {
  it('无链幂等：不置任何触发器', () => {
    resumeIntent()
    expect(loginPromptRequired.value).toBeNull()
    expect(cloudSaveConfirmRequired.value).toBeNull()
    expect(resumeAction.value).toBeNull()
  })

  it('保存链：登录后续跑 → 清链 + 分派 save 动作', async () => {
    await beginIntent(SAVE_CHAIN)
    h.auth.value = true
    resumeIntent()
    expect(hasIntentChain()).toBe(false)
    expect(resumeAction.value).toEqual({ type: 'save' })
  })

  it('续跑时前置仍缺（未登录）→ 交回登录提示，链保留', async () => {
    await beginIntent(SAVE_CHAIN)
    resetTriggers()
    resumeIntent()
    expect(loginPromptRequired.value?.id).toBe(SAVE_CHAIN.id)
    expect(hasIntentChain()).toBe(true)
  })

  it('分享链续跑仍无云端节点 → 交回「先保存到云端」确认', async () => {
    h.auth.value = true
    await beginIntent(SHARE_CHAIN)
    resetTriggers()
    resumeIntent()
    expect(cloudSaveConfirmRequired.value?.id).toBe(SHARE_CHAIN.id)
    expect(hasIntentChain()).toBe(true)
  })

  it('导出链：购买引导确认跳会员中心，充值翻转闸门后续跑重放原始导出', async () => {
    h.auth.value = true
    const payload: DownloadFormatPayload = {
      format: 'pdf',
      pdfOptions: { width: 'A4', height: 'A4', colorPolicy: 'mono' },
    }
    await beginIntent(exportChainDef(payload))
    await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith('/shell/member'))
    expect(hasIntentChain()).toBe(true)
    // 充值成功：syncUserMembership 刷新用户态 → 闸门翻转
    h.user.value = VIP_USER
    resumeIntent()
    expect(hasIntentChain()).toBe(false)
    expect(resumeAction.value).toEqual({ type: 'export', payload })
  })

  it('导出链：管理员开放免费导出（闸门翻转）同样续跑', async () => {
    h.auth.value = true
    const payload: DownloadFormatPayload = { format: 'dwg' }
    await beginIntent(exportChainDef(payload))
    await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith('/shell/member'))
    h.free.value = true
    resumeIntent()
    expect(hasIntentChain()).toBe(false)
    expect(resumeAction.value).toEqual({ type: 'export', payload })
  })
})

describe('clearIntentChain', () => {
  it('清链后无挂起意图', async () => {
    await beginIntent(SAVE_CHAIN)
    expect(hasIntentChain()).toBe(true)
    clearIntentChain()
    expect(hasIntentChain()).toBe(false)
  })
})
