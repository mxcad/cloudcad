/**
 * 回归测试：单条目剪贴板写入（A-29a）
 *
 * 单条目 ActionSheet 的「复制到剪贴板/剪切」与多选栏的复制/剪切共用同一全局剪贴板：
 * 单条目写入必须是 `setClipboard([id], mode, rootId, kind)`——单元素数组 + 正确的
 * mode（剪切→cut / 复制→copy）+ 源根（个人空间/项目）。写错 mode 会让粘贴时
 * copy 变 move（文件从源被移走）；写错源根会让跨根剪切的二次确认判定失效。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileSystemClipboard } from './fileSystemClipboard'
import type { TransferSettings } from '@/utils/transferPolicy'

describe('useFileSystemClipboard 单条目写入（A-29a）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('剪切单条目：mode=cut、源根=项目，粘贴条可见', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['node-1'], 'cut', 'prj-1', 'project')

    expect(clip.itemIds).toStrictEqual(['node-1'])
    expect(clip.mode).toBe('cut')
    expect(clip.sourceRootId).toBe('prj-1')
    expect(clip.sourceRootKind).toBe('project')
    expect(clip.hasItems).toBe(true)
  })

  it('复制单条目：mode=copy、源根=个人空间', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['node-2'], 'copy', 'personal-1', 'personalSpace')

    expect(clip.mode).toBe('copy')
    expect(clip.sourceRootId).toBe('personal-1')
    expect(clip.sourceRootKind).toBe('personalSpace')
    expect(clip.hasItems).toBe(true)
  })

  it('后写入覆盖先写入（单条目覆盖此前的多选）', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['a', 'b', 'c'], 'copy', 'prj-1', 'project')
    clip.setClipboard(['node-9'], 'cut', 'personal-1', 'personalSpace')

    expect(clip.itemIds).toStrictEqual(['node-9'])
    expect(clip.mode).toBe('cut')
    expect(clip.sourceRootKind).toBe('personalSpace')
  })

  it('清空后粘贴条不可见', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['node-1'], 'cut', 'prj-1', 'project')
    clip.clearClipboard()

    expect(clip.itemIds).toStrictEqual([])
    expect(clip.mode).toBeNull()
    expect(clip.sourceRootId).toBe('')
    expect(clip.hasItems).toBe(false)
  })
})

describe('useFileSystemClipboard 源项目策略快照（跨项目粘贴预判）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const settings: TransferSettings = { transferOutToProject: 'ALL', transferOutToPersonalSpace: null }

  it('setClipboardSource 补写快照，粘贴预判可读', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-1', 'project')
    expect(clip.sourceTransferSettings).toBeNull()

    clip.setClipboardSource(settings)
    expect(clip.sourceTransferSettings).toStrictEqual(settings)
  })

  it('新写入重置快照为 null（异步快照返回前不残留旧项目的策略）', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-1', 'project')
    clip.setClipboardSource(settings)

    clip.setClipboard(['n2'], 'copy', 'prj-2', 'project')
    expect(clip.sourceTransferSettings).toBeNull()
  })

  it('清空剪贴板同时清空策略快照', () => {
    const clip = useFileSystemClipboard()
    clip.setClipboard(['n1'], 'cut', 'prj-1', 'project')
    clip.setClipboardSource(settings)
    clip.clearClipboard()

    expect(clip.sourceTransferSettings).toBeNull()
  })
})
