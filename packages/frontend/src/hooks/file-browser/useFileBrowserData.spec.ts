///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';
import { useFileBrowserData } from './useFileBrowserData';
import type { UseFileBrowserDataOptions } from './useFileBrowserData';
import type { FileSystemNode } from '@/types/filesystem';

vi.mock('@/languages', () => ({ t: (m: string) => m }));

const nodeA = {
  id: 'a',
  name: 'a.dwg',
  nodeType: 'FILE',
  isFolder: false,
  isRoot: false,
} as FileSystemNode;

function buildSource() {
  return {
    nodes: [nodeA],
    loading: false,
    isFetching: false,
    error: null,
    libraryRootId: null,
    currentPage: 1,
    setCurrentPage: vi.fn(),
    total: 1,
    totalPages: 1,
    hasMore: false,
    load: vi.fn(),
    refresh: vi.fn(),
    buildBreadcrumbPath: vi.fn(),
    loadNodesRef: { current: vi.fn() },
    buildBreadcrumbPathRef: { current: vi.fn() },
    reset: vi.fn(),
    removeLocalNode: vi.fn(),
    updateLocalNode: vi.fn(),
    checkSkipVisibilityReload: vi.fn(() => false),
  };
}

function wrapper(initialEntries: string[]) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries }, children);
}

function renderData(
  options: Partial<UseFileBrowserDataOptions> & {
    source?: ReturnType<typeof buildSource>;
  },
  initialEntries: string[] = ['/projects/p1/files']
) {
  const source = options.source ?? buildSource();
  const result = renderHook(
    () =>
      useFileBrowserData({
        navigation: 'url',
        source,
        ...options,
      }),
    { wrapper: wrapper(initialEntries) }
  );
  return { ...result, source };
}

