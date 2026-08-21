///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  useCallback,
  useReducer,
  useRef,
  useState,
  useEffect,
  useMemo,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLibraryQuery } from '@/hooks/library/useLibraryQuery';
import { useFileSystemChildren } from '@/hooks/useFileSystemChildren';
import { useBuildBreadcrumbs } from '@/hooks/useBuildBreadcrumbs';
import type {
  FileSystemNode,
  BreadcrumbItem as FsBreadcrumbItem,
} from '@/types/filesystem';
import { mergeNodesByMode } from '@/hooks/common/mergeNodesByMode';
import { PAGE_SIZE } from '@/constants/pagination';
import type { FileBrowserSource, LibraryType } from './fileBrowserTypes';

// ── useReducer 原子化管理 total + totalPages，消除 stale closure 和 ref + setState 交互脆弱性 ──
type PagState = { total: number; totalPages: number };
type PagAction =
  | { type: 'SET'; total: number; totalPages: number }
  | { type: 'SET_TOTAL'; total: number }
  | { type: 'SET_TOTALPAGES'; totalPages: number }
  | { type: 'DECREMENT_TOTAL'; pageSize: number };

function pagReducer(state: PagState, action: PagAction): PagState {
  switch (action.type) {
    case 'SET':
      return { total: action.total, totalPages: action.totalPages };
    case 'SET_TOTAL':
      return { ...state, total: action.total };
    case 'SET_TOTALPAGES':
      return { ...state, totalPages: action.totalPages };
    case 'DECREMENT_TOTAL': {
      const newTotal = Math.max(0, state.total - 1);
      return {
        total: newTotal,
        totalPages: Math.max(1, Math.ceil(newTotal / action.pageSize) || 1),
      };
    }
  }
}

export interface UseLibraryLoaderOptions {
  /** 库模式标志（true=useLibraryQuery，false=useFileSystemChildren） */
  isLibraryMode: boolean;
  libraryType?: LibraryType;
  projectId?: string;
  pageSize?: number;
  /** 面板可见性（不可见时跳过请求） */
  visible?: boolean;
}

export interface UseLibraryLoaderReturn extends FileBrowserSource {
  nodes: FileSystemNode[];
  loading: boolean;
  isFetching: boolean;
  error: string | null;
  /** 资源库根节点 ID（来自 React Query 缓存，用于 libraryRootId 兜底） */
  libraryRootId: string | null;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  totalPages: number;
  hasMore: boolean;
  buildBreadcrumbPath: (nodeId: string) => Promise<FsBreadcrumbItem[]>;
  loadNodesRef: React.RefObject<
    (
      nodeId: string,
      page?: number,
      search?: string,
      append?: boolean | 'prepend'
    ) => Promise<void>
  >;
  buildBreadcrumbPathRef: React.RefObject<
    (nodeId: string) => Promise<FsBreadcrumbItem[]>
  >;
  reset: () => void;
  removeLocalNode: (nodeId: string) => void;
  updateLocalNode: (
    nodeId: string,
    updates: Partial<Pick<FileSystemNode, 'name'>>
  ) => void;
  checkSkipVisibilityReload: () => boolean;
  /** 列表第一项所属页码（滚动控制器 prev 触发条件用） */
  minLoadedPage: number;
}

/**
 * useLibraryLoader - 文件浏览器数据源适配器（库/普通节点滚动加载）
 *
 * useLoadNodes 重构收敛：同一数据源双模式（库=useLibraryQuery、普通=useFileSystemChildren），
 * displayNodes 支持 replace/append/prepend 合并（无限滚动）、分页 reducer、
 * 本地乐观操作（removeLocalNode/updateLocalNode + 可见性恢复跳过）。
 * 作为 FileBrowserSource 注入内核 useFileBrowserData。
 */
