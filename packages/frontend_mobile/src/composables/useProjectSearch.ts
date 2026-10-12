/**
 * 「我的项目」tab 全局递归搜索（阶段 4）
 *
 * keyword 非空时从 projectControllerGetProjects 切到 nodeControllerSearch(scope=global)：
 * 混合结果 = 项目命中（nodeType=PROJECT，sourceType=project）+ 文件命中（sourceType=file，
 * 后端 searchGlobal 经 searchAllProjects 注入 ancestorPath）。
 * keyword 为空时页面回正常项目列表，本 composable 只持有搜索结果状态与翻页。
 */
import { ref } from 'vue'
import { nodeControllerSearch } from '@cloudcad/api-sdk/sdk.gen'
import type { FileSystemNodeDto, NodeListResponseDto, ProjectFilterType } from '@cloudcad/api-sdk/types.gen'
import { t } from '@/languages'
import { unwrap } from '@/utils/apiError'
import { usePagedState, type PagedItems } from './usePagedState'

export function useProjectSearch() {
  const paged = usePagedState<FileSystemNodeDto>({
    onError: (e) => {
      console.error('[useProjectSearch] search:', e)
      return t('加载失败')
    },
  })
  const { items: results, page, totalPages, total, loading, error, hasMore } = paged

  // 最近一次搜索参数（loadMore 翻页用；keyword/filter 由页面驱动）
  let lastKeyword = ''
  let lastFilter: ProjectFilterType = 'all'

  // 单页取数：fetcher 闭包捕获最近一次搜索参数（lastKeyword/lastFilter），翻页号由 paged 按当前页传入
  async function fetchPage(pageNo: number): Promise<PagedItems<FileSystemNodeDto>> {
    const res = await nodeControllerSearch({
      query: {
        keyword: lastKeyword,
        scope: 'global',
        filter: lastFilter,
        page: pageNo,
        limit: 30,
      },
    })
    const data = unwrap<NodeListResponseDto>(res)
    return { items: data.nodes ?? [], total: data.total ?? 0, totalPages: data.totalPages ?? 1 }
  }

  async function search(keyword: string, filter: ProjectFilterType) {
    if (!keyword) {
      clear()
      return
    }
    lastKeyword = keyword
    lastFilter = filter
    paged.resetToFirstPage()
    await paged.load(fetchPage)
  }

  function searchFromFirstPage(keyword: string, filter: ProjectFilterType) {
    void search(keyword, filter)
  }

  function loadMore() {
    if (!lastKeyword) return
    paged.loadMore(fetchPage)
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
