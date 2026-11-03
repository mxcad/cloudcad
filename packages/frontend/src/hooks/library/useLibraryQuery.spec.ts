///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetDrawingNode,
} from '@/api-sdk';
import { useLibraryQuery } from './useLibraryQuery';

vi.mock('@/api-sdk', () => ({
  libraryControllerGetDrawingLibrary: vi.fn(),
  libraryControllerGetDrawingChildren: vi.fn(),
  libraryControllerGetDrawingAllFiles: vi.fn(),
  libraryControllerGetDrawingNode: vi.fn(),
  libraryControllerGetBlockLibrary: vi.fn(),
  libraryControllerGetBlockChildren: vi.fn(),
  libraryControllerGetBlockAllFiles: vi.fn(),
  libraryControllerGetBlockNode: vi.fn(),
}));
vi.mock('@/languages', () => ({
  t: (m: string) => m,
}));

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

function stubRoot() {
  vi.mocked(libraryControllerGetDrawingLibrary).mockResolvedValue({
    data: { id: 'root-1', name: '公共图纸库' },
    error: undefined,
  } as never);
}

describe('useLibraryQuery 搜索范围', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubRoot();
    vi.mocked(libraryControllerGetDrawingAllFiles).mockResolvedValue({
      data: { nodes: [], total: 0, page: 1, limit: 30, totalPages: 0 },
      error: undefined,
    } as never);
    vi.mocked(libraryControllerGetDrawingNode).mockResolvedValue({
      data: { id: 'cat-1', name: '其它' },
      error: undefined,
    } as never);
  });

  it('搜索在「当前分类/目录」子树内进行（传当前 nodeId，而非库根）', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useLibraryQuery({
          libraryType: 'drawing',
          nodeId: 'cat-1',
          page: 1,
          limit: 30,
          search: '天',
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(libraryControllerGetDrawingAllFiles).toHaveBeenCalled()
    );

    expect(libraryControllerGetDrawingAllFiles).toHaveBeenCalledWith({
      path: { nodeId: 'cat-1' },
      query: {
        page: 1,
        limit: 30,
        search: '天',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    });
    // 修复前错传库根：断言其不落入根节点
    expect(libraryControllerGetDrawingAllFiles).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: { nodeId: 'root-1' } })
    );
    expect(result.current.libraryId).toBe('root-1');
  });

  it('未进入任何分类（nodeId 为空）时搜索回退到库根', async () => {
    const wrapper = createWrapper();
    renderHook(
      () =>
        useLibraryQuery({
          libraryType: 'drawing',
          nodeId: undefined,
          page: 1,
          limit: 30,
          search: '天',
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(libraryControllerGetDrawingAllFiles).toHaveBeenCalled()
    );

    expect(libraryControllerGetDrawingAllFiles).toHaveBeenCalledWith({
      path: { nodeId: 'root-1' },
      query: {
        page: 1,
        limit: 30,
        search: '天',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    });
  });

  it('无搜索时列表加载用当前 nodeId（children/allFiles），不受搜索改动影响', async () => {
    const wrapper = createWrapper();
    renderHook(
      () =>
        useLibraryQuery({
          libraryType: 'drawing',
          nodeId: 'cat-1',
          page: 1,
          limit: 30,
          search: '',
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(libraryControllerGetDrawingAllFiles).toHaveBeenCalled()
    );

    // flatMode 默认 true：非搜索列表走 getAllFiles（无 search 参数）
    expect(libraryControllerGetDrawingAllFiles).toHaveBeenCalledWith({
      path: { nodeId: 'cat-1' },
      query: { page: 1, limit: 30, sortBy: 'createdAt', sortOrder: 'desc' },
    });
  });
});
