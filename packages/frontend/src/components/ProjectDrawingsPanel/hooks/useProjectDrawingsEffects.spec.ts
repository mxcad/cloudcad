///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { nodeControllerGetNode } from '@/api-sdk';
import { useProjectDrawingsEffects } from './useProjectDrawingsEffects';
import type { UseProjectDrawingsDataReturn } from './useProjectDrawingsData';

vi.mock('@/api-sdk', () => ({
  nodeControllerGetNode: vi.fn(),
}));
vi.mock('@/hooks/file-system', () => ({
  useSelectionShortcuts: vi.fn(),
}));
vi.mock('@/utils/errorHandler', () => ({
  handleError: vi.fn(),
}));
vi.mock('@/languages', () => ({
  t: (m: string) => m,
}));

function makeMockData(overrides: Record<string, unknown> = {}) {
  const loadNodes = vi.fn();
  const checkSkipVisibilityReload = vi.fn(() => false);
  const data = {
    selectedProjectId: null,
    setSelectedProjectId: vi.fn(),
    breadcrumb: [],
    setBreadcrumb: vi.fn(),
    resetNodes: vi.fn(),
    loadNodes,
    loadNodesRef: { current: vi.fn() },
    buildBreadcrumbPathRef: { current: vi.fn() },
    isLibraryMode: true,
    getCategoryNodeId: () => 'node-1',
    selectedCategoryPath: ['all'],
    libraryRootId: 'lib-1',
    loadRootId: 'lib-1',
    listInitializedRef: { current: true },
    searchQuery: '',
    setSearchQuery: vi.fn(),
    setCurrentPage: vi.fn(),
    currentPage: 2,
    nodes: [],
    checkSkipVisibilityReload,
    loadNodesError: null,
    showToast: vi.fn(),
    undoStack: [],
    redoStack: [],
    clearMultiSelection: vi.fn(),
    categoriesLoaded: true,
    fileBrowser: {
      clipboard: {
        copy: vi.fn(),
        cut: vi.fn(),
        paste: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
      },
    },
    ...overrides,
  } as unknown as UseProjectDrawingsDataReturn;
  return { data, loadNodes, checkSkipVisibilityReload };
}

function renderEffects(
  data: UseProjectDrawingsDataReturn,
  props: {
    visible: boolean;
    projectId?: string;
    parentId?: string | null;
    tabId?: string;
  } = { visible: true }
) {
  return renderHook(
    ({
      visible,
      projectId,
      parentId,
      tabId,
    }: {
      visible: boolean;
      projectId?: string;
      parentId?: string | null;
      tabId?: string;
    }) =>
      useProjectDrawingsEffects({
        data,
        projectId,
        visible,
        isPersonalSpace: false,
        personalSpaceId: null,
        parentId,
        tabId,
        libraryType: 'drawing',
      }),
    { initialProps: props }
  );
}

describe('useProjectDrawingsEffects — 可见性恢复（防滚动加载被 replace 冲掉）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nodes 变化（滚动加载 append/prepend 合并后）不触发重载', () => {
    const { data, loadNodes } = makeMockData();
    const { rerender } = renderEffects(data);
    loadNodes.mockClear();

    // 初始挂载：库模式初始化由 listInitializedRef 管理，本 effect 不干预
    expect(loadNodes).not.toHaveBeenCalled();

    // 滚动加载数据到位：loader.nodes 变化（30 → 60 项）
    rerender({ visible: true });

    // 回归点：旧实现 deps 含 nodes，append 后触发 replace 重载冲掉追加的列表
    expect(loadNodes).not.toHaveBeenCalled();
  });

  it('visible 从 false→true 翻转时重载当前页（不重置页码）', () => {
    const { data, loadNodes } = makeMockData();
    const { rerender } = renderEffects(data, { visible: false });
    loadNodes.mockClear();

    // 隐藏期间不重载
    expect(loadNodes).not.toHaveBeenCalled();

    // 切回可见：重载当前页（currentPage=2，replace 模式）
    rerender({ visible: true });
    expect(loadNodes).toHaveBeenCalledWith('node-1', 2, '', false);
  });

  it('visible 保持 true 时搜索/页码变化不触发可见性重载（分类变化由分类选择 effect 处理）', () => {
    const { data, loadNodes } = makeMockData();
    const { rerender } = renderEffects(data);
    loadNodes.mockClear();

    // 模拟搜索/页码变化（visible 未翻转 → 可见性恢复 effect 不应重载）
    data.currentPage = 3;
    data.searchQuery = 'abc';
    rerender({ visible: true });

    expect(loadNodes).not.toHaveBeenCalled();
  });

  it('checkSkipVisibilityReload 为 true 时跳过重载（本地乐观操作后）', () => {
    const { data, loadNodes, checkSkipVisibilityReload } = makeMockData();
    checkSkipVisibilityReload.mockReturnValue(true);
    const { rerender } = renderEffects(data, { visible: false });
    loadNodes.mockClear();

    rerender({ visible: true });
    expect(loadNodes).not.toHaveBeenCalled();
  });

  it('非库模式（项目/个人空间）不参与可见性恢复重载', () => {
    const { data, loadNodes } = makeMockData({ isLibraryMode: false });
    const { rerender } = renderEffects(data, { visible: false });

    rerender({ visible: true });
    expect(loadNodes).not.toHaveBeenCalled();
  });
});

