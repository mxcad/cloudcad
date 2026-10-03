import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useTrashList, resolveTrashScope, resolveTrashProjectId } from './useTrashList'

vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  trashControllerGetTrash: vi.fn(),
  trashControllerRestoreTrashItems: vi.fn(),
  trashControllerPermanentlyDeleteTrashItems: vi.fn(),
  trashControllerClearTrash: vi.fn(),
  trashControllerClearProjectTrash: vi.fn(),
  nodeControllerRestoreNode: vi.fn(),
  nodeControllerDeleteNode: vi.fn(),
}))
vi.mock('vant', () => ({
  showToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showFailToast: vi.fn(),
}))
vi.mock('@/languages', () => ({
  t: (key: string, params?: Record<string, string>) => {
    let out = key
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    return out
  },
}))
vi.mock('@/utils/apiError', () => ({
  errorKind: vi.fn(() => 'unknown'),
  errMsg: vi.fn((e: unknown, fallback: string) => {
    if (typeof e === 'string') return e
    const m = (e as { message?: unknown })?.message
    return typeof m === 'string' && m ? m : fallback
  }),
}))

import {
  trashControllerGetTrash,
  trashControllerRestoreTrashItems,
  trashControllerPermanentlyDeleteTrashItems,
  trashControllerClearTrash,
  trashControllerClearProjectTrash,
  nodeControllerRestoreNode,
  nodeControllerDeleteNode,
} from '@cloudcad/api-sdk/sdk.gen'
import { showSuccessToast, showFailToast } from 'vant'
import { errorKind } from '@/utils/apiError'

const SPACE_ID = 'space-1'

function resolveWith<T extends (...args: never[]) => unknown>(fn: T, response: unknown) {
  vi.mocked(fn).mockResolvedValue(response as never)
}

// 列表响应（与后端 TrashListResponseDto 同形）
function trashPage(nodes: unknown[] = [], page = 1, totalPages = 1) {
  return { data: { nodes, total: nodes.length, page, limit: 30, totalPages } }
}

function setup(spaceId: string | null = SPACE_ID) {
  return useTrashList(ref(spaceId))
}

