///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useLibraryQuery } from '@/hooks/library/useLibraryQuery';
import { useFileSystemChildren } from '@/hooks/useFileSystemChildren';
import { useBuildBreadcrumbs } from '@/hooks/useBuildBreadcrumbs';
import type { FileSystemNode } from '@/types/filesystem';
import type { BreadcrumbItem } from '@/components/ProjectDrawingsPanel/types';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';
import { PAGE_SIZE } from '@/components/ProjectDrawingsPanel/constants';

export interface UseLoadNodesReturn {
  nodes: FileSystemNode[];
  loading: boolean;
  /** 后台刷新中（数据已存在但正在重新获取），用于驱动刷新按钮 spinner */
  isFetching: boolean;
  /** API 错误信息 */
  error: string | null;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  totalPages: number;
  hasMore: boolean;
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
  libraryType: LibraryType | undefined,
  projectId?: string,
  pageSize: number = PAGE_SIZE
): UseLoadNodesReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // 共享面包屑 hook
  const { buildBreadcrumbPath } = useBuildBreadcrumbs();

  // ── Library mode: 使用 useLibraryQuery ──
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryNodeId, setLibraryNodeId] = useState<string | undefined>();

  const libraryQuery = useLibraryQuery({
    libraryType: libraryType || 'drawing',
    nodeId: libraryNodeId,
    page: currentPage,
    limit: pageSize,
    search: librarySearch,
    onTotalChange: setTotal,
    onTotalPagesChange: setTotalPages,
  });

  // ── File system mode: 使用 useFileSystemChildren ──
  const [fsNodeId, setFsNodeId] = useState<string | undefined>();
  const [fsSearch, setFsSearch] = useState('');

  const fsQuery = useFileSystemChildren({
    nodeId: fsNodeId,
    page: currentPage,
    limit: pageSize,
    search: fsSearch,
    enabled: !isLibraryMode,
    projectId,
  });

  // ── Library 模式：使用 displayNodes 支持 append/prepend/replace ──
  const loadModeRef = useRef<'replace' | 'append' | 'prepend'>('replace');
  const [displayNodes, setDisplayNodes] = useState<FileSystemNode[]>([]);
  // 跟踪 libraryNodeId 是否曾被显式设置过，首次从 undefined→value 时不重置
  // 因为 useLibraryQuery 在挂载时已用 libraryId 作为回退预取了数据，
  // 若此时重置 displayNodes，查询 key 不变导致 merge effect 不触发、数据丢失
  const libraryNodeIdWasSetRef = useRef(false);

  // 【先】节点ID或搜索变更时重置 displayNodes（必须在 merge effect 之前执行）
  // 注意：不改 loadModeRef.current，它由 loadNodes 根据 append/prepend/replace 参数设置
  useEffect(() => {
    if (!isLibraryMode) return;
    if (!libraryNodeIdWasSetRef.current) {
      if (libraryNodeId !== undefined) libraryNodeIdWasSetRef.current = true;
      return; // 初始状态转首次有效值不重置，避免与预取数据冲突
    }
    setDisplayNodes([]);
  }, [isLibraryMode, libraryNodeId, librarySearch]);

  // 【后】监听 useLibraryQuery 返回的新数据，按模式合并到 displayNodes
  // 跳过 keepPreviousData 占位数据（isPlaceholderData），只写入真实数据
  useEffect(() => {
    if (!isLibraryMode) return;
    if (libraryQuery.isPlaceholderData) return;

    const newNodes = libraryQuery.nodes;

    if (loadModeRef.current === 'replace') {
      setDisplayNodes(newNodes);
    } else if (loadModeRef.current === 'append') {
      setDisplayNodes((prev) => {
        const map = new Map<string, FileSystemNode>();
        prev.forEach((n) => map.set(n.id, n));
        newNodes.forEach((n) => { if (!map.has(n.id)) map.set(n.id, n); });
        return Array.from(map.values());
      });
    } else if (loadModeRef.current === 'prepend') {
      setDisplayNodes((prev) => {
        const map = new Map<string, FileSystemNode>();
        newNodes.forEach((n) => map.set(n.id, n));
        prev.forEach((n) => { if (!map.has(n.id)) map.set(n.id, n); });
        return Array.from(map.values());
      });
    }
  }, [isLibraryMode, libraryQuery.nodes, libraryQuery.isPlaceholderData]);

  // ── File system 模式：使用 displayNodes 支持 append/prepend/replace ──
  // 节点ID或搜索变更时重置 displayNodes
  useEffect(() => {
    if (isLibraryMode) return;
    setDisplayNodes([]);
  }, [isLibraryMode, fsNodeId, fsSearch]);

  // 监听 useFileSystemChildren 返回的新数据，按模式合并到 displayNodes
  useEffect(() => {
    if (isLibraryMode) return;
    if (fsQuery.isPlaceholderData) return;

    const newNodes = fsQuery.nodes;

    if (loadModeRef.current === 'replace') {
      setDisplayNodes(newNodes);
    } else if (loadModeRef.current === 'append') {
      setDisplayNodes((prev) => {
        const map = new Map<string, FileSystemNode>();
        prev.forEach((n) => map.set(n.id, n));
        newNodes.forEach((n) => { if (!map.has(n.id)) map.set(n.id, n); });
        return Array.from(map.values());
      });
    } else if (loadModeRef.current === 'prepend') {
      setDisplayNodes((prev) => {
        const map = new Map<string, FileSystemNode>();
        newNodes.forEach((n) => map.set(n.id, n));
        prev.forEach((n) => { if (!map.has(n.id)) map.set(n.id, n); });
        return Array.from(map.values());
      });
    }
  }, [isLibraryMode, fsQuery.nodes, fsQuery.isPlaceholderData]);

  // ── 合并结果（两种模式均使用 displayNodes） ──
  const nodes = useMemo(() => displayNodes, [displayNodes]);

  // library 模式用 isFetching（keepPreviousData 下 isLoading 换页时不更新），
  // 确保滚动节流能正确判断"正在加载中"。
  const loading = useMemo(() => {
    if (isLibraryMode) return libraryQuery.loading || libraryQuery.isFetching;
    return fsQuery.loading || fsQuery.isFetching;
  }, [isLibraryMode, libraryQuery.loading, libraryQuery.isFetching, fsQuery.loading, fsQuery.isFetching]);

  const isFetching = useMemo(() => {
    if (isLibraryMode) return libraryQuery.isFetching;
    return fsQuery.isFetching;
  }, [isLibraryMode, libraryQuery.isFetching, fsQuery.isFetching]);

  // ── Library mode: 同步分页信息 ──
  useEffect(() => {
    if (!isLibraryMode) return;
    setHasMore(currentPage < totalPages);
  }, [isLibraryMode, currentPage, totalPages]);

  // ── File system mode: 同步分页信息 ──
  useEffect(() => {
    if (isLibraryMode) return;
    if (fsQuery.isPlaceholderData) return;
    setTotal(fsQuery.total);
    setTotalPages(fsQuery.totalPages);
    setHasMore(currentPage < fsQuery.totalPages);
  }, [isLibraryMode, fsQuery.total, fsQuery.totalPages, currentPage, fsQuery.isPlaceholderData]);

  // ── 加载节点（统一入口） ──
  // 注意：page 由调用方通过 setCurrentPage 管理，
  // loadNodes 内不再 setCurrentPage 以避免重复 state 更新
  const loadNodes = useCallback(
    async (
      nodeId: string,
      page: number = 1,
      search?: string,
      append: boolean | 'prepend' = false
    ) => {
      // 记录加载模式，用于 displayNodes 的合并策略
      if (append === 'prepend') loadModeRef.current = 'prepend';
      else if (append === true) loadModeRef.current = 'append';
      else loadModeRef.current = 'replace';

      if (isLibraryMode) {
        setLibraryNodeId(nodeId);
        setLibrarySearch(search || '');
      } else {
        setFsNodeId(nodeId);
        setFsSearch(search || '');
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
    setDisplayNodes([]);
    loadModeRef.current = 'replace';
    setLibraryNodeId(undefined);
    setLibrarySearch('');
    setFsNodeId(undefined);
    setFsSearch('');
  }, []);

  const loadNodesRef = useRef(loadNodes);
  loadNodesRef.current = loadNodes;
  const buildBreadcrumbPathRef = useRef(buildBreadcrumbPath);
  buildBreadcrumbPathRef.current = buildBreadcrumbPath;

  // ── API 错误 ──
  const error: string | null = useMemo(() => {
    if (isLibraryMode) return libraryQuery.error;
    return fsQuery.error ? String(fsQuery.error) : null;
  }, [isLibraryMode, libraryQuery.error, fsQuery.error]);

  return {
    nodes,
    loading,
    isFetching,
    error,
    currentPage,
    setCurrentPage,
    total,
    totalPages,
    hasMore,
    loadNodes,
    buildBreadcrumbPath,
    loadNodesRef,
    buildBreadcrumbPathRef,
    reset,
  };
}
