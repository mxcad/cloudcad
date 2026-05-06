///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  libraryControllerGetDrawingLibrary,
  libraryControllerGetDrawingChildren,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockLibrary,
  libraryControllerGetBlockChildren,
  libraryControllerGetBlockAllFiles,
  libraryControllerGetBlockNode,
} from '@/api-sdk';
import type { FileSystemNode } from '../../types/filesystem';
import { queryKeys } from '../../lib/queryKeys';

export type LibraryType = 'drawing' | 'block';

interface UseLibraryQueryOptions {
  libraryType: LibraryType;
  nodeId: string | undefined;
  page: number;
  limit: number;
  search: string;
  onTotalChange?: (total: number) => void;
  onTotalPagesChange?: (pages: number) => void;
}

interface LibraryData {
  libraryId: string;
  libraryName: string;
}

interface ChildrenData {
  nodes: FileSystemNode[];
  total: number;
  totalPages: number;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface UseLibraryQueryReturn {
  libraryId: string | null;
  nodes: FileSystemNode[];
  currentNode: FileSystemNode | null;
  breadcrumbs: BreadcrumbItem[];
  loading: boolean;
  error: string | null;
  isFolderMode: boolean;
}

// ---- queryKey helpers ----

function getLibraryQueryKey(type: LibraryType) {
  return type === 'drawing'
    ? queryKeys.library.drawing.library
    : queryKeys.library.block.library;
}

function getChildrenQueryKey(type: LibraryType, nodeId: string) {
  return type === 'drawing'
    ? queryKeys.library.drawing.children(nodeId)
    : queryKeys.library.block.children(nodeId);
}

function getAllFilesQueryKey(type: LibraryType, nodeId: string, search: string) {
  const base =
    type === 'drawing'
      ? queryKeys.library.drawing.allFiles(nodeId)
      : queryKeys.library.block.allFiles(nodeId);
  return [...base, { search }] as const;
}

function getNodeQueryKey(type: LibraryType, nodeId: string) {
  return type === 'drawing'
    ? queryKeys.library.drawing.node(nodeId)
    : queryKeys.library.block.node(nodeId);
}

// ---- API method resolvers ----

function getLibraryApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingLibrary
    : libraryControllerGetBlockLibrary;
}

function getChildrenApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingChildren
    : libraryControllerGetBlockChildren;
}

function getAllFilesApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingAllFiles
    : libraryControllerGetBlockAllFiles;
}

function getNodeApi(type: LibraryType) {
  return type === 'drawing'
    ? libraryControllerGetDrawingNode
    : libraryControllerGetBlockNode;
}

// ---- 面包屑构建 ----

async function getNodePath(
  type: LibraryType,
  nodeId: string,
  libraryId: string
): Promise<BreadcrumbItem[]> {
  const nodeApi = getNodeApi(type);
  const nodeResponse = await nodeApi({ path: { nodeId } });
  if (nodeResponse.error) throw nodeResponse.error;
  const nodeData = nodeResponse.data as FileSystemNode & {
    parent?: { id: string; name: string };
  };

  if (nodeData.id === libraryId) {
    return [];
  }

  let path: BreadcrumbItem[] = [];
  if (nodeData.parentId && nodeData.parentId !== libraryId) {
    path = await getNodePath(type, nodeData.parentId, libraryId);
  }

  path.push({ id: nodeData.id, name: nodeData.name });
  return path;
}

async function buildBreadcrumbs(
  type: LibraryType,
  libraryData: LibraryData,
  nodeId: string
): Promise<BreadcrumbItem[]> {
  const nodeApi = getNodeApi(type);
  const crumbs: BreadcrumbItem[] = [
    { id: libraryData.libraryId, name: libraryData.libraryName },
  ];

  try {
    const nodeResponse = await nodeApi({ path: { nodeId } });
    if (nodeResponse.error) throw nodeResponse.error;
    const nodeData = nodeResponse.data as FileSystemNode & {
      parent?: { id: string; name: string };
    };

    if (nodeData.id === libraryData.libraryId) {
      return crumbs;
    }

    // 递归获取完整路径
    const pathNodes = await getNodePath(type, nodeData.id, libraryData.libraryId);
    if (pathNodes.length > 0) {
      // 过滤掉库根节点（已在 crumbs[0]）
      const intermediate = pathNodes.filter(
        (p) => p.id !== libraryData.libraryId
      );
      // 最后一个节点是当前节点，最后单独添加
      if (intermediate.length > 0) {
        intermediate.pop();
        crumbs.push(...intermediate);
      }
    }

    crumbs.push({ id: nodeData.id, name: nodeData.name });
    return crumbs;
  } catch {
    // 回退：尝试用 parentId 构建单层面包屑
    try {
      const nodeResponse = await nodeApi({ path: { nodeId } });
      if (!nodeResponse.error) {
        const nodeData = nodeResponse.data as FileSystemNode & {
          parent?: { id: string; name: string };
        };
        if (nodeData.parent && nodeData.parent.id !== libraryData.libraryId) {
          crumbs.push({
            id: nodeData.parent.id,
            name: nodeData.parent.name,
          });
        }
        crumbs.push({ id: nodeData.id, name: nodeData.name });
      }
    } catch {
      // 静默失败
    }
    return crumbs;
  }
}