describe('useFileBrowserData — 加载/分页/搜索/导航/面包屑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('url 模式（全屏页语义）', () => {
    it('URL 解析：/projects/:id/files → urlProjectId；/projects/:id/files/:nodeId → urlNodeId', () => {
      const { result } = renderData({}, ['/projects/p1/files']);
      expect(result.current.urlProjectId).toBe('p1');
      expect(result.current.urlNodeId).toBeUndefined();
      expect(result.current.isProjectRootMode).toBe(false);

      const { result: deep } = renderData({}, ['/projects/p1/files/n1']);
      expect(deep.current.urlProjectId).toBe('p1');
      expect(deep.current.urlNodeId).toBe('n1');
      expect(deep.current.currentLocationId).toBe('n1');
    });

    it('项目根模式：/projects → isProjectRootMode=true', () => {
      const { result } = renderData({}, ['/projects']);
      expect(result.current.isProjectRootMode).toBe(true);
      expect(result.current.currentLocationId).toBeNull();
    });

    it('personal-space 模式：解析个人空间节点', () => {
      const { result } = renderData(
        { mode: 'personal-space' },
        ['/personal-space/n9']
      );
      expect(result.current.isPersonalSpaceMode).toBe(true);
      expect(result.current.urlNodeId).toBe('n9');
      expect(result.current.currentLocationId).toBe('n9');
    });
  });

  describe('controlled 模式（侧边栏语义）', () => {
    it('externalProjectId/externalNodeId 驱动定位 → source.load 被调用', () => {
      const source = buildSource();
      const { result } = renderData(
        {
          navigation: 'controlled',
          externalProjectId: 'p1',
          source,
        },
        ['/cad-editor']
      );
      expect(result.current.urlProjectId).toBe('p1');
      expect(result.current.currentLocationId).toBe('p1');
      expect(source.load).toHaveBeenCalledWith('p1', 1, '');

      const { result: withNode } = renderData(
        {
          navigation: 'controlled',
          externalProjectId: 'p1',
          externalNodeId: 'n1',
          source,
        },
        ['/cad-editor']
      );
      expect(withNode.current.currentLocationId).toBe('n1');
      expect(source.load).toHaveBeenCalledWith('n1', 1, '');
    });

    it('定位变化 → 重新 load（去重同一定位）', () => {
      const source = buildSource();
      const { rerender } = renderHook(
        ({ nodeId }: { nodeId?: string }) =>
          useFileBrowserData({
            navigation: 'controlled',
            externalProjectId: 'p1',
            externalNodeId: nodeId,
            source,
          }),
        {
          wrapper: wrapper(['/cad-editor']),
          initialProps: { nodeId: undefined },
        }
      );
      expect(source.load).toHaveBeenCalledTimes(1);
      rerender({ nodeId: 'n2' });
      expect(source.load).toHaveBeenCalledWith('n2', 1, '');
      rerender({ nodeId: 'n2' });
      expect(source.load).toHaveBeenCalledTimes(2);
    });
  });

  describe('导航动作（面包屑 + load 联动）', () => {
    it('navigateTo：面包屑 push + source.load(node.id)', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      act(() => result.current.navigateTo(nodeA));
      expect(result.current.breadcrumbs).toHaveLength(1);
      expect(result.current.breadcrumbs[0]).toMatchObject({
        id: 'a',
        name: 'a.dwg',
        isRoot: true,
      });
      expect(source.load).toHaveBeenCalledWith('a', 1, '');
    });

    it('goBack：弹回上级面包屑 + 加载上级', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      act(() => result.current.navigateTo(nodeA));
      act(() =>
        result.current.navigateTo({
          ...nodeA,
          id: 'a2',
          name: 'sub',
        } as FileSystemNode)
      );
      expect(result.current.breadcrumbs).toHaveLength(2);
      act(() => result.current.goBack());
      expect(result.current.breadcrumbs).toHaveLength(1);
      expect(source.load).toHaveBeenCalledWith('a', 1, '');
    });

    it('goBack 面包屑为空时 no-op（不调用 load）', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      act(() => result.current.goBack());
      expect(source.load).not.toHaveBeenCalled();
    });

    it('navigateToBreadcrumb：截断面包屑并加载目标', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      act(() => result.current.navigateTo(nodeA));
      act(() =>
        result.current.navigateTo({
          ...nodeA,
          id: 'a2',
          name: 'sub',
        } as FileSystemNode)
      );
      act(() => result.current.navigateToBreadcrumb(0));
      expect(result.current.breadcrumbs).toHaveLength(1);
      expect(source.load).toHaveBeenCalledWith('a', 1, '');
    });

    it('currentNode 从面包屑末端派生', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      expect(result.current.currentNode).toBeNull();
      act(() => result.current.navigateTo(nodeA));
      expect(result.current.currentNode?.id).toBe('a');
    });
  });

  describe('搜索与分页', () => {
    it('setSearchQuery + handleSearchSubmit → source.load 带搜索词', () => {
      const source = buildSource();
      const { result } = renderData({ source }, ['/projects/p1/files']);
      act(() => result.current.setSearchQuery('abc'));
      expect(result.current.searchQuery).toBe('abc');
      act(() => result.current.handleSearchSubmit());
      expect(source.load).toHaveBeenCalledWith('p1', 1, 'abc');
    });

    it('handlePageChange → source.load 带页码 + pagination 更新', () => {
      const source = buildSource();
      const { result } = renderData({ source }, ['/projects/p1/files']);
      act(() => result.current.handlePageChange(2));
      expect(result.current.pagination.page).toBe(2);
      expect(source.load).toHaveBeenCalledWith('p1', 2, '');
    });

    it('handlePageSizeChange → 重置页码 + source.load', () => {
      const source = buildSource();
      const { result } = renderData({ source }, ['/projects/p1/files']);
      act(() => result.current.handlePageSizeChange(50));
      expect(result.current.pagination).toEqual({ page: 1, limit: 50 });
      expect(source.load).toHaveBeenCalledWith('p1', 1, '');
    });

    it('load/refresh 委托 source', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      act(() => {
        result.current.load('x', 2, 'kw');
      });
      expect(source.load).toHaveBeenCalledWith('x', 2, 'kw', undefined);
      act(() => result.current.refresh());
      expect(source.refresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('source 透传', () => {
    it('nodes/loading/error/分页元信息透传', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      expect(result.current.nodes).toEqual([nodeA]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.paginationMeta).toEqual({
        total: 1,
        page: 1,
        limit: 30,
        totalPages: 1,
      });
      expect(result.current.total).toBe(1);
      expect(result.current.hasMore).toBe(false);
    });

    it('乐观操作透传（removeLocalNode/updateLocalNode/reset）', () => {
      const source = buildSource();
      const { result } = renderData({ source });
      act(() => result.current.removeLocalNode('a'));
      expect(source.removeLocalNode).toHaveBeenCalledWith('a');
      act(() =>
        result.current.updateLocalNode('a', { name: 'new' })
      );
      expect(source.updateLocalNode).toHaveBeenCalledWith('a', { name: 'new' });
      act(() => result.current.reset());
      expect(source.reset).toHaveBeenCalledTimes(1);
    });
  });
});
