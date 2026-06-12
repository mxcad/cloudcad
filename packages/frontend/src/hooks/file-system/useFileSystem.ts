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

/**
 * useFileSystem - 文件系统核心 Hook
 *
 * 这是组合 Hook，整合所有拆分后的子 Hooks，对外提供统一 API。
 *
 * 子 Hooks 职责：
 * - useFileSystemData: 数据加载、分页、回收站状态
 * - useFileSystemSelection: 节点选择、多选模式
 * - useFileSystemCRUD: 创建、重命名、删除、批量操作
 * - useFileSystemNavigation: 导航、下载、文件打开
 * - useFileSystemSearch: 搜索、分页控制
 * - useFileSystemUI: Toast、确认对话框
 * - useFileSystemDragDrop: 拖拽状态
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { useFileSystemData } from './useFileSystemData';
import { useFileSystemSelection } from './useFileSystemSelection';
import { useFileSystemCRUD } from './useFileSystemCRUD';
import { useFileSystemNavigation } from './useFileSystemNavigation';
import { useFileSystemSearch } from './useFileSystemSearch';
import { useFileSystemUI } from './useFileSystemUI';
import { useFileSystemDragDrop } from './useFileSystemDragDrop';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import type { ProjectFilterType } from '@/api-sdk';

interface UseFileSystemOptions {
  mode?: 'project' | 'personal-space';
  personalSpaceId?: string | null;
  /** 外部传入的项目 ID（优先于 URL 解析，用于侧边栏等独立导航场景） */
  externalProjectId?: string | null;
  /** 外部传入的节点 ID（优先于 URL 解析，用于侧边栏等独立导航场景） */
  externalNodeId?: string | null;
  /** 是否禁用自动导航（侧边栏模式） */
  disableNavigation?: boolean;
  /** 项目过滤类型：all-全部，owned-我创建的，joined-我加入的 */
  projectFilter?: ProjectFilterType;
}

