///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useMemo, useState } from 'react';
import { useFileSystemUI } from '@/hooks/file-system';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import {
  useFileBrowserSelection,
  useFileBrowserActions,
  useFileBrowserModals,
  useLibraryLoader,
} from '@/hooks/file-browser';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/usePermission';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import { SystemPermission } from '@/constants/permissions';
import { ProjectPermission } from '@/constants/permissions';
import { useVersionHistory } from '@/hooks/useVersionHistory';
import { FileSystemNode } from '@/types/filesystem';
import type { ProjectFilterType } from '@/api-sdk';
import type { ResourceItem } from '@/components/common';

import type { LibraryType } from '../types';
import { buildResourceItems } from '../buildResourceItems';
import { useLibraryCategories } from './useLibraryCategories';
import { useProjectProjects } from './useProjectProjects';

export interface UseProjectDrawingsDataOptions {
  projectId?: string;
  isPersonalSpace: boolean;
  personalSpaceId?: string | null;
  currentOpenFileId?: string | null;
  isModified?: boolean;
  libraryType?: LibraryType;
  visible: boolean;
}

/**
 * 数据层（#283 内核化后）：库分类/项目列表/资源派生/权限/vh 保留外壳；
 * 加载骨架 → useLibraryLoader（数据源适配器注入内核）、
 * 多选 → useFileBrowserSelection（batch-only + canManageLibrary）、
 * 剪贴板/移动复制/拖拽 → useFileBrowserActions + useFileBrowserModals（内核）。
 */
