/**
 * 列表视图模式（网格 / 清单）持久化（A-16）
 *
 * PC 端网格/列表偏好按用户持久化，移动端此前每次进页重置为网格。
 * 按域隔离存储：项目详情与个人空间各自记住自己的模式。
 */
import { ref, watch, type Ref } from 'vue'

export type ViewMode = 'grid' | 'list'

const isViewMode = (v: string | null): v is ViewMode => v === 'grid' || v === 'list'

export function useViewMode(scope: string): Ref<ViewMode> {
  const storageKey = `fs_view_mode_${scope}`
  const stored = localStorage.getItem(storageKey)
  const mode = ref<ViewMode>(isViewMode(stored) ? stored : 'grid')

  watch(mode, (val) => {
    localStorage.setItem(storageKey, val)
  })

  return mode
}
