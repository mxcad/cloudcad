import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useFolderTree, type FolderTreeDeps } from './useFolderTree'
import {
  nodeControllerGetChildren,
  libraryControllerGetDrawingChildren,
  libraryControllerGetBlockChildren,
} from '../api-sdk'
import { unwrap } from '../utils/apiError'

vi.mock('../api-sdk', () => ({
  nodeControllerGetChildren: vi.fn(),
  libraryControllerGetDrawingChildren: vi.fn(),
  libraryControllerGetBlockChildren: vi.fn(),
}))
vi.mock('../utils/apiError', () => ({
  unwrap: vi.fn((res: unknown) => res),
}))
vi.mock('vant', () => ({ showToast: vi.fn() }))
vi.mock('@/languages', () => ({ t: (k: string) => k }))

const mockNode = nodeControllerGetChildren as ReturnType<typeof vi.fn>
const mockDrawing = libraryControllerGetDrawingChildren as ReturnType<typeof vi.fn>
const mockBlock = libraryControllerGetBlockChildren as ReturnType<typeof vi.fn>

function nodes(payload: Array<{ id: string; name: string; isFolder: boolean }>) {
  return { data: { nodes: payload } }
}

function makeDeps(overrides: Partial<FolderTreeDeps> = {}): FolderTreeDeps {
  return {
    getTargetType: () => 'personal',
    getLibraryType: () => 'drawing',
    resolveRootId: () => 'root-1',
    getCurrentNodeId: () => 'node-9',
    onOpenPicker: vi.fn(),
    onPickerFailed: vi.fn(),
    onSelectFolder: vi.fn(),
    ...overrides,
  }
}

