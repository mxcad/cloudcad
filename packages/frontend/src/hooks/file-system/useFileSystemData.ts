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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetTrash,
  fileSystemControllerGetProjectTrash,
  fileSystemControllerSearch,
  fileSystemControllerGetNode,
  fileSystemControllerGetChildren,
  fileSystemControllerGetRootNode,
} from '@/api-sdk';
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  toFileSystemNode,
} from '@/types/filesystem';
import type { FileSystemNodeDto, ProjectDto } from '@/types/api-client';
import { PaginationMeta } from '@/components/ui/Pagination';
import { handleError } from '@/utils/errorHandler';
import { queryKeys } from '@/lib/queryKeys';
import type { ProjectFilterType } from '@/types/project';

/** 从 API 响应包装中提取 data 属性类型 */
type UnwrapApiResponse<T> = T extends { data: infer D } ? D : T;

interface UseFileSystemDataProps {
  urlProjectId: string | undefined;
  urlNodeId: string | undefined;
  isProjectRootMode: boolean;
  isPersonalSpaceMode?: boolean;
  personalSpaceId?: string | null;
  searchQuery: string;
  paginationRef: React.MutableRefObject<{ page: number; limit: number }>;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  clearSelection: () => void;
  setIsMultiSelectMode: (value: boolean) => void;
  /** 项目过滤类型：all-全部，owned-我创建的，joined-我加入的 */
  projectFilter?: ProjectFilterType;
}

export const useFileSystemData = ({
  urlProjectId,
  urlNodeId,
  isProjectRootMode,
  isPersonalSpaceMode = false,
  personalSpaceId,
  searchQuery,
  paginationRef,
  showToast,
  clearSelection,
  setIsMultiSelectMode,
  projectFilter,
}: UseFileSystemDataProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Pagination state (source of truth for query params) ──────────────
  const [pagination, setPagination] = useState(() => ({
    page: paginationRef.current.page,
    limit: paginationRef.current.limit,
  }));

  // Keep paginationRef in sync for backward compatibility
  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination, paginationRef]);

  // ── Trash view state (managed here, exposed to parent) ──────────────
  const [isTrashView, setIsTrashView] = useState(false);
  const [isProjectTrashView, setIsProjectTrashView] = useState(false);
  const isProjectTrashViewRef = useRef(isProjectTrashView);

  useEffect(() => {
    isProjectTrashViewRef.current = isProjectTrashView;
  }, [isProjectTrashView]);

  // Reset trash view state on mode change
  useEffect(() => {
    if (isProjectRootMode) {
      setIsTrashView(false);
    } else {
      setIsProjectTrashView(false);
    }
  }, [isProjectRootMode]);

  // ── Derived mode flags for query enabled checks ─────────────────────
  const isTrash = isTrashView || isProjectTrashView;
  const hasSearch = !!searchQuery;

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
      !!effectiveNodeId && !isProjectRootMode && !isTrash && !hasSearch,
  });

  // ── Query 2: Children / Projects list ──────────────────────────────
  const childrenQuery = useQuery({
    queryKey: isProjectRootMode
      ? [...queryKeys.fileSystem.children('__projects'), { filter: projectFilter, page: pagination.page, limit: pagination.limit }]
      : queryKeys.fileSystem.children(effectiveNodeId),
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
        if (data && 'nodes' in data && Array.isArray(data.nodes)) {
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
      if (data) {
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
      (!!effectiveNodeId && !isTrash && !hasSearch) || isProjectRootMode,
  });

  // ── Query 3: Search results ────────────────────────────────────────
  const searchQueryResult = useQuery({
    queryKey: queryKeys.fileSystem.search({
      keyword: searchQuery,
      isProjectRootMode,
      isPersonalSpaceMode,
      projectId: isProjectRootMode
        ? undefined
        : isPersonalSpaceMode
          ? (urlNodeId || urlProjectId || '')
          : urlProjectId,
      filter: isProjectRootMode ? projectFilter : undefined,
      page: pagination.page,
      limit: pagination.limit,
    }),
    queryFn: async () => {
      let searchScope = 'project_files';
      let searchProjectId: string | undefined;
      let searchFilter: 'all' | 'owned' | 'joined' = 'all';

      if (isProjectRootMode) {
        searchScope = 'project';
        searchFilter = projectFilter || 'all';
      } else if (isPersonalSpaceMode || urlProjectId) {
        searchScope = 'project_files';
        searchProjectId = isPersonalSpaceMode
          ? (urlNodeId || urlProjectId || '')
          : urlProjectId;
      }

      const response = await fileSystemControllerSearch({
        query: {
          keyword: searchQuery,
          scope: searchScope as 'project' | 'project_files',
          filter: searchFilter,
          projectId: searchProjectId,
          page: pagination.page,
          limit: pagination.limit,
        },
      });

      const data = response.data;
      if (data) {
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
    enabled: hasSearch,
  });

  // ── Query 4: Trash ────────────────────────────────────────────────
  const trashQuery = useQuery({
    queryKey: isProjectTrashView
      ? [...queryKeys.fileSystem.trash, effectiveNodeId, { page: pagination.page, limit: pagination.limit }] as const
      : [...queryKeys.fileSystem.trash, { page: pagination.page, limit: pagination.limit }] as const,
    queryFn: async () => {
      // 项目内/私人空间回收站：调用项目级接口
      if (isProjectTrashView && effectiveNodeId) {
        const response = await fileSystemControllerGetProjectTrash({
          path: { projectId: effectiveNodeId },
          query: {
            page: pagination.page,
            limit: pagination.limit,
          },
        });

        const data = response.data;
        if (data) {
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
      }

      // 全局回收站：调用全局接口（仅返回已删除的项目）
      const response = await fileSystemControllerGetTrash();

      const data = response.data;
      if (data) {
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
    if (hasSearch && searchQueryResult.data) {
      return searchQueryResult.data;
    }
    if (isTrash && trashQuery.data) {
      return trashQuery.data;
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

    if (isTrashView && isPersonalSpaceMode) {
      const nodeId = urlNodeId || urlProjectId || '';
      return [
        { id: nodeId, name: '我的图纸', isRoot: true, isFolder: true },
        { id: 'trash', name: '回收站', isRoot: false, isFolder: true },
      ];
    }

    if (isTrash && !isPersonalSpaceMode && isProjectRootMode) {
      return [];
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

  const loading =
    (hasSearch && searchQueryResult.isLoading) ||
    (!hasSearch && isTrash && trashQuery.isLoading) ||
    (!hasSearch && !isTrash && !isProjectRootMode && nodeQuery.isLoading) ||
    (!hasSearch && !isTrash && childrenQuery.isLoading);

  const error = hasSearch
    ? searchQueryResult.error
    : isTrash
      ? trashQuery.error
      : nodeQuery.error || childrenQuery.error;

  // ── Refetch helpers ────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.all });
  }, [queryClient]);

  // ── Public API (backward compatible) ───────────────────────────────

  /**
   * Backward-compatible loader. In the React Query architecture, data is
   * fetched automatically when query keys change. This method exists so
   * that the parent (useFileSystem.ts) can still call it imperatively,
   * e.g. for manual refresh. Internally it simply invalidates all
   * fileSystem queries.
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
    error: error ? (error instanceof Error ? error.message : '加载数据失败') : null,
    paginationMeta,
    isTrashView,
    setIsTrashView,
    isProjectTrashView,
    setIsProjectTrashView,
    isProjectTrashViewRef,
    loadData,
    buildBreadcrumbsFromNode,
  };
};
