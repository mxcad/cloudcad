/**
 * 回收站数据层（薄 composable，供 shell/components/TrashView.vue 消费）
 *
 * 概念对齐 PC：回收站是「当前上下文」的视图，scope 由入口上下文决定，
 * 不再有手动选 scope 的下拉（原 FileBrowserPage 第 3 tab 方案已废弃）：
 *   projects = 项目列表上下文（全局：可访问项目内的已删条目 + 已删项目根 + 个人空间已删条目，projectId 不传）
 *   project  = 项目详情页上下文（projectId，取该项目子树的已删条目）
 *   personal = 个人空间上下文（projectId=personalSpaceId，按子树取数）
 *
 * 后端接口全部现成，零后端改动：
 *   GET /trash（+projectId）· POST /trash/restore · DELETE /trash/items
 *   DELETE /trash · DELETE /projects/:projectId/trash · POST /nodes/:id/restore
 *   DELETE /nodes/:id?permanently=true
 *
 * 每个动作成功后 toast + 回第 1 页重载；失败时 403 走权限文案，其余走通用失败。
 */
import { ref, computed, watch, type Ref } from 'vue'
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

export type TrashScope = 'projects' | 'project' | 'personal'
export type TrashSortField = 'name' | 'createdAt' | 'updatedAt' | 'size'
export type TrashSortOrder = 'asc' | 'desc'

/**
 * 按入口传入的 props 判定回收站 scope——按「是否传入」而非「值是否非空」：
 * 个人空间入口恒传 personalSpaceId（id 未就绪时为 null），若按真值回退到
 * projects，id 未就绪（或取数失败）时个人 tab 会误显示全局回收站，
 * 用户可能误清空全局回收站。
 */
export function resolveTrashScope(
  projectId: string | undefined,
  personalSpaceId: string | null | undefined,
): TrashScope {
  if (projectId) return 'project'
  if (personalSpaceId !== undefined) return 'personal'
  return 'projects'
}

const PAGE_SIZE = 30

export function useTrashList(personalSpaceId: Ref<string | null | undefined>) {
  const scope = ref<TrashScope>('projects')
  // 'project' scope 下选定的项目 id（项目内回收站，由 setScope('project', id) 一次设定）
  const selectedProjectId = ref<string | null>(null)
  // 高级筛选：扩展名 csv（回收站接口仅支持 search/extension/sort，大小/时间会被后端忽略）
  const extension = ref('')
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

  // 破坏性动作互斥：恢复/彻底删除/清空在途时禁止二次触发（双击/连点 → 并发请求 + 二次弹窗）
  const actionBusy = ref(false)
  async function runExclusive(fn: () => Promise<void>) {
    if (actionBusy.value) return
    actionBusy.value = true
    try {
      await fn()
    } finally {
      actionBusy.value = false
    }
  }

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
    // personal scope 依赖个人空间根 id；project scope 依赖选定的项目 id；
    // 未就绪时不发起请求（避免 personal/project 误落到全局回收站）
    if (scope.value === 'personal' && !personalSpaceId.value) {
      nodes.value = []
      total.value = 0
      totalPages.value = 1
      error.value = ''
      return
    }
    if (scope.value === 'project' && !selectedProjectId.value) {
      nodes.value = []
      total.value = 0
      totalPages.value = 1
      error.value = ''
      return
    }

    loading.value = true
    error.value = ''
    try {
      const projectId =
        scope.value === 'personal'
          ? personalSpaceId.value ?? undefined
          : scope.value === 'project'
            ? selectedProjectId.value ?? undefined
            : undefined
      const res = await trashControllerGetTrash({
        query: {
          projectId,
          page: page.value,
          limit: PAGE_SIZE,
          search: debouncedSearch.value || undefined,
          extension: extension.value || undefined,
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

  // ── 高级筛选：扩展名（回收站接口仅支持 search/extension/sort，大小/时间会被忽略）──
  const filterActive = computed(() => extension.value !== '')
  function setFilters(filters: { extension?: string }) {
    extension.value = filters.extension ?? ''
    page.value = 1
    load()
  }

  // ── scope 切换：清搜索 + 回第 1 页 + 重载 ──
  // 'project' scope 可带 projectId 一次到位（避免先切 scope 再选项目连发两次请求）
  // openTrash 总是触发加载（供视图挂载/上下文切换时调用）；setScope 幂等（同 scope 不重复请求）
  function openTrash(next: TrashScope, projectId?: string) {
    scope.value = next
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    searchText.value = ''
    debouncedSearch.value = ''
    extension.value = ''
    page.value = 1
    // 切走 project scope 时清空选定项目，避免残留 id 影响其他 scope
    selectedProjectId.value = next === 'project' ? projectId ?? null : null
    load()
  }

  function setScope(next: TrashScope, projectId?: string) {
    if (next === scope.value && (next !== 'project' || projectId === selectedProjectId.value)) return
    openTrash(next, projectId)
  }

  // personal scope 依赖个人空间根 id；页面异步取到 id 后补发请求（进入回收站时 id 可能尚未就绪）
  watch(
    personalSpaceId,
    (id) => {
      if (id && scope.value === 'personal') void load()
    },
  )

  // ── 恢复：根节点（含已删项目根）走批量恢复接口，非根走单节点恢复 ──
  async function restore(item: { id: string; isRoot?: boolean }) {
    await runExclusive(async () => {
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
    })
  }

  async function restoreBatch(ids: string[]) {
    if (ids.length === 0) return
    await runExclusive(async () => {
      try {
        const res = await trashControllerRestoreTrashItems({ body: { itemIds: ids } })
        if (res.error) throw res.error
        showSuccessToast(t('已恢复 {count} 项', { count: String(ids.length) }))
        await reload()
      } catch (e) {
        failToast(e)
      }
    })
  }

  // ── 彻底删除：单条走节点删除，批量走回收站批量接口 ──
  async function permanentDelete(item: { id: string }) {
    await runExclusive(async () => {
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
    })
  }

  async function permanentDeleteBatch(ids: string[]) {
    if (ids.length === 0) return
    await runExclusive(async () => {
      try {
        const res = await trashControllerPermanentlyDeleteTrashItems({ body: { itemIds: ids } })
        if (res.error) throw res.error
        showSuccessToast(t('已彻底删除 {count} 项', { count: String(ids.length) }))
        await reload()
      } catch (e) {
        failToast(e)
      }
    })
  }

  // ── 清空：作用范围与当前 scope 的列表完全一致 ──
  async function clear() {
    await runExclusive(async () => {
      try {
        const res =
          scope.value === 'projects'
            ? await trashControllerClearTrash()
            : await trashControllerClearProjectTrash({
                path: {
                  projectId:
                    scope.value === 'project'
                      ? selectedProjectId.value ?? ''
                      : personalSpaceId.value ?? '',
                },
              })
        if (res.error) throw res.error
        // scope 专属成功文案（对齐 PC：项目/个人空间清空报「项目回收站已清空」，全局报「回收站已清空」）
        showSuccessToast(scope.value === 'projects' ? t('回收站已清空') : t('项目回收站已清空'))
        await reload()
      } catch (e) {
        failToast(e)
      }
    })
  }

  return {
    scope, selectedProjectId, nodes, loading, error, page, totalPages, total,
    searchText, debouncedSearch,
    sortBy, sortOrder,
    loadMoreFailed, hasMore, isEmpty, filterActive, actionBusy,
    load, reload, loadMore, retryLoadMore, refresh,
    setSearch, setSort, setScope, openTrash, setFilters,
    restore, restoreBatch,
    permanentDelete, permanentDeleteBatch,
    clear,
  }
}
