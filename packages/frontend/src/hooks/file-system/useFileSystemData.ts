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

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  fileSystemControllerGetTrash,
  fileSystemControllerGetProjects,
  fileSystemControllerSearch,
  fileSystemControllerGetNode,
  fileSystemControllerGetChildren,
  fileSystemControllerGetRootNode,
  FileSystemNodeDto, ProjectDto, type SearchScope
} from '@/api-sdk';
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  toFileSystemNode,
} from '@/types/filesystem';

import { PaginationMeta } from '@/components/ui/Pagination';
import { handleError } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import type { ProjectFilterType } from '@/api-sdk';
import type { SearchFilterValues } from '@/components/search/SearchFilters';

/** 从 API 响应包装中提取 data 属性类型 */
type UnwrapApiResponse<T> = T extends { data: infer D } ? D : T;

interface UseFileSystemDataProps {
  urlProjectId: string | undefined;
  urlNodeId: string | undefined;
  isProjectRootMode: boolean;
  isPersonalSpaceMode?: boolean;
  personalSpaceId?: string | null;
  searchQuery: string;
  pagination: { page: number; limit: number };
  setPagination: React.Dispatch<React.SetStateAction<{ page: number; limit: number }>>;
  paginationRef: React.MutableRefObject<{ page: number; limit: number }>;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  clearSelection: () => void;
  /** 项目过滤类型：all-全部，owned-我创建的，joined-我加入的 */
  projectFilter?: ProjectFilterType;
  /** 搜索过滤条件 */
  searchFilters?: SearchFilterValues;
}

