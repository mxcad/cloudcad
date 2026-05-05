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
import {
  fileSystemControllerGetProjects,
  fileSystemControllerGetTrash,
  fileSystemControllerSearch,
  fileSystemControllerGetRootNode,
  fileSystemControllerGetNode,
  fileSystemControllerGetChildren,
} from '@/api-sdk';
// @deprecated — legacy import kept for getDeleted (no SDK mapping)
import { projectApi } from '@/services/projectApi';
import { trashApi } from '@/services/trashApi';
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  toFileSystemNode,
} from '@/types/filesystem';
import type { ProjectDto, SearchScope } from '@/types/api-client';
import { PaginationMeta } from '@/components/ui/Pagination';
import { handleError, isAbortError } from '@/utils/errorHandler';
import type { ProjectFilterType } from '@/services/projectApi';

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
            // 抛出 DOMException 以便被正确识别为 AbortError
            throw new DOMException('The operation was aborted.', 'AbortError');
          }

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
              traversalNode = toFileSystemNode(parentResponse);
            } catch (error: unknown) {
              handleError(error, '获取父节点失败，停止构建面包屑');
              break;
            }
          } else {
            break;
          }
        }

        setBreadcrumbs(crumbs);
      } catch (err) {
        // 检测请求取消错误
        if (isAbortError(err)) {
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

      // 如果有搜索关键词，使用统一搜索接口
      if (searchQuery) {
        let searchScope: SearchScope = 'project_files';
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

        // TODO: `libraryKey` is not in the SDK query type — passed anyway
        const searchResponse = await fileSystemControllerSearch({
          query: {
            keyword: searchQuery,
            scope: searchScope,
            filter: searchFilter,
            projectId: searchProjectId,
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
          } as any,
        });

        const searchData = searchResponse;
        if (searchData?.nodes) {
          const searchNodes = searchData.nodes.map(toFileSystemNode);
          setNodes(searchNodes);
          setPaginationMeta({
            total: searchData.total,
            page: searchData.page,
            limit: searchData.limit,
            totalPages: searchData.totalPages,
          });
        }

        setLoading(false);
        return;
      }

      // 私人空间模式：加载私人空间根目录或子目录
      if (isPersonalSpaceMode) {
        const currentNodeId = urlNodeId || urlProjectId || '';

        if (!currentNodeId) {
          return;
        }

        if (isTrashView) {
          // TODO: getTrash has query?: never and does not support projectId filtering — revisit
          const trashResponse = await fileSystemControllerGetTrash();

          const trashData = trashResponse;
          const trashNodes = (trashData?.nodes || []).map(toFileSystemNode);
          setNodes(trashNodes);

          if (trashData?.total !== undefined) {
            setPaginationMeta({
              total: trashData.total,
              page: trashData.page,
              limit: trashData.limit,
              totalPages: trashData.totalPages,
            });
          } else {
            setPaginationMeta({
              total: trashNodes.length,
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
              totalPages: Math.ceil(trashNodes.length / paginationRef.current.limit),
            });
          }

          // 设置面包屑
          setBreadcrumbs([
            { id: currentNodeId, name: '我的图纸', isRoot: true, isFolder: true },
            { id: 'trash', name: '回收站', isRoot: false, isFolder: true },
          ]);

          try {
            const nodeResponse = await fileSystemControllerGetNode({
              path: { nodeId: currentNodeId },
            });
            setCurrentNode(toFileSystemNode(nodeResponse));
          } catch {
          }

          setLoading(false);
          return;
        }

        const [nodeResponse, childrenResponse] = await Promise.all([
          fileSystemControllerGetNode({
            path: { nodeId: currentNodeId },
          }),
          fileSystemControllerGetChildren({
            path: { nodeId: currentNodeId },
            query: {
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
              search: searchQuery || undefined,
            } as any,
          }),
        ]);

        const nodeData = toFileSystemNode(nodeResponse);
        const childrenData = (childrenResponse?.nodes || []).map(toFileSystemNode);
        setNodes(childrenData);
        const childrenMeta = childrenResponse;
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
        setLoading(false);
        return;
      }

      if (isProjectRootMode) {
        let response;

        if (isProjectTrashViewRef.current) {
          // TODO: Replace with SDK when backend adds getDeletedProjects endpoint
          response = await projectApi.getDeleted(
            {
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
            },
            {
              signal: abortController.signal,
            }
          );
        } else {
          response = await fileSystemControllerGetProjects({
            query: {
              filter: projectFilter,
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
            } as any,
          });
        }

        // 处理分页响应
        // ProjectListResponseDto / SDK unwrapped response contains nodes, total, page, limit, totalPages
        const projectData = isProjectTrashViewRef.current ? response.data : response;
        if (projectData?.nodes) {
          // NodeDto[] 转换为 FileSystemNode[]
          const projectNodes = projectData.nodes.map(projectToNode);
          setNodes(projectNodes);
          setPaginationMeta({
            total: projectData.total,
            page: projectData.page,
            limit: projectData.limit,
            totalPages: projectData.totalPages,
          });
        } else {
          // 兼容旧格式
          const responseData = (isProjectTrashViewRef.current ? response.data : response) as unknown;
          const allProjects = (
            Array.isArray(responseData) ? responseData : []
          ) as ProjectDto[];
          const projectNodes = allProjects.map(p => projectToNode(p as any));
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
          // 项目内回收站视图：加载项目内已删除的文件和文件夹
          if (!urlProjectId) {
            throw new Error('项目ID不存在，无法加载项目回收站');
          }

          // TODO: getTrash has query?: never and does not support projectId filtering — revisit
          const trashResponse = await fileSystemControllerGetTrash();

          // ProjectTrashResponseDto 包含 nodes, total, page, limit, totalPages
          const trashData = trashResponse;
          const trashNodes = (trashData?.nodes || []).map(toFileSystemNode);
          setNodes(trashNodes);
          if (trashData?.total !== undefined) {
            setPaginationMeta({
              total: trashData.total,
              page: trashData.page,
              limit: trashData.limit,
              totalPages: trashData.totalPages,
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

          const projectResponse = await fileSystemControllerGetNode({
            path: { nodeId: urlProjectId },
          });
          setCurrentNode(toFileSystemNode(projectResponse));

          const projectData = projectResponse;
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
        } else {
          const [nodeResponse, childrenResponse] = await Promise.all([
            nodeApi.getNode(currentNodeId, {
              signal: abortController.signal,
            }),
            nodeApi.getChildren(
              currentNodeId,
              {
                page: paginationRef.current.page,
                limit: paginationRef.current.limit,
                search: searchQuery || undefined,
              },
              {
                signal: abortController.signal,
              }
            ),
          ]);

          const nodeData = toFileSystemNode(nodeResponse.data);

          if (!isPersonalSpaceMode && nodeData.personalSpaceKey) {
            navigate('/personal-space');
            setLoading(false);
            return;
          }

          if (!isPersonalSpaceMode && personalSpaceId && currentNodeId) {
            try {
              const rootNode = await fileSystemControllerGetRootNode({ path: { nodeId: currentNodeId } });
              if (rootNode?.personalSpaceKey) {
                if (urlNodeId) {
                  navigate(`/personal-space/${urlNodeId}`);
                } else {
                  navigate('/personal-space');
                }
                setLoading(false);
                return;
              }
            } catch {
            }
          }

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
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : '加载数据失败';
      setError(errorMessage);
      handleError(error, '加载数据失败');
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    isPersonalSpaceMode,
    personalSpaceId,
    isTrashView,
    searchQuery,
    showToast,
    buildBreadcrumbsFromNode,
    clearSelection,
    setIsMultiSelectMode,
    navigate,
    projectFilter,
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