/**
 * 资源库数据查询 Hook
 *
 * 管理库根节点、子节点列表、搜索、面包屑的查询逻辑。
 * 使用 React Query 实现缓存和自动重试。
 */
export function useLibraryQuery({
  libraryType,
  nodeId,
  page,
  limit,
  search,
  onTotalChange,
  onTotalPagesChange,
}: UseLibraryQueryOptions): UseLibraryQueryReturn {
  // ---- 1. 库根节点信息 ----
  const libraryQuery = useQuery({
    queryKey: getLibraryQueryKey(libraryType),
    queryFn: async () => {
      const api = getLibraryApi(libraryType);
      const result = await api();
      if (result.error) throw result.error;
      const data = result.data as { id: string; name: string };
      return { libraryId: data.id, libraryName: data.name } as LibraryData;
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const libraryId = libraryQuery.data?.libraryId ?? null;
  const isFolderMode = !!nodeId || !!libraryId;

  // ---- 2. 搜索模式：获取所有文件 ----
  const searchQuery = useQuery({
    queryKey: getAllFilesQueryKey(libraryType, libraryId || '__disabled__', search),
    queryFn: async () => {
      const api = getAllFilesApi(libraryType);
      const result = await api({
        path: { nodeId: libraryId! },
        query: { page, limit, search },
      });
      if (result.error) throw result.error;
      const data = result.data as {
        nodes: FileSystemNode[];
        total?: number;
        totalPages?: number;
      };
      return {
        nodes: data.nodes || [],
        total: data.total || (data.nodes || []).length,
        totalPages:
          data.totalPages ||
          Math.ceil(((data.total || (data.nodes || []).length) as number) / limit),
      } as ChildrenData;
    },
    enabled: !!search && !!libraryId,
    throwOnError: false,
  });

  // ---- 3. 子节点列表（非搜索模式） ----
  const effectiveNodeId = nodeId || libraryId;
  const childrenQuery = useQuery({
    queryKey: getChildrenQueryKey(libraryType, effectiveNodeId || '__disabled__'),
    queryFn: async () => {
      const api = getChildrenApi(libraryType);
      const result = await api({
        path: { nodeId: effectiveNodeId! },
        query: { page, limit },
      });
      if (result.error) throw result.error;
      const data = result.data as {
        nodes: FileSystemNode[];
        total?: number;
        totalPages?: number;
      };
      return {
        nodes: data.nodes || [],
        total: data.total || (data.nodes || []).length,
        totalPages:
          data.totalPages ||
          Math.ceil(((data.total || (data.nodes || []).length) as number) / limit),
      } as ChildrenData;
    },
    enabled: !search && !!effectiveNodeId,
    throwOnError: false,
  });

  // ---- 4. 当前节点详情（有 nodeId 时） ----
  const nodeQuery = useQuery({
    queryKey: getNodeQueryKey(libraryType, nodeId || '__disabled__'),
    queryFn: async () => {
      const api = getNodeApi(libraryType);
      const result = await api({ path: { nodeId: nodeId! } });
      if (result.error) throw result.error;
      return result.data as FileSystemNode;
    },
    enabled: !!nodeId,
    staleTime: 2 * 60 * 1000,
    throwOnError: false,
  });

  // ---- 5. 面包屑 ----
  const breadcrumbsQuery = useQuery({
    queryKey: ['library', libraryType, 'breadcrumbs', nodeId || 'root'] as const,
    queryFn: async () => {
      if (!nodeId || !libraryId || !libraryQuery.data) {
        return libraryQuery.data
          ? [{ id: libraryQuery.data.libraryId, name: libraryQuery.data.libraryName }]
          : [];
      }
      return buildBreadcrumbs(libraryType, libraryQuery.data, nodeId);
    },
    enabled: !search && !!libraryId,
    staleTime: 2 * 60 * 1000,
    throwOnError: false,
  });

  // ---- 派生状态 ----
  const isLoading = useMemo(() => {
    if (search) return searchQuery.isLoading;
    return libraryQuery.isLoading || childrenQuery.isLoading;
  }, [search, searchQuery.isLoading, libraryQuery.isLoading, childrenQuery.isLoading]);

  const queryError = search ? searchQuery.error : childrenQuery.error;

  const nodes = useMemo(() => {
    if (search) return searchQuery.data?.nodes ?? [];
    return childrenQuery.data?.nodes ?? [];
  }, [search, searchQuery.data, childrenQuery.data]);

  const currentNode = nodeId ? (nodeQuery.data ?? null) : null;

  const breadcrumbs = breadcrumbsQuery.data ?? [];

  // 通知分页信息变化（useEffect 避免渲染阶段副作用）
  const paginationData = search ? searchQuery.data : childrenQuery.data;
  useEffect(() => {
    if (paginationData) {
      onTotalChange?.(paginationData.total);
      onTotalPagesChange?.(paginationData.totalPages);
    }
  }, [paginationData, onTotalChange, onTotalPagesChange]);

  return {
    libraryId,
    nodes,
    currentNode,
    breadcrumbs,
    loading: isLoading,
    error: queryError ? (queryError as Error).message : null,
    isFolderMode,
  };
}
