import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useTrashList } from './useTrashList'

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

  it('clear projects scope：清空全局回收站', async () => {
    resolveWith(trashControllerGetTrash, trashPage())
    const c = setup()
    await c.clear()
    expect(vi.mocked(trashControllerClearTrash)).toHaveBeenCalled()
    expect(vi.mocked(trashControllerClearProjectTrash)).not.toHaveBeenCalled()
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
