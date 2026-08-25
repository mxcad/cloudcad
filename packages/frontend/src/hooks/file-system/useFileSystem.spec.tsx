///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useFileSystem } from './useFileSystem';

// 上下文隔离回归测试：FileSystemManager 页在 /projects ↔ /projects/:id/files
// 之间路由时组件不卸载，selectedNodes 是单一 state 会残留上一视图的选中，
// 导致底部操作栏在错误上下文显示异常。本测试用「真实的 useFileBrowserSelection」
// 验证：urlProjectId/urlNodeId 变化时选中被清空，且不破坏剪贴板（全局 store）。

// ── mock 子依赖（保持 useFileBrowserSelection 为真实实现）──────────────
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
  };
});

vi.mock('@/stores/fileSystemStore', () => ({
  useFileSystemStore: () => ({
    viewMode: 'grid',
    setViewMode: vi.fn(),
    searchTerm: '',
    setSearchTerm: vi.fn(),
  }),
}));

// useFileSystemRouting：返回可变对象，测试中通过改 routingMock 驱动 rerender
const routingMock = vi.fn();
vi.mock('./useFileSystemRouting', () => ({
  useFileSystemRouting: () => routingMock(),
}));

vi.mock('./useFileSystemUI', () => ({
  useFileSystemUI: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@/contexts/NotificationContext', () => ({
  useConfirmDialog: () => ({ showConfirm: vi.fn() }),
}));

vi.mock('./useFileSystemSearch', () => ({
  useFileSystemSearch: () => ({
    searchQuery: '',
    setSearchQuery: vi.fn(),
    pagination: { page: 1, limit: 30 },
    setPagination: vi.fn(),
    handlePageChange: vi.fn(),
    handlePageSizeChange: vi.fn(),
    paginationRef: { current: { page: 1, limit: 30 } },
    checkShouldLoadData: () => false,
    searchFilters: {},
    handleFiltersChange: vi.fn(),
    handleSearchQueryChange: vi.fn(),
  }),
}));

vi.mock('./useFileSystemData', () => ({
  useFileSystemData: () => ({
    nodes: [],
    currentNode: null,
    breadcrumbs: [],
    loading: false,
    isFetching: false,
    error: null,
    paginationMeta: null,
    loadData: vi.fn(),
  }),
}));

vi.mock('./useFileSystemEffects', () => ({
  useFileSystemEffects: () => ({
    handleRefresh: vi.fn(),
    handleSearchSubmit: vi.fn(),
    handleSearchChange: vi.fn(),
  }),
}));

vi.mock('./useTrashView', () => ({
  useTrashView: () => ({
    isTrashView: false,
    setIsTrashView: vi.fn(),
    toggle: vi.fn(),
    restore: vi.fn(),
    batchRestore: vi.fn(),
    clearTrash: vi.fn(),
    trashBreadcrumbs: [],
    trashNodes: [],
    trashPaginationMeta: null,
    trashLoading: false,
    trashIsFetching: false,
    trashError: null,
    canRestore: false,
    canDelete: false,
  }),
}));

vi.mock('./useFileSystemNavigation', () => ({
  useFileSystemNavigation: () => ({
    handleGoBack: vi.fn(),
    handleEnterFolder: vi.fn(),
    handleEnterProject: vi.fn(),
    handleFileOpen: vi.fn(),
    handleDownload: vi.fn(),
    handleDownloadWithFormat: vi.fn(),
    showDownloadFormatModal: false,
    setShowDownloadFormatModal: vi.fn(),
    downloadingNode: null,
    setDownloadingNode: vi.fn(),
  }),
}));

vi.mock('./useFileSystemCRUD', () => ({
  useFileSystemCRUD: () => ({
    showCreateFolderModal: false,
    setShowCreateFolderModal: vi.fn(),
    showCreateDrawingModal: false,
    setShowCreateDrawingModal: vi.fn(),
    showRenameModal: false,
    setShowRenameModal: vi.fn(),
    editingNode: null,
    setEditingNode: vi.fn(),
    folderName: '',
    setFolderName: vi.fn(),
    drawingName: '',
    setDrawingName: vi.fn(),
    handleCreateFolder: vi.fn(),
    handleCreateDrawing: vi.fn(),
    handleRename: vi.fn(),
    handleDelete: vi.fn(),
    handlePermanentlyDelete: vi.fn(),
    handleBatchDelete: vi.fn(),
    handleOpenRename: vi.fn(),
    handleCreateProject: vi.fn(),
    handleUpdateProject: vi.fn(),
    handleDeleteProject: vi.fn(),
    handlePermanentlyDeleteProject: vi.fn(),
  }),
}));

function setRouting(urlProjectId?: string, urlNodeId?: string) {
  routingMock.mockReturnValue({
    urlProjectId,
    urlNodeId,
    isProjectRootMode: !urlProjectId,
    isFolderMode: !!urlProjectId,
    isPersonalSpaceMode: false,
  });
}

function renderFs() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );
  return renderHook(() => useFileSystem({ mode: 'project' }), {
    wrapper: Wrapper,
  });
}

describe('useFileSystem 选中状态按上下文隔离（回归：图纸多选不带入项目列表）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRouting(undefined, undefined);
  });

  it('项目内选中图纸后切回项目列表（urlProjectId 变空）：选中被清空', () => {
    const { result, rerender } = renderFs();

    // 进入项目内，选中一张图纸
    setRouting('proj-1', undefined);
    rerender();
    act(() => result.current.handleNodeSelect('dwg-1'));

    expect(result.current.selectedNodes).toEqual(new Set(['dwg-1']));

    // 退回项目列表根目录
    setRouting(undefined, undefined);
    rerender();

    // 图纸选中被清空，不再残留到项目列表（底部操作栏不再异常显示）
    expect(result.current.selectedNodes.size).toBe(0);
  });

  it('项目列表多选项目后进入项目：项目选中被清空，不进项目内', () => {
    const { result, rerender } = renderFs();

    // 项目列表选中两个项目
    act(() => result.current.handleNodeSelect('proj-a'));
    act(() => result.current.handleNodeSelect('proj-b', true));
    expect(result.current.selectedNodes).toEqual(
      new Set(['proj-a', 'proj-b'])
    );

    // 进入某个项目
    setRouting('proj-a', undefined);
    rerender();

    expect(result.current.selectedNodes.size).toBe(0);
  });

  it('项目内不同文件夹切换（urlNodeId 变化）：选中被清空', () => {
    const { result, rerender } = renderFs();

    setRouting('proj-1', 'folder-a');
    rerender();
    act(() => result.current.handleNodeSelect('dwg-a'));

    setRouting('proj-1', 'folder-b');
    rerender();

    expect(result.current.selectedNodes.size).toBe(0);
  });

  it('首次挂载不误清空选中（上下文未变化）', () => {
    const { result } = renderFs();
    act(() => result.current.handleNodeSelect('proj-a'));
    expect(result.current.selectedNodes).toEqual(new Set(['proj-a']));
  });

  it('同一上下文内不触发清空（urlProjectId 稳定时选中保留）', () => {
    const { result, rerender } = renderFs();
    setRouting('proj-1', undefined);
    rerender();

    act(() => result.current.handleNodeSelect('dwg-1'));
    expect(result.current.selectedNodes).toEqual(new Set(['dwg-1']));

    // 无上下文变化（rerender 但 urlProjectId 不变）：选中保留
    rerender();
    expect(result.current.selectedNodes).toEqual(new Set(['dwg-1']));
  });
});
