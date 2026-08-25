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

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  projectControllerGetProjects,
  nodeControllerSearch,
  nodeControllerGetNode,
  nodeControllerGetChildren,
  nodeControllerGetRootNode,
  FileSystemNodeDto,
  ProjectDto,
  type SearchScope,
} from '@/api-sdk';
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  toFileSystemNode,
} from '@/types/filesystem';

import { PaginationMeta } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/queryKeys';
import type { ProjectFilterType } from '@/api-sdk';
import type { SearchFilterValues } from '@/components/search/SearchFilters';
import { t } from '@/languages';

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
  setPagination: React.Dispatch<
    React.SetStateAction<{ page: number; limit: number }>
  >;
  paginationRef: React.MutableRefObject<{ page: number; limit: number }>;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  clearSelection: () => void;
  /** 是否处于回收站视图（由 useTrashView 提供，用于禁用非 trash 查询） */
  isTrashView?: boolean;
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
  isTrashView = false,
  projectFilter,
  searchFilters = {},
}: UseFileSystemDataProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Keep paginationRef in sync for backward compatibility
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination, paginationRef]);

  // ── Derived mode flags for query enabled checks ─────────────────────
  const isTrash = isTrashView;
  const hasSearch = !!searchQuery;
  // 只有搜索关键词走搜索 API（递归搜全部子目录）；筛选走 children API（只返回当前目录子节点）
  const shouldSearch = hasSearch;

  // Effective node ID for personal-space and folder modes
  const effectiveNodeId = isPersonalSpaceMode
    ? urlNodeId || urlProjectId || ''
    : urlNodeId || urlProjectId || '';

  // ── Query 1: Current node info ─────────────────────────────────────
  const nodeQuery = useQuery({
    queryKey: queryKeys.fileSystem.node(effectiveNodeId),
    queryFn: async () => {
      const response = await nodeControllerGetNode({
        path: { nodeId: effectiveNodeId },
      });
      // SDK 默认不抛错：显式抛出让 react-query 进入 error 态展示真实原因，
      // 否则对 undefined 调用 toFileSystemNode 抛英文 TypeError
      if (response.error) throw response.error;
      return toFileSystemNode(response.data as FileSystemNodeDto);
    },
    enabled:
      !!effectiveNodeId && !isProjectRootMode && !isTrash && !shouldSearch,
  });

  // ── Query 2: Children / Projects list ──────────────────────────────
  const childrenQuery = useQuery({
    queryKey: isProjectRootMode
      ? [
          ...queryKeys.fileSystem.children('__projects'),
          {
            filter: projectFilter,
            page: pagination.page,
            limit: pagination.limit,
            sortBy: searchFilters.sortBy,
            sortOrder: searchFilters.sortOrder,
          },
        ]
      : [
          ...queryKeys.fileSystem.children(effectiveNodeId),
          {
            page: pagination.page,
            limit: pagination.limit,
            search: searchQuery || undefined,
            extension: searchFilters.extensions,
            modifiedAtFrom: searchFilters.modifiedAtFrom,
            modifiedAtTo: searchFilters.modifiedAtTo,
            createdAtFrom: searchFilters.createdAtFrom,
            createdAtTo: searchFilters.createdAtTo,
            sizeMin: searchFilters.sizeMin,
            sizeMax: searchFilters.sizeMax,
            sortBy: searchFilters.sortBy,
            sortOrder: searchFilters.sortOrder,
          },
        ],
    queryFn: async () => {
      if (isProjectRootMode) {
        const response = await projectControllerGetProjects({
          query: {
            filter: projectFilter,
            page: pagination.page,
            limit: pagination.limit,
            sortBy: searchFilters.sortBy || undefined,
            sortOrder: (searchFilters.sortOrder as 'asc' | 'desc') || undefined,
          },
        });
        // SDK 默认不抛错：显式抛出让 react-query 感知失败，
        // 否则失败被当作"暂无项目"空态返回（历史 bug）
        if (response.error) throw response.error;

        const data = response.data;
        if (
          data &&
          typeof data === 'object' &&
          'nodes' in data &&
          Array.isArray(data.nodes)
        ) {
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
          nodes: allProjects.map((p) =>
            projectToNode(p as unknown as FileSystemNodeDto)
          ),
          total: allProjects.length,
          page: pagination.page,
          limit: pagination.limit,
          totalPages: Math.ceil(allProjects.length / pagination.limit),
        };
      }

      const response = await nodeControllerGetChildren({
        path: { nodeId: effectiveNodeId },
        query: {
          page: pagination.page,
          limit: pagination.limit,
          search: searchQuery || undefined,
          extension:
            searchFilters.extensions && searchFilters.extensions.length > 0
              ? searchFilters.extensions.join(',')
              : undefined,
          modifiedAtFrom: searchFilters.modifiedAtFrom || undefined,
          modifiedAtTo: searchFilters.modifiedAtTo || undefined,
          createdAtFrom: searchFilters.createdAtFrom || undefined,
          createdAtTo: searchFilters.createdAtTo || undefined,
          sizeMin:
            searchFilters.sizeMin !== undefined
              ? searchFilters.sizeMin
              : undefined,
          sizeMax:
            searchFilters.sizeMax !== undefined
              ? searchFilters.sizeMax
              : undefined,
          sortBy: searchFilters.sortBy || undefined,
          sortOrder: searchFilters.sortOrder || undefined,
        },
      });
      // SDK 默认不抛错：显式抛出让 react-query 感知失败，
      // 否则失败被当作"空目录"返回（历史 bug）
      if (response.error) throw response.error;

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
  // Inject timeRange as modified syntax for backward compat with search parser
  const effectiveSearchKeyword =
    searchFilters.timeRange && !searchFilters.modifiedAtFrom
      ? `modified:>${searchFilters.timeRange} ${searchQuery}`.trim()
      : searchQuery;

  const searchQueryResult = useQuery({
    queryKey: queryKeys.fileSystem.search({
      keyword: searchQuery,
      isProjectRootMode,
      isPersonalSpaceMode,
      projectId: isPersonalSpaceMode
        ? effectiveNodeId || undefined
        : (urlProjectId ?? undefined),
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
        // 当前位于某个项目/文件夹下时，按当前子树范围搜索，
        // 避免筛选时返回个人空间内其他项目的文件。
        searchProjectId = effectiveNodeId || undefined;
      } else if (urlProjectId) {
        searchScope = 'project_files';
        searchProjectId = urlProjectId;
      }

      const response = await nodeControllerSearch({
        query: {
          keyword: effectiveSearchKeyword,
          scope: searchScope,
          filter: searchFilter,
          projectId: searchProjectId,
          page: pagination.page,
          limit: pagination.limit,
          extension:
            hasSearch &&
            searchFilters.extensions &&
            searchFilters.extensions.length > 0
              ? searchFilters.extensions.join(',')
              : undefined,
          modifiedAtFrom:
            (hasSearch && searchFilters.modifiedAtFrom) || undefined,
          modifiedAtTo: (hasSearch && searchFilters.modifiedAtTo) || undefined,
          createdAtFrom:
            (hasSearch && searchFilters.createdAtFrom) || undefined,
          createdAtTo: (hasSearch && searchFilters.createdAtTo) || undefined,
          sizeMin:
            hasSearch && searchFilters.sizeMin !== undefined
              ? searchFilters.sizeMin
              : undefined,
          sizeMax:
            hasSearch && searchFilters.sizeMax !== undefined
              ? searchFilters.sizeMax
              : undefined,
          sortBy: (hasSearch && searchFilters.sortBy) || undefined,
          sortOrder: (hasSearch && searchFilters.sortOrder) || undefined,
        },
        signal: abortSignal,
      });
      // SDK 默认不抛错：显式抛出让 react-query 感知失败，
      // 否则搜索失败被当作"无搜索结果"返回（历史 bug）
      if (response.error) throw response.error;

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

  // ── Personal space redirect detection ──────────────────────────────
  useEffect(() => {
    if (!nodeQuery.data || isPersonalSpaceMode) return;

    const nodeData = nodeQuery.data;

    if (nodeData.personalSpaceKey) {
      navigate('/personal-space');
      return;
    }

    if (personalSpaceId && effectiveNodeId) {
      nodeControllerGetRootNode({
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
          console.error(
            'Failed to fetch root node for personal space redirection:',
            error
          );
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
    if (shouldSearch && searchQueryResult.data) {
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

  // Breadcrumbs: static for project-root, derived for normal mode
  // (trash breadcrumbs are provided by useTrashView)
  const breadcrumbs: BreadcrumbItem[] = (() => {
    if (isProjectRootMode) return [];

    // Normal mode: use ancestors from nodeQuery (single backend recursive CTE query,
    // replaces previous sequential per-parent HTTP requests)
    const ancestors = nodeQuery.data?.ancestors;
    if (ancestors && ancestors.length > 0) {
      const rootAncestor = ancestors[0];
      if (!rootAncestor) return [];
      // 根节点使用前端指定的名称（翻译后的），子节点直接用后端名称
      const rootName = isPersonalSpaceMode
        ? t('个人空间')
        : rootAncestor.name || t('公开资源库');
      return [
        { id: rootAncestor.id, name: rootName, isRoot: true, isFolder: true },
        ...ancestors.slice(1).map((a) => ({
          id: a.id,
          name: a.name,
          isRoot: false,
          isFolder: true,
        })),
      ];
    }
    return [];
  })();

  const loading =
    (shouldSearch && searchQueryResult.isLoading) ||
    (!shouldSearch && !isProjectRootMode && nodeQuery.isLoading) ||
    (!shouldSearch && childrenQuery.isLoading);

  const isFetching =
    (shouldSearch && searchQueryResult.isFetching) ||
    (!shouldSearch && !isProjectRootMode && nodeQuery.isFetching) ||
    (!shouldSearch && childrenQuery.isFetching);

  const error = shouldSearch
    ? searchQueryResult.error
    : nodeQuery.error || childrenQuery.error;

  // ── Refetch helpers ────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    // 使用 refetchQueries 替代 invalidateQueries，确保手动刷新时立即重新请求，
    // 不受 staleTime (30s) 的影响
    queryClient.refetchQueries({
      queryKey: queryKeys.fileSystem.all,
      type: 'all',
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

  return {
    nodes,
    currentNode: nodeQuery.data ?? null,
    breadcrumbs,
    loading,
    isFetching,
    error: error
      ? error instanceof Error
        ? error.message
        : t('加载数据失败')
      : null,
    paginationMeta,
    loadData,
  };
};
