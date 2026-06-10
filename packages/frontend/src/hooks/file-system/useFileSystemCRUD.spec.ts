///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useFileSystemCRUD } from './useFileSystemCRUD';

vi.mock('@/contexts/NotificationContext', () => ({
  useConfirmDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/api-sdk', () => ({
  fileSystemControllerCreateProject: vi.fn(),
  fileSystemControllerCreateFolder: vi.fn(),
  fileSystemControllerUpdateNode: vi.fn(),
  fileSystemControllerDeleteNode: vi.fn(),
  fileSystemControllerRestoreNode: vi.fn(),
  fileSystemControllerRestoreTrashItems: vi.fn(),
  fileSystemControllerClearTrash: vi.fn(),
}));

describe('useFileSystemCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      wrapper: MemoryRouter
    });

    expect(result.current.showCreateFolderModal).toBe(false);
    expect(typeof result.current.setShowCreateFolderModal).toBe('function');
    expect(typeof result.current.handleCreateFolder).toBe('function');
  });
});
