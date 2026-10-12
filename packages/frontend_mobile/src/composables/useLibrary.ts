///////////////////////////////////////////////////////////////////////////////
// 移动端图纸库/图块库数据层 composable
// 管理: 根节点、3级分类、节点列表、分页、搜索、面包屑导航
///////////////////////////////////////////////////////////////////////////////

import { ref, computed, shallowRef } from 'vue'
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingCategories,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockCategories,
  libraryControllerGetBlockAllFiles,
} from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto, NodeListResponseDto } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { unwrap } from '@/utils/apiError'
import { usePagedState, type PagedItems } from './usePagedState'

export type LibraryType = 'drawing' | 'block'

interface CategoryItem {
  id: string
  name: string
  hasChildren?: boolean
  parentId?: string
}

interface CategoryLevel {
  level: number
  items: CategoryItem[]
}

interface BreadcrumbItem {
  id: string
  name: string
}

/** 缩略图 URL */
export function getThumbnailUrl(libraryType: LibraryType, nodeId: string): string {
  return `/api/v1/library/${libraryType}/nodes/${nodeId}/thumbnail`
}

export function useLibrary(libraryType: LibraryType) {
  const STORAGE_KEY = `library_category_path_${libraryType}`

  function loadSavedCategory(): string[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 补齐到 3 级
          while (parsed.length < 3) parsed.push('all')
          return parsed.slice(0, 3)
        }
      }
    } catch {}
    return ['all', 'all', 'all']
  }

  function saveCategory(path: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(path))
    } catch {}
  }

  // ── 根节点 ──
  const rootId = ref<string | null>(null)
  const rootName = ref('')

  // ── 分类 ──
  const categories = shallowRef<CategoryLevel[]>([])
  const selectedPath = ref<string[]>(loadSavedCategory())

  // ── 当前浏览节点 ──
  const currentFolderId = ref<string | null>(null)
  const breadcrumbs = ref<BreadcrumbItem[]>([])

  // ── 节点列表 ──
  const paged = usePagedState<FileSystemNodeDto>({ onError: () => t('加载失败') })
  const { items: nodes, page, totalPages, total, loading, error, hasMore } = paged
  const searchText = ref('')
  const debouncedSearch = ref('')

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

  // ── API 选择 ──
  const api = {
    getLibrary: libraryType === 'drawing'
      ? libraryControllerGetDrawingLibrary
      : libraryControllerGetBlockLibrary,
    getCategories: libraryType === 'drawing'
      ? libraryControllerGetDrawingCategories
      : libraryControllerGetBlockCategories,
    getAllFiles: libraryType === 'drawing'
      ? libraryControllerGetDrawingAllFiles
      : libraryControllerGetBlockAllFiles,
  }

  // ── 解析分类目标节点 ──
  function resolveCategoryNodeId(): string | null {
    // 从右往左找到第一个非 'all' 的分类 ID
    for (let i = selectedPath.value.length - 1; i >= 0; i--) {
      if (selectedPath.value[i] !== 'all') {
        return selectedPath.value[i]
      }
    }
    return rootId.value
  }

  // ── 加载根 + 分类 ──
  async function fetchRootAndCategories() {
    try {
      const [libRes, catRes] = await Promise.all([
        api.getLibrary({}),
        api.getCategories({}),
      ])

      // SDK 把非 2xx 放进 res.error 而不抛异常：不检查的话 data 为 undefined，
      // rootId 变成 ''，loadNodes 静默 return，页面停在"暂无数据"且无错误提示
      // （unwrap 同时拦截 res.error 与 data.code 字符串业务码，任一失败即抛 → catch 置错误态）
      const libData = unwrap<FileSystemNodeDto>(libRes)
      const catData = unwrap<{ categories?: CategoryLevel[] }>(catRes)
      rootId.value = libData.id || ''
      rootName.value = t('全部')

      // 根节点是后续一切查询的前提：拿不到时 loadNodes 无目标节点、页面停在错误态。
      // 响应形状一并打出，便于区分「接口空」与「envelope 未被解包」。
      if (!rootId.value) {
        console.error(
          '[useLibrary] getLibrary 未返回根节点',
          JSON.stringify({
            status: libRes.response?.status,
            dataShape: libRes.data && typeof libRes.data === 'object'
              ? Object.keys(libRes.data as Record<string, unknown>)
              : typeof libRes.data,
          }),
        )
        error.value = t('加载失败')
        return false
      }

      const rawCategories = catData?.categories ?? []

      // 补齐到3级，每级插入"全部"
      const padded: CategoryLevel[] = []
      for (let i = 0; i < 3; i++) {
        const existing = rawCategories.find((c: CategoryLevel) => c.level === i)
        const items: CategoryItem[] = [{ id: 'all', name: t('全部') }]
        if (existing?.items) {
          items.push(...existing.items)
        }
        padded.push({ level: i, items })
      }
      categories.value = padded
      discardStaleCategoryPath()
      return true
    } catch (e) {
      console.error('[useLibrary] fetchRootAndCategories exception:', e)
      error.value = t('加载失败')
      return false
    }
  }

  /**
   * localStorage 里的分类 ID 可能已不在服务端（库内文件夹被删/重建），
   * children 对不存在的 nodeId 返回 { code: SUCCESS, nodes: [] }——页面会卡在
   * "暂无数据"且无错误提示。启动时用服务端分类树校验一遍，失效则回退到"全部"。
   */
  function discardStaleCategoryPath() {
    for (let i = 0; i < selectedPath.value.length; i++) {
      const id = selectedPath.value[i]
      if (id === 'all') continue
      const items = categories.value[i]?.items ?? []
      if (!items.some((c) => c.id === id)) {
        const fresh = ['all', 'all', 'all']
        selectedPath.value = fresh
        saveCategory(fresh)
        return
      }
    }
  }

  // ── 加载节点列表 ──
  // 单页取数：fetcher 闭包捕获目标节点/搜索等消费方特有状态，翻页号由 paged 按当前页传入
  async function fetchPage(
    targetId: string,
    pageNo: number,
  ): Promise<PagedItems<FileSystemNodeDto>> {
    const queryParams: { page: number; limit: number; search?: string } = {
      page: pageNo,
      limit: 30,
    }
    if (debouncedSearch.value) {
      queryParams.search = debouncedSearch.value
    }
    const res = await api.getAllFiles({
      path: { nodeId: targetId },
      query: queryParams,
    })
    const data = unwrap<NodeListResponseDto>(res)
    const fetched = data.nodes ?? []
    // 首屏 0 条时把目标节点打到 console：库内查错节点、根节点没拿到、
    // 服务端分类树变更后 localStorage 里的旧 ID 失效，这三种都会静默返回空
    if (pageNo === 1 && fetched.length === 0) {
      console.warn(
        '[useLibrary] all-files 返回 0 条',
        `type=${libraryType} target=${targetId} search=${debouncedSearch.value || '(无)'}`,
      )
    }
    return { items: fetched, total: data.total ?? 0, totalPages: data.totalPages ?? 1 }
  }

  async function loadNodes() {
    const targetId = currentFolderId.value ?? resolveCategoryNodeId()
    if (!targetId) {
      // 根节点没拿到（getLibrary 返回了空/异常形状）：必须让用户看到失败，
      // 静默 return 会让页面停在"暂无数据"且无重试入口
      console.error('[useLibrary] loadNodes 无可用目标节点')
      error.value = t('加载失败')
      return
    }
    await paged.load((pageNo) => fetchPage(targetId, pageNo))
  }

  // 当前浏览目标对应的 fetcher（loadMore/retry 共用；无目标时返回空 fetcher 不翻页）
  function currentFetcher(): (pageNo: number) => Promise<PagedItems<FileSystemNodeDto>> {
    const targetId = currentFolderId.value ?? resolveCategoryNodeId()
    if (!targetId) return () => Promise.resolve({ items: [], total: 0, totalPages: 1 })
    return (pageNo) => fetchPage(targetId, pageNo)
  }

  // ── 选择分类 ──
  function selectCategory(level: number, categoryId: string) {
    const newPath = [...selectedPath.value]
    newPath[level] = categoryId
    // 重置下级为 'all'
    for (let i = level + 1; i < newPath.length; i++) {
      newPath[i] = 'all'
    }
    selectedPath.value = newPath
    saveCategory(newPath)
    // 重置导航
    breadcrumbs.value = []
    currentFolderId.value = null
    page.value = 1
    searchText.value = ''
    debouncedSearch.value = ''
    loadNodes()
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
      // 回到分类根
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
    paged.loadMore(currentFetcher())
  }

  // ── 加载更多失败后重试 ──
  // loadMore 已自增 page，重试须重载当前页而不是再翻一页（否则漏掉一整页）
  function retryLoadMore() {
    paged.retryLoadMore(currentFetcher())
  }

  // ── 判断缩略图节点类型 ──
  function isFolder(node: FileSystemNodeDto): boolean {
    return node.isFolder || node.nodeType === 'FOLDER'
  }

  // ── 分类名称显示 ──
  const categoryLabel = computed(() => {
    const parts: string[] = []
    for (let i = 0; i < selectedPath.value.length; i++) {
      const id = selectedPath.value[i]
      if (id === 'all') continue
      const level = categories.value[i]
      const item = level?.items?.find(c => c.id === id)
      if (item) parts.push(item.name)
    }
    const folderNames = breadcrumbs.value.map(b => b.name)
    return [...parts, ...folderNames].join(' / ') || rootName.value
  })

  const isEmpty = computed(() => !loading.value && nodes.value.length === 0)

  return {
    rootId,
    rootName,
    categories,
    selectedPath,
    breadcrumbs,
    nodes,
    loading,
    error,
    total,
    page,
    totalPages,
    searchText,
    categoryLabel,
    hasMore,
    isEmpty,
    fetchRootAndCategories,
    loadNodes,
    selectCategory,
    enterFolder,
    goBackTo,
    loadMore,
    retryLoadMore,
    resolveCategoryNodeId,
    setSearch,
    isFolder,
    getThumbnailUrl: (nodeId: string) => getThumbnailUrl(libraryType, nodeId),
  }
}