describe('useFolderTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadFolderChildren：普通目标走 nodeControllerGetChildren，排除当前节点并映射 FolderNode', async () => {
    mockNode.mockResolvedValue(
      nodes([
        { id: 'a', name: 'A', isFolder: true },
        { id: 'node-9', name: '当前', isFolder: true },
        { id: 'b', name: 'B', isFolder: false },
      ]),
    )
    const tree = useFolderTree(makeDeps())
    const result = await tree.loadFolderChildren('parent-1')
    expect(mockNode).toHaveBeenCalledWith({
      path: { nodeId: 'parent-1' },
      query: { nodeType: 'folder' },
    })
    expect(result).toEqual([
      { id: 'a', name: 'A', isFolder: true },
      { id: 'b', name: 'B', isFolder: false },
    ])
  })

  it('loadFolderChildren：库目标（drawing）走库专用图纸子节点接口', async () => {
    mockDrawing.mockResolvedValue(nodes([{ id: 'd', name: 'D', isFolder: true }]))
    const tree = useFolderTree(
      makeDeps({ getTargetType: () => 'library', getLibraryType: () => 'drawing' }),
    )
    const result = await tree.loadFolderChildren('lib-1')
    expect(mockDrawing).toHaveBeenCalled()
    expect(mockNode).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: 'd', name: 'D', isFolder: true }])
  })

  it('loadFolderChildren：库目标（block）走库专用图块子节点接口', async () => {
    mockBlock.mockResolvedValue(nodes([{ id: 'b', name: 'B', isFolder: true }]))
    const tree = useFolderTree(
      makeDeps({ getTargetType: () => 'library', getLibraryType: () => 'block' }),
    )
    const result = await tree.loadFolderChildren('lib-2')
    expect(mockBlock).toHaveBeenCalled()
    expect(mockNode).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: 'b', name: 'B', isFolder: true }])
  })

  it('loadFolderChildren：空 parentId 不调接口直接返回空数组', async () => {
    const tree = useFolderTree(makeDeps())
    const result = await tree.loadFolderChildren('')
    expect(mockNode).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('loadFolderChildren：接口失败吞掉返回空数组（浏览不打断）', async () => {
    mockNode.mockRejectedValue(new Error('boom'))
    const tree = useFolderTree(makeDeps())
    const result = await tree.loadFolderChildren('parent-1')
    expect(result).toEqual([])
  })

  it('openFolderPicker：无根节点显示提示、onPickerFailed 回退表单、不取数', async () => {
    const deps = makeDeps({ resolveRootId: () => '', getTargetType: () => 'project' })
    const tree = useFolderTree(deps)
    await tree.openFolderPicker()
    expect(deps.onOpenPicker).toHaveBeenCalled()
    expect(deps.onPickerFailed).toHaveBeenCalled()
    expect(mockNode).not.toHaveBeenCalled()
    expect(tree.folderLoading.value).toBe(false)
  })

  it('openFolderPicker：首次打开清空路径并加载根子节点', async () => {
    mockNode.mockResolvedValue(nodes([{ id: 'r', name: 'R', isFolder: true }]))
    const tree = useFolderTree(makeDeps())
    await tree.openFolderPicker()
    expect(tree.folderPath.value).toEqual([])
    expect(tree.folderNodes.value).toEqual([{ id: 'r', name: 'R', isFolder: true }])
    expect(tree.folderLoading.value).toBe(false)
  })

  it('openFolderPicker：有上次浏览位置则恢复路径并加载叶子节点', async () => {
    mockNode.mockResolvedValue(nodes([{ id: 'leaf', name: 'Leaf', isFolder: true }]))
    const tree = useFolderTree(makeDeps())
    // 先造一段浏览历史
    tree.folderPath.value = [{ id: 'x', name: 'X' }]
    tree.selectFolder('x')
    // 重开
    await tree.openFolderPicker()
    expect(tree.folderPath.value).toEqual([{ id: 'x', name: 'X' }])
    expect(mockNode).toHaveBeenCalledWith({
      path: { nodeId: 'x' },
      query: { nodeType: 'folder' },
    })
  })

  it('enterFolder：追加路径条目并加载该目录子节点', async () => {
    mockNode.mockResolvedValue(nodes([{ id: 'c', name: 'C', isFolder: false }]))
    const tree = useFolderTree(makeDeps())
    await tree.enterFolder('a', 'A')
    expect(tree.folderPath.value).toEqual([{ id: 'a', name: 'A' }])
    expect(tree.folderNodes.value).toEqual([{ id: 'c', name: 'C', isFolder: false }])
  })

  it('goToRoot：清空路径并加载根子节点', async () => {
    mockNode.mockResolvedValue(nodes([{ id: 'r', name: 'R', isFolder: true }]))
    const tree = useFolderTree(makeDeps())
    tree.folderPath.value = [{ id: 'a', name: 'A' }]
    await tree.goToRoot()
    expect(tree.folderPath.value).toEqual([])
    expect(mockNode).toHaveBeenCalledWith({
      path: { nodeId: 'root-1' },
      query: { nodeType: 'folder' },
    })
  })

  it('navigateToBreadcrumb：截断到目标并加载；点击末位是 no-op', async () => {
    mockNode.mockResolvedValue(nodes([]))
    const tree = useFolderTree(makeDeps())
    tree.folderPath.value = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    await tree.navigateToBreadcrumb(1)
    expect(tree.folderPath.value).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])
    expect(mockNode).not.toHaveBeenCalled()
    await tree.navigateToBreadcrumb(0)
    expect(tree.folderPath.value).toEqual([{ id: 'a', name: 'A' }])
    expect(mockNode).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      query: { nodeType: 'folder' },
    })
  })

  it('goUp：弹出末位并加载父级；空路径是 no-op', async () => {
    mockNode.mockResolvedValue(nodes([]))
    const tree = useFolderTree(makeDeps())
    await tree.goUp()
    expect(mockNode).not.toHaveBeenCalled()
    tree.folderPath.value = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    await tree.goUp()
    expect(tree.folderPath.value).toEqual([{ id: 'a', name: 'A' }])
    expect(mockNode).toHaveBeenCalledWith({
      path: { nodeId: 'a' },
      query: { nodeType: 'folder' },
    })
  })

  it('selectFolder：保存 lastFolderPath 并回调当前路径', () => {
    const deps = makeDeps()
    const tree = useFolderTree(deps)
    tree.folderPath.value = [{ id: 'a', name: 'A' }]
    tree.selectFolder('a')
    expect(tree.lastFolderPath.value).toEqual([{ id: 'a', name: 'A' }])
    expect(deps.onSelectFolder).toHaveBeenCalledWith('a', [{ id: 'a', name: 'A' }])
  })

  it('clearFolderPath：清空浏览位置', () => {
    const tree = useFolderTree(makeDeps())
    tree.folderPath.value = [{ id: 'a', name: 'A' }]
    tree.clearFolderPath()
    expect(tree.folderPath.value).toEqual([])
  })
})
