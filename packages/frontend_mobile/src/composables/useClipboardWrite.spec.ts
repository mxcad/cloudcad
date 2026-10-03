/**
 * useClipboardWrite：复制/剪切写入剪贴板 + 源项目 6 域出向策略快照。
 *
 * 回归点：
 * - 源为项目 → 写入后异步快照该项目出向策略（setClipboardSource），跨项目粘贴预判依赖它；
 * - 源为个人空间 → 无出向字段，跳过快照（不发起查询）；
 * - 快照失败（null）不阻断写入（剪贴板仍可用，粘贴预判保守拒绝，后端兜底）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useClipboardWrite } from './useClipboardWrite'
import { useFileSystemClipboard } from '@/stores/fileSystemClipboard'

vi.mock('@/utils/transferPolicy', () => ({
  fetchProjectTransferSettings: vi.fn(),
}))

import { fetchProjectTransferSettings } from '@/utils/transferPolicy'

const mockedFetch = fetchProjectTransferSettings as ReturnType<typeof vi.fn>

describe('useClipboardWrite', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('项目源复制：写入剪贴板 + 异步快照出向策略', async () => {
    const settings = { transferOutToProject: 'ALL', transferOutToPersonalSpace: null }
    mockedFetch.mockResolvedValue(settings)

    const { write } = useClipboardWrite()
    const clip = useFileSystemClipboard()
    write(['n1', 'n2'], 'copy', 'prj-1', 'project')

    // 同步写入立即可见
    expect(clip.itemIds).toStrictEqual(['n1', 'n2'])
    expect(clip.mode).toBe('copy')
    expect(clip.sourceRootId).toBe('prj-1')
    expect(clip.sourceRootKind).toBe('project')
    // 快照先为 null（异步）
    expect(clip.sourceTransferSettings).toBeNull()

    await vi.waitFor(() => expect(clip.sourceTransferSettings).toStrictEqual(settings))
    expect(mockedFetch).toHaveBeenCalledWith('prj-1')
  })

  it('个人空间源剪切：写入剪贴板，跳过快照（不发起查询）', async () => {
    const { write } = useClipboardWrite()
    const clip = useFileSystemClipboard()
    write(['n1'], 'cut', 'personal-1', 'personalSpace')

    expect(clip.mode).toBe('cut')
    expect(clip.sourceRootKind).toBe('personalSpace')
    // 等一拍确认没有发起查询
    await new Promise((r) => setTimeout(r, 0))
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(clip.sourceTransferSettings).toBeNull()
  })

  it('快照失败（null）不阻断写入：剪贴板仍可用', async () => {
    mockedFetch.mockResolvedValue(null)

    const { write } = useClipboardWrite()
    const clip = useFileSystemClipboard()
    write(['n1'], 'cut', 'prj-1', 'project')

    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(clip.itemIds).toStrictEqual(['n1'])
    expect(clip.hasItems).toBe(true)
    expect(clip.sourceTransferSettings).toBeNull()
  })

  it('新写入重置策略快照：异步快照返回前保持 null', () => {
    const { write } = useClipboardWrite()
    const clip = useFileSystemClipboard()
    clip.setClipboardSource({ transferOutToProject: 'ALL' })
    expect(clip.sourceTransferSettings).not.toBeNull()

    // 再次写入（另一项目）→ 快照立即重置为 null
    write(['n9'], 'copy', 'prj-2', 'project')
    expect(clip.sourceTransferSettings).toBeNull()
    expect(clip.sourceRootId).toBe('prj-2')
  })

  it('快速连切源项目：晚返回的旧项目快照不覆盖新项目（防竞态）', async () => {
    let resolveA: (s: unknown) => void
    let resolveB: (s: unknown) => void
    const promiseA = new Promise((r) => (resolveA = r))
    const promiseB = new Promise((r) => (resolveB = r))
    mockedFetch
      .mockImplementationOnce(() => promiseA)
      .mockImplementationOnce(() => promiseB)

    const { write } = useClipboardWrite()
    const clip = useFileSystemClipboard()

    // 先切项目 A（fetch A 在途），再切项目 B（fetch B 在途）
    write(['a1'], 'copy', 'prj-A', 'project')
    write(['b1'], 'copy', 'prj-B', 'project')

    // B 的 fetch 先返回 → 生效
    resolveB!({ transferOutToProject: 'ALL' })
    await vi.waitFor(() =>
      expect(clip.sourceTransferSettings).toStrictEqual({ transferOutToProject: 'ALL' }),
    )

    // A 的 fetch 后返回（晚于 B）：无 gen 守卫会覆盖成 A 的策略；守卫应丢弃
    resolveA!({ transferOutToProject: 'NONE' })
    await new Promise((r) => setTimeout(r, 0))
    expect(clip.sourceTransferSettings).toStrictEqual({ transferOutToProject: 'ALL' })
    expect(clip.sourceRootId).toBe('prj-B')
  })
})
