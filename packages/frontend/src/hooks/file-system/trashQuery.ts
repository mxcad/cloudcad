///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * trash 子域查询辅助（非 hook）：trash react-query 配置构建 + 面包屑派生。
 */

import { trashControllerGetTrash } from '@/api-sdk';

import { t } from '@/languages';
import { queryKeys } from '@/lib/queryKeys';
import { toFileSystemNode } from '@/types/filesystem';
import type { BreadcrumbItem, FileSystemNode } from '@/types/filesystem';
import type { SearchFilterValues } from '@/components/search/SearchFilters';

export interface TrashListData {
  nodes: FileSystemNode[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface BuildTrashQueryOptionsArgs {
  /** trash 查询的项目范围（非项目根模式 + trash 视图时生效） */
  projectIdForTrash: string | undefined;
  page: number;
  limit: number;
  searchQuery: string;
  searchFilters: SearchFilterValues;
  isTrashView: boolean;
}

/** 构建 trash react-query 配置（由 useTrashView 消费） */
export function buildTrashQueryOptions({
  projectIdForTrash,
  page,
  limit,
  searchQuery,
  searchFilters,
  isTrashView,
}: BuildTrashQueryOptionsArgs) {
  return {
    queryKey: [
      ...queryKeys.fileSystem.trash,
      {
        projectId: projectIdForTrash,
        page,
        limit,
        search: searchQuery,
        extensions: searchFilters.extensions,
        sortBy: searchFilters.sortBy,
        sortOrder: searchFilters.sortOrder,
      },
    ] as const,
    queryFn: async () => {
      const response = await trashControllerGetTrash({
        query: {
          projectId: projectIdForTrash,
          page,
          limit,
          search: searchQuery || undefined,
          extension:
            searchFilters.extensions && searchFilters.extensions.length > 0
              ? searchFilters.extensions.join(',')
              : undefined,
          sortBy: searchFilters.sortBy || undefined,
          sortOrder: searchFilters.sortOrder || undefined,
        },
      });
      // SDK 默认不抛错：显式抛出让 react-query 感知失败，
      // 否则加载失败被当作"回收站为空"返回（历史 bug）
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
        page,
        limit,
        totalPages: 0,
      };
    },
    enabled: isTrashView,
  };
}

interface BuildTrashBreadcrumbsArgs {
  isTrashView: boolean;
  isPersonalSpaceMode?: boolean;
  isProjectRootMode: boolean;
  urlProjectId?: string;
  urlNodeId?: string;
  /** 当前项目节点（trash 面包屑根节点名称来源） */
  currentNode: FileSystemNode | null;
}

/** 派生 trash 视图面包屑 */
export function buildTrashBreadcrumbs({
  isTrashView,
  isPersonalSpaceMode = false,
  isProjectRootMode,
  urlProjectId,
  urlNodeId,
  currentNode,
}: BuildTrashBreadcrumbsArgs): BreadcrumbItem[] {
  if (!isTrashView) return [];
  if (isPersonalSpaceMode) {
    const nodeId = urlNodeId || urlProjectId || '';
    return [
      { id: nodeId, name: t('个人空间'), isRoot: true, isFolder: true },
      { id: 'trash', name: t('回收站'), isRoot: false, isFolder: true },
    ];
  }
  if (isProjectRootMode) {
    return [{ id: 'trash', name: t('回收站'), isRoot: true, isFolder: true }];
  }
  if (urlProjectId) {
    if (currentNode) {
      return [
        {
          id: currentNode.id,
          name: currentNode.name,
          isRoot: true,
          isFolder: true,
        },
        { id: 'trash', name: t('回收站'), isRoot: false, isFolder: true },
      ];
    }
    return [];
  }
  return [];
}
