///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fileSystemControllerGetChildren, fileSystemControllerSearch } from '@/api-sdk';
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
  /** 项目 ID，用于搜索 API 递归搜索子目录 */
  projectId?: string;
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
  isFetching: boolean;
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
  projectId,
}: UseFileSystemChildrenOptions): UseFileSystemChildrenReturn {
  const effectiveNodeId = nodeId || '__disabled__';
  const isSearchActive = !!search && search.trim().length > 0;

  const { data, isLoading, isFetching, error } = useQuery<FileSystemChildrenData>({
    queryKey: [...queryKeys.fileSystem.children(effectiveNodeId), { page, search, projectId }] as const,
    queryFn: async () => {
      if (isSearchActive && projectId) {
        // 搜索模式：调用统一搜索 API 递归搜索子目录
        const { data: response } = await fileSystemControllerSearch({
          query: {
            keyword: search,
            scope: 'project_files' as const,
            projectId,
            page,
            limit: PAGE_SIZE,
          },
        });
        const nodeList = (response?.nodes || []).map(toFileSystemNode);
        const totalCount = response?.total || 0;
        const totalPageCount = response?.totalPages || Math.ceil(totalCount / PAGE_SIZE) || 1;
        return { nodes: nodeList, total: totalCount, totalPages: totalPageCount };
      }
      // 浏览模式：仅获取直接子节点
      const { data: response } = await fileSystemControllerGetChildren({
        path: { nodeId: nodeId! },
        query: { page, limit: PAGE_SIZE } as Record<string, unknown>,
      });
      const nodeList = (response?.nodes || []).map(toFileSystemNode);
      const totalCount = response?.total || 0;
      const totalPageCount = response?.totalPages || Math.ceil(totalCount / PAGE_SIZE) || 1;
      return { nodes: nodeList, total: totalCount, totalPages: totalPageCount };
    },
    enabled: enabled && !!nodeId,
    // staleTime: 0 确保侧边栏面板每次挂载和查询键变化时都立即获取最新数据，
    // 不受全局 30s staleTime 影响。这解决了"我的图纸"面板首次加载为空的问题。
    staleTime: 0,
    throwOnError: false,
  });

  return {
    nodes: data?.nodes ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    loading: isLoading || (isFetching && !data),
    isFetching,
    error: error as Error | null,
  };
}
