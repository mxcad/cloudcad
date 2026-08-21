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
  const nodes = shallowRef<FileSystemNodeDto[]>([])
  const loading = ref(false)
  const error = ref('')
  const page = ref(1)
  const totalPages = ref(1)
  const total = ref(0)
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

      const libData = (libRes.data ?? {}) as FileSystemNodeDto
      rootId.value = libData.id || ''
      rootName.value = t('全部')

      const catData = (catRes.data ?? {}) as unknown as { categories?: CategoryLevel[] }
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
      return true
    } catch (e) {
      console.error('[useLibrary] fetchRootAndCategories exception:', e)
      error.value = t('加载失败')
      return false
    }
  }

  // ── 加载节点列表 ──
  async function loadNodes() {
    const targetId = currentFolderId.value ?? resolveCategoryNodeId()
    if (!targetId) {
      return
    }

    loading.value = true
    error.value = ''

    try {
      const queryParams: Record<string, unknown> = {
        page: page.value,
        limit: 30,
      }
      if (debouncedSearch.value) {
        queryParams.search = debouncedSearch.value
      }

      const res = await api.getAllFiles({
        path: { nodeId: targetId },
        query: queryParams as any,
      })

      if (res.error) {
        console.error('[useLibrary] getAllFiles error:', res.error)
        throw new Error(String(res.error))
      }

      const rawData = res.data ?? {}
      const data = rawData as unknown as NodeListResponseDto

      if (page.value === 1) {
        nodes.value = data.nodes ?? []
      } else {
        nodes.value = [...nodes.value, ...(data.nodes ?? [])]
      }
      total.value = data.total ?? 0
      totalPages.value = data.totalPages ?? 1
    } catch (e) {
      console.error('[useLibrary] loadNodes exception:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
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
    if (loading.value || page.value >= totalPages.value) return
    page.value++
    loadNodes()
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

  const hasMore = computed(() => page.value < totalPages.value)
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
    setSearch,
    isFolder,
    getThumbnailUrl: (nodeId: string) => getThumbnailUrl(libraryType, nodeId),
  }
}
