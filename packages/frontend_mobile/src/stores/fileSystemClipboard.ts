/**
 * 文件系统剪贴板（对齐 PC fileSystemClipboardStore）。
 *
 * 多选 → 复制/剪切 写入剪贴板（跨导航持久），到目标文件夹点「粘贴」应用：
 *   cut → batch-move（成功后清空剪贴板）；copy → batch-copy（保留剪贴板，可重复粘贴）。
 *
 * sourceRootId/sourceRootKind 记录源根（个人空间或某项目），用于粘贴时判定跨根剪切
 * 并触发二次确认（文件将从源移走）。
 *
 * sourceTransferSettings 是源项目 6 域出向策略快照（源为项目时复制/剪切时异步补写；
 * 非项目根/查询失败为 null）。粘贴预判（useClipboardPaste）用它评估跨项目转移是否被
 * 源项目策略禁止——对齐 PC 的 sourceTransferSettings 快照语义；后端仍是最终裁决。
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { TransferSettings } from '@/utils/transferPolicy'

export type ClipboardMode = 'copy' | 'cut'
export type ClipboardRootKind = 'personalSpace' | 'project'

export const useFileSystemClipboard = defineStore('fileSystemClipboard', () => {
  const itemIds = ref<string[]>([])
  const mode = ref<ClipboardMode | null>(null)
  const sourceRootId = ref('')
  const sourceRootKind = ref<ClipboardRootKind>('project')
  // 源文件夹 id（剪切/复制时所在文件夹）：剪切+粘贴撤销据此把节点移回源文件夹
  const sourceFolderId = ref('')
  // 源项目 6 域出向策略快照（源为项目时复制/剪切后异步补写；null=非项目源或查询失败）
  const sourceTransferSettings = ref<TransferSettings | null>(null)

  const hasItems = computed(() => itemIds.value.length > 0 && mode.value !== null)

  function setClipboard(ids: string[], m: ClipboardMode, rootId: string, kind: ClipboardRootKind, folderId = '') {
    itemIds.value = ids
    mode.value = m
    sourceRootId.value = rootId
    sourceRootKind.value = kind
    sourceFolderId.value = folderId
    // 新写入重置策略快照：异步快照（setClipboardSource）返回前保持 null
    sourceTransferSettings.value = null
  }

  /** 异步补写源域策略快照（复制/剪切先入剪贴板、fetchProjectTransferSettings 返回后调用） */
  function setClipboardSource(settings: TransferSettings | null) {
    sourceTransferSettings.value = settings
  }

  function clearClipboard() {
    itemIds.value = []
    mode.value = null
    sourceRootId.value = ''
    sourceRootKind.value = 'project'
    sourceFolderId.value = ''
    sourceTransferSettings.value = null
  }

  return {
    itemIds,
    mode,
    sourceRootId,
    sourceRootKind,
    sourceFolderId,
    sourceTransferSettings,
    hasItems,
    setClipboard,
    setClipboardSource,
    clearClipboard,
  }
})
