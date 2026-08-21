///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useRef } from 'react';
import { useFileItemRenderer } from './useFileItemRenderer';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import { handleError } from '@/utils/errorHandler';
import { MxFun } from 'mxdraw';
import { FileSystemNode } from '@/types/filesystem';
import { SystemPermission } from '@/constants/permissions';
import { t } from '@/languages';
import type { ResourceItem } from '@/components/common';

import type { LibraryType } from '../types';
import type { UseProjectDrawingsDataReturn } from './useProjectDrawingsData';
import type { UseProjectDrawingsActionsReturn } from './useProjectDrawingsActions';

export interface UseProjectDrawingsInteractionsOptions {
  data: UseProjectDrawingsDataReturn;
  actions: UseProjectDrawingsActionsReturn;
  doubleClickToOpen: boolean;
  onDrawingOpen: (node: FileSystemNode, libraryType?: LibraryType) => void;
}

/**
 * ProjectDrawingsPanel 交互层
 *
 * 导航手势（进入文件夹/面包屑/返回/项目切换）、项点击（含库打开逻辑）、
 * 分页（加载更多/页码/页大小）、拖拽（内核 useFileBrowserActions.dragDrop），
 * 以及 useFileItemRenderer 渲染器组装。
 */
export function useProjectDrawingsInteractions({
  data,
  actions,
  doubleClickToOpen,
  onDrawingOpen,
}: UseProjectDrawingsInteractionsOptions) {
  const {
    nodes,
    loading,
    currentPage,
    setCurrentPage,
    loadNodes,
    breadcrumb,
    setBreadcrumb,
    searchQuery,
    setSearchQuery,
    selectedProjectId,
    setSelectedProjectId,
    isLibraryMode,
    canManageLibrary,
    getCategoryNodeId,
    selectedCategoryPath,
    libraryRootId,
    projectPermissions,
    multiSelectedNodes,
    handleMultiNodeSelect,
    showToast,
    user,
    hasPermission,
    vh,
    setPageSize,
    isPersonalSpace,
    libraryType,
    resetNodes,
    nodePermissions,
    refreshNodes,
  } = data;
  // 拖拽高亮目标（内核 useFileBrowserActions 管理）
  const dropTargetId = data.fileBrowser.dropTargetId;
  const { showConfirm: showConfirmPromise } = useConfirmDialog();

  const {
    handleDownload,
    handleDelete,
    handleOpenRename,
    handleLibraryOpenRename,
    handleMove,
    handleCopy,
    setDownloadingNode,
    setShowDownloadFormatModal,
    libraryOperations,
  } = actions;

  const loadingPageRef = useRef<number | null>(null);
  const lastClickTimeRef = useRef(0);
  const CLICK_THROTTLE_MS = 500;

  // 加载结束（成功或失败）后重置防重复标记，允许重试同一页
  useEffect(() => {
    if (!loading) loadingPageRef.current = null;
  }, [loading]);

  // Navigation handlers
  const handleEnterFolder = useCallback(
    (folder: FileSystemNode) => {
      setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
      loadNodes(folder.id);
      setSearchQuery('');
      setCurrentPage(1);
    },
    [loadNodes]
  );

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      const newBreadcrumb = breadcrumb.slice(0, index + 1);
      setBreadcrumb(newBreadcrumb);
      const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
      if (lastItem) loadNodes(lastItem.id);
      setSearchQuery('');
      setCurrentPage(1);
    },
    [breadcrumb, loadNodes]
  );

  const handleGoBack = useCallback(() => {
    if (breadcrumb.length > 1) {
      const newBreadcrumb = breadcrumb.slice(0, -1);
      setBreadcrumb(newBreadcrumb);
      const lastItem = newBreadcrumb[newBreadcrumb.length - 1];
      if (lastItem) loadNodes(lastItem.id);
    } else if (breadcrumb.length === 1 && !isPersonalSpace) {
      setSelectedProjectId(null);
      setBreadcrumb([]);
      resetNodes();
    }
    setSearchQuery('');
    setCurrentPage(1);
  }, [breadcrumb, isPersonalSpace, loadNodes]);

  const handleEnterProject = useCallback((project: FileSystemNode) => {
    setSelectedProjectId(project.id);
    setBreadcrumb([]);
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  const handleBackToProjects = useCallback(() => {
    setSelectedProjectId(null);
    setBreadcrumb([]);
    resetNodes();
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setCurrentPage(1);
      if (isLibraryMode) {
        const nid = getCategoryNodeId(selectedCategoryPath, libraryRootId);
        if (nid) loadNodes(nid, 1, query);
      } else {
        const lb = breadcrumb[breadcrumb.length - 1];
        if (lb) loadNodes(lb.id, 1, query);
      }
    },
    [
      setSearchQuery,
      setCurrentPage,
      isLibraryMode,
      getCategoryNodeId,
      selectedCategoryPath,
      libraryRootId,
      loadNodes,
      breadcrumb,
    ]
  );

  const handleDeleteProject = useCallback(
    async (project: FileSystemNode) => {
      const perms = nodePermissions.get(project.id);
      if (!perms?.canDelete) return;
      const confirmed = await showConfirmPromise({
        title: t('删除项目'),
        message: t(`确定要删除项目"${project.name}"吗？删除后将移至回收站。`),
        type: 'danger',
        confirmText: t('删除'),
      });
      if (!confirmed) return;
      await handleDelete(project, false);
      refreshNodes();
    },
    [nodePermissions, showConfirmPromise, handleDelete, refreshNodes]
  );

  // Item click
  const handleItemClick = useCallback(
    (item: ResourceItem) => {
      const now = Date.now();
      if (now - lastClickTimeRef.current < CLICK_THROTTLE_MS) return;
      lastClickTimeRef.current = now;

      const node = nodes.find((n) => n.id === item.id);
      if (!node) return;
      if (node.isFolder) {
        handleEnterFolder(node);
        return;
      }
      if (isLibraryMode) {
        const isLoggedIn = user !== null;
        const hasSysPerm =
          isLoggedIn &&
          (libraryType === 'drawing'
            ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
            : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));
        if (hasSysPerm) {
          onDrawingOpen(node, libraryType);
          return;
        }
        if (libraryType === 'drawing') {
          import('@/services/mxcadManager').then(({ openLibraryDrawing }) => {
            openLibraryDrawing(
              node.id,
              node.name,
              node.path || '',
              node.updatedAt
            ).catch((error: unknown) => {
              handleError(error, 'ProjectDrawingsPanel: 打开图纸库文件失败');
            });
          });
        } else {
          const mxwebUrl = `/api/v1/library/block/filesData/${node.path}`;
          MxFun.sendStringToExecute('Mx_Insert', {
            filePath: mxwebUrl,
            name: node.name,
            isBlockLibrary: true,
          });
        }
        return;
      }
      onDrawingOpen(node);
    },
    [
      nodes,
      handleEnterFolder,
      onDrawingOpen,
      isLibraryMode,
      libraryType,
      hasPermission,
      user,
    ]
  );

  const handlePageChange = useCallback(
    (page: number, direction: 'prev' | 'next' | 'jump') => {
      if (loadingPageRef.current === page) return;
      const nodeId = isLibraryMode
        ? getCategoryNodeId(selectedCategoryPath, libraryRootId)
        : breadcrumb[breadcrumb.length - 1]?.id;
      if (!nodeId) return;
      setCurrentPage(page);
      loadingPageRef.current = page;
      if (direction === 'jump') {
        loadNodes(nodeId, page, searchQuery, false);
      } else if (direction === 'next')
        loadNodes(nodeId, page, searchQuery, true);
      else loadNodes(nodeId, page, searchQuery, 'prepend');
    },
    [
      isLibraryMode,
      selectedCategoryPath,
      libraryRootId,
      breadcrumb,
      searchQuery,
      loadNodes,
    ]
  );

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      setPageSize(newPageSize);
      setCurrentPage(1);
      let nodeId: string | undefined;
      if (isLibraryMode) {
        nodeId = getCategoryNodeId(selectedCategoryPath, libraryRootId);
      } else nodeId = breadcrumb[breadcrumb.length - 1]?.id;
      if (nodeId) loadNodes(nodeId, 1, searchQuery, false);
    },
    [
      isLibraryMode,
      selectedCategoryPath,
      libraryRootId,
      breadcrumb,
      searchQuery,
      loadNodes,
    ]
  );

  // Drag-and-drop handlers（内核 useFileBrowserActions 拖拽回调）
  const dragDrop = data.fileBrowser.dragDrop;

  // File item renderer
  const { renderFileItem } = useFileItemRenderer({
    nodes,
    isLibraryMode,
    libraryType,
    canManageLibrary,
    doubleClickToOpen,
    forceCompactActions: !isLibraryMode,
    projectPermissions,
    onDrawingOpen,
    handleEnterFolder,
    handleDownload,
    handleDelete,
    handleOpenRename,
    handleLibraryOpenRename,
    handleShowVersionHistory: vh.handleShowVersionHistory,
    handleMove,
    handleCopy,
    ...dragDrop,
    dropTargetId,
    showToast,
    user,
    hasPermission: hasPermission as (perm: SystemPermission) => boolean,
    setDownloadingNode,
    setShowDownloadFormatModal,
    libraryOperations,
    selectedNodes: canManageLibrary ? multiSelectedNodes : undefined,
    onNodeSelect: canManageLibrary ? handleMultiNodeSelect : undefined,
  });

  return {
    handleEnterFolder,
    handleBreadcrumbClick,
    handleGoBack,
    handleEnterProject,
    handleBackToProjects,
    handleSearchChange,
    handleDeleteProject,
    handleItemClick,
    handlePageChange,
    handlePageSizeChange,
    ...dragDrop,
    renderFileItem,
  };
}

export type UseProjectDrawingsInteractionsReturn = ReturnType<
  typeof useProjectDrawingsInteractions
>;
