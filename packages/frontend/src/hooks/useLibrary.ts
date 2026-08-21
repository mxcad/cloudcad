///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { FileSystemNode } from '../types/filesystem';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { useFileBrowserSelection } from './file-browser/useFileBrowserSelection';
import { useLibraryQuery } from './library/useLibraryQuery';
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
  /** 导航前回调（用于重置页码等） */
  onNavigate?: () => void;
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
  /** 加载状态（首次加载为 true） */
  loading: boolean;
  /** 后台刷新中（数据已存在但正在重新获取），用于驱动刷新按钮 spinner */
  isFetching: boolean;
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
  /** 直接设置选中节点（框选批量注入） */
  selectMany: (nodeIds: string[]) => void;
}

export type UseLibraryReturn = UseLibraryState & UseLibraryActions;

/**
 * 公共资源库 Hook（组合 hook）
 *
 * 组合 useLibraryQuery、useFileBrowserSelection（选择内核）两个子 hook，
 * 负责查询、导航与选择状态。写操作统一走 useLibraryOperations。
 * 内部使用 React Query 管理缓存和自动重试。
 */
export const useLibrary = (
  options: UseLibraryOptions = {}
): UseLibraryReturn => {
  const { page = 1, limit = 50, onTotalPagesChange, onTotalChange } = options;
  const navigate = useNavigate();
  const params = useParams<{ libraryType: LibraryType; nodeId?: string }>();
  const queryClient = useQueryClient();

  // 路由参数
  const libraryType: LibraryType =
    (params.libraryType as LibraryType) || 'drawing';
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

  // ── 视图模式（使用全局 fileSystemStore，与 FileSystemManager 共享状态） ──
  const viewMode = useFileSystemStore((s) => s.viewMode);
  const setViewMode = useFileSystemStore((s) => s.setViewMode);

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
        options.onNavigate?.();
        navigate(`/library/${libraryType}/${node.id}`);
      }
    },
    [navigate, libraryType, options.onNavigate]
  );

  const enterParent = useCallback(() => {
    setSearchTerm('');
    options.onNavigate?.();
    if (query.breadcrumbs.length > 1) {
      const parentBreadcrumb = query.breadcrumbs[query.breadcrumbs.length - 2];
      if (parentBreadcrumb) {
        navigate(`/library/${libraryType}/${parentBreadcrumb.id}`);
      } else {
        navigate(`/library/${libraryType}`);
      }
    } else {
      navigate(`/library/${libraryType}`);
    }
  }, [navigate, libraryType, query.breadcrumbs, options.onNavigate]);

  // ── 选择管理（ADR-0052：单一选择内核 useFileBrowserSelection）──
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useFileBrowserSelection({
    nodes: query.nodes,
    multiple: 'always',
  });

  // ── 清除错误（React Query 没有可清除的 error 状态，保留接口兼容） ──
  const clearError = useCallback(() => {
    // React Query 错误通过 query 自动管理，此方法保留用于向后兼容
  }, []);

  return {
    // State
    libraryType,
    libraryId: query.libraryId,
    nodes: query.nodes,
    currentNode: query.currentNode,
    breadcrumbs: query.breadcrumbs,
    loading: query.loading,
    isFetching: query.isFetching,
    error: query.error,
    searchTerm,
    viewMode,
    isFolderMode: query.isFolderMode,
    // Selection State
    selectedNodes,
    // Actions
    setLibraryType,
    enterNode,
    enterParent,
    refresh,
    setSearchTerm,
    setViewMode,
    clearError,
    // Selection Actions
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  };
};
