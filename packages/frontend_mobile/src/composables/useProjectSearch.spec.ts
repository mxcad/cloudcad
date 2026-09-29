import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useProjectSearch } from './useProjectSearch'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  nodeControllerSearch: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))

import { nodeControllerSearch } from '@cloudcad/api-sdk/sdk.gen'

function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

// 列表响应（与后端 NodeListResponseDto 同形）
function nodePage(nodes: unknown[] = [], page = 1, totalPages = 1) {
  return { data: { nodes, total: nodes.length, page, limit: 30, totalPages } }
}

describe('useProjectSearch 全局递归搜索（tab0 混合结果）', () => {
  let errorSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    resolveWith(nodeControllerSearch, nodePage())
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('search：scope=global，带 keyword/filter/page/limit', async () => {
    resolveWith(nodeControllerSearch, nodePage([{ id: 'hit-1' }]))
    const c = useProjectSearch()
    await c.search('图纸', 'owned')
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledWith({
      query: { keyword: '图纸', scope: 'global', filter: 'owned', page: 1, limit: 30 },
    })
    expect(c.results.value).toEqual([{ id: 'hit-1' }])
    expect(c.total.value).toBe(1)
    expect(c.totalPages.value).toBe(1)
    expect(c.loading.value).toBe(false)
  })

  it('空关键词：不发请求，清空状态', async () => {
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    await c.search('', 'all')
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledTimes(1)
    expect(c.results.value).toEqual([])
    expect(c.page.value).toBe(1)
  })

  it('loadMore：翻页追加结果，page 递增', async () => {
    resolveWith(nodeControllerSearch, nodePage([{ id: 'hit-1' }], 1, 2))
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    vi.mocked(nodeControllerSearch).mockResolvedValueOnce(nodePage([{ id: 'hit-2' }], 2, 2) as never)
    c.loadMore()
    await vi.waitFor(() => expect(c.results.value).toHaveLength(2))
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ page: 2 }),
    })
    expect(c.hasMore.value).toBe(false)
  })

  it('loadMore 到底不再翻页', async () => {
    resolveWith(nodeControllerSearch, nodePage([{ id: 'hit-1' }], 1, 1))
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    c.loadMore()
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledTimes(1)
  })

  it('未搜索过：loadMore 不发请求', async () => {
    const c = useProjectSearch()
    c.loadMore()
    expect(vi.mocked(nodeControllerSearch)).not.toHaveBeenCalled()
  })

  it('clear 后 loadMore 不发请求', async () => {
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    c.clear()
    c.loadMore()
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledTimes(1)
  })

  it('searchFromFirstPage：翻页后回第 1 页重查', async () => {
    resolveWith(nodeControllerSearch, nodePage([{ id: 'hit-1' }], 1, 2))
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    vi.mocked(nodeControllerSearch).mockResolvedValueOnce(nodePage([{ id: 'hit-2' }], 2, 2) as never)
    c.loadMore()
    // 等翻页请求真正落定（page 是同步置位，不能当完成信号）
    await vi.waitFor(() => expect(c.results.value).toHaveLength(2))
    vi.mocked(nodeControllerSearch).mockResolvedValueOnce(nodePage([{ id: 'hit-3' }], 1, 1) as never)
    c.searchFromFirstPage('图纸', 'joined')
    await vi.waitFor(() => expect(c.results.value).toEqual([{ id: 'hit-3' }]))
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ page: 1, filter: 'joined' }),
    })
  })

  it('isProjectHit：PROJECT 命中为 true，文件/文件夹为 false', () => {
    const c = useProjectSearch()
    expect(c.isProjectHit({ nodeType: 'PROJECT' } as never)).toBe(true)
    expect(c.isProjectHit({ nodeType: 'FILE' } as never)).toBe(false)
    expect(c.isProjectHit({ nodeType: 'FOLDER' } as never)).toBe(false)
  })

  it('res.error：置错误态，结果不被替换', async () => {
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    expect(c.results.value).toEqual([])
    vi.mocked(nodeControllerSearch).mockResolvedValueOnce({ error: 'boom' } as never)
    await c.search('图纸', 'all')
    expect(c.error.value).toBe('加载失败')
    expect(c.results.value).toEqual([])
    expect(c.loading.value).toBe(false)
  })

  it('请求异常：置错误态', async () => {
    vi.mocked(nodeControllerSearch).mockRejectedValue(new Error('boom'))
    const c = useProjectSearch()
    await c.search('图纸', 'all')
    expect(c.error.value).toBe('加载失败')
    expect(c.loading.value).toBe(false)
  })
})
