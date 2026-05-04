///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useFileSystemCRUD } from './useFileSystemCRUD';
import { projectApi } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
import { projectTrashApi } from '@/services/projectTrashApi';
import { trashApi } from '@/services/trashApi';

vi.mock('@/services/projectApi');
vi.mock('@/services/nodeApi');
vi.mock('@/services/projectTrashApi');
vi.mock('@/services/trashApi');

describe('useFileSystemCRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createDefaultProps = () => ({
    urlProjectId: 'test-project-id',
    currentNode: null,
    loadData: vi.fn(),
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    selectedNodes: new Set(),
    nodes: [],
    clearSelection: vi.fn(),
    isProjectTrashViewRef: { current: false },
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
