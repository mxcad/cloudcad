///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useFileSystemCRUD } from './useFileSystemCRUD';

vi.mock('@/contexts/NotificationContext', () => ({
  useConfirmDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/api-sdk', () => ({
  projectControllerCreateProject: vi.fn(),
  nodeControllerCreateFolder: vi.fn(),
  nodeControllerUpdateNode: vi.fn(),
  nodeControllerDeleteNode: vi.fn(),
  nodeControllerRestoreNode: vi.fn(),
  trashControllerRestoreTrashItems: vi.fn(),
  trashControllerClearTrash: vi.fn(),
}));

describe('useFileSystemCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, children),
      );
  };

  const createDefaultProps = () => ({
    urlProjectId: 'test-project-id',
    currentNode: null,
    loadData: vi.fn(),
    showToast: vi.fn(),
    selectedNodes: new Set(),
    nodes: [],
    clearSelection: vi.fn(),
    mode: 'project' as const,
  });

  it('should return expected shape with all required functions', () => {
    const { result } = renderHook(() => useFileSystemCRUD(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    expect(result.current.showCreateFolderModal).toBe(false);
    expect(typeof result.current.setShowCreateFolderModal).toBe('function');
    expect(typeof result.current.handleCreateFolder).toBe('function');
  });

  it('BUG-FS-04：重命名 101 字符 → 前端拦截（toast 中文文案，不发更新请求）', async () => {
    const props = createDefaultProps();
    const showToast = vi.fn();
    const { result } = renderHook(
      () =>
        useFileSystemCRUD({
          ...props,
          showToast,
          urlProjectId: 'test-project-id',
        }),
      { wrapper: createWrapper() },
    );
    const { nodeControllerUpdateNode } = await import('@/api-sdk');

    // 进入重命名态：设置编辑节点 + 101 字符新名（act 包裹以 flush 状态，使 handleRename 闭包拿到新值）
    act(() => {
      result.current.setEditingNode({
        id: 'node-1',
        name: 'old-name',
        isFolder: true,
        extension: '',
        parentId: null,
        projectId: 'test-project-id',
        nodeType: 'FOLDER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never);
      result.current.setFolderName('a'.repeat(101));
    });

    await act(async () => {
      await result.current.handleRename();
    });

    expect(showToast).toHaveBeenCalledWith('名称长度不能超过 100 个字符', 'error');
    expect(nodeControllerUpdateNode).not.toHaveBeenCalled();
  });
});
