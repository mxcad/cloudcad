///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React, { useCallback, useRef, useState } from 'react';
import {
  fileSystemControllerGetChildren,
  fileSystemControllerGetNode,
  libraryControllerGetDrawingAllFiles,
  libraryControllerGetBlockAllFiles,
} from '@/api-sdk';
import { FileSystemNode, toFileSystemNode } from '@/types/filesystem';
import { handleError } from '@/utils/errorHandler';
import { PAGE_SIZE } from '@/components/ProjectDrawingsPanel/constants';
import type { BreadcrumbItem } from '@/components/ProjectDrawingsPanel/types';
import type { LibraryType } from '@/components/ProjectDrawingsPanel/types';

export interface UseLoadNodesReturn {
  nodes: FileSystemNode[];
  setNodes: React.Dispatch<React.SetStateAction<FileSystemNode[]>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  total: number;
  setTotal: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  setTotalPages: React.Dispatch<React.SetStateAction<number>>;
  hasMore: boolean;
  setHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  activeRequestId: React.MutableRefObject<number>;
  loadNodes: (
    nodeId: string,
    page?: number,
    search?: string,
    append?: boolean | 'prepend'
  ) => Promise<void>;
  buildBreadcrumbPath: (nodeId: string) => Promise<BreadcrumbItem[]>;
  loadNodesRef: React.MutableRefObject<(
    nodeId: string,
    page?: number,
    search?: string,
    append?: boolean | 'prepend'
  ) => Promise<void>>;
  buildBreadcrumbPathRef: React.MutableRefObject<(nodeId: string) => Promise<BreadcrumbItem[]>>;
}

export function useLoadNodes(
  isLibraryMode: boolean,
  libraryType: LibraryType | undefined
): UseLoadNodesReturn {
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const activeRequestId = useRef(0);

  // 加载当前目录下的节点（支持分页和搜索）
  const loadNodes = useCallback(
    async (
      nodeId: string,
      page: number = 1,
      search?: string,
      append: boolean | 'prepend' = false
    ) => {
      const currentRequestId = activeRequestId.current + 1;
      activeRequestId.current = currentRequestId;

      setLoading(true);
      try {
        let nodeList: FileSystemNode[] = [];
        let totalCount = 0;
        let totalPageCount = 1;

        if (isLibraryMode) {
          const response =
            libraryType === 'drawing'
              ? await libraryControllerGetDrawingAllFiles({ path: { nodeId }, query: {
                  page,
                  limit: PAGE_SIZE,
                  search: search || undefined,
                } })
              : await libraryControllerGetBlockAllFiles({ path: { nodeId }, query: {
                  page,
                  limit: PAGE_SIZE,
                  search: search || undefined,
                } });
          nodeList = (response as any)?.nodes || [];
          totalCount = (response as any)?.total || 0;
          totalPageCount =
            (response as any)?.totalPages || Math.ceil(totalCount / PAGE_SIZE) || 1;
        } else {
          const { data: response } = await fileSystemControllerGetChildren({
            path: { nodeId },
            query: { page, limit: PAGE_SIZE, search: search || undefined } as any,
          });
          nodeList = (response?.nodes || []).map(toFileSystemNode);
          totalCount = response?.total || 0;
          totalPageCount =
            response?.totalPages || Math.ceil(totalCount / PAGE_SIZE) || 1;
        }

        if (currentRequestId !== activeRequestId.current) {
          return;
        }

        if (append === 'prepend') {
          setNodes((prev) => {
            const uniqueMap = new Map<string, FileSystemNode>();
            nodeList.forEach((node) => uniqueMap.set(node.id, node));
            prev.forEach((node) => {
              if (!uniqueMap.has(node.id)) {
                uniqueMap.set(node.id, node);
              }
            });
            return Array.from(uniqueMap.values());
          });
        } else if (append === true) {
          setNodes((prev) => {
            const uniqueMap = new Map<string, FileSystemNode>();
            prev.forEach((node) => uniqueMap.set(node.id, node));
            nodeList.forEach((node) => {
              if (!uniqueMap.has(node.id)) {
                uniqueMap.set(node.id, node);
              }
            });
            return Array.from(uniqueMap.values());
          });
        } else {
          const uniqueMap = new Map<string, FileSystemNode>();
          nodeList.forEach((node) => uniqueMap.set(node.id, node));
          setNodes(Array.from(uniqueMap.values()));
        }

        setTotal(totalCount);
        setTotalPages(totalPageCount);
        setHasMore(page < totalPageCount);
      } catch (error: unknown) {
        handleError(error, 'useLoadNodes: 加载节点失败');
        if (currentRequestId === activeRequestId.current && !append) {
          setNodes([]);
          setTotal(0);
        }
        setTotalPages(1);
        setHasMore(false);
      } finally {
        if (currentRequestId === activeRequestId.current) {
          setLoading(false);
        }
      }
    },
    [isLibraryMode, libraryType]
  );

  // 构建面包屑路径（带最大深度限制防止无限循环）
  const buildBreadcrumbPath = useCallback(async (nodeId: string) => {
    try {
      const path: BreadcrumbItem[] = [];
      let currentId: string | null = nodeId;
      let depth = 0;
      const MAX_DEPTH = 20;

      while (currentId && depth < MAX_DEPTH) {
        try {
          const { data: node } = await fileSystemControllerGetNode({ path: { nodeId: currentId } }) as unknown as { data: { id: string; name: string; parentId?: string | null } | undefined };
          if (node) {
            path.unshift({ id: node.id, name: node.name });
            currentId = node.parentId || null;
            depth++;
          } else {
            break;
          }
        } catch (error: unknown) {
          handleError(error, `useLoadNodes: 获取节点 ${currentId} 失败`);
          break;
        }
      }

      if (path.length === 0) {
        return [{ id: nodeId, name: '根目录' }];
      }

      return path;
    } catch (error: unknown) {
      handleError(error, 'useLoadNodes: 构建面包屑路径失败');
      return [{ id: nodeId, name: '根目录' }];
    }
  }, []);

  const loadNodesRef = useRef(loadNodes);
  const buildBreadcrumbPathRef = useRef(buildBreadcrumbPath);

  return {
    nodes,
    setNodes,
    loading,
    total,
    setTotal,
    totalPages,
    setTotalPages,
    hasMore,
    setHasMore,
    activeRequestId,
    loadNodes,
    buildBreadcrumbPath,
    loadNodesRef,
    buildBreadcrumbPathRef,
  };
}
