import { useState, useCallback, useRef, useEffect } from 'react';
import { projectsApi } from '../../services/apiService';
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
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const useFileSystemData = ({
  urlProjectId,
  urlNodeId,
  isProjectRootMode,
  searchQuery,
  paginationRef,
  showToast,
}: UseFileSystemDataProps) => {
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentNode, setCurrentNode] = useState<FileSystemNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);

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
      let currentNode: FileSystemNode | null = node;

      try {
        while (currentNode && !visited.has(currentNode.id)) {
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }

          visited.add(currentNode.id);
          crumbs.unshift({
            id: currentNode.id,
            name: currentNode.name,
            isRoot: currentNode.isRoot,
          });

          if (currentNode.parentId) {
            const parentResponse = await projectsApi.getNode(currentNode.parentId, { signal });
            currentNode = parentResponse.data;
          } else {
            break;
          }
        }

        setBreadcrumbs(crumbs);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
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

    try {
      const params: any = {
        page: paginationRef.current.page,
        limit: paginationRef.current.limit,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      if (isProjectRootMode) {
        const response = await projectsApi.list({
          params,
          signal: abortController.signal,
        });

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
            totalPages: Math.ceil(allProjects.length / paginationRef.current.limit),
          });
        }

        setCurrentNode(null);
        setBreadcrumbs([]);
      } else {
        const currentNodeId = urlNodeId || urlProjectId;
        const [nodeResponse, childrenResponse] = await Promise.all([
          projectsApi.getNode(currentNodeId, { signal: abortController.signal }),
          projectsApi.getChildren(currentNodeId, { params, signal: abortController.signal }),
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
            totalPages: Math.ceil(childrenData.length / paginationRef.current.limit),
          });
        }

        setCurrentNode(nodeData);
        await buildBreadcrumbsFromNode(nodeData, abortController.signal);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('请求被取消', 'useFileSystemData');
        return;
      }

      const errorMessage = error instanceof Error ? error.message : '加载数据失败';
      setError(errorMessage);
      handleError(error, '加载数据失败');
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [urlProjectId, urlNodeId, isProjectRootMode, searchQuery, showToast, buildBreadcrumbsFromNode]);

  return {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    paginationMeta,
    loadData,
    buildBreadcrumbsFromNode,
  };
};