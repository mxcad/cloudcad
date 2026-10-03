/**
 * useClipboardPaste：剪贴板粘贴预判（对齐 PC canPaste / pasteDisabledReason）。
 *
 * 回归点（跨项目复制/剪切/粘贴策略门控）：
 * - 无剪贴板 / 同根 → 乐观放行（canPaste=true，无原因）；
 * - 源项目出向策略禁止本次操作 → 禁用 + 源策略原因；
 * - 目标项目入向策略禁止 → 禁用 + 目标策略原因；
 * - 目标为项目且跨根 → 拉取目标入向策略（fetchProjectTransferSettings）；
 * - 源项目策略快照缺失（null）→ 保守拒绝（对齐 PC 悲观门控）；
 * - 全允许 → 放行。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useClipboardPaste } from './useClipboardPaste'
import { useFileSystemClipboard } from '@/stores/fileSystemClipboard'
import type { TransferDomain } from '@/utils/transferPolicy'

// 保留真实 precheckTransfer（6 域矩阵），仅 mock 目标策略查询（避免真实 API 调用）
vi.mock('@/utils/transferPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/transferPolicy')>()
  return { ...actual, fetchProjectTransferSettings: vi.fn() }
})
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))

import { fetchProjectTransferSettings } from '@/utils/transferPolicy'

const mockedFetch = fetchProjectTransferSettings as ReturnType<typeof vi.fn>

async function flush() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

/** 在 effectScope 内创建判定（避免 onScopeDispose 无作用域告警，并便于清理） */
function createPolicy(getTarget: () => { id: string; domain: TransferDomain }) {
  const scope = effectScope()
  let policy!: ReturnType<typeof useClipboardPaste>
  scope.run(() => {
    policy = useClipboardPaste(getTarget)
  })
  return { policy, stop: () => scope.stop() }
}

describe('useClipboardPaste 跨项目粘贴预判', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('无剪贴板 → 乐观放行', async () => {
    const clip = useFileSystemClipboard()
    expect(clip.hasItems).toBe(false)
    const { policy } = createPolicy(() => ({ id: 'prj-1', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(true)
    expect(policy.pasteDisabledReason.value).toBe('')
  })

  it('同根（源=目标项目）→ 放行，不查目标策略', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-1', 'project')
    const { policy } = createPolicy(() => ({ id: 'prj-1', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(true)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('项目→项目 剪切：源出向 NONE → 禁用 + 源策略原因', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-src', 'project')
    clip.setClipboardSource({ transferOutToProject: 'NONE', transferInFromProject: 'ALL' })
    mockedFetch.mockResolvedValue({ transferInFromProject: 'ALL' })

    const { policy } = createPolicy(() => ({ id: 'prj-tgt', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(false)
    expect(policy.pasteDisabledReason.value).toBe('源项目跨项目策略不允许移动，已禁止')
    // 跨根且目标为项目 → 拉取了目标入向策略
    expect(mockedFetch).toHaveBeenCalledWith('prj-tgt')
  })

  it('个人空间→项目 复制：目标入向 NONE → 禁用 + 目标策略原因', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'copy', 'personal-1', 'personalSpace')
    mockedFetch.mockResolvedValue({ transferInFromPersonalSpace: 'NONE' })

    const { policy } = createPolicy(() => ({ id: 'prj-tgt', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(false)
    expect(policy.pasteDisabledReason.value).toBe('当前项目跨项目策略不允许复制，已禁止')
  })

  it('项目→个人空间 复制：源出向 ALL → 放行（目标个人空间无入向字段，不查）', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'copy', 'prj-src', 'project')
    clip.setClipboardSource({ transferOutToPersonalSpace: 'ALL' })

    const { policy } = createPolicy(() => ({ id: 'personal-1', domain: 'personalSpace' }))
    await flush()
    expect(policy.canPaste.value).toBe(true)
    expect(policy.pasteDisabledReason.value).toBe('')
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('源项目策略快照缺失（null）→ 保守拒绝', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-src', 'project')
    // sourceTransferSettings 保持 null（快照未就绪）
    mockedFetch.mockResolvedValue({ transferInFromProject: 'ALL' })

    const { policy } = createPolicy(() => ({ id: 'prj-tgt', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(false)
    expect(policy.pasteDisabledReason.value).toBe('源项目未开放跨项目转移')
  })

  it('目标策略查询失败（null）→ 保守拒绝（目标项目）', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'copy', 'personal-1', 'personalSpace')
    mockedFetch.mockResolvedValue(null)

    const { policy } = createPolicy(() => ({ id: 'prj-tgt', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(false)
    expect(policy.pasteDisabledReason.value).toBe('当前项目未开放跨项目转移')
  })

  it('剪贴板清空后判定挂起 → 恢复放行', async () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-src', 'project')
    clip.setClipboardSource({ transferOutToProject: 'NONE' })
    mockedFetch.mockResolvedValue({ transferInFromProject: 'ALL' })

    const { policy, stop } = createPolicy(() => ({ id: 'prj-tgt', domain: 'project' }))
    await flush()
    expect(policy.canPaste.value).toBe(false)

    clip.clearClipboard()
    await flush()
    expect(policy.canPaste.value).toBe(true)
    expect(policy.pasteDisabledReason.value).toBe('')
    stop()
  })
})
