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
 * - useFileSystemRouting: URL 参数解析、模式派生
 * - useFileSystemData: 数据加载、分页
 * - useFileSystemCRUD: 创建、重命名、删除、批量操作
 * - useFileSystemNavigation: 导航、下载、文件打开
 * - useFileSystemSearch: 搜索、分页控制
 * - useFileSystemEffects: 加载编排副作用（参数/分页/搜索监听）
 * - useFileSystemUI: Toast、确认对话框
 * - useTrashView: 回收站子域（视图状态/查询/恢复/清空/面包屑/门控）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import { useFileSystemData } from './useFileSystemData';
import { useFileSystemCRUD } from './useFileSystemCRUD';
import { useFileSystemNavigation } from './useFileSystemNavigation';
import { useFileSystemSearch } from './useFileSystemSearch';
import { useFileSystemUI } from './useFileSystemUI';
import { useFileSystemRouting } from './useFileSystemRouting';
import { useFileSystemEffects } from './useFileSystemEffects';
import { useFileBrowserSelection } from '../file-browser/useFileBrowserSelection';
import { useTrashView } from './useTrashView';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import type { ProjectFilterType } from '@/api-sdk';
import type { FileSystemNode } from '@/types/filesystem';

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

  // URL 参数解析与模式派生（外部传入优先于 URL 解析）
  const {
    urlProjectId,
    urlNodeId,
    isProjectRootMode,
    isFolderMode,
    isPersonalSpaceMode,
  } = useFileSystemRouting({
    mode,
    personalSpaceId,
    externalProjectId,
    externalNodeId,
  });

  // 从 Zustand store 获取视图模式
  const {
    viewMode,
    setViewMode,
    searchTerm: storeSearchTerm,
    setSearchTerm: setStoreSearchTerm,
  } = useFileSystemStore();

  // UI Hook (Toast) — 委托全局 ToastStack（见 useFileSystemUI 说明）
  const { showToast } = useFileSystemUI();

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
    pagination,
    setPagination,
    handlePageChange,
    handlePageSizeChange,
    paginationRef,
    checkShouldLoadData,
    searchFilters,
    handleFiltersChange,
    handleSearchQueryChange,
  } = useFileSystemSearch({
    loadData: () => {}, // 将在下面覆盖
  });

  // 拖拽状态
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // 回收站视图状态（由 useTrashView 提供，延迟同步给数据层以避免 hook 循环依赖）
  const [isTrashViewForData, setIsTrashViewForData] = useState(false);

  // Data Hook
  const [selectionClearFn, setSelectionClearFn] = React.useState<() => void>(
    () => () => {}
  );

  const {
    nodes,
    currentNode,
    breadcrumbs: dataBreadcrumbs,
    loading: dataLoading,
    isFetching: dataIsFetching,
    error: dataError,
    paginationMeta: dataPaginationMeta,
    loadData,
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
    isTrashView: isTrashViewForData,
    projectFilter: externalProjectFilter,
    searchFilters,
  });

  // 加载编排副作用（projectFilter / 参数 / 分页 / 搜索监听）
  const {
    handleRefresh,
    handleSearchSubmit: handleSearchSubmitWrapper,
    handleSearchChange,
  } = useFileSystemEffects({
    urlProjectId,
    urlNodeId,
    searchQuery,
    setSearchQuery,
    setStoreSearchTerm,
    pagination,
    setPagination,
    loadData,
    checkShouldLoadData,
    externalProjectFilter,
  });

  // 节点选择引用（经 ref 注入回收站子域，打破 hook 循环依赖）
  const selectedNodesRef = useRef<Set<string>>(new Set());
  const clearSelectionRef = useRef<() => void>(() => {});

  // 回收站子域：视图状态 / trash query / 恢复 / 批量恢复 / 清空 / 面包屑 / 门控
  const trash = useTrashView({
    isProjectRootMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,
    searchQuery,
    searchFilters,
    pagination,
    setPagination,
    showToast,
    showConfirm,
    selectedNodesRef,
    clearSelectionRef,
    setStoreSearchTerm,
    refresh: handleRefresh,
    loadData,
    currentNode,
  });

  // 回收站视图状态延迟同步给数据层（避免 useFileSystemData ↔ useTrashView 循环依赖）
  useEffect(() => {
    setIsTrashViewForData(trash.isTrashView);
  }, [trash.isTrashView]);

  // 数据源二选一：回收站视图使用 trash 数据，普通视图使用数据层数据
  const displayNodes = trash.isTrashView ? trash.trashNodes : nodes;
  const loading = trash.isTrashView ? trash.trashLoading : dataLoading;
  const isFetching = trash.isTrashView ? trash.trashIsFetching : dataIsFetching;
  const error = trash.isTrashView ? trash.trashError : dataError;
  const paginationMeta = trash.isTrashView
    ? trash.trashPaginationMeta
    : dataPaginationMeta;
  const breadcrumbs = trash.isTrashView
    ? trash.trashBreadcrumbs
    : dataBreadcrumbs;

  // 节点选择（ADR-0052：单一选择内核 useFileBrowserSelection）
  const {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useFileBrowserSelection({
    nodes: displayNodes,
    multiple: 'always',
  });
  selectedNodesRef.current = selectedNodes;
  clearSelectionRef.current = clearSelection;

  // 设置 selection 回调函数
  React.useEffect(() => {
    setSelectionClearFn(() => clearSelection);
  }, [clearSelection]);

  // 上下文切换时清空选中：图纸多选与项目多选互不干扰。
  // FileSystemManager 页在 /projects ↔ /projects/:id/files ↔ 文件夹之间路由时组件不卸载，
  // selectedNodes 是单一 state，会残留上一视图的选中（如项目内选中的图纸带到项目列表），
  // 导致底部操作栏在错误的上下文显示异常。故上下文（urlProjectId/urlNodeId）变化即清空选中。
  // 注：跨项目复制/粘贴依赖的是「剪贴板」（useFileSystemClipboardStore，全局 store），
  // 与选中状态无关；此处清空选中不影响跨项目复制/粘贴。
  const prevNavContextRef = useRef('');
  React.useEffect(() => {
    const navContext = `${urlProjectId ?? ''}|${urlNodeId ?? ''}`;
    if (
      prevNavContextRef.current !== '' &&
      prevNavContextRef.current !== navContext
    ) {
      clearSelection();
    }
    prevNavContextRef.current = navContext;
  }, [urlProjectId, urlNodeId, clearSelection]);

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
    handleOpenRename,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
  } = useFileSystemCRUD({
    urlProjectId,
    currentNode,
    loadData,
    showToast,
    showConfirm,
    selectedNodes,
    nodes: displayNodes,
    clearSelection,
    mode,
  });

  return {
    // 模式状态
    isProjectRootMode,
    isFolderMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,

    // 状态
    nodes: displayNodes,
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
    handleSearchQueryChange,
    pagination,
    setPagination,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
    viewMode,
    setViewMode,
    selectedNodes,
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
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    handleCreateFolder,
    handleCreateDrawing,
    handleRename,
    handleDelete,
    handlePermanentlyDelete,
    handleBatchDelete,
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

    // 回收站相关操作（内部换源 useTrashView）
    isTrashView: trash.isTrashView,
    setIsTrashView: trash.setIsTrashView,
    handleToggleTrashView: trash.toggle,
    // 回收站门控派生（useTrashView 单一来源，props 层与权限派生组合消费）
    canRestore: trash.canRestore,
    canDelete: trash.canDelete,
    handleRestoreNode: trash.restore,
    handleBatchRestore: trash.batchRestore,
    handleClearTrash: trash.clearTrash,
  };
};