export const useFileSystemData = ({
  urlProjectId,
  urlNodeId,
  isProjectRootMode,
  isPersonalSpaceMode = false,
  personalSpaceId,
  searchQuery,
  pagination,
  setPagination,
  paginationRef,
  showToast,
  clearSelection,
  projectFilter,
  searchFilters = {},
}: UseFileSystemDataProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Keep paginationRef in sync for backward compatibility
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination, paginationRef]);

  // ── Trash view state (managed here, exposed to parent) ──────────────
  const [isTrashView, setIsTrashView] = useState(false);

  // Reset trash view on mode change
  useEffect(() => {
    setIsTrashView(false);
  }, [isProjectRootMode]);

  // ── Derived mode flags for query enabled checks ─────────────────────
  const isTrash = isTrashView;
  const hasSearch = !!searchQuery;
  const hasFilter = !!(searchFilters.extension || searchFilters.timeRange || searchFilters.sortBy);
  const shouldSearch = hasSearch || hasFilter;

  // Effective node ID for personal-space and folder modes
  const effectiveNodeId = isPersonalSpaceMode
    ? urlNodeId || urlProjectId || ''
    : urlNodeId || urlProjectId || '';

  // ── Query 1: Current node info ─────────────────────────────────────
  const nodeQuery = useQuery({
    queryKey: queryKeys.fileSystem.node(effectiveNodeId),
    queryFn: async () => {
      const response = await fileSystemControllerGetNode({
        path: { nodeId: effectiveNodeId },
      });
      return toFileSystemNode(response.data as FileSystemNodeDto);
    },
    enabled:
      !!effectiveNodeId && !isProjectRootMode && !isTrash && !shouldSearch,
  });

  // ── Query 2: Children / Projects list ──────────────────────────────
  const childrenQuery = useQuery({
    queryKey: isProjectRootMode
      ? [...queryKeys.fileSystem.children('__projects'), { filter: projectFilter, page: pagination.page, limit: pagination.limit }]
      : [...queryKeys.fileSystem.children(effectiveNodeId), { page: pagination.page, limit: pagination.limit }],
    queryFn: async () => {
      if (isProjectRootMode) {
        const response = await fileSystemControllerGetProjects({
          query: {
            filter: projectFilter,
            page: pagination.page,
            limit: pagination.limit,
          },
        });

        const data = response.data;
        if (data && typeof data === 'object' && 'nodes' in data && Array.isArray(data.nodes)) {
          return {
            nodes: data.nodes.map((n) => projectToNode(n)),
            total: data.total,
            page: data.page,
            limit: data.limit,
            totalPages: data.totalPages,
          };
        }

        // Legacy format: array of ProjectDto
        const allProjects = (
          Array.isArray(response.data) ? response.data : []
        ) as ProjectDto[];
        return {
          nodes: allProjects.map(
            (p) => projectToNode(p as unknown as FileSystemNodeDto)
          ),
          total: allProjects.length,
          page: pagination.page,
          limit: pagination.limit,
          totalPages: Math.ceil(allProjects.length / pagination.limit),
        };
      }

      const response = await fileSystemControllerGetChildren({
        path: { nodeId: effectiveNodeId },
        query: {
          page: pagination.page,
          limit: pagination.limit,
          search: searchQuery || undefined,
        },
      });

      const data = response.data;
      if (data && typeof data === 'object' && Array.isArray(data.nodes)) {
        const childrenData = data.nodes.map(toFileSystemNode);
        return {
          nodes: childrenData,
          total: data.total,
          page: data.page,
          limit: data.limit,
          totalPages: data.totalPages,
        };
      }
      return {
        nodes: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    },
    enabled:
      (!!effectiveNodeId && !isTrash && !shouldSearch) || isProjectRootMode,
    placeholderData: keepPreviousData,
  });

  // ── Query 3: Search results ────────────────────────────────────────
  const effectiveSearchKeyword = searchFilters.timeRange
    ? `modified:>${searchFilters.timeRange} ${searchQuery}`.trim()
    : searchQuery;

  const searchQueryResult = useQuery({
    queryKey: queryKeys.fileSystem.search({
      keyword: searchQuery,
      isProjectRootMode,
      isPersonalSpaceMode,
      projectId: isPersonalSpaceMode ? undefined : (urlProjectId ?? undefined),
      filter: isProjectRootMode ? projectFilter : undefined,
      page: pagination.page,
      limit: pagination.limit,
      ...searchFilters,
    }),
    queryFn: async ({ signal: abortSignal }) => {
      let searchScope: SearchScope = 'project_files';
      let searchProjectId: string | undefined;
      let searchFilter: 'all' | 'owned' | 'joined' = 'all';

      if (isProjectRootMode) {
        searchScope = 'global';
        searchFilter = projectFilter || 'all';
      } else if (isPersonalSpaceMode) {
        searchScope = 'personal_space';
      } else if (urlProjectId) {
        searchScope = 'project_files';
        searchProjectId = urlProjectId;
      }

      const response = await fileSystemControllerSearch({
        query: {
          keyword: effectiveSearchKeyword,
          scope: searchScope,
          filter: searchFilter,
          projectId: searchProjectId,
          page: pagination.page,
          limit: pagination.limit,
          extension: searchFilters.extension || undefined,
          fileStatus: undefined,
          sortBy: searchFilters.sortBy || undefined,
          sortOrder: searchFilters.sortOrder || undefined,
        },
        signal: abortSignal,
      });

      const data = response.data;
      if (data && typeof data === 'object' && Array.isArray(data.nodes)) {
        return {
          nodes: data.nodes.map(toFileSystemNode),
          total: data.total,
          page: data.page,
          limit: data.limit,
          totalPages: data.totalPages,
        };
      }
      return {
        nodes: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    },
    enabled: shouldSearch && !isTrash,
    placeholderData: keepPreviousData,
  });

  // ── Query 4: Trash (unified) ───────────────────────────────────────
  const projectIdForTrash = isTrash && !isProjectRootMode
    ? (urlProjectId || '')
    : undefined;

  const trashQuery = useQuery({
    queryKey: [...queryKeys.fileSystem.trash, { projectId: projectIdForTrash, page: pagination.page, limit: pagination.limit, search: searchQuery, extension: searchFilters.extension, sortBy: searchFilters.sortBy, sortOrder: searchFilters.sortOrder }] as const,
    queryFn: async () => {
      const response = await fileSystemControllerGetTrash({
        query: {
          projectId: projectIdForTrash,
          page: pagination.page,
          limit: pagination.limit,
          search: searchQuery || undefined,
          extension: searchFilters.extension || undefined,
          sortBy: searchFilters.sortBy || undefined,
          sortOrder: searchFilters.sortOrder || undefined,
        },
      });

      const data = response.data;
      if (data && typeof data === 'object' && Array.isArray(data.nodes)) {
        const trashNodes = data.nodes.map(toFileSystemNode);
        return {
          nodes: trashNodes,
          total: data.total,
          page: data.page,
          limit: data.limit,
          totalPages: data.totalPages,
        };
      }
      return {
        nodes: [],
        total: 0,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: 0,
      };
    },
    enabled: isTrash,
  });

  // ── Query 5: Breadcrumb parents (traverse upward) ──────────────────
  const [breadcrumbNodes, setBreadcrumbNodes] = useState<
    { id: string; name: string; isRoot: boolean }[] | null
  >(null);

  const fetchBreadcrumbs = useCallback(
    async (node: FileSystemNode) => {
      const crumbs: { id: string; name: string; isRoot: boolean }[] = [];
      const visited = new Set<string>();
      let traversalNode: FileSystemNode | null = node;

      try {
        while (traversalNode && !visited.has(traversalNode.id)) {
          visited.add(traversalNode.id);
          crumbs.unshift({
            id: traversalNode.id,
            name: traversalNode.name,
            isRoot: traversalNode.isRoot,
          });

          if (traversalNode.parentId) {
            try {
              const parentResponse = await fileSystemControllerGetNode({
                path: { nodeId: traversalNode.parentId },
              });
              traversalNode = toFileSystemNode(parentResponse.data as FileSystemNodeDto);
            } catch (error: unknown) {
              handleError(error, '获取父节点失败，停止构建面包屑');
              break;
            }
          } else {
            break;
          }
        }

        setBreadcrumbNodes(crumbs);
      } catch (err) {
        setBreadcrumbNodes([
          {
            id: node.id,
            name: node.name,
            isRoot: node.isRoot,
          },
        ]);
      }
    },
    []
  );

  // Build breadcrumbs when currentNode changes (normal mode, non-trash)
  useEffect(() => {
    if (
      nodeQuery.data &&
      !isProjectRootMode &&
      !isTrash &&
      !hasSearch
    ) {
      fetchBreadcrumbs(nodeQuery.data);
    }
  }, [
    nodeQuery.data,
    isProjectRootMode,
    isTrash,
    hasSearch,
    fetchBreadcrumbs,
  ]);

  // ── Personal space redirect detection ──────────────────────────────
  useEffect(() => {
    if (!nodeQuery.data || isPersonalSpaceMode) return;

    const nodeData = nodeQuery.data;

    if (nodeData.personalSpaceKey) {
      navigate('/personal-space');
      return;
    }

    if (personalSpaceId && effectiveNodeId) {
      fileSystemControllerGetRootNode({
        path: { nodeId: effectiveNodeId },
      })
        .then((response) => {
          const rootNode = response.data;
          if (rootNode?.personalSpaceKey) {
            if (urlNodeId) {
              navigate(`/personal-space/${urlNodeId}`);
            } else {
              navigate('/personal-space');
            }
          }
        })
        .catch((error) => {
          console.error('Failed to fetch root node for personal space redirection:', error);
        });
    }
  }, [
    nodeQuery.data,
    isPersonalSpaceMode,
    personalSpaceId,
    effectiveNodeId,
    urlNodeId,
    navigate,
  ]);

  // ── Derive current data from active query ──────────────────────────
  const activeData = (() => {
    if (isTrash && trashQuery.data) {
      return trashQuery.data;
    }
    if (hasSearch && searchQueryResult.data) {
      return searchQueryResult.data;
    }
    if (childrenQuery.data) {
      return childrenQuery.data;
    }
    return null;
  })();

  const nodes: FileSystemNode[] = activeData?.nodes || [];
  const paginationMeta: PaginationMeta | null = activeData
    ? {
        total: activeData.total,
        page: activeData.page,
        limit: activeData.limit,
        totalPages: activeData.totalPages,
      }
    : null;

  // Breadcrumbs: static for trash/project-root, derived for normal mode
  const breadcrumbs: BreadcrumbItem[] = (() => {
    if (isProjectRootMode && !isTrash) return [];

    if (isTrash && isPersonalSpaceMode) {
      const nodeId = urlNodeId || urlProjectId || '';
      return [
        { id: nodeId, name: '我的图纸', isRoot: true, isFolder: true },
        { id: 'trash', name: '回收站', isRoot: false, isFolder: true },
      ];
    }

    if (isTrash && !isPersonalSpaceMode && isProjectRootMode) {
      return [
        { id: 'trash', name: '回收站', isRoot: true, isFolder: true },
      ];
    }

    if (isTrash && !isPersonalSpaceMode && !isProjectRootMode && urlProjectId) {
      if (breadcrumbNodes && breadcrumbNodes.length >= 1) {
        return [
          ...breadcrumbNodes.map((n) => ({ ...n, isFolder: true })),
          { id: 'trash', name: '回收站', isRoot: false, isFolder: true },
        ];
      }
      const projectNode = nodeQuery.data;
      if (projectNode) {
        return [
          {
            id: projectNode.id,
            name: projectNode.name,
            isRoot: true,
            isFolder: true,
          },
          { id: 'trash', name: '回收站', isRoot: false, isFolder: true },
        ];
      }
      return [];
    }

    // Normal mode: use fetched breadcrumb chain
    if (breadcrumbNodes) {
      return breadcrumbNodes.map((n) => ({ ...n, isFolder: true }));
    }
    return [];
  })();

  const loading = isTrash
    ? trashQuery.isLoading
    : (hasSearch && searchQueryResult.isLoading) ||
      (!hasSearch && !isProjectRootMode && nodeQuery.isLoading) ||
      (!hasSearch && childrenQuery.isLoading);

  const isFetching = isTrash
    ? trashQuery.isFetching
    : (hasSearch && searchQueryResult.isFetching) ||
      (!hasSearch && !isProjectRootMode && nodeQuery.isFetching) ||
      (!hasSearch && childrenQuery.isFetching);

  const error = isTrash
    ? trashQuery.error
    : hasSearch
      ? searchQueryResult.error
      : nodeQuery.error || childrenQuery.error;

  // ── Refetch helpers ────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    // 使用 refetchQueries 替代 invalidateQueries，确保手动刷新时立即重新请求，
    // 不受 staleTime (30s) 的影响
    queryClient.refetchQueries({
      queryKey: queryKeys.fileSystem.all,
      type: 'active',
    });
  }, [queryClient]);

  // ── Public API (backward compatible) ───────────────────────────────

  /**
   * Backward-compatible loader. When called (e.g. from the refresh button),
   * it forces an immediate refetch of all active fileSystem queries,
   * bypassing the staleTime cache. This ensures the file list always
   * reflects the latest server state after user-initiated refresh.
   */
  const loadData = useCallback(async () => {
    refetchAll();
  }, [refetchAll]);

  /**
   * Backward-compatible no-op. Breadcrumbs are now built automatically
   * via the fetchBreadcrumbs effect when currentNode changes.
   */
  const buildBreadcrumbsFromNode = useCallback(
    async (_node: FileSystemNode, _signal?: AbortSignal) => {},
    []
  );

  return {
    nodes,
    currentNode: nodeQuery.data ?? null,
    breadcrumbs,
    loading,
    isFetching,
    error: error ? (error instanceof Error ? error.message : '加载数据失败') : null,
    paginationMeta,
    isTrashView,
    setIsTrashView,
    loadData,
    buildBreadcrumbsFromNode,
  };
};
