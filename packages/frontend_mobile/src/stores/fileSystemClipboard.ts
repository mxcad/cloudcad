/**
 * 文件系统剪贴板（对齐 PC fileSystemClipboardStore）。
 *
 * 多选 → 复制/剪切 写入剪贴板（跨导航持久），到目标文件夹点「粘贴」应用：
 *   cut → batch-move（成功后清空剪贴板）；copy → batch-copy（保留剪贴板，可重复粘贴）。
 *
 * sourceRootId/sourceRootKind 记录源根（个人空间或某项目），用于粘贴时判定跨根剪切
 * 并触发二次确认（文件将从源移走）。
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export type ClipboardMode = 'copy' | 'cut'
export type ClipboardRootKind = 'personalSpace' | 'project'

export const useFileSystemClipboard = defineStore('fileSystemClipboard', () => {
  const itemIds = ref<string[]>([])
  const mode = ref<ClipboardMode | null>(null)
  const sourceRootId = ref('')
  const sourceRootKind = ref<ClipboardRootKind>('project')

  const hasItems = computed(() => itemIds.value.length > 0 && mode.value !== null)

  function setClipboard(ids: string[], m: ClipboardMode, rootId: string, kind: ClipboardRootKind) {
    itemIds.value = ids
    mode.value = m
    sourceRootId.value = rootId
    sourceRootKind.value = kind
  }

  function clearClipboard() {
    itemIds.value = []
    mode.value = null
    sourceRootId.value = ''
    sourceRootKind.value = 'project'
  }

  return { itemIds, mode, sourceRootId, sourceRootKind, hasItems, setClipboard, clearClipboard }
})