describe('useTrashList 回收站数据层', () => {
  let warnSpy: { mockRestore: () => void }

  beforeEach(() => {
    vi.clearAllMocks()
    // 动作 SDK 默认成功，避免个别用例漏 mock 时挂起
    resolveWith(trashControllerRestoreTrashItems, { data: {} })
    resolveWith(trashControllerPermanentlyDeleteTrashItems, { data: {} })
    resolveWith(trashControllerClearTrash, { data: {} })
    resolveWith(trashControllerClearProjectTrash, { data: {} })
    resolveWith(nodeControllerRestoreNode, { data: {} })
    resolveWith(nodeControllerDeleteNode, { data: {} })
    warnSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('默认 projects scope：load 不带 projectId，limit 30', async () => {
    resolveWith(trashControllerGetTrash, trashPage([{ id: 'a' }]))
    const c = setup()
    await c.load()
    expect(c.scope.value).toBe('projects')
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
      query: expect.objectContaining({ projectId: undefined, page: 1, limit: 30 }),
    })
    expect(c.nodes.value).toHaveLength(1)
    expect(c.total.value).toBe(1)
  })

  it('personal scope：load 带 personalSpaceId', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setScope('personal')
    await vi.waitFor(() => expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalled())
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
      query: expect.objectContaining({ projectId: SPACE_ID }),
    })
  })

  it('personal scope 但 spaceId 未就绪：不发请求，列表置空', async () => {
    const c = setup(null)
    c.setScope('personal')
    await vi.waitFor(() => expect(c.nodes.value).toEqual([]))
    expect(vi.mocked(trashControllerGetTrash)).not.toHaveBeenCalled()
  })

  it('project scope：setScope 带 projectId 一次到位，load 带选定 projectId', async () => {
    resolveWith(trashControllerGetTrash, trashPage([{ id: 'x' }]))
    const c = setup()
    c.setScope('project', 'proj-9')
    await vi.waitFor(() => expect(c.nodes.value).toHaveLength(1))
    expect(c.selectedProjectId.value).toBe('proj-9')
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ projectId: 'proj-9' }),
    })
  })

  it('project scope 未选项目：不发请求，列表置空', async () => {
    const c = setup()
    c.setScope('project')
    await vi.waitFor(() => expect(c.nodes.value).toEqual([]))
    expect(vi.mocked(trashControllerGetTrash)).not.toHaveBeenCalled()
  })

  it('同一 project scope 换项目：只多发一次请求，不带旧 projectId', async () => {
    resolveWith(trashControllerGetTrash, trashPage([{ id: 'x' }]))
    const c = setup()
    c.setScope('project', 'proj-9')
    await vi.waitFor(() => expect(c.selectedProjectId.value).toBe('proj-9'))
    const callsBefore = vi.mocked(trashControllerGetTrash).mock.calls.length
    c.setScope('project', 'proj-10')
    await vi.waitFor(() => expect(c.selectedProjectId.value).toBe('proj-10'))
    expect(vi.mocked(trashControllerGetTrash).mock.calls.length).toBe(callsBefore + 1)
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ projectId: 'proj-10' }),
    })
  })

  it('同一 project scope 重复选同一项目：不重复请求', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setScope('project', 'proj-9')
    await vi.waitFor(() => expect(c.selectedProjectId.value).toBe('proj-9'))
    c.setScope('project', 'proj-9')
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledTimes(1)
  })

  it('clear project scope：清空选定项目子树（非全局）', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setScope('project', 'proj-9')
    await vi.waitFor(() => expect(c.selectedProjectId.value).toBe('proj-9'))
    await c.clear()
    expect(vi.mocked(trashControllerClearProjectTrash)).toHaveBeenCalledWith({ path: { projectId: 'proj-9' } })
    expect(vi.mocked(trashControllerClearTrash)).not.toHaveBeenCalled()
  })

  it('setScope 切离 project：清空选定项目 id', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setScope('project', 'proj-9')
    await vi.waitFor(() => expect(c.selectedProjectId.value).toBe('proj-9'))
    c.setScope('projects')
    await vi.waitFor(() => expect(c.scope.value).toBe('projects'))
    expect(c.selectedProjectId.value).toBeNull()
  })

  it('loadMore：翻页追加，page 递增，到底后 hasMore=false', async () => {
    resolveWith(trashControllerGetTrash, trashPage([{ id: 'a' }], 1, 2))
    const c = setup()
    await c.load()
    vi.mocked(trashControllerGetTrash).mockResolvedValueOnce(trashPage([{ id: 'b' }], 2, 2) as never)
    c.loadMore()
    await vi.waitFor(() => expect(c.nodes.value).toHaveLength(2))
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenLastCalledWith({
      query: expect.objectContaining({ page: 2 }),
    })
    expect(c.hasMore.value).toBe(false)
  })

  it('loadMore 到底不再翻页', async () => {
    resolveWith(trashControllerGetTrash, trashPage([{ id: 'a' }], 1, 1))
    const c = setup()
    await c.load()
    c.loadMore()
    expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledTimes(1)
  })

  it('setSearch：300ms 防抖后回第 1 页带 search', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setSearch('图纸')
    expect(vi.mocked(trashControllerGetTrash)).not.toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
        query: expect.objectContaining({ search: '图纸', page: 1 }),
      }),
    )
  })

  it('setSort：回第 1 页带 sortBy/sortOrder', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setSort('name', 'asc')
    await vi.waitFor(() =>
      expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
        query: expect.objectContaining({ sortBy: 'name', sortOrder: 'asc', page: 1 }),
      }),
    )
  })

  it('setFilters：扩展名筛选回第 1 页带 extension，filterActive 高亮', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setFilters({ extension: '.dwg,.dxf' })
    await vi.waitFor(() =>
      expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
        query: expect.objectContaining({ extension: '.dwg,.dxf', page: 1 }),
      }),
    )
    expect(c.filterActive.value).toBe(true)
  })

  it('setScope 切换清空扩展名筛选', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setFilters({ extension: '.dwg' })
    await vi.waitFor(() => expect(c.filterActive.value).toBe(true))
    c.setScope('personal')
    await vi.waitFor(() => expect(c.scope.value).toBe('personal'))
    expect(c.filterActive.value).toBe(false)
  })

  it('setScope 切换清空搜索词', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setSearch('abc')
    await vi.waitFor(() => expect(c.searchText.value).toBe('abc'))
    c.setScope('personal')
    await vi.waitFor(() => expect(c.scope.value).toBe('personal'))
    expect(c.searchText.value).toBe('')
    expect(c.debouncedSearch.value).toBe('')
  })

  it('restore 根节点：走批量恢复接口', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.restore({ id: 'root-1', isRoot: true })
    expect(vi.mocked(trashControllerRestoreTrashItems)).toHaveBeenCalledWith({ body: { itemIds: ['root-1'] } })
    expect(vi.mocked(nodeControllerRestoreNode)).not.toHaveBeenCalled()
  })

  it('restore 非根节点：走单节点恢复接口', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.restore({ id: 'node-1', isRoot: false })
    expect(vi.mocked(nodeControllerRestoreNode)).toHaveBeenCalledWith({ path: { nodeId: 'node-1' } })
    expect(vi.mocked(trashControllerRestoreTrashItems)).not.toHaveBeenCalled()
  })

  it('restoreBatch：批量恢复带全部 id + 计数文案', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.restoreBatch(['a', 'b'])
    expect(vi.mocked(trashControllerRestoreTrashItems)).toHaveBeenCalledWith({ body: { itemIds: ['a', 'b'] } })
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('已恢复 2 项')
  })

  it('permanentDelete 单条：nodeControllerDeleteNode permanently=true', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.permanentDelete({ id: 'n-1' })
    expect(vi.mocked(nodeControllerDeleteNode)).toHaveBeenCalledWith({
      path: { nodeId: 'n-1' },
      query: { permanently: true },
    })
  })

  it('permanentDeleteBatch：批量彻底删除带全部 id + 计数文案', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.permanentDeleteBatch(['a', 'b', 'c'])
    expect(vi.mocked(trashControllerPermanentlyDeleteTrashItems)).toHaveBeenCalledWith({
      body: { itemIds: ['a', 'b', 'c'] },
    })
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('已彻底删除 3 项')
  })

  it('openTrash：同 scope 也总是触发加载（视图挂载/上下文切换入口，区别于 setScope 幂等）', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.openTrash('projects')
    await vi.waitFor(() => expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledTimes(1))
    c.openTrash('projects')
    await vi.waitFor(() => expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledTimes(2))
  })

  it('openTrash project scope：带 projectId 一次到位', async () => {
    resolveWith(trashControllerGetTrash, trashPage([{ id: 'x' }]))
    const c = setup()
    c.openTrash('project', 'proj-9')
    await vi.waitFor(() =>
      expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
        query: expect.objectContaining({ projectId: 'proj-9' }),
      }),
    )
    expect(c.selectedProjectId.value).toBe('proj-9')
  })

  it('personal scope：spaceId 后到（watch）→ 自动补发请求', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const spaceId = ref<string | null>(null)
    const c = useTrashList(spaceId)
    c.setScope('personal')
    await vi.waitFor(() => expect(c.nodes.value).toEqual([]))
    expect(vi.mocked(trashControllerGetTrash)).not.toHaveBeenCalled()
    spaceId.value = SPACE_ID
    await vi.waitFor(() =>
      expect(vi.mocked(trashControllerGetTrash)).toHaveBeenCalledWith({
        query: expect.objectContaining({ projectId: SPACE_ID }),
      }),
    )
  })

  it('clear projects scope：清空全局回收站 + 成功文案「回收站已清空」', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.clear()
    expect(vi.mocked(trashControllerClearTrash)).toHaveBeenCalled()
    expect(vi.mocked(trashControllerClearProjectTrash)).not.toHaveBeenCalled()
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('回收站已清空')
  })

  it('clear project scope：成功文案「项目回收站已清空」（scope 专属，对齐 PC）', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.openTrash('project', 'proj-9')
    await vi.waitFor(() => expect(c.selectedProjectId.value).toBe('proj-9'))
    await c.clear()
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('项目回收站已清空')
  })

  it('clear personal scope：清空个人空间子树', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    c.setScope('personal')
    await c.clear()
    expect(vi.mocked(trashControllerClearProjectTrash)).toHaveBeenCalledWith({ path: { projectId: SPACE_ID } })
    expect(vi.mocked(trashControllerClearTrash)).not.toHaveBeenCalled()
  })

  it('动作成功后回第 1 页重载 + 成功文案', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.load()
    const callsBefore = vi.mocked(trashControllerGetTrash).mock.calls.length
    await c.restore({ id: 'n-1', isRoot: false })
    expect(vi.mocked(trashControllerGetTrash).mock.calls.length).toBe(callsBefore + 1)
    expect(vi.mocked(showSuccessToast)).toHaveBeenCalledWith('已恢复')
  })

  it('失败 403：显示权限错误文案，不显示成功', async () => {
    vi.mocked(errorKind).mockReturnValue('forbidden')
    vi.mocked(nodeControllerRestoreNode).mockRejectedValue(new Error('no perm'))
    const c = setup()
    await c.restore({ id: 'n-1', isRoot: false })
    expect(vi.mocked(showFailToast)).toHaveBeenCalledWith('没有执行此操作的权限')
    expect(vi.mocked(showSuccessToast)).not.toHaveBeenCalled()
  })

  it('失败（非 403）：透传后端本地化文案', async () => {
    vi.mocked(errorKind).mockReturnValue('unknown')
    vi.mocked(nodeControllerDeleteNode).mockRejectedValue(new Error('服务端异常'))
    const c = setup()
    await c.permanentDelete({ id: 'n-1' })
    expect(vi.mocked(showFailToast)).toHaveBeenCalledWith('服务端异常')
  })
})