export function useLibraryLoader({
  isLibraryMode,
  libraryType,
  projectId,
  pageSize = PAGE_SIZE,
  visible = true,
}: UseLibraryLoaderOptions): UseLibraryLoaderReturn {
  const queryClient = useQueryClient();

  const [{ total, totalPages }, dispatch] = useReducer(pagReducer, {
    total: 0,
    // totalPages 初始 0：未同步前不算「已到最后一页」（isLastPage/边界触发防误报）
    totalPages: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const { buildBreadcrumbPath } = useBuildBreadcrumbs();

  // ── Library mode: useLibraryQuery ──
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryNodeId, setLibraryNodeId] = useState<string | undefined>();

  const libraryQuery = useLibraryQuery({
    libraryType: libraryType || 'drawing',
    nodeId: libraryNodeId,
    page: currentPage,
    limit: pageSize,
    search: librarySearch,
    enabled: visible,
    onTotalChange: useCallback(
      (t: number) => dispatch({ type: 'SET_TOTAL', total: t }),
      []
    ),
    onTotalPagesChange: useCallback(
      (tp: number) => dispatch({ type: 'SET_TOTALPAGES', totalPages: tp }),
      []
    ),
  });

  // ── File system mode: useFileSystemChildren ──
  const [fsNodeId, setFsNodeId] = useState<string | undefined>();
  const [fsSearch, setFsSearch] = useState('');

  const fsQuery = useFileSystemChildren({
    nodeId: fsNodeId,
    page: currentPage,
    limit: pageSize,
    search: fsSearch,
    enabled: visible && !isLibraryMode,
    projectId,
  });

  // ── displayNodes 合并（replace/append/prepend） ──
  const loadModeRef = useRef<'replace' | 'append' | 'prepend'>('replace');
  const [displayNodes, setDisplayNodes] = useState<FileSystemNode[]>([]);
  // 列表第一项所属页码（滚动控制器 prev 触发条件用）：
  // replace/prepend → currentPage（列表从当前请求页开始）；append → 不变
  const [minLoadedPage, setMinLoadedPage] = useState(1);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const skipVisibilityReloadRef = useRef(false);
  const libraryNodeIdWasSetRef = useRef(false);

  useEffect(() => {
    if (!isLibraryMode) return;
    if (!libraryNodeIdWasSetRef.current) {
      if (libraryNodeId !== undefined) libraryNodeIdWasSetRef.current = true;
      return; // 初始状态转首次有效值不重置，避免与预取数据冲突
    }
    setDisplayNodes([]);
    // 清空路径同步重置合并模式与列表第一页：导航/分类切换后数据未到位期间
    // 若旧 loadModeRef（prepend/append）残留，缓存命中数据到位时会按旧模式合并
    loadModeRef.current = 'replace';
  }, [isLibraryMode, libraryNodeId, librarySearch]);

  useEffect(() => {
    if (!isLibraryMode) return;
    if (libraryQuery.isPlaceholderData) return;
    if (libraryQuery.error) return;
    mergeNodes(libraryQuery.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLibraryMode,
    libraryQuery.nodes,
    libraryQuery.isPlaceholderData,
    libraryQuery.error,
  ]);

  useEffect(() => {
    if (isLibraryMode) return;
    setDisplayNodes([]);
    // 同库模式：导航/搜索变化清空时重置合并模式（防旧 prepend/append 残留）
    loadModeRef.current = 'replace';
  }, [isLibraryMode, fsNodeId, fsSearch]);

  useEffect(() => {
    if (isLibraryMode) return;
    if (fsQuery.isPlaceholderData) return;
    if (fsQuery.error) return;
    mergeNodes(fsQuery.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLibraryMode, fsQuery.nodes, fsQuery.isPlaceholderData, fsQuery.error]);

  const mergeNodes = useCallback((newNodes: FileSystemNode[]) => {
    setDisplayNodes((prev) =>
      mergeNodesByMode(prev, newNodes, loadModeRef.current)
    );
    // 列表第一页维护：replace/prepend → 从当前请求页开始；append → 不变
    if (loadModeRef.current !== 'append') {
      setMinLoadedPage(currentPageRef.current);
    }
  }, []);

  const nodes = useMemo(() => displayNodes, [displayNodes]);

  const loading = useMemo(() => {
    if (isLibraryMode) return libraryQuery.loading || libraryQuery.isFetching;
    return fsQuery.loading || fsQuery.isFetching;
  }, [
    isLibraryMode,
    libraryQuery.loading,
    libraryQuery.isFetching,
    fsQuery.loading,
    fsQuery.isFetching,
  ]);

  const isFetching = useMemo(() => {
    if (isLibraryMode) return libraryQuery.isFetching;
    return fsQuery.isFetching;
  }, [isLibraryMode, libraryQuery.isFetching, fsQuery.isFetching]);

  // ── 分页信息同步 ──
  useEffect(() => {
    if (!isLibraryMode) return;
    setHasMore(currentPage < totalPages);
  }, [isLibraryMode, currentPage, totalPages]);

  useEffect(() => {
    if (isLibraryMode) return;
    if (fsQuery.isPlaceholderData) return;
    dispatch({
      type: 'SET',
      total: fsQuery.total,
      totalPages: fsQuery.totalPages,
    });
    setHasMore(currentPage < fsQuery.totalPages);
  }, [
    isLibraryMode,
    fsQuery.total,
    fsQuery.totalPages,
    currentPage,
    fsQuery.isPlaceholderData,
  ]);

  // ── 加载节点（统一入口；page 由调用方 setCurrentPage 管理） ──
  const loadNodes = useCallback(
    async (
      nodeId: string,
      page: number = 1,
      search?: string,
      append: boolean | 'prepend' = false
    ) => {
      if (append === 'prepend') loadModeRef.current = 'prepend';
      else if (append === true) loadModeRef.current = 'append';
      else loadModeRef.current = 'replace';

      if (isLibraryMode) {
        setLibraryNodeId(nodeId);
        setLibrarySearch(search || '');
        if (append === false || append === undefined) {
          queryClient.invalidateQueries({ queryKey: ['library', libraryType] });
        }
      } else {
        setFsNodeId(nodeId);
        setFsSearch(search || '');
      }
    },
    [isLibraryMode, libraryType, queryClient]
  );

  // ── 本地数据操作方法（乐观更新，不需要重新请求） ──
  const removeLocalNode = useCallback(
    (nodeId: string) => {
      skipVisibilityReloadRef.current = true;
      setDisplayNodes((prev) => prev.filter((n) => n.id !== nodeId));
      dispatch({ type: 'DECREMENT_TOTAL', pageSize });
    },
    [pageSize]
  );

  const updateLocalNode = useCallback(
    (nodeId: string, updates: Partial<Pick<FileSystemNode, 'name'>>) => {
      skipVisibilityReloadRef.current = true;
      setDisplayNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
      );
    },
    []
  );

  const reset = useCallback(() => {
    setCurrentPage(1);
    dispatch({ type: 'SET', total: 0, totalPages: 0 });
    setHasMore(false);
    setDisplayNodes([]);
    setMinLoadedPage(1);
    loadModeRef.current = 'replace';
    setLibraryNodeId(undefined);
    setLibrarySearch('');
    setFsNodeId(undefined);
    setFsSearch('');
  }, []);

  const checkSkipVisibilityReload = useCallback(() => {
    if (skipVisibilityReloadRef.current) {
      skipVisibilityReloadRef.current = false;
      return true;
    }
    return false;
  }, []);

  const loadNodesRef = useRef(loadNodes);
  loadNodesRef.current = loadNodes;

  // 面包屑包装：useBuildBreadcrumbs 返回 {id,name}，转换为内核 BreadcrumbItem（含 isRoot）
  const buildBreadcrumbPathForCore = useCallback(
    async (nodeId: string): Promise<FsBreadcrumbItem[]> => {
      const path = await buildBreadcrumbPath(nodeId);
      return path.map((item, index) => ({
        id: item.id,
        name: item.name,
        isRoot: index === 0,
        isFolder: true,
      }));
    },
    [buildBreadcrumbPath]
  );
  const buildBreadcrumbPathRef = useRef(buildBreadcrumbPathForCore);
  buildBreadcrumbPathRef.current = buildBreadcrumbPathForCore;

  const error: string | null = useMemo(() => {
    if (isLibraryMode) return libraryQuery.error;
    return fsQuery.error ? String(fsQuery.error) : null;
  }, [isLibraryMode, libraryQuery.error, fsQuery.error]);

  // ── 刷新（重载当前定位） ──────────────────────────────────────────
  const refresh = useCallback(() => {
    const nodeId = isLibraryMode ? libraryNodeId : fsNodeId;
    if (nodeId) {
      void loadNodesRef.current(
        nodeId,
        currentPage,
        (isLibraryMode ? librarySearch : fsSearch) || undefined,
        false
      );
    }
  }, [
    isLibraryMode,
    libraryNodeId,
    fsNodeId,
    currentPage,
    librarySearch,
    fsSearch,
  ]);

  return {
    nodes,
    loading,
    isFetching,
    error,
    libraryRootId: libraryQuery.libraryId,
    currentPage,
    setCurrentPage,
    total,
    totalPages,
    hasMore,
    load: loadNodes,
    refresh,
    buildBreadcrumbPath: buildBreadcrumbPathForCore,
    loadNodesRef,
    buildBreadcrumbPathRef,
    reset,
    removeLocalNode,
    updateLocalNode,
    checkSkipVisibilityReload,
    minLoadedPage,
  };
}
