import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUnifiedFileList } from './useUnifiedFileList'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  nodeControllerGetChildren: vi.fn(),
  nodeControllerGetNode: vi.fn(),
  nodeControllerSearch: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))

import {
  nodeControllerGetChildren,
  nodeControllerGetNode,
  nodeControllerSearch,
} from '@cloudcad/api-sdk/sdk.gen'

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
    localStorage.clear()
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

  // ── 位置持久化（阶段 5）──
  it('enterFolder：personal 域写入 fs_breadcrumb_personal 存档', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.enterFolder({ id: 'folder-1', name: '文件夹一' } as never)
    const saved = JSON.parse(localStorage.getItem('fs_breadcrumb_personal') ?? 'null')
    expect(saved).toEqual({ folderId: 'folder-1', breadcrumbs: [{ id: 'folder-1', name: '文件夹一' }] })
  })

  it('enterFolder：project 域存档 key 含 projectId', async () => {
    const c = useUnifiedFileList('project')
    await c.loadRootNode('proj-7')
    c.enterFolder({ id: 'folder-9', name: '目录' } as never)
    const saved = JSON.parse(localStorage.getItem('fs_breadcrumb_project_proj-7') ?? 'null')
    expect(saved?.folderId).toBe('folder-9')
    // personal key 不受 project 域影响
    expect(localStorage.getItem('fs_breadcrumb_personal')).toBeNull()
  })

  it('goBackTo(-1) 回根：currentFolderId 置根 id 并重查根子节点（R7 回归）', async () => {
    resolveWith(nodeControllerGetChildren, nodePage([{ id: 'folder-1', name: '文件夹一' }]))
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.enterFolder({ id: 'folder-1', name: '文件夹一' } as never)
    await vi.waitFor(() => expect(c.loading.value).toBe(false))
    expect(localStorage.getItem('fs_breadcrumb_personal')).not.toBeNull()
    vi.clearAllMocks()

    c.goBackTo(-1)
    // R7 修复前置 null → loadNodes 早退、列表停在旧内容；修复后=根 id
    expect(c.currentFolderId.value).toBe('space-1')
    expect(c.breadcrumbs.value).toEqual([])
    await vi.waitFor(() => expect(c.loading.value).toBe(false))
    // 回根重查根子节点（而非早退）
    expect(vi.mocked(nodeControllerGetChildren)).toHaveBeenCalledWith(
      expect.objectContaining({ path: { nodeId: 'space-1' } }),
    )
    // 回根不覆盖存档（currentFolderId===rootId 跳过持久化，仍保留上次离开位置）
    const saved = JSON.parse(localStorage.getItem('fs_breadcrumb_personal') ?? 'null')
    expect(saved?.folderId).toBe('folder-1')
  })

  it('loadRootNode：还原存档位置（节点仍存在 → getChildren 按存档加载）', async () => {
    localStorage.setItem(
      'fs_breadcrumb_personal',
      JSON.stringify({ folderId: 'saved-1', breadcrumbs: [{ id: 'saved-1', name: '存档目录' }] }),
    )
    vi.mocked(nodeControllerGetNode).mockResolvedValue({ data: { id: 'saved-1' } } as never)
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    expect(c.currentFolderId.value).toBe('saved-1')
    expect(c.breadcrumbs.value).toEqual([{ id: 'saved-1', name: '存档目录' }])
    expect(vi.mocked(nodeControllerGetChildren)).toHaveBeenCalledWith(
      expect.objectContaining({ path: { nodeId: 'saved-1' } }),
    )
  })

  it('loadRootNode：存档节点已删除 → 清存档回根目录', async () => {
    localStorage.setItem(
      'fs_breadcrumb_personal',
      JSON.stringify({ folderId: 'gone-1', breadcrumbs: [{ id: 'gone-1', name: '已删' }] }),
    )
    vi.mocked(nodeControllerGetNode).mockRejectedValue(new Error('404'))
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    expect(c.currentFolderId.value).toBe('space-1')
    expect(c.breadcrumbs.value).toEqual([])
    expect(localStorage.getItem('fs_breadcrumb_personal')).toBeNull()
    expect(vi.mocked(nodeControllerGetChildren)).toHaveBeenCalledWith(
      expect.objectContaining({ path: { nodeId: 'space-1' } }),
    )
  })

  it('loadRootNode：override 优先于存档（returnTarget 场景不读 localStorage）', async () => {
    localStorage.setItem(
      'fs_breadcrumb_personal',
      JSON.stringify({ folderId: 'saved-1', breadcrumbs: [{ id: 'saved-1', name: '存档目录' }] }),
    )
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1', {
      folderId: 'rt-1',
      breadcrumbs: [{ id: 'rt-1', name: '返回目标' }],
    })
    expect(c.currentFolderId.value).toBe('rt-1')
    expect(c.breadcrumbs.value).toEqual([{ id: 'rt-1', name: '返回目标' }])
    expect(vi.mocked(nodeControllerGetNode)).not.toHaveBeenCalled()
  })

  it('loadRootNode：存档 JSON 损坏 → 静默回根目录', async () => {
    localStorage.setItem('fs_breadcrumb_personal', '{broken json')
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    expect(c.currentFolderId.value).toBe('space-1')
    expect(vi.mocked(nodeControllerGetNode)).not.toHaveBeenCalled()
  })
})

