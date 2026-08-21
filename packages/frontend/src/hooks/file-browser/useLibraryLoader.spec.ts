///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLibraryLoader } from './useLibraryLoader';
import { useLibraryQuery } from '@/hooks/library/useLibraryQuery';
import { useFileSystemChildren } from '@/hooks/useFileSystemChildren';
import { useBuildBreadcrumbs } from '@/hooks/useBuildBreadcrumbs';
import type { FileSystemNode } from '@/types/filesystem';

vi.mock('@/hooks/library/useLibraryQuery', () => ({
  useLibraryQuery: vi.fn(),
}));
vi.mock('@/hooks/useFileSystemChildren', () => ({
  useFileSystemChildren: vi.fn(),
}));
vi.mock('@/hooks/useBuildBreadcrumbs', () => ({
  useBuildBreadcrumbs: vi.fn(() => ({ buildBreadcrumbPath: vi.fn() })),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

const libQueryMock = vi.mocked(useLibraryQuery);
const fsQueryMock = vi.mocked(useFileSystemChildren);

function makeNode(id: string): FileSystemNode {
  return { id, name: id, isFolder: false } as FileSystemNode;
}
function makePage(prefix: string, count = 3): FileSystemNode[] {
  return Array.from({ length: count }, (_, i) => makeNode(`${prefix}-${i + 1}`));
}

function mockLibraryQuery(nodes: FileSystemNode[], overrides: Record<string, unknown> = {}) {
  libQueryMock.mockReturnValue({
    libraryId: 'lib-1',
    nodes,
    currentNode: null,
    breadcrumbs: [],
    loading: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    isFolderMode: false,
    ...overrides,
  } as never);
}

function mockFsQuery(nodes: FileSystemNode[], overrides: Record<string, unknown> = {}) {
  fsQueryMock.mockReturnValue({
    nodes,
    total: nodes.length,
    totalPages: 1,
    loading: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    ...overrides,
  } as never);
}

describe('useLibraryLoader — 数据源适配器滚动合并（replace/append/prepend）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // loader 无条件调用两个查询 hook：未覆盖的模式给空兜底（占位跳过合并），
    // 避免未 mock 的模式返回 undefined 崩溃
    mockLibraryQuery([], { isPlaceholderData: true });
    mockFsQuery([]);
  });

  describe('库模式（useLibraryQuery）', () => {
    it('load 默认（replace）：整体替换为当前页', () => {
      mockLibraryQuery(makePage('p1'));
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: true, libraryType: 'drawing' })
      );
      act(() => {
        result.current.load('lib-1', 1, '', false);
      });
      mockLibraryQuery(makePage('p1'));
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual(
        makePage('p1').map((n) => n.id)
      );
      // replace：列表从当前请求页开始
      expect(result.current.minLoadedPage).toBe(1);
    });

    it('load append：在现有数据后追加（按 id 去重）', () => {
      mockLibraryQuery(makePage('p1'));
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: true, libraryType: 'drawing' })
      );
      act(() => {
        result.current.load('lib-1', 1, '', false);
      });
      mockLibraryQuery(makePage('p1'));
      rerender();
      expect(result.current.nodes).toHaveLength(3);

      // 第 2 页追加（含 1 个与第 1 页重复的 id）
      act(() => {
        result.current.load('lib-1', 2, '', true);
      });
      mockLibraryQuery([...makePage('p2'), makePage('p1')[0]!]);
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual([
        'p1-1',
        'p1-2',
        'p1-3',
        'p2-1',
        'p2-2',
        'p2-3',
      ]);
      // append：列表第一项不变
      expect(result.current.minLoadedPage).toBe(1);
    });

    it('load prepend：前插到现有数据之前（按 id 去重）', () => {
      mockLibraryQuery(makePage('p2'));
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: true, libraryType: 'drawing' })
      );
      act(() => {
        // 真实流程：调用方先 setCurrentPage 再 load（loadNodes 的 page 参数由调用方管理）
        result.current.setCurrentPage(2);
        result.current.load('lib-1', 2, '', false);
      });
      mockLibraryQuery(makePage('p2'));
      rerender();
      // replace 第 2 页：列表从第 2 页开始
      expect(result.current.minLoadedPage).toBe(2);

      act(() => {
        result.current.setCurrentPage(1);
        result.current.load('lib-1', 1, '', 'prepend');
      });
      mockLibraryQuery(makePage('p1'));
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual([
        'p1-1',
        'p1-2',
        'p1-3',
        'p2-1',
        'p2-2',
        'p2-3',
      ]);
      // prepend：列表第一项 = 前插页（currentPage）
      expect(result.current.minLoadedPage).toBe(1);
    });

    it('refresh：整体替换回当前定位页', () => {
      mockLibraryQuery(makePage('p1'));
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: true, libraryType: 'drawing' })
      );
      act(() => {
        result.current.load('lib-1', 1, '', false);
      });
      mockLibraryQuery(makePage('p1'));
      rerender();
      act(() => {
        result.current.load('lib-1', 2, '', true);
      });
      mockLibraryQuery(makePage('p2'));
      rerender();
      expect(result.current.nodes).toHaveLength(6);

      // 刷新：replace 为第 2 页新数据
      act(() => {
        result.current.refresh();
      });
      mockLibraryQuery(makePage('p2-refreshed'));
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual(
        makePage('p2-refreshed').map((n) => n.id)
      );
    });

    it('placeholder/error 数据不参与合并', () => {
      mockLibraryQuery(makePage('p1'));
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: true, libraryType: 'drawing' })
      );
      act(() => {
        result.current.load('lib-1', 1, '', false);
      });
      mockLibraryQuery(makePage('p1'));
      rerender();
      expect(result.current.nodes).toHaveLength(3);

      // keepPreviousData 占位期：nodes 引用不变 → 不重复合并
      mockLibraryQuery(makePage('p1'));
      rerender();
      expect(result.current.nodes).toHaveLength(3);

      // 错误数据不合并
      mockLibraryQuery([], { error: 'network error' });
      rerender();
      expect(result.current.nodes).toHaveLength(3);
    });

    it('分页信息：hasMore 随 currentPage/totalPages', () => {
      mockLibraryQuery(makePage('p1'), { isPlaceholderData: true });
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: true, libraryType: 'drawing' })
      );
      // 初始占位：totalPages 未知
      act(() => {
        result.current.setCurrentPage(1);
      });
      mockLibraryQuery(makePage('p1'), { isPlaceholderData: true });
      rerender();
      // totalPages 默认 1（占位）→ hasMore false
      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('文件系统模式（useFileSystemChildren）', () => {
    it('load replace/append/prepend 合并 + 分页信息同步', () => {
      mockFsQuery(makePage('p1'), { total: 6, totalPages: 2 });
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: false, projectId: 'proj-1' })
      );
      act(() => {
        result.current.load('node-1', 1, '', false);
      });
      mockFsQuery(makePage('p1'), { total: 6, totalPages: 2 });
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual(
        makePage('p1').map((n) => n.id)
      );
      expect(result.current.total).toBe(6);
      expect(result.current.totalPages).toBe(2);

      // append 第 2 页（同 nodeId 不清空）
      act(() => {
        result.current.load('node-1', 2, '', true);
      });
      mockFsQuery(makePage('p2'), { total: 6, totalPages: 2 });
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual([
        'p1-1',
        'p1-2',
        'p1-3',
        'p2-1',
        'p2-2',
        'p2-3',
      ]);

      // prepend 第 1 页（新数据）
      act(() => {
        result.current.load('node-1', 1, '', 'prepend');
      });
      mockFsQuery(makePage('p0'), { total: 9, totalPages: 3 });
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual([
        'p0-1',
        'p0-2',
        'p0-3',
        'p1-1',
        'p1-2',
        'p1-3',
        'p2-1',
        'p2-2',
        'p2-3',
      ]);
    });

    it('切换目录：displayNodes 清空重建（防跨目录误合并）', () => {
      mockFsQuery(makePage('folder-a'));
      const { result, rerender } = renderHook(() =>
        useLibraryLoader({ isLibraryMode: false, projectId: 'proj-1' })
      );
      act(() => {
        result.current.load('node-a', 1, '', false);
      });
      mockFsQuery(makePage('folder-a'));
      rerender();
      expect(result.current.nodes).toHaveLength(3);

      // 挂起 append 方向 + 进入新目录：新目录数据前插到旧数据（若不清空会误合并）
      act(() => {
        result.current.load('node-b', 1, '', true);
      });
      mockFsQuery(makePage('folder-b'));
      rerender();
      expect(result.current.nodes.map((n) => n.id)).toEqual(
        makePage('folder-b').map((n) => n.id)
      );
    });
  });
});
