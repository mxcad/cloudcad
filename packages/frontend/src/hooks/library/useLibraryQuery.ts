///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useEffect, useMemo } from 'react';
import {
  useQuery,
  keepPreviousData,
} from '@tanstack/react-query';
import type { FileSystemNode } from '../../types/filesystem';
import type { FileSystemNodeDto, NodeListResponseDto } from '@/api-sdk';
import { t } from '@/languages';
import { withTimeout } from '@/utils/withTimeout';
import { REQUEST_TIMEOUT_MS } from '@/constants/timeouts';
import {
  getLibraryQueryKey,
  getAllFilesQueryKey,
  getNodeQueryKey,
  buildChildrenOrAllFilesKey,
  getLibraryApi,
  getChildrenApi,
  getAllFilesApi,
  getNodeApi,
  type LibraryType,
  type LibraryData,
  type ChildrenData,
  type BreadcrumbItem,
} from './libraryQueryHelpers';
import { buildBreadcrumbs } from './libraryBreadcrumbs';

export type { LibraryType } from './libraryQueryHelpers';

interface UseLibraryQueryOptions {
  libraryType: LibraryType;
  nodeId: string | undefined;
  page: number;
  limit: number;
  search: string;
  /** 根级是否用 flat 模式（getAllFiles）vs 层级目录（getChildren）。默认 true 保持侧边栏行为 */
  flatMode?: boolean;
  /** 排序字段。默认 'createdAt'，可选 'name' | 'createdAt' | 'updatedAt' | 'size' */
  sortBy?: string;
  /** 排序方向。默认 'desc' */
  sortOrder?: 'asc' | 'desc';
  /** 是否启用查询（用于面板不可见时跳过 API 请求），默认 true */
  enabled?: boolean;
  onTotalChange?: (total: number) => void;
  onTotalPagesChange?: (pages: number) => void;
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
  sortBy = 'createdAt',
  sortOrder = 'desc',
  enabled = true,
  onTotalChange,
  onTotalPagesChange,
}: UseLibraryQueryOptions): UseLibraryQueryReturn {
  // ---- 1. 库根节点信息 ----
  const libraryQuery = useQuery({
    queryKey: getLibraryQueryKey(libraryType),
    queryFn: async (): Promise<LibraryData> => {
      const api = getLibraryApi(libraryType);
      const result = await withTimeout(api(), REQUEST_TIMEOUT_MS);
      if (result.error || !result.data)
        throw result.error ?? new Error('Library root not found');
      return {
        libraryId: result.data.id,
        libraryName: result.data.name,
      };
    },
    staleTime: 5 * 60 * 1000,
    throwOnError: false,
    enabled,
  });

  const libraryId = libraryQuery.data?.libraryId ?? null;
  const isFolderMode = !!nodeId || !!libraryId;

  // ---- 2. 搜索模式：获取所有文件 ----
  const searchQuery = useQuery({
    queryKey: [
      ...getAllFilesQueryKey(libraryType, libraryId || '__disabled__', search),
      { page, limit },
    ] as const,
    queryFn: async (): Promise<ChildrenData> => {
      const api = getAllFilesApi(libraryType);
      const result = await withTimeout(
        api({
          path: { nodeId: libraryId! },
          query: { page, limit, search, sortBy, sortOrder },
        }),
        REQUEST_TIMEOUT_MS
      );
      if (result.error || !result.data)
        throw result.error ?? new Error('Search failed');
      return {
        nodes: result.data.nodes || [],
        total: result.data.total || (result.data.nodes || []).length,
        totalPages:
          result.data.totalPages ||
          Math.ceil(
            (result.data.total || (result.data.nodes || []).length) / limit
          ),
      };
    },
    enabled: enabled && !!search && !!libraryId,
    staleTime: 10 * 1000,
    throwOnError: false,
    retry: 1,
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
        effectiveNodeId || '__disabled__'
      ),
      { page, limit },
    ] as const,
    queryFn: async (): Promise<ChildrenData> => {
      let data: NodeListResponseDto;
      if (useAllFiles) {
        const api = getAllFilesApi(libraryType);
        const result = await withTimeout(
          api({
            path: { nodeId: effectiveNodeId! },
            query: { page, limit, sortBy, sortOrder },
          }),
          REQUEST_TIMEOUT_MS
        );
        if (result.error || !result.data)
          throw result.error ?? new Error('Failed to load children');
        data = result.data;
      } else {
        const api = getChildrenApi(libraryType);
        const result = await withTimeout(
          api({
            path: { nodeId: effectiveNodeId! },
            query: { page, limit, sortBy, sortOrder },
          }),
          REQUEST_TIMEOUT_MS
        );
        if (result.error || !result.data)
          throw result.error ?? new Error('Failed to load children');
        data = result.data;
      }
      return {
        nodes: data.nodes || [],
        total: data.total || (data.nodes || []).length,
        totalPages:
          data.totalPages ||
          Math.ceil((data.total || (data.nodes || []).length) / limit),
      };
    },
    enabled: enabled && !search && !!effectiveNodeId,
    staleTime: 30 * 1000,
    throwOnError: false,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  // ---- 4. 当前节点详情（有 nodeId 时） ----
  const nodeQuery = useQuery({
    queryKey: getNodeQueryKey(libraryType, nodeId || '__disabled__'),
    queryFn: async (): Promise<FileSystemNodeDto> => {
      const api = getNodeApi(libraryType);
      const result = await withTimeout(
        api({ path: { nodeId: nodeId! } }),
        REQUEST_TIMEOUT_MS
      );
      if (result.error || !result.data)
        throw result.error ?? new Error('Node not found');
      return result.data;
    },
    enabled: enabled && !!nodeId,
    staleTime: 2 * 60 * 1000,
    throwOnError: false,
  });

  // ---- 5. 面包屑 ----
  // 根节点名称由前端根据库类型直接指定
  const libraryRootName = useMemo(() => {
    return libraryType === 'drawing' ? t('图纸库') : t('图块库');
  }, [libraryType]);

  const breadcrumbsQuery = useQuery({
    queryKey: [
      'library',
      libraryType,
      'breadcrumbs',
      nodeId || 'root',
    ] as const,
    queryFn: async () => {
      // 根目录时也返回根节点名称
      if (!nodeId || !libraryId || !libraryQuery.data) {
        return libraryQuery.data
          ? [
              {
                id: libraryQuery.data.libraryId,
                name: libraryRootName,
                editName: libraryType,
                isRoot: true,
                isFolder: true,
              },
            ]
          : [];
      }
      const childPath = await withTimeout(
        buildBreadcrumbs(libraryType, libraryQuery.data, nodeId),
        REQUEST_TIMEOUT_MS
      );
      // 根节点使用前端指定的名称，子节点直接用后端返回的名称
      return [
        {
          id: libraryId,
          name: libraryRootName,
          editName: libraryType,
          isRoot: true,
          isFolder: true,
        },
        ...childPath,
      ];
    },
    enabled: enabled && !search && !!libraryId,
    staleTime: 2 * 60 * 1000,
    throwOnError: false,
  });

  // ---- 派生状态 ----
  // 注意：isLoading 不含 isPlaceholderData —— keepPreviousData 翻页期间展示旧数据，
  // 不应因此阻塞滚动翻页/分页按钮；翻页中的交互由调用方用 isFetching 感知。
  const isLoading = useMemo(() => {
    if (search) return searchQuery.isLoading;
    return libraryQuery.isLoading || childrenQuery.isLoading;
  }, [
    search,
    searchQuery.isLoading,
    libraryQuery.isLoading,
    childrenQuery.isLoading,
  ]);

  // isFetching: 后台刷新时仍为 true，用于驱动刷新按钮的 spinner
  const isFetching = useMemo(() => {
    if (search) {
      return searchQuery.isFetching || libraryQuery.isFetching;
    }
    return (
      libraryQuery.isFetching ||
      childrenQuery.isFetching ||
      nodeQuery.isFetching
    );
  }, [
    search,
    searchQuery.isFetching,
    libraryQuery.isFetching,
    childrenQuery.isFetching,
    nodeQuery.isFetching,
  ]);

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