export function useProjectDrawingsData({
  projectId,
  isPersonalSpace,
  personalSpaceId,
  currentOpenFileId,
  isModified = false,
  libraryType,
  visible,
}: UseProjectDrawingsDataOptions) {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const { config } = useRuntimeConfig();

  const isLibraryMode = libraryType === 'drawing' || libraryType === 'block';
  const canManageLibrary =
    isLibraryMode &&
    user !== null &&
    (libraryType === 'drawing'
      ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
      : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE));

  const [pageSize, setPageSize] = useState(30);

  // 解析分类路径，从右往左找第一个非'all'的节点ID。
  const getCategoryNodeId = (
    path: string[],
    rootId: string | null
  ): string | undefined => {
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] !== 'all') return path[i];
    }
    return rootId ?? undefined;
  };

  // ── 数据源适配器（useLoadNodes 重构收敛，行为等价） ──────────────
  const loader = useLibraryLoader({
    isLibraryMode,
    libraryType,
    projectId,
    pageSize,
    visible,
  });

  // Library categories
  const {
    libraryRootId,
    categories,
    categoriesLoaded,
    selectedCategoryPath,
    setSelectedCategoryPath,
    handleCategorySelect,
    refreshCategories,
    listInitializedRef,
  } = useLibraryCategories(isLibraryMode, libraryType, visible);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    isPersonalSpace ? projectId || null : null
  );
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>(
    []
  );

  // UI hook
  const { toasts, showToast, removeToast } = useFileSystemUI();

  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);

  // ── 多选（内核：batch-only + canManageLibrary 批量开关） ──────────
  const selection = useFileBrowserSelection({
    nodes: loader.nodes,
    multiple: 'batch-only',
    batchEnabled: canManageLibrary,
  });

  // Load projects and project permissions
  const {
    projects,
    nodePermissions,
    page: projectsPage,
    totalPages: projectsTotalPages,
    loading: projectsLoading,
    error: projectsError,
    handleScrollPageChange: handleProjectsScrollPageChange,
    retryLoadMore: retryProjectsLoadMore,
    minLoadedPage: projectsMinLoadedPage,
  } = useProjectProjects({
    visible,
    isPersonalSpace,
    isLibraryMode,
    projectFilter,
    projectRefreshKey,
  });

  // Build refreshNodes
  const refreshNodes = useCallback(() => {
    setProjectRefreshKey((k) => k + 1);
    if (isLibraryMode) {
      refreshCategories();
      const nodeId = getCategoryNodeId(selectedCategoryPath, libraryRootId);
      if (nodeId) loader.load(nodeId, loader.currentPage, searchQuery, false);
    } else {
      const lastBreadcrumb = breadcrumb[breadcrumb.length - 1];
      if (lastBreadcrumb) loader.load(lastBreadcrumb.id);
    }
  }, [
    isLibraryMode,
    selectedCategoryPath,
    libraryRootId,
    searchQuery,
    loader,
    breadcrumb,
    refreshCategories,
  ]);

  const currentProjectId = selectedProjectId || personalSpaceId || '';
  const undoProjectId = isLibraryMode ? undefined : currentProjectId;

  // Permissions
  // visible 门控：4 个面板始终挂载（display:none），隐藏面板不自动加载权限，
  // 避免打开文件后隐藏面板也发 permissions 请求；切到该 tab 时 autoLoad 变 true 再加载
  const { permissions: projectPermissions } = useProjectPermissions(
    selectedProjectId,
    { autoLoad: visible }
  );

  const currentNode = useMemo(() => {
    if (breadcrumb.length === 0) return null;
    const last = breadcrumb[breadcrumb.length - 1];
    return (
      loader.nodes.find((n) => n.id === last?.id) ||
      ({
        id: last?.id || '',
        name: last?.name || '',
        isFolder: true,
        parentId:
          breadcrumb.length > 1
            ? breadcrumb[breadcrumb.length - 2]?.id
            : undefined,
      } as FileSystemNode)
    );
  }, [breadcrumb, loader.nodes]);

  const keyPrefix = useMemo(() => {
    if (isLibraryMode)
      return libraryType === 'drawing' ? 'drawing-library' : 'block-library';
    if (isPersonalSpace) return 'personal-space';
    return 'project-space';
  }, [isLibraryMode, libraryType, isPersonalSpace]);

  // Resource items
  const resourceItems: ResourceItem[] = useMemo(
    () =>
      buildResourceItems({
        nodes: loader.nodes,
        currentOpenFileId,
        isModified,
        searchQuery,
        selectedProjectId,
        breadcrumb,
        isLibraryMode,
        libraryType,
        libraryRootId,
        keyPrefix,
      }),
    [
      loader.nodes,
      currentOpenFileId,
      isModified,
      searchQuery,
      selectedProjectId,
      breadcrumb,
      isLibraryMode,
      libraryType,
      libraryRootId,
      keyPrefix,
    ]
  );

  // Version history (now using selectedProjectId)
  const vh = useVersionHistory({ projectId: selectedProjectId });

  // ── 动作/弹窗内核（剪贴板/移动复制/拖拽/SelectFolder 收敛） ──────
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

  const fileBrowser = useFileBrowserActions({
    data: {
      nodes: loader.nodes,
      currentNode,
      urlProjectId: selectedProjectId || '',
      refresh: refreshNodes,
      removeLocalNode: loader.removeLocalNode,
      updateLocalNode: loader.updateLocalNode,
    },
    selection,
    permissions: {
      canCreate: projectPermissions[ProjectPermission.FILE_CREATE] === true,
      canEdit: projectPermissions[ProjectPermission.FILE_EDIT] === true,
      canDelete: projectPermissions[ProjectPermission.FILE_DELETE] === true,
      canMove: projectPermissions[ProjectPermission.FILE_MOVE] === true,
      canCopy: projectPermissions[ProjectPermission.FILE_COPY] === true,
      canRestore:
        projectPermissions[ProjectPermission.FILE_TRASH_MANAGE] === true,
    },
    mode: isPersonalSpace ? 'personal-space' : 'project',
    showToast,
    showConfirm,
    projectId: currentProjectId,
    targetParentId:
      breadcrumb[breadcrumb.length - 1]?.id || selectedProjectId || '',
    undoProjectId,
    enableClipboard: true,
    enableTrash: false,
    refresh: refreshNodes,
  });

  const modals = useFileBrowserModals({
    actions: fileBrowser,
    nodes: loader.nodes,
    selectedNodes: selection.selectedNodes,
    clearSelection: selection.clearSelection,
    projectId: currentProjectId,
  });

  const selectedNodesArray = useMemo(
    () => Array.from(selection.selectedNodes),
    [selection.selectedNodes]
  );

  return {
    user,
    hasPermission,
    config,
    toasts,
    showToast,
    removeToast,
    // 数据（loader 透传）
    nodes: loader.nodes,
    loading: loader.loading,
    isFetching: loader.isFetching,
    error: loader.error,
    total: loader.total,
    totalPages: loader.totalPages,
    hasMore: loader.hasMore,
    currentPage: loader.currentPage,
    setCurrentPage: loader.setCurrentPage,
    loadNodes: loader.load,
    loadNodesRef: loader.loadNodesRef,
    buildBreadcrumbPathRef: loader.buildBreadcrumbPathRef,
    resetNodes: loader.reset,
    loadNodesError: loader.error,
    minLoadedPage: loader.minLoadedPage,
    loadRootId: loader.libraryRootId,
    removeLocalNode: loader.removeLocalNode,
    updateLocalNode: loader.updateLocalNode,
    checkSkipVisibilityReload: loader.checkSkipVisibilityReload,
    // 库分类 / 项目
    libraryRootId,
    categories,
    categoriesLoaded,
    selectedCategoryPath,
    setSelectedCategoryPath,
    handleCategorySelect,
    refreshCategories,
    listInitializedRef,
    projects,
    nodePermissions,
    projectsPage,
    projectsTotalPages,
    projectsLoading,
    projectsError,
    handleProjectsScrollPageChange,
    retryProjectsLoadMore,
    projectsMinLoadedPage,
    projectFilter,
    setProjectFilter,
    selectedProjectId,
    setSelectedProjectId,
    breadcrumb,
    setBreadcrumb,
    searchQuery,
    setSearchQuery,
    pageSize,
    setPageSize,
    projectRefreshKey,
    setProjectRefreshKey,
    // 内核（选择/动作/弹窗）
    selection,
    fileBrowser,
    modals,
    // 兼容旧字段（下游消费零改动）
    multiSelectedNodes: selection.selectedNodes,
    handleMultiNodeSelect: selection.handleNodeSelect,
    clearMultiSelection: selection.clearSelection,
    selectMultiNodes: selection.selectMany,
    selectedNodesArray,
    clipboardItems: fileBrowser.clipboard.items,
    clipboardMode: fileBrowser.clipboard.mode,
    clearClipboard: fileBrowser.clipboard.clear,
    pushAction,
    undoStack,
    redoStack,
    isLibraryMode,
    canManageLibrary,
    getCategoryNodeId,
    currentProjectId,
    undoProjectId,
    currentNode,
    resourceItems,
    projectPermissions,
    vh,
    refreshNodes,
    keyPrefix,
    isPersonalSpace,
    libraryType,
  };
}
export type UseProjectDrawingsDataReturn = ReturnType<
  typeof useProjectDrawingsData
>;
