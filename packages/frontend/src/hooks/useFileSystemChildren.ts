///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fileSystemControllerGetChildren } from '@/api-sdk';
import { FileSystemNode, toFileSystemNode } from '@/types/filesystem';
import { queryKeys } from '@/lib/queryKeys';
import { PAGE_SIZE } from '@/components/ProjectDrawingsPanel/constants';

interface UseFileSystemChildrenOptions {
  /** 当前目录 nodeId */
  nodeId: string | undefined;
  /** 页码 */
  page: number;
  /** 搜索关键词 */
  search?: string;
  /** 是否启用查询 */
  enabled?: boolean;
}

interface FileSystemChildrenData {
  nodes: FileSystemNode[];
  total: number;
  totalPages: number;
}

interface UseFileSystemChildrenReturn {
  nodes: FileSystemNode[];
  total: number;
  totalPages: number;
  loading: boolean;
  error: Error | null;
}

/**
 * 文件系统子节点查询 Hook
 *
 * 使用 React Query 管理文件系统子节点的加载、分页和搜索。
 * 替代 useLoadNodes 中手动 fetch 的文件系统模式。
 */
export function useFileSystemChildren({
  nodeId,
  page,
  search,
  enabled = true,
}: UseFileSystemChildrenOptions): UseFileSystemChildrenReturn {
  const effectiveNodeId = nodeId || '__disabled__';

  const { data, isLoading, error } = useQuery<FileSystemChildrenData>({
    queryKey: [...queryKeys.fileSystem.children(effectiveNodeId), { page, search }] as const,
    queryFn: async () => {
      const { data: response } = await fileSystemControllerGetChildren({
        path: { nodeId: nodeId! },
        query: { page, limit: PAGE_SIZE, search: search || undefined } as Record<string, unknown>,
      });
      const nodeList = (response?.nodes || []).map(toFileSystemNode);
      const totalCount = response?.total || 0;
      const totalPageCount = response?.totalPages || Math.ceil(totalCount / PAGE_SIZE) || 1;
      return {
        nodes: nodeList,
        total: totalCount,
        totalPages: totalPageCount,
      };
    },
    enabled: enabled && !!nodeId,
    staleTime: 30 * 1000,
    throwOnError: false,
  });

  return {
    nodes: data?.nodes ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    loading: isLoading,
    error: error as Error | null,
  };
}
