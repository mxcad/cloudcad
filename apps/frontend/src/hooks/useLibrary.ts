///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { libraryApi } from '../services/libraryApi';
import { getApiClient } from '../services/apiClient';
import type { FileSystemNode } from '../types/filesystem';
import { handleError } from '../utils/errorHandler';
import { isAbortError } from '../utils/errorHandler';
import { useLibrarySelection } from './library/useLibrarySelection';

/**
 * 公共资源库类型
 */
export type LibraryType = 'drawing' | 'block';

interface UseLibraryOptions {
  /** 当前页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 页码变化回调 */
  onPageChange?: (page: number) => void;
  /** 总页数变化回调 */
  onTotalPagesChange?: (pages: number) => void;
  /** 总数变化回调 */
  onTotalChange?: (total: number) => void;
}

interface UseLibraryState {
  /** 当前库类型 */
  libraryType: LibraryType;
  /** 当前库 ID */
  libraryId: string | null;
  /** 节点列表 */
  nodes: FileSystemNode[];
  /** 当前节点 */
  currentNode: FileSystemNode | null;
  /** 面包屑导航 */
  breadcrumbs: Array<{ id: string; name: string }>;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 搜索关键词 */
  searchTerm: string;
  /** 视图模式 */
  viewMode: 'grid' | 'list';
  /** 是否文件夹模式 */
  isFolderMode: boolean;
  /** 选中节点 */
  selectedNodes: Set<string>;
  /** 是否多选模式 */
  isMultiSelectMode: boolean;
}

interface UseLibraryActions {
  /** 切换库类型 */
  setLibraryType: (type: LibraryType) => void;
  /** 进入节点 */
  enterNode: (node: FileSystemNode) => void;
  /** 进入父文件夹 */
  enterParent: () => void;
  /** 刷新当前列表 */
  refresh: () => Promise<void>;
  /** 搜索 */
  setSearchTerm: (term: string) => void;
  /** 切换视图模式 */
  setViewMode: (mode: 'grid' | 'list') => void;
  /** 创建文件夹 */
  createFolder: (name: string, parentId?: string) => Promise<void>;
  /** 删除节点 */
  deleteNode: (nodeId: string, permanently?: boolean) => Promise<void>;
  /** 重命名节点 */
  renameNode: (nodeId: string, name: string) => Promise<void>;
  /** 移动节点 */
  moveNode: (nodeId: string, targetParentId: string) => Promise<void>;
  /** 复制节点 */
  copyNode: (nodeId: string, targetParentId: string) => Promise<void>;
  /** 下载文件 */
  downloadNode: (nodeId: string) => Promise<void>;
  /** 清除错误 */
  clearError: () => void;
  /** 选择节点 */
  handleNodeSelect: (
    nodeId: string,
    isMultiSelect?: boolean,
    isShift?: boolean
  ) => void;
  /** 全选/取消全选 */
  handleSelectAll: () => void;
  /** 清除选择 */
  clearSelection: () => void;
  /** 切换多选模式 */
  toggleMultiSelectMode: () => void;
  /** 批量删除 */
  batchDeleteNodes: (nodeIds: string[]) => Promise<void>;
}

export type UseLibraryReturn = UseLibraryState & UseLibraryActions;

/**
 * 公共资源库 Hook
 *
 * 提供图纸库和图块库的状态管理和操作
 */
