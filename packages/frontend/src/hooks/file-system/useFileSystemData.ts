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
import { projectsApi } from '../../services/projectsApi';
import { filesApi } from '../../services/filesApi';
import { trashApi } from '../../services/trashApi';
import {
  FileSystemNode,
  BreadcrumbItem,
  projectToNode,
  toFileSystemNode,
} from '../../types/filesystem';
import type { ProjectDto, SearchScope } from '../../types/api-client';
import { PaginationMeta } from '../../components/ui/Pagination';

import { handleError, isAbortError } from '../../utils/errorHandler';
import type { ProjectFilterType } from '../../services/projectsApi';

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
              const parentResponse = await projectsApi.getNode(
                traversalNode.parentId,
                { signal }
              );
              traversalNode = toFileSystemNode(parentResponse.data);
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

        const searchResponse = await projectsApi.search(
          searchQuery,
          {
            scope: searchScope,
            filter: searchFilter,
            projectId: searchProjectId,
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
          },
          {
            signal: abortController.signal,
          }
        );

        const searchData = searchResponse.data;
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
          // personalSpaceId 还没准备好，保持 loading 状态等待
          // 不设置错误状态，避免闪烁
          console.log('[useFileSystemData] 等待 personalSpaceId...');
          // 保持 loading 状态为 true，让用户看到加载中界面而不是错误界面
          return;
        }

        // 私人空间回收站视图
        if (isTrashView) {
          const trashResponse = await projectsApi.getProjectTrash(currentNodeId, {
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
          });

          const trashData = trashResponse.data;
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

          // 获取私人空间节点信息作为当前节点
          try {
            const nodeResponse = await projectsApi.getNode(currentNodeId, {
              signal: abortController.signal,
            });
            setCurrentNode(toFileSystemNode(nodeResponse.data));
          } catch {
            // 忽略错误
          }

          setLoading(false);
          return;
        }

        // 加载私人空间子目录
        const [nodeResponse, childrenResponse] = await Promise.all([
          projectsApi.getNode(currentNodeId, {
            signal: abortController.signal,
          }),
          projectsApi.getChildren(
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
        const childrenData = (childrenResponse.data?.nodes || []).map(toFileSystemNode);
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
        setLoading(false);
        return;
      }

      if (isProjectRootMode) {
        // 项目根目录模式
        let response;

        if (isProjectTrashViewRef.current) {
          // 加载已删除的项目列表（项目回收站）
          response = await projectsApi.getDeletedProjects(
            {
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
            },
            {
              signal: abortController.signal,
            }
          );
        } else {
          // 加载正常项目列表，支持按类型过滤
          response = await projectsApi.list(
            projectFilter,
            {
              page: paginationRef.current.page,
              limit: paginationRef.current.limit,
            },
            {
              signal: abortController.signal,
            }
          );
        }

        // 处理分页响应
        // ProjectListResponseDto 包含 nodes, total, page, limit, totalPages
        const projectData = response.data;
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
          // 项目内回收站视图：加载项目内已删除的文件和文件夹
          if (!urlProjectId) {
            throw new Error('项目ID不存在，无法加载项目回收站');
          }

          const trashResponse = await projectsApi.getProjectTrash(urlProjectId, {
            page: paginationRef.current.page,
            limit: paginationRef.current.limit,
          });

          // ProjectTrashResponseDto 包含 nodes, total, page, limit, totalPages
          const trashData = trashResponse.data;
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

          // 获取项目信息作为当前节点
          const projectResponse = await projectsApi.getNode(urlProjectId, {
            signal: abortController.signal,
          });
          setCurrentNode(toFileSystemNode(projectResponse.data));

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
        } else {
          // 正常视图：加载文件夹内容
          const [nodeResponse, childrenResponse] = await Promise.all([
            projectsApi.getNode(currentNodeId, {
              signal: abortController.signal,
            }),
            projectsApi.getChildren(
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

          // 访问控制：项目模式下禁止访问私人空间节点
          // 检查节点或其根节点是否为私人空间
          if (!isPersonalSpaceMode && nodeData.personalSpaceKey) {
            // 当前节点是私人空间根节点，跳转到私人空间
            console.log('[useFileSystemData] 检测到私人空间节点，跳转到私人空间');
            navigate('/personal-space');
            setLoading(false);
            return;
          }

          // 检查父节点链是否属于私人空间
          // 通过获取根节点来判断
          if (!isPersonalSpaceMode && personalSpaceId && currentNodeId) {
            // 检查当前节点的根节点是否为私人空间
            try {
              const rootResponse = await filesApi.getRoot(currentNodeId);
              if (rootResponse.data?.personalSpaceKey) {
                console.log('[useFileSystemData] 节点属于私人空间，跳转到私人空间');
                // 跳转到私人空间的对应位置
                if (urlNodeId) {
                  navigate(`/personal-space/${urlNodeId}`);
                } else {
                  navigate('/personal-space');
                }
                setLoading(false);
                return;
              }
            } catch {
              // 忽略获取根节点失败的错误，继续正常流程
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
    } catch (err) {
      // 检测请求取消错误 - 使用统一的检测函数
      if (isAbortError(err)) {
        console.info('[useFileSystemData] 请求被取消（正常行为）');
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
