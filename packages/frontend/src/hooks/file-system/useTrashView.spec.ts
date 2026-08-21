///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTrashView } from './useTrashView';
import {
  trashControllerGetTrash,
  trashControllerRestoreTrashItems,
  trashControllerClearTrash,
  trashControllerClearProjectTrash,
  nodeControllerRestoreNode,
  nodeControllerBatchDeleteNodes,
  nodeControllerGetNode,
} from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';

const { mockPushAction, mockClearStack } = vi.hoisted(() => ({
  mockPushAction: vi.fn(),
  mockClearStack: vi.fn(),
}));

vi.mock('@/api-sdk', () => ({
  trashControllerGetTrash: vi.fn(),
  trashControllerRestoreTrashItems: vi.fn(),
  trashControllerClearTrash: vi.fn(),
  trashControllerClearProjectTrash: vi.fn(),
  nodeControllerRestoreNode: vi.fn(),
  nodeControllerBatchDeleteNodes: vi.fn(),
  nodeControllerGetNode: vi.fn(),
}));

vi.mock('@/stores/fileSystemUndoRedoStore', () => ({
  useFileSystemUndoRedoStore: vi.fn((selector: unknown) =>
    (selector as (s: unknown) => unknown)({
      pushAction: mockPushAction,
      clearStack: mockClearStack,
    })
  ),
}));

const createNode = (overrides: Partial<FileSystemNode>): FileSystemNode =>
  ({
    id: 'n1',
    name: 'test.dwg',
    nodeType: 'FILE',
    isRoot: false,
    isFolder: false,
    parentId: 'p1',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as FileSystemNode;

describe('useTrashView', () => {
  let showConfirm: ReturnType<typeof vi.fn>;
  let confirmHandler: (() => void | Promise<void>) | null;
  let setStoreSearchTerm: ReturnType<typeof vi.fn>;
  let setPagination: ReturnType<typeof vi.fn>;
  let refresh: ReturnType<typeof vi.fn>;
  let loadData: ReturnType<typeof vi.fn>;
  let clearSelectionRef: { current: ReturnType<typeof vi.fn> };
  let selectedNodesRef: { current: Set<string> };

  const createTestQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  const createWrapper = () => {
    const queryClient = createTestQueryClient();
    return ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
  };

  const createDefaultProps = () => ({
    isProjectRootMode: false,
    isPersonalSpaceMode: false,
    urlProjectId: 'project-1',
    urlNodeId: undefined,
    searchQuery: '',
    searchFilters: {},
    pagination: { page: 1, limit: 20 },
    setPagination,
    showToast: vi.fn(),
    showConfirm,
    selectedNodesRef,
    clearSelectionRef,
    setStoreSearchTerm,
    refresh,
    loadData,
    currentNode: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    confirmHandler = null;
    showConfirm = vi.fn(
      (
        _title: string,
        _message: string,
        onConfirm: () => void | Promise<void>
      ) => {
        confirmHandler = onConfirm;
      }
    );
    setStoreSearchTerm = vi.fn();
    setPagination = vi.fn();
    refresh = vi.fn();
    loadData = vi.fn();
    clearSelectionRef = { current: vi.fn() };
    selectedNodesRef = { current: new Set<string>() };
    vi.mocked(trashControllerGetTrash).mockResolvedValue({
      data: {
        nodes: [{ id: 'trash-1', name: 'deleted.dwg' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    } as never);
  });

  it('toggle 切换视图并保持副作用顺序（清空搜索 → 重置分页 → 刷新）', () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    expect(result.current.isTrashView).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isTrashView).toBe(true);
    expect(setStoreSearchTerm).toHaveBeenCalledWith('');
    expect(setPagination).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isTrashView).toBe(false);
  });

  it('门控派生：trash 视图下 canRestore/canDelete 可用（供 props 层与权限派生双条件消费）', async () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    expect(result.current.canRestore).toBe(false);
    expect(result.current.canDelete).toBe(false);

    act(() => {
      result.current.toggle();
    });

    await waitFor(() => expect(result.current.trashNodes).toHaveLength(1));

    expect(result.current.canRestore).toBe(true);
    expect(result.current.canDelete).toBe(true);
  });

  it('restore 单节点：确认后调用恢复接口并刷新（普通节点走 nodeControllerRestoreNode）', async () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });
    const node = createNode({ id: 'n1', name: 'test.dwg' });

    act(() => {
      result.current.restore(node);
    });

    expect(showConfirm).toHaveBeenCalled();
    await act(async () => {
      await confirmHandler?.();
    });

    expect(nodeControllerRestoreNode).toHaveBeenCalledWith({
      path: { nodeId: 'n1' },
      throwOnError: true,
    });
    expect(loadData).toHaveBeenCalled();
  });

  it('restore 项目节点：走 trashControllerRestoreTrashItems', async () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });
    const node = createNode({ id: 'proj-1', isRoot: true, isFolder: true });

    act(() => {
      result.current.restore(node);
    });

    await act(async () => {
      await confirmHandler?.();
    });

    expect(trashControllerRestoreTrashItems).toHaveBeenCalledWith({
      body: { itemIds: ['proj-1'] },
      throwOnError: true,
    } as never);
    expect(loadData).toHaveBeenCalled();
  });

  it('batchRestore：确认后批量恢复并联动 undo 与选择清理', async () => {
    selectedNodesRef.current = new Set(['a', 'b']);
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.batchRestore();
    });

    expect(showConfirm).toHaveBeenCalled();
    await act(async () => {
      await confirmHandler?.();
    });

    expect(trashControllerRestoreTrashItems).toHaveBeenCalledWith({
      body: { itemIds: ['a', 'b'] },
      throwOnError: true,
    } as never);
    expect(mockPushAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'delete',
        nodeIds: ['a', 'b'],
      })
    );
    expect(clearSelectionRef.current).toHaveBeenCalled();
    expect(loadData).toHaveBeenCalled();
  });

  it('batchRestore：无选中时直接返回', () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.batchRestore();
    });

    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('clearTrash：带 projectId 走项目清空接口并清空 undo 栈', async () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.clearTrash('project-1');
    });

    await act(async () => {
      await confirmHandler?.();
    });

    expect(trashControllerClearProjectTrash).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      throwOnError: true,
    });
    expect(trashControllerClearTrash).not.toHaveBeenCalled();
    expect(mockClearStack).toHaveBeenCalled();
    expect(loadData).toHaveBeenCalled();
  });

  it('clearTrash：无 projectId 走全局清空接口', async () => {
    const { result } = renderHook(() => useTrashView(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.clearTrash();
    });

    await act(async () => {
      await confirmHandler?.();
    });

    expect(trashControllerClearTrash).toHaveBeenCalledWith({
      throwOnError: true,
    });
    expect(trashControllerClearProjectTrash).not.toHaveBeenCalled();
    expect(loadData).toHaveBeenCalled();
  });
});