export const useLibrary = (
  options: UseLibraryOptions = {}
): UseLibraryReturn => {
  const {
    page = 1,
    limit = 50,
    onPageChange,
    onTotalPagesChange,
    onTotalChange,
  } = options;
  const navigate = useNavigate();
  const params = useParams<{ libraryType: LibraryType; nodeId?: string }>();

  // 直接从路由参数读取库类型，确保路由是唯一数据源
  const libraryType: LibraryType = (params.libraryType as LibraryType) || 'drawing';
  const urlNodeId = params.nodeId;

  // 状态
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FileSystemNode[]>([]);
  const [currentNode, setCurrentNode] = useState<FileSystemNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(() => {
    // 从 localStorage 读取持久化的视图模式
    try {
      const saved = localStorage.getItem('library:viewMode');
      if (saved === 'grid' || saved === 'list') {
        return saved;
      }
    } catch {
      // localStorage 不可用时忽略
    }
    return 'grid';
  });

  // 判断是否是文件夹模式
  const isFolderMode = useMemo(() => {
    return !!urlNodeId || !!libraryId;
  }, [urlNodeId, libraryId]);

  /**
   * 递归获取节点的完整路径信息
   */
  const getNodePath = async (
    type: LibraryType,
    nodeId: string,
    libraryId: string
  ): Promise<Array<{ id: string; name: string }>> => {
    const nodeApiMethod =
      type === 'drawing'
        ? libraryApi.getDrawingNode
        : libraryApi.getBlockNode;

    const nodeResponse = await nodeApiMethod(nodeId);
    const nodeData = nodeResponse.data as FileSystemNode & {
      parent?: { id: string; name: string };
    };

    // 如果是库根节点，返回空数组
    if (nodeData.id === libraryId) {
      return [];
    }

    // 递归获取父节点路径
    let path: Array<{ id: string; name: string }> = [];
    if (nodeData.parentId && nodeData.parentId !== libraryId) {
      path = await getNodePath(type, nodeData.parentId, libraryId);
    }

    // 添加当前节点到路径
    path.push({ id: nodeData.id, name: nodeData.name });
    return path;
  };

  /**
   * 加载库数据
   * 注意：page 和 limit 作为参数传入，避免闭包问题
   */
  const loadLibrary = useCallback(
    async (type: LibraryType, nodeId: string | undefined, currentPage: number, currentLimit: number, search?: string) => {
      setLoading(true);
      setError(null);

      try {
        // 获取库详情
        const libraryApiMethod =
          type === 'drawing'
            ? libraryApi.getDrawingLibrary
            : libraryApi.getBlockLibrary;

        const libraryResponse = await libraryApiMethod();
        const library = libraryResponse.data as { id: string; name: string };
        setLibraryId(library.id);

        // 如果有搜索关键词，递归搜索整个资源库
        if (search) {
          const allFilesApiMethod =
            type === 'drawing'
              ? libraryApi.getDrawingAllFiles
              : libraryApi.getBlockAllFiles;

          // 从库根节点开始递归搜索
          const response = await allFilesApiMethod(library.id, {
            page: currentPage,
            limit: currentLimit,
            search: search,
          });
          const searchData = response.data as {
            nodes: FileSystemNode[];
            total?: number;
            totalPages?: number;
          };
          setNodes(searchData.nodes || []);
          setCurrentNode(null);
          setBreadcrumbs([
            { id: library.id, name: library.name },
            { id: 'search', name: `搜索: ${search}` },
          ]);

          // 更新分页信息
          const total = searchData.total || searchData.nodes.length;
          const totalPages =
            searchData.totalPages || Math.ceil(total / currentLimit);
          onTotalChange?.(total);
          onTotalPagesChange?.(totalPages);
        } else if (nodeId) {
          // 如果有 nodeId，加载子节点
          const childrenApiMethod =
            type === 'drawing'
              ? libraryApi.getDrawingChildren
              : libraryApi.getBlockChildren;

          const response = await childrenApiMethod(nodeId, { 
            page: currentPage, 
            limit: currentLimit,
          });
          const childrenData = response.data as {
            nodes: FileSystemNode[];
            total?: number;
            totalPages?: number;
          };
          setNodes(childrenData.nodes || []);

          // 更新分页信息
          const total = childrenData.total || childrenData.nodes.length;
          const totalPages =
            childrenData.totalPages || Math.ceil(total / currentLimit);
          onTotalChange?.(total);
          onTotalPagesChange?.(totalPages);

          // 加载当前节点详情用于面包屑
          const nodeApiMethod =
            type === 'drawing'
              ? libraryApi.getDrawingNode
              : libraryApi.getBlockNode;

          const nodeResponse = await nodeApiMethod(nodeId);
          const nodeData = nodeResponse.data as FileSystemNode & {
            parent?: { id: string; name: string };
          };
          setCurrentNode(nodeData as unknown as FileSystemNode);

          // 构建面包屑
          const crumbs: Array<{ id: string; name: string }> = [
            { id: library.id, name: library.name },
          ];

          // 如果当前节点不是库根节点，添加到面包屑
          // 避免重复添加库根节点（当 nodeId 是库根目录ID时，nodeData 就是 library）
          if (nodeData.id !== library.id) {
            // 递归获取完整的路径信息
            try {
              const pathNodes = await getNodePath(type, nodeData.id, library.id);
              // 移除最后一个节点，因为我们会在下面单独添加当前节点
              if (pathNodes.length > 0) {
                pathNodes.pop();
                crumbs.push(...pathNodes);
              }
            } catch (err) {
              console.error('获取节点路径失败:', err);
              // 回退到原来的逻辑，只支持单层父节点
              const parentNode = nodeData.parent;
              if (parentNode && parentNode.id !== library.id) {
                crumbs.push({ id: parentNode.id, name: parentNode.name });
              }
            }
            crumbs.push({ id: nodeData.id, name: nodeData.name });
          }

          setBreadcrumbs(crumbs);
        } else {
          // 加载根目录
          const childrenApiMethod =
            type === 'drawing'
              ? libraryApi.getDrawingChildren
              : libraryApi.getBlockChildren;

          const response = await childrenApiMethod(library.id, { 
            page: currentPage, 
            limit: currentLimit,
          });
          const childrenData = response.data as {
            nodes: FileSystemNode[];
            total?: number;
            totalPages?: number;
          };
          setNodes(childrenData.nodes || []);
          setCurrentNode(null);
          setBreadcrumbs([{ id: library.id, name: library.name }]);

          // 更新分页信息
          const total = childrenData.total || childrenData.nodes.length;
          const totalPages =
            childrenData.totalPages || Math.ceil(total / currentLimit);
          onTotalChange?.(total);
          onTotalPagesChange?.(totalPages);
        }
      } catch (err) {
        if (isAbortError(err)) return;

        const appError = handleError(err, '加载资源库失败');
        setError(appError.message);
      } finally {
        setLoading(false);
      }
    },
    [onTotalChange, onTotalPagesChange]
  );

  /**
   * 切换库类型
   */
  const setLibraryType = useCallback(
    (type: LibraryType) => {
      navigate(`/library/${type}`);
    },
    [navigate]
  );

  /**
   * 进入节点
   */
  const enterNode = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        // 进入目录时清空搜索状态
        setSearchTerm('');
        navigate(`/library/${libraryType}/${node.id}`);
      }
    },
    [navigate, libraryType, setSearchTerm]
  );

  /**
   * 进入父文件夹
   */
  const enterParent = useCallback(() => {
    // 返回上级时清空搜索状态
    setSearchTerm('');
    if (breadcrumbs.length > 1) {
      const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
      if (parentBreadcrumb) {
        navigate(`/library/${libraryType}/${parentBreadcrumb.id}`);
      } else {
        navigate(`/library/${libraryType}`);
      }
    } else {
      navigate(`/library/${libraryType}`);
    }
  }, [navigate, libraryType, breadcrumbs, setSearchTerm]);

  /**
   * 刷新当前列表
   */
  const refresh = useCallback(async () => {
    await loadLibrary(libraryType, urlNodeId, page, limit, searchTerm);
  }, [loadLibrary, libraryType, urlNodeId, page, limit, searchTerm]);

  /**
   * 创建文件夹
   */
  const createFolder = useCallback(
    async (name: string, parentId?: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.createDrawingFolder
            : libraryApi.createBlockFolder;

        await apiMethod({ name, parentId });
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType, refresh]
  );

  /**
   * 删除节点（公共资源库直接永久删除，不走回收站）
   */
  const deleteNode = useCallback(
    async (nodeId: string, permanently: boolean = true) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.deleteDrawingNode
            : libraryApi.deleteBlockNode;

        await apiMethod(nodeId, permanently);
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType, refresh]
  );

  /**
   * 重命名节点
   */
  const renameNode = useCallback(
    async (nodeId: string, name: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.renameDrawingNode
            : libraryApi.renameBlockNode;

        await apiMethod(nodeId, name);
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType, refresh]
  );

  /**
   * 移动节点
   */
  const moveNode = useCallback(
    async (nodeId: string, targetParentId: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.moveDrawingNode
            : libraryApi.moveBlockNode;

        await apiMethod(nodeId, targetParentId);
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType, refresh]
  );

  /**
   * 复制节点
   */
  const copyNode = useCallback(
    async (nodeId: string, targetParentId: string) => {
      try {
        const apiMethod =
          libraryType === 'drawing'
            ? libraryApi.copyDrawingNode
            : libraryApi.copyBlockNode;

        await apiMethod(nodeId, targetParentId);
        await refresh();
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType, refresh]
  );

  /**
   * 下载文件
   */
  const downloadNode = useCallback(
    async (nodeId: string) => {
      try {
        // 直接使用 apiClient 下载文件，支持 responseType 配置
        const apiClient = getApiClient();
        const response = await (libraryType === 'drawing'
          ? apiClient.LibraryController_downloadDrawingNode(
              { nodeId },
              undefined,
              { responseType: 'arraybuffer' }
            )
          : apiClient.LibraryController_downloadBlockNode(
              { nodeId },
              undefined,
              { responseType: 'arraybuffer' }
            ));

        // 处理下载逻辑（后端返回文件流）
        const url = window.URL.createObjectURL(
          new Blob([response.data as unknown as Blob])
        );
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'file');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType]
  );

  /**
   * 切换视图模式（持久化到 localStorage）
   */
  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('library:viewMode', mode);
    } catch {
      // localStorage 不可用时忽略
    }
  }, []);

  // 多选状态管理
  const {
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
  } = useLibrarySelection({ nodes });

  /**
   * 批量删除选中节点
   */
  const batchDeleteNodes = useCallback(
    async (nodeIds: string[]) => {
      try {
        for (const nodeId of nodeIds) {
          const apiMethod =
            libraryType === 'drawing'
              ? libraryApi.deleteDrawingNode
              : libraryApi.deleteBlockNode;
          await apiMethod(nodeId, true);
        }
        await refresh();
        clearSelection();
      } catch (err) {
        if (isAbortError(err)) return;
        throw err;
      }
    },
    [libraryType, refresh, clearSelection]
  );

  /**
   * 切换多选模式
   */
  const toggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((prev) => {
      if (!prev) {
        clearSelection();
      }
      return !prev;
    });
  }, [setIsMultiSelectMode, clearSelection]);

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 防抖搜索 - 300ms 后更新待搜索关键词
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 初始化加载 - 监听 libraryType, urlNodeId, page 和 debouncedSearchTerm 变化
  useEffect(() => {
    loadLibrary(libraryType, urlNodeId, page, limit, debouncedSearchTerm);
  }, [libraryType, urlNodeId, page, limit, debouncedSearchTerm, loadLibrary]);

  // 退出多选模式时清空选中
  useEffect(() => {
    if (!isMultiSelectMode && selectedNodes.size > 0) {
      clearSelection();
    }
  }, [isMultiSelectMode, selectedNodes.size, clearSelection]);

  return {
    // State
    libraryType,
    libraryId,
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchTerm,
    viewMode,
    isFolderMode,
    // Selection State
    selectedNodes,
    isMultiSelectMode,
    // Actions
    setLibraryType,
    enterNode,
    enterParent,
    refresh,
    setSearchTerm,
    setViewMode,
    createFolder,
    deleteNode,
    renameNode,
    moveNode,
    copyNode,
    downloadNode,
    clearError,
    // Selection Actions
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    toggleMultiSelectMode,
    batchDeleteNodes,
  };
};
