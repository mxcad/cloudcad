///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLibraryQuery } from '@/hooks/library/useLibraryQuery';
import { useFileSystemChildren } from '@/hooks/useFileSystemChildren';
import { useBuildBreadcrumbs } from '@/hooks/useBuildBreadcrumbs';
import type { FileSystemNode } from '@/types/filesystem';
import type { BreadcrumbItem } from '@/components/ProjectDrawingsPanel/types';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import { PAGE_SIZE } from '@/components/ProjectDrawingsPanel/constants';
import { queryKeys } from '@/lib/queryKeys';

export interface UseLoadNodesReturn {
  nodes: FileSystemNode[];
  loading: boolean;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  totalPages: number;
  hasMore: boolean;
  activeRequestId: React.MutableRefObject<number>;
  loadNodes: (
    nodeId: string,
    page?: number,
    search?: string,
    append?: boolean | 'prepend'
  ) => Promise<void>;
  buildBreadcrumbPath: (nodeId: string) => Promise<BreadcrumbItem[]>;
  loadNodesRef: React.MutableRefObject<(
    nodeId: string,
    page?: number,
    search?: string,
    append?: boolean | 'prepend'
  ) => Promise<void>>;
  buildBreadcrumbPathRef: React.MutableRefObject<(nodeId: string) => Promise<BreadcrumbItem[]>>;
  /** 重置节点列表和分页状态 */
  reset: () => void;
}

export function useLoadNodes(
  isLibraryMode: boolean,
  libraryType: LibraryType | undefined
): UseLoadNodesReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const activeRequestId = useRef(0);
  const queryClient = useQueryClient();

  // 共享面包屑 hook
  const { buildBreadcrumbPath } = useBuildBreadcrumbs();

  // ── Library mode: 使用 useLibraryQuery ──
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryNodeId, setLibraryNodeId] = useState<string | undefined>();

  const libraryQuery = useLibraryQuery({
    libraryType: libraryType || 'drawing',
    nodeId: libraryNodeId,
    page: currentPage,
    limit: PAGE_SIZE,
    search: librarySearch,
  });

  // ── File system mode: 使用 useFileSystemChildren ──
  const [fsNodeId, setFsNodeId] = useState<string | undefined>();
  const [fsSearch, setFsSearch] = useState<string>();

  const fsQuery = useFileSystemChildren({
    nodeId: fsNodeId,
    page: currentPage,
    search: fsSearch,
    enabled: !isLibraryMode,
  });

  // ── 合并结果 ──
  const nodes = useMemo(() => {
    if (isLibraryMode) return libraryQuery.nodes;
    return fsQuery.nodes;
  }, [isLibraryMode, libraryQuery.nodes, fsQuery.nodes]);

  const loading = useMemo(() => {
    if (isLibraryMode) return libraryQuery.loading;
    return fsQuery.loading;
  }, [isLibraryMode, libraryQuery.loading, fsQuery.loading]);

  // ── Library mode: 同步分页信息 ──
  useEffect(() => {
    if (!isLibraryMode) return;
    // useLibraryQuery 通过 onTotalChange/onTotalPagesChange 回调报告分页
    // 这里我们从节点数量推断 hasMore
    setHasMore(libraryQuery.nodes.length >= PAGE_SIZE);
  }, [isLibraryMode, libraryQuery.nodes.length]);

  // ── File system mode: 同步分页信息 ──
  useEffect(() => {
    if (isLibraryMode) return;
    setTotal(fsQuery.total);
    setTotalPages(fsQuery.totalPages);
    setHasMore(currentPage < fsQuery.totalPages);
  }, [isLibraryMode, fsQuery.total, fsQuery.totalPages, currentPage]);

  // ── 加载节点（统一入口） ──
  const loadNodes = useCallback(
    async (
      nodeId: string,
      page: number = 1,
      search?: string,
      append: boolean | 'prepend' = false
    ) => {
      const currentRequestId = activeRequestId.current + 1;
      activeRequestId.current = currentRequestId;

      setCurrentPage(page);

      if (isLibraryMode) {
        // Library mode: 更新查询参数，React Query 自动加载
        setLibraryNodeId(nodeId);
        setLibrarySearch(search || '');
        // 分页信息由 useEffect 同步
      } else {
        // File system mode: 更新查询参数
        setFsNodeId(nodeId);
        setFsSearch(search);
        // 分页信息由 useEffect 同步
      }
    },
    [isLibraryMode]
  );

  // ── 重置状态 ──
  const reset = useCallback(() => {
    setCurrentPage(1);
    setTotal(0);
    setTotalPages(1);
    setHasMore(false);
    activeRequestId.current = 0;
    setLibraryNodeId(undefined);
    setLibrarySearch('');
    setFsNodeId(undefined);
    setFsSearch(undefined);
    // 清除 React Query 缓存
    queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.all });
  }, [queryClient]);

  const loadNodesRef = useRef(loadNodes);
  const buildBreadcrumbPathRef = useRef(buildBreadcrumbPath);

  return {
    nodes,
    loading,
    currentPage,
    setCurrentPage,
    total,
    totalPages,
    hasMore,
    activeRequestId,
    loadNodes,
    buildBreadcrumbPath,
    loadNodesRef,
    buildBreadcrumbPathRef,
    reset,
  };
}
