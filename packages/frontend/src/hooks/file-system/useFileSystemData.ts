///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { projectsApi } from '../../services/projectsApi';
import { trashApi } from '../../services/trashApi';
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  trashItemToNode,
} from '../../types/filesystem';
import type { ProjectDto } from '../../types/api-client';
import { PaginationMeta } from '../../components/ui/Pagination';

import { handleError } from '../../utils/errorHandler';

interface UseFileSystemDataProps {
  urlProjectId: string | undefined;
  urlNodeId: string | undefined;
  isProjectRootMode: boolean;
  searchQuery: string;
  paginationRef: React.MutableRefObject<{ page: number; limit: number }>;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  clearSelection: () => void;
  setIsMultiSelectMode: (value: boolean) => void;
}

export const useFileSystemData = ({
  urlProjectId,
  urlNodeId,
  isProjectRootMode,
  searchQuery,
  paginationRef,
  showToast,
  clearSelection,
  setIsMultiSelectMode,
}: UseFileSystemDataProps) => {
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentNode, setCurrentNode] = useState<FileSystemNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(
    null
  );

  // 回收站视图状态
  const [isTrashView, setIsTrashView] = useState(false);
  const [isProjectTrashView, setIsProjectTrashView] = useState(false);
  const isProjectTrashViewRef = useRef(isProjectTrashView);

  // 同步 ref 和状态
  useEffect(() => {
    isProjectTrashViewRef.current = isProjectTrashView;
  }, [isProjectTrashView]);

  // 监听路由变化，重置回收站状态
  // 当用户在项目列表页面和项目内部之间切换时，自动重置相应的回收站视图状态
  useEffect(() => {
    if (isProjectRootMode) {
      // 返回项目列表时，重置项目内回收站视图状态
      setIsTrashView(false);
    } else {
      // 进入项目内部时，重置项目回收站视图状态
      setIsProjectTrashView(false);
    }
  }, [isProjectRootMode]);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const buildBreadcrumbsFromNode = useCallback(
    async (node: FileSystemNode, signal?: AbortSignal) => {
      const crumbs: BreadcrumbItem[] = [];
      const visited = new Set<string>();
      let traversalNode: FileSystemNode | null = node;

      try {
        while (traversalNode && !visited.has(traversalNode.id)) {
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }

          visited.add(traversalNode.id);
          crumbs.unshift({
            id: traversalNode.id,
            name: traversalNode.name,
            isRoot: traversalNode.isRoot,
          });

          if (traversalNode.parentId) {
            try {
              const parentResponse = await projectsApi.getNode(
                traversalNode.parentId,
                { signal }
              );
              traversalNode = parentResponse.data;
            } catch (err) {
              console.warn(
                '获取父节点失败，停止构建面包屑',
                'useFileSystemData',
                {
                  parentId: traversalNode.parentId,
                }
              );
              break;
            }
          } else {
            break;
          }
        }

        setBreadcrumbs(crumbs);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        setBreadcrumbs([
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

  const loadData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);
    clearSelection();
    setIsMultiSelectMode(false);

    try {
      const params: {
        page: number;
        limit: number;
        search?: string;
      } = {
        page: paginationRef.current.page,
        limit: paginationRef.current.limit,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      if (isProjectRootMode) {
        // 项目根目录模式
        let response;

        if (isProjectTrashViewRef.current) {
          // 加载已删除的项目列表（项目回收站）
          response = await projectsApi.getDeletedProjects({
            signal: abortController.signal,
          });
        } else {
          // 加载正常项目列表
          response = await projectsApi.list({
            signal: abortController.signal,
          });
        }

        // 处理分页响应
        // ProjectListResponseDto 包含 projects, total, page, limit, totalPages
        const projectData = response.data;
        if (projectData?.projects) {
          // ProjectDto[] 转换为 FileSystemNode[]
          const projectNodes = projectData.projects.map(projectToNode);
          setNodes(projectNodes);
          setPaginationMeta({
            total: projectData.total,
            page: projectData.page,
            limit: projectData.limit,
            totalPages: projectData.totalPages,
          });
        } else {
          // 兼容旧格式
          const responseData = response.data as unknown;
          const allProjects = (
            Array.isArray(responseData) ? responseData : []
          ) as ProjectDto[];
          const projectNodes = allProjects.map(projectToNode);
          setNodes(projectNodes);
          setPaginationMeta({
            total: projectNodes.length,
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
            totalPages: Math.ceil(
              projectNodes.length / paginationRef.current.limit
            ),
          });
        }

        setCurrentNode(null);
        setBreadcrumbs([]);
      } else {
        // 文件夹模式
        const currentNodeId = urlNodeId || urlProjectId || '';
        if (isTrashView) {
          // 全局回收站视图：加载所有已删除的项目
          const trashResponse = await trashApi.getList({
            signal: abortController.signal,
          });

          // TrashItemDto[] 转换为 FileSystemNode[]
          // TrashListResponseDto 包含 items 和 total
          const trashData = trashResponse.data;
          const trashItems = trashData?.items || [];
          const trashNodes = trashItems.map(trashItemToNode);
          setNodes(trashNodes);
          if (trashData?.total !== undefined) {
            setPaginationMeta({
              total: trashData.total,
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
              totalPages: Math.ceil(
                trashData.total / paginationRef.current.limit
              ),
            });
          } else {
            setPaginationMeta({
              total: trashNodes.length,
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
              totalPages: Math.ceil(
                trashNodes.length / paginationRef.current.limit
              ),
            });
          }

          // 尝试获取项目信息作为当前节点
          try {
            if (!urlProjectId)
              throw new Error('项目ID不存在，无法加载项目信息');
            const projectResponse = await projectsApi.getNode(urlProjectId, {
              signal: abortController.signal,
            });
            setCurrentNode(projectResponse.data);

            const projectData = projectResponse.data;
            setBreadcrumbs([
              {
                id: projectData.id,
                name: projectData.name,
                isRoot: true,
                isFolder: true,
              },
              {
                id: 'trash',
                name: '回收站',
                isRoot: false,
                isFolder: true,
              },
            ]);
          } catch (err) {
            console.warn(
              '获取项目信息失败，使用默认面包屑',
              'useFileSystemData'
            );
            setBreadcrumbs([
              {
                id: urlProjectId || 'unknown_project',
                name: '项目',
                isRoot: true,
                isFolder: true,
              },
              {
                id: 'trash',
                name: '回收站',
                isRoot: false,
                isFolder: true,
              },
            ]);
          }
        } else {
          // 正常视图：加载文件夹内容
          const [nodeResponse, childrenResponse] = await Promise.all([
            projectsApi.getNode(currentNodeId, {
              signal: abortController.signal,
            }),
            projectsApi.getChildren(currentNodeId, {
              signal: abortController.signal,
            }),
          ]);

          const nodeData = nodeResponse.data;

          // NodeListResponseDto 包含 nodes, total, page, limit, totalPages
          const childrenData = childrenResponse.data?.nodes || [];
          setNodes(childrenData);
          const childrenMeta = childrenResponse.data;
          if (childrenMeta?.total !== undefined) {
            setPaginationMeta({
              total: childrenMeta.total,
              page: childrenMeta.page,
              limit: childrenMeta.limit,
              totalPages: childrenMeta.totalPages,
            });
          } else {
            setPaginationMeta({
              total: childrenData.length,
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
              totalPages: Math.ceil(
                childrenData.length / paginationRef.current.limit
              ),
            });
          }

          setCurrentNode(nodeData);
          await buildBreadcrumbsFromNode(nodeData, abortController.signal);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.info('请求被取消', 'useFileSystemData');
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '加载数据失败';
      setError(errorMessage);
      handleError(err, '加载数据失败');
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    isTrashView,
    searchQuery,
    showToast,
    buildBreadcrumbsFromNode,
    clearSelection,
    setIsMultiSelectMode,
  ]);

  return {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
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