describe('useUnifiedFileList 高级筛选（二期 d）', () => {
  let errorSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resolveWith(nodeControllerGetChildren, nodePage())
    resolveWith(nodeControllerSearch, nodePage())
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('无筛选：getChildren query 不含任何筛选键', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    expect(c.hasActiveFilters.value).toBe(false)
    const call = vi.mocked(nodeControllerGetChildren).mock.calls.at(-1)?.[0] as {
      query: Record<string, unknown>
    }
    for (const k of ['extension', 'createdAtFrom', 'createdAtTo', 'modifiedAtFrom', 'modifiedAtTo', 'sizeMin', 'sizeMax']) {
      expect(call.query[k]).toBeUndefined()
    }
  })

  it('setFilters：回第一页重查，getChildren query 带全部筛选参数', async () => {
    resolveWith(nodeControllerGetChildren, nodePage([{ id: 'f-1', name: '子目录' }], 1, 2))
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.enterFolder({ id: 'f-1', name: '子目录' } as never)
    await vi.waitFor(() => expect(c.loading.value).toBe(false))
    // 先翻页到第 2 页，验证 setFilters 重置回第 1 页
    c.loadMore()
    await vi.waitFor(() => expect(c.loading.value).toBe(false))
    expect(c.page.value).toBe(2)

    c.setFilters({ extension: 'dwg,mxweb', createdAtFrom: '2026-01-01T00:00:00.000Z', sizeMax: 1048576 })
    await vi.waitFor(() => expect(c.loading.value).toBe(false))
    expect(c.hasActiveFilters.value).toBe(true)
    expect(c.page.value).toBe(1)
    const call = vi.mocked(nodeControllerGetChildren).mock.calls.at(-1)?.[0] as {
      query: Record<string, unknown>
    }
    expect(call.query).toMatchObject({
      extension: 'dwg,mxweb',
      createdAtFrom: '2026-01-01T00:00:00.000Z',
      sizeMax: 1048576,
      page: 1,
    })
    // 未设置的筛选键不出现
    expect(call.query.createdAtTo).toBeUndefined()
    expect(call.query.sizeMin).toBeUndefined()
    expect(call.query.modifiedAtFrom).toBeUndefined()
  })

  it('搜索态 setFilters：筛选参数同时传给 search', async () => {
    const c = useUnifiedFileList('project')
    await c.loadRootNode('proj-1')
    c.setSearch('图纸')
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalled())
    vi.clearAllMocks()

    c.setFilters({ sizeMin: 1024 })
    await vi.waitFor(() => expect(vi.mocked(nodeControllerSearch)).toHaveBeenCalled())
    const call = vi.mocked(nodeControllerSearch).mock.calls.at(-1)?.[0] as {
      query: Record<string, unknown>
    }
    expect(call.query).toMatchObject({ keyword: '图纸', sizeMin: 1024, page: 1 })
    expect(call.query.sizeMax).toBeUndefined()
  })

  it('clearFilters：清空筛选并回第一页重查（query 无筛选键）', async () => {
    const c = useUnifiedFileList('personal')
    await c.loadRootNode('space-1')
    c.setFilters({ extension: 'pdf' })
    await vi.waitFor(() => expect(c.hasActiveFilters.value).toBe(true))
    vi.clearAllMocks()

    c.clearFilters()
    await vi.waitFor(() => expect(c.loading.value).toBe(false))
    expect(c.hasActiveFilters.value).toBe(false)
    expect(c.page.value).toBe(1)
    const call = vi.mocked(nodeControllerGetChildren).mock.calls.at(-1)?.[0] as {
      query: Record<string, unknown>
    }
    expect(call.query.extension).toBeUndefined()
  })
})
