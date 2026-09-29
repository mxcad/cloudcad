/**
 * UnifiedFileList 统一数据层（M2 实施）
 *
 * 文件浏览器 / 项目详情共用一套数据加载逻辑，通过 domain 参数切换：
 *   - project / personal → nodeController*（getChildren 递归）
 *
 * 库域已改为抽屉（useLibrary.ts，all-files 扁平取数），不再走本 composable——
 * 见 docs/adr/0062-mobile-app-shell-architecture.md 第 5 节。
 * nodeController 分支复用文件系统节点层级遍历逻辑。
 */
import { ref, computed, shallowRef } from 'vue'
import {
  nodeControllerGetChildren,
  nodeControllerGetNode,
  nodeControllerSearch,
} from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto, NodeListResponseDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'

export type UnifiedDomain = 'project' | 'personal'

interface BreadcrumbItem {
  id: string
  name: string
}

export function useUnifiedFileList(domain: UnifiedDomain) {
  const STORAGE_KEY = `fs_breadcrumb_${domain}`

  // ── 状态 ──
  const nodes = shallowRef<FileSystemNodeDto[]>([])
  const loading = ref(false)
  const error = ref('')
  const page = ref(1)
  const totalPages = ref(1)
  const total = ref(0)
  const searchText = ref('')
  const debouncedSearch = ref('')

  // 服务端排序（A-10）：后端 ALLOWED_SORT 白名单 name/createdAt/updatedAt/size，越界会抛 400
  const sortBy = ref<'name' | 'createdAt' | 'updatedAt' | 'size'>('updatedAt')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  function setSort(by: 'name' | 'createdAt' | 'updatedAt' | 'size', order: 'asc' | 'desc') {
    sortBy.value = by
    sortOrder.value = order
    page.value = 1
    loadNodes()
  }

  const currentFolderId = ref<string | null>(null)
  const breadcrumbs = ref<BreadcrumbItem[]>([])
  // 根节点 id（loadRootNode 记录）：project 域搜索 scope=project_files 时作 projectId
  const rootId = ref<string | null>(null)

  // ── 位置持久化（阶段 5）：跨会话还原离开前的文件夹位置 ──
  // personal 域 = fs_breadcrumb_personal；project 域 = fs_breadcrumb_project_{projectId}（每项目独立）
  function storageKey(): string {
    return domain === 'project' ? `fs_breadcrumb_project_${rootId.value ?? ''}` : STORAGE_KEY
  }

  function persistLocation() {
    if (!rootId.value || !currentFolderId.value || currentFolderId.value === rootId.value) return
    try {
      localStorage.setItem(
        storageKey(),
        JSON.stringify({ folderId: currentFolderId.value, breadcrumbs: breadcrumbs.value }),
      )
    } catch {
      // localStorage 不可用（隐私模式/超配额）→ 静默跳过
    }
  }

  function readSavedLocation(): { folderId: string; breadcrumbs: BreadcrumbItem[] } | null {
    try {
      const raw = localStorage.getItem(storageKey())
      if (!raw) return null
      const parsed = JSON.parse(raw) as { folderId?: unknown; breadcrumbs?: unknown }
      if (typeof parsed?.folderId === 'string' && Array.isArray(parsed.breadcrumbs)) {
        return { folderId: parsed.folderId, breadcrumbs: parsed.breadcrumbs as BreadcrumbItem[] }
      }
      return null
    } catch {
      return null
    }
  }

  function clearSavedLocation() {
    try {
      localStorage.removeItem(storageKey())
    } catch {
      // 忽略
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | null = null
  function setSearch(val: string) {
    searchText.value = val
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      debouncedSearch.value = val
      page.value = 1
      loadNodes()
    }, 300)
  }

  // 清搜索词（对齐 PC：上下文切换即清搜索）。同步取消未触发的防抖定时器，
  // 否则定时器会晚一步把旧关键词写回 debouncedSearch，导致清搜索失效。
  // 本函数只改状态，加载由调用方统一触发（enterFolder/goBackTo 各只发一次请求）
  function resetSearchState() {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    searchText.value = ''
    debouncedSearch.value = ''
    page.value = 1
  }

  // ── 解析目标节点 ID ──
  function resolveTargetId(): string | null {
    return currentFolderId.value
  }

  // 搜索 scope 派生：personal → personal_space；project → project_files（需 rootId）
  function searchScope(): 'personal_space' | 'project_files' | null {
    if (domain === 'personal') return 'personal_space'
    return rootId.value ? 'project_files' : null
  }

  // ── 加载节点列表 ──
  async function loadNodes() {
    // 搜索态：改走 nodeControllerSearch 递归全 scope 搜索（结果替换当前文件夹列表）
    if (debouncedSearch.value) {
      const scope = searchScope()
      if (scope) {
        await loadSearch(scope)
        return
      }
    }

    const targetId = resolveTargetId()
    if (!targetId) {
      // 无目标节点（尚未 loadRootNode 设置根）
      return
    }

    loading.value = true
    error.value = ''

    try {
      // 项目/个人空间：用 nodeControllerGetChildren（服务端搜索：传 search 参数，
      // QueryChildrenDto.search 匹配名称或描述；避免只在已加载页做客户端过滤）
      const res = await nodeControllerGetChildren({
        path: { nodeId: targetId },
        query: {
          page: page.value,
          limit: 30,
          sortBy: sortBy.value,
          sortOrder: sortOrder.value,
          ...(debouncedSearch.value ? { search: debouncedSearch.value } : {}),
        },
      } as any)

      if (res.error) throw new Error(String(res.error))
      const data = (res.data ?? {}) as unknown as NodeListResponseDto
      nodes.value = page.value === 1
        ? (data.nodes ?? [])
        : [...nodes.value, ...(data.nodes ?? [])]
      total.value = data.total ?? 0
      totalPages.value = data.totalPages ?? 1
    } catch (e) {
      console.error('[useUnifiedFileList] loadNodes:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
  }

  // ── 加载搜索结果（递归全 scope，替换当前文件夹列表）──
  async function loadSearch(scope: 'personal_space' | 'project_files') {
    loading.value = true
    error.value = ''

    try {
      const query =
        scope === 'personal_space'
          ? {
              keyword: debouncedSearch.value,
              scope,
              page: page.value,
              limit: 30,
              sortBy: sortBy.value,
              sortOrder: sortOrder.value,
            }
          : {
              keyword: debouncedSearch.value,
              scope,
              projectId: rootId.value ?? undefined,
              page: page.value,
              limit: 30,
              sortBy: sortBy.value,
              sortOrder: sortOrder.value,
            }
      const res = await nodeControllerSearch({ query } as any)

      if (res.error) throw new Error(String(res.error))
      const data = (res.data ?? {}) as unknown as NodeListResponseDto
      nodes.value = page.value === 1
        ? (data.nodes ?? [])
        : [...nodes.value, ...(data.nodes ?? [])]
      total.value = data.total ?? 0
      totalPages.value = data.totalPages ?? 1
    } catch (e) {
      console.error('[useUnifiedFileList] loadSearch:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
  }

  // ── 进入文件夹 ──
  function enterFolder(folder: FileSystemNodeDto) {
    breadcrumbs.value.push({ id: folder.id, name: folder.name })
    currentFolderId.value = folder.id
    if (searchText.value || debouncedSearch.value) resetSearchState()
    page.value = 1
    persistLocation()
    loadNodes()
  }

  // ── 面包屑返回 ──
  function goBackTo(index: number) {
    if (searchText.value || debouncedSearch.value) resetSearchState()
    if (index < 0) {
      breadcrumbs.value = []
      currentFolderId.value = null
    } else {
      breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
      currentFolderId.value = breadcrumbs.value[index]?.id ?? null
    }
    page.value = 1
    persistLocation()
    loadNodes()
  }

  // ── 加载更多 ──
  function loadMore() {
    if (loading.value || page.value >= totalPages.value) return
    page.value++
    loadNodes()
  }

  // 加载更多失败（A-14）：page>1 失败时已加载列表保留，底部出重试条；
  // page 已指向失败页，重试直接重跑当前页，不会重复追加
  const loadMoreFailed = computed(() => error.value !== '' && page.value > 1)

  function retryLoadMore() {
    loadNodes()
  }

  // 手动刷新（A-15）：下拉刷新 / 刷新按钮 → 回到第一页整页重查。
  // 返回 loadNodes 的 Promise，供「创建/删除后 await 重载完成再走后续」的调用方使用
  function refresh(): Promise<void> {
    page.value = 1
    return loadNodes()
  }

  function isFolder(node: FileSystemNodeDto): boolean {
    return !!node.isFolder || node.nodeType === 'FOLDER'
  }

  const hasMore = computed(() => page.value < totalPages.value)
  const isEmpty = computed(() => !loading.value && nodes.value.length === 0)

  function getThumbnailUrl(nodeId: string): string {
    return `/api/v1/file-system/nodes/${nodeId}/thumbnail`
  }

  // 项目/个人空间的根节点加载
  // override：显式初始位置（如「打开图纸返回」的 returnTarget）——优先于持久化存档
  async function loadRootNode(
    rootNodeId: string,
    override?: { folderId: string; breadcrumbs: BreadcrumbItem[] },
  ) {
    rootId.value = rootNodeId
    currentFolderId.value = rootNodeId
    breadcrumbs.value = []
    page.value = 1

    if (override) {
      currentFolderId.value = override.folderId
      breadcrumbs.value = override.breadcrumbs
    } else {
      // 位置持久化：有存档则还原离开前的文件夹（验证节点仍存在，失败清存档回根目录）
      const saved = readSavedLocation()
      if (saved && saved.folderId !== rootNodeId) {
        try {
          const res = await nodeControllerGetNode({ path: { nodeId: saved.folderId } })
          if (res.error) throw new Error(String(res.error))
          currentFolderId.value = saved.folderId
          breadcrumbs.value = saved.breadcrumbs
        } catch {
          clearSavedLocation()
        }
      }
    }
    await loadNodes()
  }

  return {
    nodes, loading, error, page, totalPages, total,
    searchText, debouncedSearch,
    sortBy, sortOrder, setSort,
    loadMoreFailed, retryLoadMore,
    hasMore, isEmpty,
    setSearch,
    loadNodes, loadMore, refresh,
    isFolder,
    getThumbnailUrl,
    currentFolderId, breadcrumbs, rootId,
    enterFolder, goBackTo,
    loadRootNode,
  }
}
