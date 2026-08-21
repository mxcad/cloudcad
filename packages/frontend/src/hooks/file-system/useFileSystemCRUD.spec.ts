///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
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
});
