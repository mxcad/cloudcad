///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData, type QueryKey } from '@tanstack/react-query';
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
import type { NodeListResponseDto, FileSystemNodeDto } from '@/api-sdk';
import { queryKeys } from '../../lib/queryKeys';

export type LibraryType = 'drawing' | 'block';

interface UseLibraryQueryOptions {
  libraryType: LibraryType;
  nodeId: string | undefined;
  page: number;
  limit: number;
  search: string;
  /** 根级是否用 flat 模式（getAllFiles）vs 层级目录（getChildren）。默认 true 保持侧边栏行为 */
  flatMode?: boolean;
  onTotalChange?: (total: number) => void;
  onTotalPagesChange?: (pages: number) => void;
  /** 刷新计数器，递增时强制重新获取（如同一目录下的删除/重命名） */
  refreshKey?: number;
}

interface LibraryData {
  libraryId: string;
  libraryName: string;
}

type ChildrenData = Pick<
  NodeListResponseDto,
  'nodes' | 'total' | 'totalPages'
>;

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
  /** 后台刷新中（数据已存在但正在重新获取），用于驱动刷新按钮 spinner */
  isFetching: boolean;
  /** 当前数据是否为 keepPreviousData 占位数据（真实数据尚未就绪） */
  isPlaceholderData: boolean;
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
  libraryId: string,
): Promise<BreadcrumbItem[]> {
  const nodeApi = getNodeApi(type);
  const nodeResponse = await nodeApi({ path: { nodeId } });
  if (nodeResponse.error) throw nodeResponse.error;

  // FileSystemNodeDto 没有 parent 字段，但 API 响应实际包含
  const nodeData = nodeResponse.data as FileSystemNodeDto & {
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
  nodeId: string,
): Promise<BreadcrumbItem[]> {
  const nodeApi = getNodeApi(type);
  const crumbs: BreadcrumbItem[] = [
    { id: libraryData.libraryId, name: libraryData.libraryName },
  ];

  try {
    const nodeResponse = await nodeApi({ path: { nodeId } });
    if (nodeResponse.error) throw nodeResponse.error;
    const nodeData = nodeResponse.data as FileSystemNodeDto & {
      parent?: { id: string; name: string };
    };

    if (nodeData.id === libraryData.libraryId) {
      return crumbs;
    }

    const pathNodes = await getNodePath(type, nodeData.id, libraryData.libraryId);
    if (pathNodes.length > 0) {
      const intermediate = pathNodes.filter(
        (p) => p.id !== libraryData.libraryId,
      );
      if (intermediate.length > 0) {
        intermediate.pop();
        crumbs.push(...intermediate);
      }
    }

    crumbs.push({ id: nodeData.id, name: nodeData.name });
    return crumbs;
  } catch {
    try {
      const nodeResponse = await nodeApi({ path: { nodeId } });
      if (!nodeResponse.error) {
        const nodeData = nodeResponse.data as FileSystemNodeDto & {
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

// ---- 构建 queryKey 辅助函数（消除条件类型断言） ----

function buildChildrenOrAllFilesKey(
  libraryType: LibraryType,
  useAllFiles: boolean,
  effectiveNodeId: string,
): QueryKey {
  if (useAllFiles) {
    return getAllFilesQueryKey(libraryType, effectiveNodeId, '');
  }
  return getChildrenQueryKey(libraryType, effectiveNodeId);
}

/**
 * 资源库数据查询 Hook
 *
 * 管理库根节点、子节点列表、搜索、面包屑的查询逻辑。
 * 使用 React Query 实现缓存和自动重试。
 *
 * 类型安全性：
 * - SDK 返回类型为判别联合：{ data: Dto; error: undefined } | { data: undefined; error: unknown }
 * - if (result.error) throw → TypeScript 自动窄化 result.data 为精确的 Dto 类型
 * - 不使用 as 类型断言
 */
export function useLibraryQuery({
  libraryType,
  nodeId,
  page,
  limit,
  search,
  flatMode = true,
  onTotalChange,
  onTotalPagesChange,
  refreshKey = 0,
}: UseLibraryQueryOptions): UseLibraryQueryReturn {
  // ---- 1. 库根节点信息 ----
  const libraryQuery = useQuery({
    queryKey: getLibraryQueryKey(libraryType),
    queryFn: async (): Promise<LibraryData> => {
      const api = getLibraryApi(libraryType);
      const result = await api();
      if (result.error || !result.data) throw result.error ?? new Error('Library root not found');
      return {
        libraryId: result.data.id,
        libraryName: result.data.name,
      };
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
  });

  const libraryId = libraryQuery.data?.libraryId ?? null;
  const isFolderMode = !!nodeId || !!libraryId;

  // ---- 2. 搜索模式：获取所有文件 ----
  const searchQuery = useQuery({
    queryKey: [...getAllFilesQueryKey(libraryType, libraryId || '__disabled__', search), { page, limit }] as const,
    queryFn: async (): Promise<ChildrenData> => {
      const api = getAllFilesApi(libraryType);
      const result = await api({
        path: { nodeId: libraryId! },
        query: { page, limit, search },
      });
      if (result.error || !result.data) throw result.error ?? new Error('Search failed');
      return {
        nodes: result.data.nodes || [],
        total: result.data.total || (result.data.nodes || []).length,
        totalPages:
          result.data.totalPages ||
          Math.ceil(((result.data.total || (result.data.nodes || []).length) / limit)),
      };
    },
    enabled: !!search && !!libraryId,
    throwOnError: false,
    placeholderData: keepPreviousData,
  });

  // ---- 3. 子节点列表（非搜索模式） ----
  // flatMode=true: 递归获取该节点下所有嵌套文件（getAllFiles，侧边栏用）
  // flatMode=false: 仅直接子节点（getChildren，管理页用）
  const effectiveNodeId = nodeId || libraryId;
  const useAllFiles = flatMode && !!libraryId;
  const childrenQuery = useQuery({
    queryKey: [
      ...buildChildrenOrAllFilesKey(
        libraryType,
        useAllFiles,
        effectiveNodeId || '__disabled__',
      ),
      { page, limit },
    ] as const,
    queryFn: async (): Promise<ChildrenData> => {
      let data: NodeListResponseDto;
      if (useAllFiles) {
        const api = getAllFilesApi(libraryType);
        const result = await api({
          path: { nodeId: effectiveNodeId! },
          query: { page, limit },
        });
        if (result.error || !result.data) throw result.error ?? new Error('Failed to load children');
        data = result.data;
      } else {
        const api = getChildrenApi(libraryType);
        const result = await api({
          path: { nodeId: effectiveNodeId! },
          query: { page, limit },
        });
        if (result.error || !result.data) throw result.error ?? new Error('Failed to load children');
        data = result.data;
      }
      return {
        nodes: data.nodes || [],
        total: data.total || (data.nodes || []).length,
        totalPages:
          data.totalPages ||
          Math.ceil(((data.total || (data.nodes || []).length) / limit)),
      };
    },
    enabled: !search && !!effectiveNodeId,
    throwOnError: false,
    placeholderData: keepPreviousData,
  });

  // ---- 4. 当前节点详情（有 nodeId 时） ----
  const nodeQuery = useQuery({
    queryKey: getNodeQueryKey(libraryType, nodeId || '__disabled__'),
    queryFn: async (): Promise<FileSystemNodeDto> => {
      const api = getNodeApi(libraryType);
      const result = await api({ path: { nodeId: nodeId! } });
      if (result.error || !result.data) throw result.error ?? new Error('Node not found');
      return result.data;
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
    if (search) return searchQuery.isLoading || searchQuery.isPlaceholderData;
    return libraryQuery.isLoading || childrenQuery.isLoading || childrenQuery.isPlaceholderData;
  }, [search, searchQuery.isLoading, searchQuery.isPlaceholderData,
      libraryQuery.isLoading, childrenQuery.isLoading, childrenQuery.isPlaceholderData]);

  // isFetching: 后台刷新时仍为 true，用于驱动刷新按钮的 spinner
  const isFetching = useMemo(() => {
    if (search) {
      return searchQuery.isFetching || libraryQuery.isFetching;
    }
    return libraryQuery.isFetching || childrenQuery.isFetching || nodeQuery.isFetching;
  }, [search, searchQuery.isFetching, libraryQuery.isFetching, childrenQuery.isFetching, nodeQuery.isFetching]);

  const queryError = search ? searchQuery.error : childrenQuery.error;

  const nodes = useMemo(() => {
    if (search) return searchQuery.data?.nodes ?? [];
    return childrenQuery.data?.nodes ?? [];
  }, [search, searchQuery.data, childrenQuery.data]);

  const currentNode = nodeId ? (nodeQuery.data ?? null) : null;

  const breadcrumbs = breadcrumbsQuery.data ?? [];

  // 通知分页信息变化（useEffect 避免渲染阶段副作用，跳过 keepPreviousData 占位数据）
  const isPlaceholder = search
    ? searchQuery.isPlaceholderData
    : childrenQuery.isPlaceholderData;
  const paginationData = search ? searchQuery.data : childrenQuery.data;
  useEffect(() => {
    if (paginationData && !isPlaceholder) {
      onTotalChange?.(paginationData.total);
      onTotalPagesChange?.(paginationData.totalPages);
    }
  }, [paginationData, isPlaceholder, onTotalChange, onTotalPagesChange]);

  return {
    libraryId,
    nodes,
    currentNode,
    breadcrumbs,
    loading: isLoading,
    isFetching,
    isPlaceholderData: isPlaceholder,
    error: queryError ? String(queryError) : null,
    isFolderMode,
  };
}