describe('resolveTrashScope（入口 props → scope）', () => {
  it('传 projectId → project scope（项目详情页入口）', () => {
    expect(resolveTrashScope('proj-9', null)).toBe('project')
    expect(resolveTrashScope('proj-9', SPACE_ID)).toBe('project')
  })

  it('传 personalSpaceId（含 null：id 未就绪）→ personal scope，不回退全局', () => {
    expect(resolveTrashScope(undefined, SPACE_ID)).toBe('personal')
    // 回归：个人空间根 id 尚未取到（null）时仍停留在 personal，
    // 不得回退到 projects（否则个人 tab 误显示全局回收站，可被误清空）
    expect(resolveTrashScope(undefined, null)).toBe('personal')
  })

  it('都不传 → projects scope（项目列表 tab 入口，全局回收站）', () => {
    expect(resolveTrashScope(undefined, undefined)).toBe('projects')
  })

  it('空串 projectId 视同未传（路由参数缺失兜底）', () => {
    expect(resolveTrashScope('', undefined)).toBe('projects')
  })
})

describe('resolveTrashProjectId（scope → projectId 来源，load/clear 共用）', () => {
  it('personal → 个人空间根 id（id 未就绪 null → undefined，不回退）', () => {
    expect(resolveTrashProjectId('personal', 'proj-9', SPACE_ID)).toBe(SPACE_ID)
    expect(resolveTrashProjectId('personal', 'proj-9', null)).toBeUndefined()
  })

  it('project → 选定项目 id（未选 null → undefined）', () => {
    expect(resolveTrashProjectId('project', 'proj-9', SPACE_ID)).toBe('proj-9')
    expect(resolveTrashProjectId('project', null, SPACE_ID)).toBeUndefined()
  })

  it('projects → 无（全局回收站，projectId 不传）', () => {
    expect(resolveTrashProjectId('projects', 'proj-9', SPACE_ID)).toBeUndefined()
  })
})