describe('useProjectDrawingsEffects — 打开图纸后目录只加载一次（防项目根初始化覆盖）', () => {
  const openFilePath = [
    { id: 'proj-root', name: '项目' },
    { id: 'folder-1', name: '图纸目录' },
  ];
  const projectRootOnly = [{ id: 'proj-root', name: '项目' }];

  function makeProjectData(overrides: Record<string, unknown> = {}) {
    const { data } = makeMockData({ isLibraryMode: false, ...overrides });
    data.buildBreadcrumbPathRef.current = vi
      .fn()
      .mockResolvedValue(openFilePath);
    return data;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nodeControllerGetNode).mockResolvedValue({
      data: { id: 'proj-root', name: '项目' },
      error: null,
    });
  });

  it('按 parentId 导航后，导航写入的 selectedProjectId 不再触发项目根初始化', async () => {
    const data = makeProjectData();
    const { rerender } = renderEffects(data, {
      visible: true,
      parentId: 'folder-1',
      tabId: 'my-project',
    });

    await vi.waitFor(() => {
      expect(data.setSelectedProjectId).toHaveBeenCalledWith('proj-root');
    });
    expect(data.setBreadcrumb).toHaveBeenCalledWith(openFilePath);
    expect(data.loadNodesRef.current).toHaveBeenCalledWith('folder-1');

    // 回归点：导航写的 selectedProjectId 会让项目根初始化 effect 重跑，
    // 旧实现会 setBreadcrumb([项目根]) + loadNodes('proj-root')，把正确目录切走、高亮丢失
    data.selectedProjectId = 'proj-root';
    rerender({ visible: true, parentId: 'folder-1', tabId: 'my-project' });

    expect(nodeControllerGetNode).not.toHaveBeenCalled();
    expect(data.loadNodes).not.toHaveBeenCalledWith('proj-root');
    expect(data.setBreadcrumb).not.toHaveBeenCalledWith(projectRootOnly);
  });

  it('项目根初始化请求返回晚于 parentId 导航时结果作废', async () => {
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      return {
        promise: new Promise<T>((r) => {
          resolve = r;
        }),
        resolve,
      };
    };
    const getNodeReq = deferred<{
      data: { id: string; name: string };
      error: null;
    }>();
    const pathReq = deferred<{ id: string; name: string }[]>();

    const data = makeProjectData({ selectedProjectId: 'proj-root' });
    data.buildBreadcrumbPathRef.current = vi.fn(() => pathReq.promise);
    vi.mocked(nodeControllerGetNode).mockReturnValue(getNodeReq.promise);

    renderEffects(data, {
      visible: true,
      parentId: 'folder-1',
      tabId: 'my-project',
    });

    await act(async () => {
      pathReq.resolve(openFilePath);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(data.loadNodesRef.current).toHaveBeenCalledWith('folder-1');

    // 回归点：在飞的项目根请求后返回会覆盖正确目录
    await act(async () => {
      getNodeReq.resolve({
        data: { id: 'proj-root', name: '项目' },
        error: null,
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(data.setBreadcrumb).not.toHaveBeenCalledWith(projectRootOnly);
    expect(data.loadNodes).not.toHaveBeenCalledWith('proj-root');
  });

  it('回到项目列表后重新进入项目仍可加载项目根（用户导航不被一并禁掉）', async () => {
    const data = makeProjectData();
    const { rerender } = renderEffects(data, {
      visible: true,
      parentId: 'folder-1',
      tabId: 'my-project',
    });

    await vi.waitFor(() => {
      expect(data.setSelectedProjectId).toHaveBeenCalledWith('proj-root');
    });

    // 导航写入的 selectedProjectId 生效（真实组件里由 React state 落地）
    data.selectedProjectId = 'proj-root';
    rerender({ visible: true, parentId: 'folder-1', tabId: 'my-project' });

    // 用户返回项目列表：目录归属声明复位
    data.selectedProjectId = null;
    rerender({ visible: true, parentId: 'folder-1', tabId: 'my-project' });

    // 重新进入同一项目：仍须加载项目根
    data.selectedProjectId = 'proj-root';
    rerender({ visible: true, parentId: 'folder-1', tabId: 'my-project' });
    expect(nodeControllerGetNode).toHaveBeenCalledWith({
      path: { nodeId: 'proj-root' },
    });
  });
});
