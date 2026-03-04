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
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { useFileSystemData } from './useFileSystemData';
import { useFileSystemSelection } from './useFileSystemSelection';
import { useFileSystemCRUD } from './useFileSystemCRUD';
import { useFileSystemNavigation } from './useFileSystemNavigation';
import { useFileSystemSearch } from './useFileSystemSearch';
import { useFileSystemUI } from './useFileSystemUI';
import { useFileSystemDragDrop } from './useFileSystemDragDrop';
import { trashApi } from '../../services/trashApi';

export const useFileSystem = () => {
  const navigate = useNavigate();
  const { projectId, nodeId } = useParams<{
    projectId: string;
    nodeId?: string;
  }>();
  const location = useLocation();

  // 从 URL 路径直接解析 projectId 和 nodeId
  const urlProjectId = useMemo(() => {
    const match = location.pathname.match(/\/projects\/([^/]+)/);
    return match ? match[1] : '';
  }, [location.pathname]);

  const urlNodeId = useMemo(() => {
    const match = location.pathname.match(/\/projects\/[^/]+\/files\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  // 模式判断
  const isProjectRootMode = !urlProjectId;
  const isFolderMode = !!urlProjectId;

  // 从 Zustand store 获取视图模式
  const {
    viewMode,
    setViewMode,
    searchTerm: storeSearchTerm,
    setSearchTerm: setStoreSearchTerm,
  } = useFileSystemStore();

  // UI Hook (Toast, Confirm)
  const {
    toasts,
    confirmDialog,
    showToast,
    removeToast,
    showConfirm,
    closeConfirm,
  } = useFileSystemUI();

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
  } = useFileSystemSearch({
    loadData: () => {}, // 将在下面覆盖
  });

  // Drag & Drop Hook
  const { draggedNodes, setDraggedNodes, dropTargetId, setDropTargetId } =
    useFileSystemDragDrop();

  // Data Hook - 需要传递 clearSelection 和 setIsMultiSelectMode
  const [selectionClearFn, setSelectionClearFn] = React.useState<() => void>(
    () => () => {}
  );
  const [setMultiSelectModeFn, setSetMultiSelectModeFn] = React.useState<
    (v: boolean) => void
  >(() => () => {});

  const {
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
  } = useFileSystemData({
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    searchQuery,
    paginationRef,
    showToast,
    clearSelection: selectionClearFn,
    setIsMultiSelectMode: setMultiSelectModeFn,
  });

  // Selection Hook
  const {
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
  } = useFileSystemSelection({
    nodes,
    showToast,
  });

  // 设置 selection 回调函数
  React.useEffect(() => {
    setSelectionClearFn(() => clearSelection);
    setSetMultiSelectModeFn(() => setIsMultiSelectMode);
  }, [clearSelection, setIsMultiSelectMode]);

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
  });

  // CRUD Hook
  const {
    showCreateFolderModal,
    setShowCreateFolderModal,
    showRenameModal,
    setShowRenameModal,
    editingNode,
    setEditingNode,
    folderName,
    setFolderName,
    handleCreateFolder,
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
    handleClearProjectTrash,
  } = useFileSystemCRUD({
    urlProjectId,
    currentNode,
    loadData,
    showToast,
    showConfirm,
    selectedNodes,
    nodes,
    clearSelection,
    isProjectTrashViewRef,
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

  const handleToggleProjectTrashView = useCallback(() => {
    setIsProjectTrashView(!isProjectTrashView);
  }, [isProjectTrashView, setIsProjectTrashView]);

  // 监听 isProjectTrashView 变化
  const prevIsProjectTrashViewRef = useRef(isProjectTrashView);
  useEffect(() => {
    if (prevIsProjectTrashViewRef.current !== isProjectTrashView) {
      setStoreSearchTerm('');
      setPagination((prev) => ({ ...prev, page: 1 }));
      setRefreshCount((prev) => prev + 1);
      prevIsProjectTrashViewRef.current = isProjectTrashView;
    }
  }, [isProjectTrashView, setStoreSearchTerm, setPagination]);

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
    loadData();
  }, [urlProjectId, urlNodeId, refreshCount, loadData, setPagination]);

  // 监听 pagination 变化
  useEffect(() => {
    if (checkShouldLoadData()) {
      loadData();
    }
  }, [pagination, checkShouldLoadData, loadData]);

  // 监听 searchTerm 变化
  const prevSearchTermRef = useRef('');
  useEffect(() => {
    if (searchQuery === '' && prevSearchTermRef.current !== '') {
      setPagination((prev) => ({ ...prev, page: 1 }));
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

    // 状态
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchTerm: searchQuery,
    setSearchTerm: handleSearchChange,
    handleSearchSubmit: handleSearchSubmitWrapper,
    pagination,
    setPagination,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
    viewMode,
    setViewMode,
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    toasts,
    confirmDialog,
    showCreateFolderModal,
    showRenameModal,
    showDownloadFormatModal,
    folderName,
    setFolderName,
    editingNode,
    downloadingNode,

    // 拖拽状态
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,

    // 操作方法
    setShowCreateFolderModal,
    setShowRenameModal,
    setShowDownloadFormatModal,
    setEditingNode,
    setDownloadingNode,
    showToast,
    removeToast,
    showConfirm,
    closeConfirm,
    loadCurrentNode,
    loadChildren,
    buildBreadcrumbs,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleSelectAll,
    handleCreateFolder,
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
    handleToggleTrashView,
    handleRestoreNode,
    handleClearProjectTrash,
    isProjectTrashView,
    handleToggleProjectTrashView,
    trashApi,
  };
};
