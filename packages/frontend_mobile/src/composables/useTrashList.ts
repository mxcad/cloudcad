/**
 * 回收站数据层（薄 composable，复用 UnifiedFileList 展示组件）
 *
 * 双 scope：
 *   projects = 全局回收站（可访问项目内的已删条目 + 已删项目根，不含个人空间文件）
 *   personal = 个人空间回收站（projectId=personalSpaceId，按子树取数）
 *
 * 后端接口全部现成，零后端改动：
 *   GET /trash（+projectId）· POST /trash/restore · DELETE /trash/items
 *   DELETE /trash · DELETE /projects/:projectId/trash · POST /nodes/:id/restore
 *   DELETE /nodes/:id?permanently=true
 *
 * 每个动作成功后 toast + 回第 1 页重载；失败时 403 走权限文案，其余走通用失败。
 */
import { ref, computed, type Ref } from 'vue'
import {
  trashControllerGetTrash,
  trashControllerRestoreTrashItems,
  trashControllerPermanentlyDeleteTrashItems,
  trashControllerClearTrash,
  trashControllerClearProjectTrash,
  nodeControllerRestoreNode,
  nodeControllerDeleteNode,
} from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto, TrashListResponseDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { showSuccessToast, showFailToast } from 'vant'
import { errorKind, errMsg } from '@/utils/apiError'

export type TrashScope = 'projects' | 'personal'
export type TrashSortField = 'name' | 'createdAt' | 'updatedAt' | 'size'
export type TrashSortOrder = 'asc' | 'desc'

const PAGE_SIZE = 30

export function useTrashList(personalSpaceId: Ref<string | null | undefined>) {
  const scope = ref<TrashScope>('projects')
  const nodes = ref<FileSystemNodeDto[]>([])
  const loading = ref(false)
  const error = ref('')
  const page = ref(1)
  const totalPages = ref(1)
  const total = ref(0)
  const searchText = ref('')
  const debouncedSearch = ref('')
  const sortBy = ref<TrashSortField>('updatedAt')
  const sortOrder = ref<TrashSortOrder>('desc')

  let searchTimer: ReturnType<typeof setTimeout> | null = null

  // 失败分类：403 → 权限文案，其余透传后端本地化文案（兜底通用失败）
  function failToast(e: unknown): void {
    if (errorKind(e) === 'forbidden') {
      showFailToast(t('没有执行此操作的权限'))
      return
    }
    showFailToast(errMsg(e, t('操作失败')))
  }

  // ── 列表加载 ──
  async function load() {
    // 个人 scope 依赖个人空间根 id；未就绪时不发起请求（避免误落到全局回收站）
    if (scope.value === 'personal' && !personalSpaceId.value) {
      nodes.value = []
      total.value = 0
      totalPages.value = 1
      error.value = ''
      return
    }

    loading.value = true
    error.value = ''
    try {
      const projectId = scope.value === 'personal' ? personalSpaceId.value ?? undefined : undefined
      const res = await trashControllerGetTrash({
        query: {
          projectId,
          page: page.value,
          limit: PAGE_SIZE,
          search: debouncedSearch.value || undefined,
          sortBy: sortBy.value,
          sortOrder: sortOrder.value,
        },
      })
      if (res.error) throw res.error
      const data = (res.data ?? {}) as TrashListResponseDto
      nodes.value = page.value === 1 ? (data.nodes ?? []) : [...nodes.value, ...(data.nodes ?? [])]
      total.value = data.total ?? 0
      totalPages.value = data.totalPages ?? 1
    } catch (e) {
      console.error('[useTrashList] load:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
  }

  // 回第 1 页重载（动作成功后调用）
  async function reload() {
    page.value = 1
    await load()
  }

  // ── 分页 / 刷新 ──
  function loadMore() {
    if (loading.value || page.value >= totalPages.value) return
    page.value++
    load()
  }

  const loadMoreFailed = computed(() => error.value !== '' && page.value > 1)

  function retryLoadMore() {
    load()
  }

  async function refresh() {
    page.value = 1
    await load()
  }

  const hasMore = computed(() => page.value < totalPages.value)
  const isEmpty = computed(() => !loading.value && nodes.value.length === 0)

  // ── 搜索（300ms 防抖，服务端 search 参数）──
  function setSearch(val: string) {
    searchText.value = val
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      debouncedSearch.value = val
      page.value = 1
      load()
    }, 300)
  }

  // ── 排序 ──
  function setSort(by: TrashSortField, order: TrashSortOrder) {
    sortBy.value = by
    sortOrder.value = order
    page.value = 1
    load()
  }

  // ── scope 切换：清搜索 + 回第 1 页 + 重载 ──
  function setScope(next: TrashScope) {
    if (next === scope.value) return
    scope.value = next
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    searchText.value = ''
    debouncedSearch.value = ''
    page.value = 1
    load()
  }

  // ── 恢复：根节点（含已删项目根）走批量恢复接口，非根走单节点恢复 ──
  async function restore(item: { id: string; isRoot?: boolean }) {
    try {
      const res = item.isRoot
        ? await trashControllerRestoreTrashItems({ body: { itemIds: [item.id] } })
        : await nodeControllerRestoreNode({ path: { nodeId: item.id } })
      if (res.error) throw res.error
      showSuccessToast(t('已恢复'))
      await reload()
    } catch (e) {
      failToast(e)
    }
  }

  async function restoreBatch(ids: string[]) {
    if (ids.length === 0) return
    try {
      const res = await trashControllerRestoreTrashItems({ body: { itemIds: ids } })
      if (res.error) throw res.error
      showSuccessToast(t('已恢复 {count} 项', { count: String(ids.length) }))
      await reload()
    } catch (e) {
      failToast(e)
    }
  }

  // ── 彻底删除：单条走节点删除，批量走回收站批量接口 ──
  async function permanentDelete(item: { id: string }) {
    try {
      const res = await nodeControllerDeleteNode({
        path: { nodeId: item.id },
        query: { permanently: true },
      })
      if (res.error) throw res.error
      showSuccessToast(t('已彻底删除'))
      await reload()
    } catch (e) {
      failToast(e)
    }
  }

  async function permanentDeleteBatch(ids: string[]) {
    if (ids.length === 0) return
    try {
      const res = await trashControllerPermanentlyDeleteTrashItems({ body: { itemIds: ids } })
      if (res.error) throw res.error
      showSuccessToast(t('已彻底删除 {count} 项', { count: String(ids.length) }))
      await reload()
    } catch (e) {
      failToast(e)
    }
  }

  // ── 清空：作用范围与当前 scope 的列表完全一致 ──
  async function clear() {
    try {
      const res =
        scope.value === 'projects'
          ? await trashControllerClearTrash()
          : await trashControllerClearProjectTrash({ path: { projectId: personalSpaceId.value ?? '' } })
      if (res.error) throw res.error
      showSuccessToast(t('回收站已清空'))
      await reload()
    } catch (e) {
      failToast(e)
    }
  }

  return {
    scope, nodes, loading, error, page, totalPages, total,
    searchText, debouncedSearch,
    sortBy, sortOrder,
    loadMoreFailed, hasMore, isEmpty,
    load, reload, loadMore, retryLoadMore, refresh,
    setSearch, setSort, setScope,
    restore, restoreBatch,
    permanentDelete, permanentDeleteBatch,
    clear,
  }
}
