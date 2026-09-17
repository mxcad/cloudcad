import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 契约回归：图纸库/图块库的浏览列表必须走 all-files（扁平，分类下所有文件一次铺开），
 * 而不是 children（仅直接子节点）。这是 CAD 编辑器侧边栏的行为（useLibraryQuery
 * flatMode=true）：分类本身就是目录结构，浏览列表里不做文件夹下钻。
 *
 * 注：children 是 LibraryManager 管理页层级浏览用的；库浏览抽屉/侧边栏用 all-files。
 * 上一轮 bug1 曾把方向记反（认为 children 才"与 PC 一致"），实际对的是管理页而非侧边栏。
 * 见 docs/adr/0062-mobile-app-shell-architecture.md。
 */
vi.mock('@cloudcad/api-sdk/sdk.gen', () => ({
  libraryControllerGetDrawingLibrary: vi.fn(),
  libraryControllerGetDrawingCategories: vi.fn(),
  libraryControllerGetDrawingChildren: vi.fn(),
  libraryControllerGetDrawingAllFiles: vi.fn(),
  libraryControllerGetBlockLibrary: vi.fn(),
  libraryControllerGetBlockCategories: vi.fn(),
  libraryControllerGetBlockChildren: vi.fn(),
  libraryControllerGetBlockAllFiles: vi.fn(),
}))

import * as sdk from '@cloudcad/api-sdk/sdk.gen'
import { useLibrary } from './useLibrary'

const FOLDER = {
  id: 'cat-1',
  name: '交通',
  nodeType: 'FOLDER',
  isFolder: true,
  isRoot: false,
  ownerId: 'owner-1',
  createdAt: '2026-04-28T00:00:00.000Z',
  updatedAt: '2026-04-28T00:00:00.000Z',
}

const FLAT_FILE = {
  id: 'file-1',
  name: '总平面图.dwg',
  nodeType: 'FILE',
  isFolder: false,
  isRoot: false,
  ownerId: 'owner-1',
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
}

const SDK = {
  drawing: {
    lib: sdk.libraryControllerGetDrawingLibrary,
    cats: sdk.libraryControllerGetDrawingCategories,
    children: sdk.libraryControllerGetDrawingChildren,
    allFiles: sdk.libraryControllerGetDrawingAllFiles,
  },
  block: {
    lib: sdk.libraryControllerGetBlockLibrary,
    cats: sdk.libraryControllerGetBlockCategories,
    children: sdk.libraryControllerGetBlockChildren,
    allFiles: sdk.libraryControllerGetBlockAllFiles,
  },
} as const

describe('useLibrary 库域列表数据源', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it.each(['drawing', 'block'] as const)(
    '列表走 all-files（扁平铺开分类下所有文件），不走 children（%s）',
    async (type) => {
      const s = SDK[type]

      vi.mocked(s.lib).mockResolvedValue({
        data: { id: 'root-1', name: '公共资源库', nodeType: 'LIBRARY_DRAWING' },
        error: undefined,
      } as never)
      vi.mocked(s.cats).mockResolvedValue({
        data: { categories: [] },
        error: undefined,
      } as never)
      vi.mocked(s.children).mockResolvedValue({
        data: { nodes: [FOLDER], total: 10, page: 1, limit: 30, totalPages: 1 },
        error: undefined,
      } as never)
      vi.mocked(s.allFiles).mockResolvedValue({
        data: { nodes: [FLAT_FILE], total: 16313, page: 1, limit: 30, totalPages: 544 },
        error: undefined,
      } as never)

      const library = useLibrary(type)
      await library.fetchRootAndCategories()
      await library.loadNodes()

      expect(s.lib).toHaveBeenCalledWith({})
      expect(s.allFiles).toHaveBeenCalledWith({
        path: { nodeId: 'root-1' },
        query: { page: 1, limit: 30 },
      })
      expect(s.children).not.toHaveBeenCalled()
      expect(library.nodes.value).toEqual([FLAT_FILE])
    }
  )

  it('搜索条件下推 search 参数', async () => {
    const s = SDK.drawing

    vi.mocked(s.lib).mockResolvedValue({
      data: { id: 'root-1', name: '公共资源库', nodeType: 'LIBRARY_DRAWING' },
      error: undefined,
    } as never)
    vi.mocked(s.cats).mockResolvedValue({ data: { categories: [] }, error: undefined } as never)
    vi.mocked(s.allFiles).mockResolvedValue({
      data: { nodes: [], total: 0, page: 1, limit: 30, totalPages: 1 },
      error: undefined,
    } as never)

    const library = useLibrary('drawing')
    await library.fetchRootAndCategories()
    library.setSearch('桥架')
    // setSearch 带 300ms 防抖
    await vi.waitFor(() => expect(s.allFiles).toHaveBeenCalled())

    expect(s.allFiles).toHaveBeenCalledWith({
      path: { nodeId: 'root-1' },
      query: { page: 1, limit: 30, search: '桥架' },
    })
  })
})

