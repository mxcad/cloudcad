import { useState, useCallback, useRef, useEffect } from 'react';
import { projectsApi, trashApi } from '../../services/apiService';
import { FileSystemNode, BreadcrumbItem } from '../../types/filesystem';
import { PaginationMeta } from '../../components/ui/Pagination';
import { logger } from '../../utils/logger';
import { handleError } from '../../utils/errorHandler';

interface UseFileSystemDataProps {
  urlProjectId: string;
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
              logger.warn(
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
            params,
            signal: abortController.signal,
          });
        } else {
          // 加载正常项目列表
          response = await projectsApi.list({
            params,
            signal: abortController.signal,
          });
        }

        if (response.data?.data) {
          setNodes(response.data.data);
          setPaginationMeta(response.data.meta);
        } else {
          const allProjects = response.data || [];
          setNodes(allProjects);
          setPaginationMeta({
            total: allProjects.length,
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
            totalPages: Math.ceil(
              allProjects.length / paginationRef.current.limit
            ),
          });
        }

        setCurrentNode(null);
        setBreadcrumbs([]);
      } else {
        // 文件夹模式
        const currentNodeId = urlNodeId || urlProjectId;

        if (isTrashView) {
          // 全局回收站视图：加载所有已删除的项目
          const trashResponse = await trashApi.getList({
            params,
            signal: abortController.signal,
          });

          if (trashResponse.data?.data) {
            setNodes(trashResponse.data.data);
            setPaginationMeta(trashResponse.data.meta);
          } else {
            const trashData = trashResponse.data || [];
            setNodes(trashData);
            setPaginationMeta({
              total: trashData.length,
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
              totalPages: Math.ceil(
                trashData.length / paginationRef.current.limit
              ),
            });
          }

          // 尝试获取项目信息作为当前节点
          try {
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
            logger.warn(
              '获取项目信息失败，使用默认面包屑',
              'useFileSystemData'
            );
            setBreadcrumbs([
              {
                id: urlProjectId,
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
              params,
              signal: abortController.signal,
            }),
          ]);

          const nodeData = nodeResponse.data;

          if (childrenResponse.data?.data) {
            setNodes(childrenResponse.data.data);
            setPaginationMeta(childrenResponse.data.meta);
          } else {
            const childrenData = childrenResponse.data || [];
            setNodes(childrenData);
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
        logger.info('请求被取消', 'useFileSystemData');
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
