/**
 * 剪贴板写入（复制/剪切）+ 源项目 6 域出向策略快照（跨项目粘贴预判的前置数据）。
 *
 * 多选栏与单条目菜单的「复制/剪切」共用此出口：先同步写入全局剪贴板（粘贴条立即可见），
 * 源为项目时异步快照该项目的出向策略（transferOutTo*）——useClipboardPaste 粘贴预判用它
 * 评估「源项目是否禁止本次跨项目转移」，对齐 PC clipboardHandleCopy/Cut 的
 * setClipboard + snapshotSourceTransfer 语义。源为个人空间无出向字段，恒允许（跳过快照）。
 * 快照失败为 null → 粘贴预判保守拒绝，后端仍是最终裁决（权限/配额/策略）。
 */
import { useFileSystemClipboard, type ClipboardMode, type ClipboardRootKind } from '@/stores/fileSystemClipboard'
import { fetchProjectTransferSettings } from '@/utils/transferPolicy'

export function useClipboardWrite() {
  const clipboard = useFileSystemClipboard()
  // 代际计数防竞态：快速连切源项目复制/剪切时，只有最近一次写入的策略快照生效，
  // 避免先切项目 A 的在途 fetch 晚于项目 B 的写入返回、把 A 的出向策略盖到 B 的剪贴板上
  // （对齐 useClipboardPaste 的 gen 守卫）。
  let gen = 0

  function write(ids: string[], mode: ClipboardMode, rootId: string, kind: ClipboardRootKind, folderId = '') {
    clipboard.setClipboard(ids, mode, rootId, kind, folderId)
    if (kind === 'project') {
      const myGen = ++gen
      void fetchProjectTransferSettings(rootId).then((s) => {
        if (myGen !== gen) return
        clipboard.setClipboardSource(s)
      })
    }
  }

  return { write, clipboard }
}
