///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFileSystemData } from './useFileSystemData';
import {
  fileSystemControllerGetTrash,
  fileSystemControllerGetProjects,
  fileSystemControllerSearch,
  fileSystemControllerGetRootNode,
  fileSystemControllerGetNode,
  fileSystemControllerGetChildren,
} from '@/api-sdk';

vi.mock('@/api-sdk', () => ({
  fileSystemControllerGetTrash: vi.fn(),
  fileSystemControllerGetProjects: vi.fn(),
  fileSystemControllerSearch: vi.fn(),
  fileSystemControllerGetRootNode: vi.fn(),
  fileSystemControllerGetNode: vi.fn(),
  fileSystemControllerGetChildren: vi.fn(),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

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
    pagination: { page: 1, limit: 20 },
    setPagination: vi.fn(),
    paginationRef: { current: { page: 1, limit: 20 } },
    showToast: vi.fn(),
    clearSelection: vi.fn(),
    projectFilter: undefined,
  });

  const createWrapper = () => {
    const queryClient = createTestQueryClient();
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    return Wrapper;
  };

  it('should return expected shape with loading state', async () => {
    vi.mocked(fileSystemControllerGetProjects).mockResolvedValue({
      data: { nodes: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    } as any);

    const { result } = renderHook(() => useFileSystemData(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    expect(result.current.nodes).toEqual([]);
    expect(result.current.currentNode).toBe(null);
    expect(result.current.breadcrumbs).toEqual([]);
    expect(typeof result.current.loadData).toBe('function');
    expect(typeof result.current.buildBreadcrumbsFromNode).toBe('function');
  });

  it('should have expected view state properties', () => {
    const { result } = renderHook(() => useFileSystemData(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.isTrashView).toBe('boolean');
    expect(typeof result.current.setIsTrashView).toBe('function');
  });

  it('should call loadData without crashing', async () => {
    vi.mocked(fileSystemControllerGetProjects).mockResolvedValue({
      data: { nodes: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    } as any);

    const { result } = renderHook(() => useFileSystemData(createDefaultProps()), {
      wrapper: createWrapper(),
    });

    // loadData now triggers React Query invalidation, not a direct API call
    await result.current.loadData();

    // No assertion on fileSystemControllerGetProjects being called directly,
    // because React Query handles the fetching via queryClient.invalidateQueries.
    // The mock is still set up so that if the query runs, it resolves correctly.
  });
});
