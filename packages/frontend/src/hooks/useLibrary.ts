///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { FileSystemNode } from '../types/filesystem';
import { useLibrarySelection } from './library/useLibrarySelection';
import { useLibraryQuery } from './library/useLibraryQuery';
import { useLibraryMutations } from './library/useLibraryMutations';
import { useLibraryDownload } from './library/useLibraryDownload';
import type { LibraryType } from './library/useLibraryQuery';

// ── 公共类型（重新导出，保持向后兼容） ──

export type { LibraryType } from './library/useLibraryQuery';

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
  refresh: () => void;
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
 * 公共资源库 Hook（组合 hook）
 *
 * 组合 useLibraryQuery、useLibraryMutations、useLibraryDownload 三个子 hook，
 * 保持对外接口不变。内部使用 React Query 管理缓存和自动重试。
 */
export const useLibrary = (
  options: UseLibraryOptions = {}
): UseLibraryReturn => {
  const {
    page = 1,
    limit = 50,
    onTotalPagesChange,
    onTotalChange,
  } = options;
  const navigate = useNavigate();
  const params = useParams<{ libraryType: LibraryType; nodeId?: string }>();
  const queryClient = useQueryClient();

  // 路由参数
  const libraryType: LibraryType = (params.libraryType as LibraryType) || 'drawing';
  const urlNodeId = params.nodeId;

  // ── 搜索防抖 ──
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── 视图模式（localStorage 持久化） ──
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(() => {
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

  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('library:viewMode', mode);
    } catch {
      // localStorage 不可用时忽略
    }
  }, []);

  // ── 数据查询 ──
  // flatMode: false → 管理页面走层级目录（getChildren），而非递归扁平（getAllFiles）
  const query = useLibraryQuery({
    libraryType,
    nodeId: urlNodeId,
    page,
    limit,
    search: debouncedSearchTerm,
    flatMode: false,
    onTotalChange,
    onTotalPagesChange,
  });

  // ── Mutation 成功后刷新 ──
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['library'] });
  }, [queryClient]);

  // ── 写操作 ──
  const mutations = useLibraryMutations({
    libraryType,
    onSuccess: refresh,
  });

  // ── 下载操作 ──
  const { downloadNode } = useLibraryDownload({ libraryType });

  // ── 路由导航 ──
  const setLibraryType = useCallback(
    (type: LibraryType) => {
      navigate(`/library/${type}`);
    },
    [navigate]
  );

  const enterNode = useCallback(
    (node: FileSystemNode) => {
      if (node.isFolder) {
        setSearchTerm('');
        navigate(`/library/${libraryType}/${node.id}`);
      }
    },
    [navigate, libraryType]
  );

  const enterParent = useCallback(() => {
    setSearchTerm('');
    if (query.breadcrumbs.length > 1) {
      const parentBreadcrumb =
        query.breadcrumbs[query.breadcrumbs.length - 2];
      if (parentBreadcrumb) {
        navigate(`/library/${libraryType}/${parentBreadcrumb.id}`);
      } else {
        navigate(`/library/${libraryType}`);
      }
    } else {
      navigate(`/library/${libraryType}`);
    }
  }, [navigate, libraryType, query.breadcrumbs]);

  // ── 选择管理 ──
  const {
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
  } = useLibrarySelection({ nodes: query.nodes });

  // ── 清除错误（React Query 没有可清除的 error 状态，保留接口兼容） ──
  const clearError = useCallback(() => {
    // React Query 错误通过 query 自动管理，此方法保留用于向后兼容
  }, []);

  // ── 退出多选模式时清空选中 ──
  useEffect(() => {
    if (!isMultiSelectMode && selectedNodes.size > 0) {
      clearSelection();
    }
  }, [isMultiSelectMode, selectedNodes.size, clearSelection]);

  // ── 切换多选模式 ──
  const toggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((prev) => {
      if (!prev) {
        clearSelection();
      }
      return !prev;
    });
  }, [setIsMultiSelectMode, clearSelection]);

  // ── 批量删除（使用 mutation + 清除选择） ──
  const batchDeleteNodes = useCallback(
    async (nodeIds: string[]) => {
      await mutations.batchDeleteNodes(nodeIds);
      clearSelection();
    },
    [mutations.batchDeleteNodes, clearSelection]
  );

  return {
    // State
    libraryType,
    libraryId: query.libraryId,
    nodes: query.nodes,
    currentNode: query.currentNode,
    breadcrumbs: query.breadcrumbs,
    loading: query.loading,
    error: query.error,
    searchTerm,
    viewMode,
    isFolderMode: query.isFolderMode,
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
    createFolder: async (name: string, parentId?: string): Promise<void> => {
      await mutations.createFolder({ name, parentId });
    },
    deleteNode: async (nodeId: string, permanently?: boolean): Promise<void> => {
      await mutations.deleteNode({ nodeId, permanently });
    },
    renameNode: async (nodeId: string, name: string): Promise<void> => {
      await mutations.renameNode({ nodeId, name });
    },
    moveNode: async (nodeId: string, targetParentId: string): Promise<void> => {
      await mutations.moveNode({ nodeId, targetParentId });
    },
    copyNode: async (nodeId: string, targetParentId: string): Promise<void> => {
      await mutations.copyNode({ nodeId, targetParentId });
    },
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
