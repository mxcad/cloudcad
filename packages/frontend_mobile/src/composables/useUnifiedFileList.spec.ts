import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUnifiedFileList } from './useUnifiedFileList'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  nodeControllerGetChildren: vi.fn(),
  nodeControllerSearch: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))

import { nodeControllerGetChildren, nodeControllerSearch } from '@cloudcad/api-sdk/sdk.gen'

function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

// 列表响应（与后端 NodeListResponseDto 同形）
function nodePage(nodes: unknown[] = [], page = 1, totalPages = 1) {
  return { data: { nodes, total: nodes.length, page, limit: 30, totalPages } }
}

describe('useUnifiedFileList 统一数据层（阶段 4 搜索分支）', () => {
  let errorSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    resolveWith(nodeControllerGetChildren, nodePage())
    resolveWith(nodeControllerSearch, nodePage())
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('loadRootNode：getChildren 取根子节点，并记录 rootId', async () => {
    resolveWith(nodeControllerGetChildren, nodePage([{ id: 'a' }]))
    const c = useUnifiedFileList('project')
    await c.loadRootNode('proj-1')
    expect(c.rootId.value).toBe('proj-1')
    expect(vi.mocked(nodeControllerGetChildren)).toHaveBeenCalledWith(
      expect.objectContaining({ path: { nodeId: 'proj-1' } }),
    )
    expect(c.nodes.value).toHaveLength(1)
  })

  it('personal 域搜索：scope=personal_space，不带 projectId', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalled())
    const call = vi.mocked(nodeControllerSearch).mock.calls.at(-1)?.[0] as {
      query: Record<string, unknown>
    }
    expect(call.query).toMatchObject({ keyword: '图纸', scope: 'personal_space', page: 1, limit: 30 })
    expect(call.query.projectId).toBeUndefined()
  })

  it('project 域搜索：scope=project_files，projectId=rootId', async () => {
    const c = useUnifiedFileList('project')
    await c.loadRootNode('proj-9')
    c.setSearch('装配')
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalled())
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledWith({
      query: expect.objectContaining({ keyword: '装配', scope: 'project_files', projectId: 'proj-9', page: 1, limit: 30 }),
    })
  })

  it('搜索结果替换当前文件夹列表', async () => {
    resolveWith(nodeControllerGetChildren, nodePage([{ id: 'folder-child' }]))
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    expect(c.nodes.value).toEqual([{ id: 'folder-child' }])
    resolveWith(nodeControllerSearch, nodePage([{ id: 'hit-1' }, { id: 'hit-2' }]))
    c.setSearch('图纸')
    await vi.waitFor(() => expect(c.nodes.value).toEqual([{ id: 'hit-1' }, { id: 'hit-2' }]))
  })

  it('清空搜索词：回 getChildren 正常列表（不再走 search）', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalled())
    const searchCalls = vi.mocked(nodeControllerSearch).mock.calls.length
    c.setSearch('')
    await vi.waitFor(() =>
      expect(vi.mocked(nodeControllerGetChildren)).toHaveBeenCalledWith(
        expect.objectContaining({ path: { nodeId: 'space-1' } }),
      ),
    )
    // 清空后 getChildren 不再带 search 参数
    const lastCall = vi.mocked(nodeControllerGetChildren).mock.calls.at(-1)?.[0] as {
      query?: Record<string, unknown>
    }
    expect(lastCall.query?.search).toBeUndefined()
    expect(vi.mocked(nodeControllerSearch).mock.calls.length).toBe(searchCalls)
  })

  it('enterFolder 先清搜索：进入文件夹走 getChildren 而非 search', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalled())
    const searchCalls = vi.mocked(nodeControllerSearch).mock.calls.length
    c.enterFolder({ id: 'folder-1', name: '文件夹一' } as never)
    await vi.waitFor(() =>
      expect(vi.mocked(nodeControllerGetChildren)).toHaveBeenCalledWith(
        expect.objectContaining({ path: { nodeId: 'folder-1' } }),
      ),
    )
    expect(c.searchText.value).toBe('')
    expect(c.debouncedSearch.value).toBe('')
    expect(vi.mocked(nodeControllerSearch).mock.calls.length).toBe(searchCalls)
  })

  it('搜索态 loadMore：翻页追加搜索结果', async () => {
    resolveWith(nodeControllerSearch, nodePage([{ id: 'hit-1' }], 1, 2))
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(c.nodes.value).toHaveLength(1))
    vi.mocked(nodeControllerSearch).mockResolvedValueOnce(nodePage([{ id: 'hit-2' }], 2, 2) as never)
    c.loadMore()
    await vi.waitFor(() => expect(c.nodes.value).toHaveLength(2))
    expect(vi.mocked(nodeControllerSearch)).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ page: 2 }),
    })
    expect(c.hasMore.value).toBe(false)
  })

  it('搜索态 setSort：排序参数传给 search', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledTimes(1))
    c.setSort('name', 'asc')
    await vi.waitFor(() =>
      expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalledWith({
        query: expect.objectContaining({ sortBy: 'name', sortOrder: 'asc', page: 1 }),
      }),
    )
  })

  it('project 域未 loadRootNode：搜索无 scope 不发请求', async () => {
    const c = useUnifiedFileList('project')
    c.setSearch('图纸')
    await new Promise((r) => setTimeout(r, 350))
    expect(vi.mocked(nodeControllerSearch)).not.toHaveBeenCalled()
    expect(vi.mocked(nodeControllerGetChildren)).not.toHaveBeenCalled()
  })

  it('搜索失败：error 置加载失败文案', async () => {
    vi.mocked(nodeControllerSearch).mockRejectedValue(new Error('boom'))
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(c.error.value).toBe('加载失败'))
    expect(c.loading.value).toBe(false)
  })
})