describe('useLibrary 不得静默空态', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const CATS = {
    categories: [
      {
        level: 0,
        items: [{ id: 'cat-1', name: '交通', parentId: 'root-1', hasChildren: true }],
      },
    ],
  }

  function stubOk() {
    const s = SDK.drawing
    vi.mocked(s.lib).mockResolvedValue({
      data: { id: 'root-1', name: '公共图纸库', nodeType: 'LIBRARY_DRAWING' },
      error: undefined,
    } as never)
    vi.mocked(s.cats).mockResolvedValue({ data: CATS, error: undefined } as never)
    vi.mocked(s.allFiles).mockResolvedValue({
      data: { nodes: [FLAT_FILE], total: 1, page: 1, limit: 30, totalPages: 1 },
      error: undefined,
    } as never)
    return s
  }

  it('getLibrary 返回 error 时必须落到错误态，而不是空态', async () => {
    const s = SDK.drawing
    // SDK 对非 2xx 只填 error、不抛异常，data 为 undefined
    vi.mocked(s.lib).mockResolvedValue({ error: { message: 'forbidden' }, data: undefined } as never)
    vi.mocked(s.cats).mockResolvedValue({ data: CATS, error: undefined } as never)

    const library = useLibrary('drawing')
    const ok = await library.fetchRootAndCategories()

    expect(ok).toBe(false)
    expect(library.error.value).toBeTruthy()
    // 抛出早于 rootId 赋值，仍须保持"无有效根节点"（null 或 ''）
    expect(library.rootId.value ?? '').toBe('')
  })

  it('localStorage 里已失效的分类 ID 必须回退到"全部"并查根节点', async () => {
    // 失效分类 ID 若不回退会查不到目标节点而永久卡空态
    localStorage.setItem(
      'library_category_path_drawing',
      JSON.stringify(['ghost-1', 'all', 'all']),
    )
    const s = stubOk()

    const library = useLibrary('drawing')
    await library.fetchRootAndCategories()
    await library.loadNodes()

    expect(library.selectedPath.value).toEqual(['all', 'all', 'all'])
    expect(localStorage.getItem('library_category_path_drawing')).toBe(
      JSON.stringify(['all', 'all', 'all']),
    )
    expect(s.allFiles).toHaveBeenCalledWith({
      path: { nodeId: 'root-1' },
      query: { page: 1, limit: 30 },
    })
    expect(library.nodes.value).toEqual([FLAT_FILE])
  })

  it('仍然有效的已保存分类必须原样保留并直接查询', async () => {
    localStorage.setItem(
      'library_category_path_drawing',
      JSON.stringify(['cat-1', 'all', 'all']),
    )
    const s = stubOk()

    const library = useLibrary('drawing')
    await library.fetchRootAndCategories()
    await library.loadNodes()

    expect(library.selectedPath.value).toEqual(['cat-1', 'all', 'all'])
    expect(s.allFiles).toHaveBeenCalledWith({
      path: { nodeId: 'cat-1' },
      query: { page: 1, limit: 30 },
    })
  })
})
