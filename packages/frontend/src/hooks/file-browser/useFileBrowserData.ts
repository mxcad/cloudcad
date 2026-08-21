///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { FileSystemNode } from '@/types/filesystem';
import type { SearchFilterValues } from '@/components/search/SearchFilters';
import type {
  UseFileBrowserDataOptions,
  UseFileBrowserDataReturn,
} from './fileBrowserTypes';
import type { UseLibraryLoaderReturn } from './useLibraryLoader';

export type { UseFileBrowserDataOptions, UseFileBrowserDataReturn } from './fileBrowserTypes';

/**
 * useFileBrowserData - 文件浏览器数据+导航内核（原子 A）
 *
 * 数据源编排（source 适配器注入，内核只见 load/refresh 契约）+
 * 导航（navigation: 'url' | 'controlled' 一等公民）+ 面包屑状态 +
 * 搜索/分页状态。零 JSX 零 DOM 感知。
 *
 * - url 模式：从 URL 解析 projectId/nodeId（全屏页语义）
 * - controlled 模式：externalProjectId/externalNodeId 受控驱动（侧边栏语义）
 */
export const useFileBrowserData = (
  options: UseFileBrowserDataOptions
): UseFileBrowserDataReturn => {
  const {
    navigation,
    mode = 'project',
    personalSpaceId,
    externalProjectId,
    externalNodeId,
    source,
    pageSize = 30,
    enabled = true,
  } = options;

  const urlParams = useLocation();

  // ── url 模式定位解析（controlled 模式下外部值优先） ──────────────
  const urlProjectId = useMemo(() => {
    if (navigation === 'controlled') {
      return externalProjectId || '';
    }
    if (mode === 'personal-space') {
      return personalSpaceId || '';
    }
    const match = urlParams.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [navigation, mode, personalSpaceId, externalProjectId, urlParams.pathname]);

  const urlNodeId = useMemo(() => {
    if (navigation === 'controlled') {
      return externalNodeId || undefined;
    }
    if (mode === 'personal-space') {
      const match = urlParams.pathname.match(/\/personal-space\/([^/]+)/);
      return match ? match[1] : undefined;
    }
    const match = urlParams.pathname.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [navigation, mode, externalNodeId, urlParams.pathname]);

  const isProjectRootMode = navigation === 'url' && mode === 'project' && !urlProjectId;
  const isPersonalSpaceMode = mode === 'personal-space';

  // ── 当前定位（source 加载目标） ────────────────────────────────────
  const currentLocationId = useMemo(() => {
    if (navigation === 'controlled') {
      return externalNodeId ?? externalProjectId ?? null;
    }
    const nodeId = urlNodeId ?? urlProjectId;
    return nodeId || null;
  }, [navigation, externalNodeId, externalProjectId, urlNodeId, urlProjectId]);

  // ── 面包屑状态（受控：外部定位变化时重建；url：由外壳渲染层决定） ──
  const [breadcrumbs, setBreadcrumbs] = useState<UseFileBrowserDataReturn['breadcrumbs']>([]);

  // ── 搜索状态 ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilterValues>({});

  // ── 分页状态 ────────────────────────────────────────────────────────
  const [pagination, setPagination] = useState({ page: 1, limit: pageSize });

  // controlled 模式：外部定位变化 → 加载（不重置搜索，由外壳决定）
  const prevLocationIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (navigation !== 'controlled' || !enabled) return;
    if (currentLocationId === prevLocationIdRef.current) return;
    prevLocationIdRef.current = currentLocationId;
    if (currentLocationId) {
      source.load(currentLocationId, 1, searchQuery);
    }
  }, [navigation, enabled, currentLocationId, source, searchQuery]);

  // url 模式：定位变化 → 重置面包屑（加载由外壳数据层负责）
  useEffect(() => {
    if (navigation !== 'url') return;
    setBreadcrumbs([]);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [navigation, currentLocationId]);

  // ── 导航动作 ────────────────────────────────────────────────────────
  const navigateTo = useCallback(
    (node: FileSystemNode) => {
      setBreadcrumbs((prev) => [
        ...prev,
        {
          id: node.id,
          name: node.name,
          isRoot: prev.length === 0,
          isFolder: node.isFolder,
        },
      ]);
      setSearchQuery('');
      setPagination((prev) => ({ ...prev, page: 1 }));
      void source.load(node.id, 1, '');
    },
    [source]
  );

  const goBack = useCallback(() => {
    setBreadcrumbs((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.slice(0, -1);
      const last = next[next.length - 1];
      if (last) {
        setSearchQuery('');
        setPagination((p) => ({ ...p, page: 1 }));
        void source.load(last.id, 1, '');
      }
      return next;
    });
  }, [source]);

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      setBreadcrumbs((prev) => {
        if (index >= prev.length) return prev;
        const next = prev.slice(0, index + 1);
        const last = next[next.length - 1];
        if (last) {
          setSearchQuery('');
          setPagination((p) => ({ ...p, page: 1 }));
          void source.load(last.id, 1, '');
        }
        return next;
      });
    },
    [source]
  );

  const load = useCallback(
    (nodeId: string, page = 1, search = '', append?: boolean | 'prepend') => {
      return source.load(nodeId, page, search, append);
    },
    [source]
  );

  const refresh = useCallback(() => {
    source.refresh();
  }, [source]);

  const handleSearchSubmit = useCallback(() => {
    if (currentLocationId) {
      void source.load(currentLocationId, 1, searchQuery);
    }
  }, [currentLocationId, searchQuery, source]);

  const handleSearchQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleFiltersChange = useCallback((filters: SearchFilterValues) => {
    setSearchFilters(filters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      setPagination((prev) => {
        const next = { ...prev, page };
        return next;
      });
      if (currentLocationId) {
        void source.load(currentLocationId, page, searchQuery);
      }
    },
    [currentLocationId, searchQuery, source]
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPagination({ page: 1, limit: size });
      if (currentLocationId) {
        void source.load(currentLocationId, 1, searchQuery);
      }
    },
    [currentLocationId, searchQuery, source]
  );

  // ── source 透传（UseLibraryLoaderReturn 全量） ──────────────────────
  const sourceData = source as UseLibraryLoaderReturn;

  // ── 派生：currentNode / paginationMeta ──────────────────────────────
  const currentNode = useMemo<FileSystemNode | null>(() => {
    if (breadcrumbs.length === 0) return null;
    const last = breadcrumbs[breadcrumbs.length - 1];
    return (
      sourceData.nodes.find((n) => n.id === last?.id) ||
      ({
        id: last?.id || '',
        name: last?.name || '',
        isFolder: true,
        parentId:
          breadcrumbs.length > 1
            ? breadcrumbs[breadcrumbs.length - 2]?.id
            : undefined,
      } as FileSystemNode)
    );
  }, [breadcrumbs, sourceData.nodes]);

  const paginationMeta = sourceData.total === 0 && sourceData.totalPages === 0
    ? null
    : {
        total: sourceData.total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: sourceData.totalPages,
      };

  return {
    // 数据（source 透传）
    nodes: sourceData.nodes,
    loading: sourceData.loading,
    isFetching: sourceData.isFetching,
    error: sourceData.error,
    currentNode,
    breadcrumbs,
    paginationMeta,
    // 导航
    currentLocationId,
    isProjectRootMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,
    navigateTo,
    goBack,
    navigateToBreadcrumb,
    load,
    refresh,
    // 搜索
    searchQuery,
    setSearchQuery: handleSearchQueryChange,
    handleSearchSubmit,
    searchFilters,
    handleFiltersChange,
    handleSearchQueryChange,
    // 分页
    pagination,
    setPagination,
    handlePageChange,
    handlePageSizeChange,
    // source 透传
    libraryRootId: sourceData.libraryRootId,
    currentPage: sourceData.currentPage,
    setCurrentPage: sourceData.setCurrentPage,
    total: sourceData.total,
    totalPages: sourceData.totalPages,
    hasMore: sourceData.hasMore,
    reset: sourceData.reset,
    removeLocalNode: sourceData.removeLocalNode,
    updateLocalNode: sourceData.updateLocalNode,
    checkSkipVisibilityReload: sourceData.checkSkipVisibilityReload,
    loadNodesRef: sourceData.loadNodesRef,
    buildBreadcrumbPathRef: sourceData.buildBreadcrumbPathRef,
  } as UseFileBrowserDataReturn;
};
