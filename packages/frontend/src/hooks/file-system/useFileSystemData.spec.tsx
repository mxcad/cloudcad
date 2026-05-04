///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useFileSystemData } from './useFileSystemData';
import { projectApi } from '@/services/projectApi';
import { nodeApi } from '@/services/nodeApi';
import { searchApi } from '@/services/searchApi';
import { projectTrashApi } from '@/services/projectTrashApi';

vi.mock('@/services/projectApi');
vi.mock('@/services/nodeApi');
vi.mock('@/services/searchApi');
vi.mock('@/services/projectTrashApi');

describe('useFileSystemData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createDefaultProps = () => ({
    urlProjectId: undefined,
    urlNodeId: undefined,
    isProjectRootMode: true,
    isPersonalSpaceMode: false,
    personalSpaceId: null,
    searchQuery: '',
    paginationRef: { current: { page: 1, limit: 20 } },
    showToast: vi.fn(),
    clearSelection: vi.fn(),
    setIsMultiSelectMode: vi.fn(),
    projectFilter: undefined,
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  it('should return expected shape with loading state', async () => {
    vi.mocked(projectApi.list).mockResolvedValue({
      data: { nodes: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    } as any);

    const { result } = renderHook(() => useFileSystemData(createDefaultProps()), {
      wrapper,
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.nodes).toEqual([]);
    expect(result.current.currentNode).toBe(null);
    expect(result.current.breadcrumbs).toEqual([]);
    expect(result.current.error).toBe(null);
    expect(result.current.paginationMeta).toBe(null);
    expect(typeof result.current.loadData).toBe('function');
    expect(typeof result.current.buildBreadcrumbsFromNode).toBe('function');
  });

  it('should have expected view state properties', () => {
    const { result } = renderHook(() => useFileSystemData(createDefaultProps()), {
      wrapper,
    });

    expect(typeof result.current.isTrashView).toBe('boolean');
    expect(typeof result.current.setIsTrashView).toBe('function');
    expect(typeof result.current.isProjectTrashView).toBe('boolean');
    expect(typeof result.current.setIsProjectTrashView).toBe('function');
    expect(result.current.isProjectTrashViewRef).toBeDefined();
  });

  it('should call loadData without crashing', async () => {
    vi.mocked(projectApi.list).mockResolvedValue({
      data: { nodes: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    } as any);

    const { result } = renderHook(() => useFileSystemData(createDefaultProps()), {
      wrapper,
    });

    await result.current.loadData();

    expect(projectApi.list).toHaveBeenCalled();
  });
});