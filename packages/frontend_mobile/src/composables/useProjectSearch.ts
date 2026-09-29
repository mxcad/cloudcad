/**
 * 「我的项目」tab 全局递归搜索（阶段 4）
 *
 * keyword 非空时从 projectControllerGetProjects 切到 nodeControllerSearch(scope=global)：
 * 混合结果 = 项目命中（nodeType=PROJECT，sourceType=project）+ 文件命中（sourceType=file，
 * 后端 searchGlobal 经 searchAllProjects 注入 ancestorPath）。
 * keyword 为空时页面回正常项目列表，本 composable 只持有搜索结果状态与翻页。
 */
import { ref, computed } from 'vue'
import { nodeControllerSearch } from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto, NodeListResponseDto, ProjectFilterType } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'

export function useProjectSearch() {
  const results = ref<FileSystemNodeDto[]>([])
  const loading = ref(false)
  const error = ref('')
  const page = ref(1)
  const totalPages = ref(1)
  const total = ref(0)
  const hasMore = computed(() => page.value < totalPages.value)

  // 最近一次搜索参数（loadMore 翻页用；keyword/filter 由页面驱动）
  let lastKeyword = ''
  let lastFilter: ProjectFilterType = 'all'

  async function search(keyword: string, filter: ProjectFilterType, append = false) {
    if (!keyword) {
      clear()
      return
    }
    lastKeyword = keyword
    lastFilter = filter
    loading.value = true
    error.value = ''

    try {
      const res = await nodeControllerSearch({
        query: {
          keyword,
          scope: 'global',
          filter,
          page: page.value,
          limit: 30,
        },
      })
      if (res.error) throw new Error(String(res.error))
      const data = (res.data ?? {}) as unknown as NodeListResponseDto
      results.value = append ? [...results.value, ...(data.nodes ?? [])] : (data.nodes ?? [])
      total.value = data.total ?? 0
      totalPages.value = data.totalPages ?? 1
    } catch (e) {
      console.error('[useProjectSearch] search:', e)
      error.value = t('加载失败')
    } finally {
      loading.value = false
    }
  }

  function searchFromFirstPage(keyword: string, filter: ProjectFilterType) {
    page.value = 1
    void search(keyword, filter, false)
  }

  function loadMore() {
    if (loading.value || !hasMore.value || !lastKeyword) return
    page.value++
    void search(lastKeyword, lastFilter, true)
  }

  function clear() {
    results.value = []
    total.value = 0
    totalPages.value = 1
    page.value = 1
    lastKeyword = ''
    error.value = ''
  }

  // 项目命中（渲染项目卡片）vs 文件/文件夹命中（渲染文件行 + 来源徽章）
  function isProjectHit(node: FileSystemNodeDto): boolean {
    return node.nodeType === 'PROJECT'
  }

  return {
    results, loading, error, page, totalPages, total, hasMore,
    search, searchFromFirstPage, loadMore, clear, isProjectHit,
  }
}
