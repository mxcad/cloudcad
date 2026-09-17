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
import { nodeControllerGetChildren } from '@cloudcad/api-sdk/sdk.gen'
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

  // ── 解析目标节点 ID ──
  function resolveTargetId(): string | null {
    return currentFolderId.value
  }

  // ── 加载节点列表 ──
  async function loadNodes() {
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

  // ── 进入文件夹 ──
  function enterFolder(folder: FileSystemNodeDto) {
    breadcrumbs.value.push({ id: folder.id, name: folder.name })
    currentFolderId.value = folder.id
    page.value = 1
    loadNodes()
  }

  // ── 面包屑返回 ──
  function goBackTo(index: number) {
    if (index < 0) {
      breadcrumbs.value = []
      currentFolderId.value = null
    } else {
      breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
      currentFolderId.value = breadcrumbs.value[index]?.id ?? null
    }
    page.value = 1
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

  // 手动刷新（A-15）：下拉刷新 / 刷新按钮 → 回到第一页整页重查
  function refresh() {
    page.value = 1
    loadNodes()
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
  async function loadRootNode(rootNodeId: string) {
    currentFolderId.value = rootNodeId
    breadcrumbs.value = []
    page.value = 1
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
    currentFolderId, breadcrumbs,
    enterFolder, goBackTo,
    loadRootNode,
  }
}