export const useFileSystem = (options?: UseFileSystemOptions) => {
  const mode = options?.mode || 'project';
  const personalSpaceId = options?.personalSpaceId;
  const externalProjectId = options?.externalProjectId;
  const externalNodeId = options?.externalNodeId;
  const disableNavigation = options?.disableNavigation || false;
  const externalProjectFilter = options?.projectFilter;

  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{
    projectId: string;
    nodeId?: string;
  }>();
  const location = useLocation();

  // 从 URL 路径直接解析 projectId 和 nodeId（支持外部覆盖）
  const urlProjectId = useMemo(() => {
    // 外部传入优先
    if (externalProjectId !== undefined && externalProjectId !== null) {
      return externalProjectId;
    }
    // 私人空间模式：使用私人空间 ID
    if (mode === 'personal-space') {
      return personalSpaceId || '';
    }
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [location.pathname, mode, personalSpaceId, externalProjectId]);

  const urlNodeId = useMemo(() => {
    // 外部传入优先
    if (externalNodeId !== undefined && externalNodeId !== null) {
      return externalNodeId || undefined;
    }
    // 私人空间模式的 URL nodeId 解析
    if (mode === 'personal-space') {
      const match = location.pathname.match(/\/personal-space\/([^/]+)/);
      return match ? match[1] : undefined;
    }
    const match = location.pathname.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname, mode, externalNodeId]);

  // 模式判断：私人空间模式或项目根目录模式
  const isProjectRootMode = mode === 'project' && !urlProjectId;
  const isFolderMode = !!urlProjectId;
  const isPersonalSpaceMode = mode === 'personal-space';

  // 从 Zustand store 获取视图模式
  const {
    viewMode,
    setViewMode,
    searchTerm: storeSearchTerm,
    setSearchTerm: setStoreSearchTerm,
  } = useFileSystemStore();

  // UI Hook (Toast)
  const {
    toasts,
    showToast,
    removeToast,
  } = useFileSystemUI();

  // Confirm Dialog - adapt Promise-based API to callback-style
  const { showConfirm: showConfirmPromise } = useConfirmDialog();
  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      type?: 'danger' | 'warning' | 'info',
      confirmText?: string
    ) => {
      showConfirmPromise({ title, message, type, confirmText }).then(
        (confirmed) => {
          if (confirmed) {
            onConfirm();
          }
        }
      );
    },
    [showConfirmPromise]
  );

  // Search Hook
  const {
    searchQuery,
    setSearchQuery,
    handleSearchSubmit,
    pagination,
    setPagination,
    handlePageChange,
    handlePageSizeChange,
    paginationRef,
    checkShouldLoadData,
    searchFilters,
    handleFiltersChange,
  } = useFileSystemSearch({
    loadData: () => {}, // 将在下面覆盖
  });

  // Drag & Drop Hook
  const { draggedNodes, setDraggedNodes, dropTargetId, setDropTargetId } =
    useFileSystemDragDrop();

  // Data Hook
  const [selectionClearFn, setSelectionClearFn] = React.useState<() => void>(
    () => () => {}
  );

  const {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    isFetching,
    error,
    paginationMeta,
    isTrashView,
    setIsTrashView,
    loadData,
    buildBreadcrumbsFromNode,
  } = useFileSystemData({
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    isPersonalSpaceMode,
    personalSpaceId,
    searchQuery,
    pagination,
    setPagination,
    paginationRef,
    showToast,
    clearSelection: selectionClearFn,
    projectFilter: externalProjectFilter,
    searchFilters,
  });

  // Selection Hook
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectNodes,
  } = useFileSystemSelection({
    nodes,
    showToast,
  });

  // 设置 selection 回调函数
  React.useEffect(() => {
    setSelectionClearFn(() => clearSelection);
  }, [clearSelection]);

  // Navigation Hook
  const {
    handleGoBack,
    handleEnterFolder,
    handleEnterProject,
    handleFileOpen,
    handleDownload,
    handleDownloadWithFormat,
    showDownloadFormatModal,
    setShowDownloadFormatModal,
    downloadingNode,
    setDownloadingNode,
  } = useFileSystemNavigation({
    urlProjectId,
    currentNode,
    showToast,
    mode,
  });

  // CRUD Hook
  const {
    showCreateFolderModal,
    setShowCreateFolderModal,
    showCreateDrawingModal,
    setShowCreateDrawingModal,
    showRenameModal,
    setShowRenameModal,
    editingNode,
    setEditingNode,
    folderName,
    setFolderName,
    drawingName,
    setDrawingName,
    handleCreateFolder,
    handleCreateDrawing,
    handleRename,
    handleDelete,
    handlePermanentlyDelete,
    handleBatchDelete,
    handleBatchRestore,
    handleOpenRename,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
    handleRestoreNode,
    handleClearTrash,
  } = useFileSystemCRUD({
    urlProjectId,
    currentNode,
    loadData,
    showToast,
    showConfirm,
    selectedNodes,
    nodes,
    clearSelection,
    mode,
  });

  // 刷新操作
  const [refreshCount, setRefreshCount] = React.useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshCount((prev) => prev + 1);
  }, []);
  interface UseFileSystemProps {
    urlProjectId: string;
    urlNodeId: string | undefined;
    refreshCount: number;
  }
  // 参数变化跟踪
  const prevParamsRef = useRef<UseFileSystemProps | null>(null);

  // 切换回收站视图
  const handleToggleTrashView = useCallback(() => {
    setIsTrashView(!isTrashView);
  }, [isTrashView, setIsTrashView]);

  // 监听 isTrashView 变化
  const prevIsTrashViewRef = useRef(isTrashView);
  useEffect(() => {
    if (prevIsTrashViewRef.current !== isTrashView) {
      setStoreSearchTerm('');
      setPagination((prev) => ({ ...prev, page: 1 }));
      setRefreshCount((prev) => prev + 1);
      prevIsTrashViewRef.current = isTrashView;
    }
  }, [isTrashView, setStoreSearchTerm, setPagination]);

  // 监听 projectFilter 变化（项目过滤：全部/我创建的/我加入的）
  const prevProjectFilterRef = useRef(externalProjectFilter);
  useEffect(() => {
    if (prevProjectFilterRef.current !== externalProjectFilter) {
      setStoreSearchTerm('');
      setPagination((prev) => ({ ...prev, page: 1 }));
      setRefreshCount((prev) => prev + 1);
      prevProjectFilterRef.current = externalProjectFilter;
    }
  }, [externalProjectFilter, setStoreSearchTerm, setPagination]);

  // 初始加载和参数变化监听
  useEffect(() => {
    const currentParams = {
      urlProjectId,
      urlNodeId,
      refreshCount,
    } as UseFileSystemProps;

    const hasChanged =
      prevParamsRef.current === null ||
      prevParamsRef.current.urlProjectId !== currentParams.urlProjectId ||
      prevParamsRef.current.urlNodeId !== currentParams.urlNodeId ||
      prevParamsRef.current.refreshCount !== currentParams.refreshCount;

    prevParamsRef.current = currentParams;

    if (!hasChanged) {
      return;
    }

    setPagination((prev) => ({ ...prev, page: 1 }));
    // 直接使用 loadData，不将其放入依赖项（loadData 内部使用 ref 管理，不会捕获过时的闭包）
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId, urlNodeId, refreshCount, setPagination]);

  // 监听 pagination 变化
  useEffect(() => {
    if (checkShouldLoadData()) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination, checkShouldLoadData]);

  // 监听 searchTerm 变化
  const prevSearchTermRef = useRef('');
  useEffect(() => {
    if (searchQuery === '' && prevSearchTermRef.current !== '') {
      setPagination((prev) => ({ ...prev, page: 1 }));
      // 200ms 延迟：等待 store 中的搜索状态完全清除后再重新加载数据
      // 避免与 useFileSystemData 中 hasSearch 状态过渡期间的条件竞争
      setTimeout(() => {
        loadData();
      }, 200);
    }
    prevSearchTermRef.current = searchQuery;
  }, [searchQuery, loadData, setPagination]);

  // 搜索提交
  const handleSearchSubmitWrapper = useCallback(() => {
    loadData();
  }, [loadData]);

  // 搜索词变化处理
  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setStoreSearchTerm(query);
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    [setSearchQuery, setStoreSearchTerm, setPagination]
  );

  // 兼容性方法
  const loadCurrentNode = useCallback(() => {}, []);
  const loadChildren = useCallback(() => {}, []);
  const buildBreadcrumbs = useCallback(() => {}, []);

  // 显示项目成员（占位）
  const handleShowMembers = useCallback(() => {}, []);

  return {
    // 模式状态
    isProjectRootMode,
    isFolderMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,

    // 状态
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    isFetching,
    error,
    searchTerm: searchQuery,
    setSearchTerm: handleSearchChange,
    handleSearchSubmit: handleSearchSubmitWrapper,
    searchFilters,
    handleFiltersChange,
    pagination,
    setPagination,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
    viewMode,
    setViewMode,
    selectedNodes,
    toasts,
    showCreateFolderModal,
    showCreateDrawingModal,
    showRenameModal,
    showDownloadFormatModal,
    folderName,
    setFolderName,
    drawingName,
    setDrawingName,
    editingNode,
    downloadingNode,

    // 拖拽状态
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,

    // 操作方法
    setShowCreateFolderModal,
    setShowCreateDrawingModal,
    setShowRenameModal,
    setShowDownloadFormatModal,
    setEditingNode,
    setDownloadingNode,
    showToast,
    removeToast,
    loadCurrentNode,
    loadChildren,
    buildBreadcrumbs,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectNodes,
    handleCreateFolder,
    handleCreateDrawing,
    handleRename,
    handleDelete,
    handlePermanentlyDelete,
    handleBatchDelete,
    handleBatchRestore,
    handleEnterFolder,
    handleFileOpen,
    handleDownload,
    handleDownloadWithFormat,
    handleOpenRename,

    // 项目相关操作
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
    handleEnterProject,
    handleShowMembers,

    // 回收站相关操作
    isTrashView,
    setIsTrashView,
    handleToggleTrashView,
    handleRestoreNode,
    handleClearTrash,
  };
};
