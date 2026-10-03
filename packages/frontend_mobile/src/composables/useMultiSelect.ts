/**
 * 长按多选状态机（UnifiedFileList 各列表视图共用：个人空间/项目/回收站）。
 *
 * - 长按阈值到达 → 进入多选并选中被按项（手势定时器绑 touch 事件，留在 SFC；状态机在此）；
 * - 多选态点按切换选中；选中清空自动退出多选；
 * - 导航（面包屑变化）时清除选中：跨文件夹后 selected 是旧 id，操作项全部失效且计数残留，
 *   会卡在「已选 N 项」却点不动的状态。下拉刷新不改面包屑 → 不触发，保留选中。
 */
import { ref, computed, watch } from 'vue'

export interface MultiSelectItem {
  id: string
}
export interface BreadcrumbRef {
  id: string
  name: string
}

export function useMultiSelect(getBreadcrumbs: () => BreadcrumbRef[]) {
  const isSelectionMode = ref(false)
  const selected = ref<Set<string>>(new Set())

  /** 长按阈值到达：进入多选并选中被按项 */
  function enterWith(item: MultiSelectItem) {
    isSelectionMode.value = true
    selected.value = new Set([item.id])
  }

  /** 多选态点按：切换选中；清空后自动退出多选 */
  function toggleSelect(item: MultiSelectItem) {
    const s = new Set(selected.value)
    if (s.has(item.id)) s.delete(item.id)
    else s.add(item.id)
    selected.value = s
    if (s.size === 0) isSelectionMode.value = false
  }

  /** 全选（A-19：作用于当前已加载页，与 PC「全选当前视图」语义一致） */
  function selectAll(ids: string[]) {
    selected.value = new Set(ids)
  }

  /** 清空选中（退出多选） */
  function clearSelection() {
    selected.value = new Set()
    isSelectionMode.value = false
  }

  /** 退出多选并清空选中 */
  function exitSelectionMode() {
    isSelectionMode.value = false
    selected.value = new Set()
  }

  // 导航（面包屑变化）时清除选中
  const breadcrumbKey = computed(() => getBreadcrumbs().map((b) => b.id).join('›'))
  watch(breadcrumbKey, (val, old) => {
    if (old !== undefined && val !== old) exitSelectionMode()
  })

  return { isSelectionMode, selected, enterWith, toggleSelect, selectAll, clearSelection, exitSelectionMode }
}
