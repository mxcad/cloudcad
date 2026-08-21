import React from 'react';
import { Scissors, Copy, Trash2, RotateCcw, Download } from 'lucide-react';
import MxCadUploader from '@/components/MxCadUploader';
import type { FileSystemNode } from '@/types/filesystem';
import type { FileSystemHeaderProps } from './FileSystemHeader';
import type { FileSystemStatesProps } from './FileSystemStates';
import type { FileSystemContentProps } from './FileSystemContent';
import type { FileSystemModalsProps } from './FileSystemModals';
import type { FileSystemManagerViewProps } from './types';
import type { UseFileSystemManagerActionsReturn } from './hooks/useFileSystemManagerActions';
import type {
  BatchActionBarProps,
  BatchActionItem,
} from '@/components/common/BatchActionBar';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import { t } from '@/languages';

type Actions = UseFileSystemManagerActionsReturn;

function buildHeaderProps(a: Actions): FileSystemHeaderProps {
  const {
    fs,
    clipboard,
    projectManagement,
    projectQuota,
    urlEffects,
    navigate,
    projectFilter,
    setProjectFilter,
    isAtRoot,
    canUpload,
  } = a;
  return {
    mode: a.mode,
    isAtRoot,
    isTrashView: fs.isTrashView,
    isPersonalSpaceMode: fs.isPersonalSpaceMode,
    isProjectRootMode: fs.isProjectRootMode,
    loading: fs.loading,
    isFetching: fs.isFetching,
    searchTerm: fs.searchTerm,
    viewMode: fs.viewMode,
    selectedNodes: fs.selectedNodes,
    nodesCount: a.displayNodes.length,
    projectFilter,
    breadcrumbs: fs.breadcrumbs,
    canCreateProject: true,
    canCreate: a.projectPermissionsRecord['FILE_CREATE'] === true,
    canUpload,
    projectQuota,
    uploadButton: (
      <MxCadUploader
        ref={a.uploaderRef}
        nodeId={() =>
          fs.currentNode?.id || fs.urlNodeId || fs.urlProjectId || ''
        }
        openAfterUpload={false}
        onSuccess={fs.handleRefresh}
        onExternalReferenceSuccess={fs.handleRefresh}
        buttonText=""
        buttonClassName="hover:bg-[var(--bg-tertiary)]"
      />
    ),
    onSetSearchTerm: fs.setSearchTerm,
    onSetViewMode: fs.setViewMode,
    onSearchSubmit: fs.handleSearchSubmit,
    onSelectAll: fs.handleSelectAll,
    onToggleTrashView: fs.handleToggleTrashView,
    // 门控双条件：useTrashView 回收站视图派生（fs.canRestore）&& 回收站管理权限（a.canRestore）
    onClearTrash:
      fs.canRestore && a.canRestore ? a.handleClearTrash : undefined,
    onProjectFilterChange: setProjectFilter,
    onRefresh: fs.handleRefresh,
    onCreateFolder: () => fs.setShowCreateFolderModal(true),
    onCreateDrawing: () => fs.setShowCreateDrawingModal(true),
    onCreateProject: projectManagement.openCreateModal,
    onGoBack: fs.handleGoBack,
    onBreadcrumbNavigate: a.handleBreadcrumbNavigate,
    onBreadcrumbPathSubmit: urlEffects.handleBreadcrumbPathSubmit,
    showToast: fs.showToast,
    clipboardCount: clipboard.clipboardItems.length,
    clipboardMode: clipboard.clipboardMode,
    onCopy: clipboard.clipboardHandleCopy,
    onCut: clipboard.clipboardHandleCut,
    onPaste: clipboard.clipboardHandlePaste,
    searchFilters: fs.searchFilters,
    onSearchFiltersChange: fs.handleFiltersChange,
    onSearchQueryChange: fs.handleSearchQueryChange,
    // 撤销/重做按钮（命令栈 fileSystemUndoRedoStore，与快捷键同源）
    canUndo: a.undoStack.length > 0,
    canRedo: a.redoStack.length > 0,
    onUndo: () => clipboard.clipboardHandleUndo(),
    onRedo: () => clipboard.clipboardHandleRedo(),
  };
}

function buildStatesProps(a: Actions): FileSystemStatesProps {
  const { fs, isAtRoot, projectManagement } = a;
  const showEmpty = a.displayNodes.length === 0 && !fs.loading && !fs.error;
  const isEmptyProject =
    showEmpty && !isAtRoot && !fs.isTrashView && fs.currentNode?.isRoot;
  return {
    loading: fs.loading,
    // 列表已有内容（滚动翻页/后台刷新失败）时不整页替换：错误降级为底部失败条，
    // 保留已累计加载的内容（FileListGrid loadError 消费）
    error: fs.error && a.displayNodes.length === 0 ? fs.error : null,
    isEmpty: showEmpty,
    isAtRoot,
    isTrashView: fs.isTrashView,
    searchTerm: fs.searchTerm,
    canCreateProject: true,
    projectFilter: a.projectFilter,
    onRefresh: fs.handleRefresh,
    onCreateProject: projectManagement.openCreateModal,
    isEmptyProject,
  };
}

function buildContentProps(a: Actions): FileSystemContentProps {
  const {
    fs,
    clipboard,
    urlEffects,
    dragAndDrop,
    effects,
    nodePermissions,
    projectPermissionsRecord,
    isAtRoot,
    viewNodes,
    currentAncestorPath,
    handleFileOpen,
    handleScrollPageChange,
    canUpload,
  } = a;
  return {
    onClearTrash: a.handleClearTrash,
    nodes: viewNodes,
    viewMode: fs.viewMode,
    isTrashView: fs.isTrashView,
    isAtRoot,
    selectedNodes: fs.selectedNodes,
    dropTargetId: a.dropTargetId,
    nodePermissions,
    projectPermissions: projectPermissionsRecord,
    permissionsLoading: a.permissionsLoading,
    paginationMeta: fs.paginationMeta,
    onNodeSelect: fs.handleNodeSelect,
    onFileOpen: handleFileOpen,
    onDownload: fs.handleDownload,
    onDelete: fs.handleDelete,
    onPermanentlyDelete: fs.handlePermanentlyDelete,
    onRename: fs.handleOpenRename,
    onRefresh: fs.handleRefresh,
    onRestore: fs.canRestore ? fs.handleRestoreNode : undefined,
    onEdit: isAtRoot
      ? (node: FileSystemNode) => a.projectManagement.openEditModal(node)
      : undefined,
    onDeleteNode: isAtRoot
      ? (node: FileSystemNode) => {
          if (fs.isTrashView) {
            fs.handlePermanentlyDeleteProject(node.id, node.name);
          } else {
            fs.handleDeleteProject(node.id, node.name);
          }
        }
      : undefined,
    onShowMembers: isAtRoot ? effects.handleShowMembers : undefined,
    onShowRoles: isAtRoot ? effects.handleShowRoles : undefined,
    onShowOperationHistory: isAtRoot
      ? effects.handleShowOperationHistory
      : undefined,
    onMove: a.moveCopy.handleMove,
    onCopy: a.moveCopy.handleCopy,
    onShowVersionHistory: a.versionHistory.handleShowVersionHistory,
    onShare: effects.handleShare,
    onDragStart: dragAndDrop.handleDragStart,
    onDragOver: dragAndDrop.handleDragOver,
    onDragLeave: dragAndDrop.handleDragLeave,
    onDrop: dragAndDrop.handleDrop,
    fileDropHandlers: canUpload ? effects.fileDropHandlers : undefined,
    isFileDragOver: effects.isFileDragOver,
    onPageChange: fs.handlePageChange,
    onPageSizeChange: fs.handlePageSizeChange,
    onDeleteProject: fs.handleDeleteProject,
    onPermanentlyDeleteProject: fs.handlePermanentlyDeleteProject,
    onRubberBandSelect: clipboard.handleRubberBandSelect,
    onBatchDelete: () => fs.handleBatchDelete(fs.isTrashView),
    onBatchMove: clipboard.clipboardHandleCut,
    onBatchCopy: clipboard.clipboardHandleCopy,
    onBatchRestore: fs.canRestore ? fs.handleBatchRestore : undefined,
    loading: fs.loading || fs.isFetching,
    currentPage: fs.paginationMeta?.page,
    totalPages: fs.paginationMeta?.totalPages,
    onScrollPageChange: handleScrollPageChange,
    minLoadedPage: a.minLoadedPage,
    // 有内容时的错误：底部失败条 + 重试（无内容时走整页错误态，见 buildStatesProps）
    loadError: fs.error && viewNodes.length > 0 ? fs.error : null,
    onRetryLoadMore: fs.handleRefresh,
    highlightNodeId: urlEffects.highlightNodeId || undefined,
    isSearchResult: !!fs.searchTerm,
    currentAncestorPath,
    onOpen: urlEffects.handleOpen,
    onOpenInNewTab: urlEffects.handleOpenInNewTab,
    onOpenFileLocation: urlEffects.handleOpenFileLocation,
    onCopyClipboard: urlEffects.handleCopyClipboard,
    onCut: urlEffects.handleCut,
    onFolderDownload: urlEffects.handleFolderDownload,
    onCopyPath: urlEffects.handleCopyPath,
    onCreateFolderInCurrentDir: () => fs.setShowCreateFolderModal(true),
    onCreateDrawingInCurrentDir: () => fs.setShowCreateDrawingModal(true),
    onPasteInCurrentDir: clipboard.clipboardHandlePaste,
    clipboardHasItems: clipboard.clipboardItems.length > 0,
    clipboardMode: clipboard.clipboardMode,
    onCreateProject: a.projectManagement.openCreateModal,
  };
}

function buildBatchBarProps(a: Actions): BatchActionBarProps | null {
  const { fs, clipboard, showSelectionBar, showClipboardBar, isAtRoot } = a;
  if (!showSelectionBar && !showClipboardBar) return null;

  const isTrashView = fs.isTrashView;

  // canDelete 逐节点判断（与 FileSystemContent.canBatchDelete 语义一致）：
  // - 根目录（多选项目）：按每个项目卡片的 nodePermissions.canDelete（PROJECT_DELETE/owner）判断，
  //   不能回退到 a.canDelete=FILE_DELETE——根目录下 urlProjectId 为空，该项恒 false，会导致
  //   多选「自己创建的项目」删除按钮也禁用。
  // - 项目内文件/文件夹：按项目权限 a.canDelete（FILE_DELETE）判断。
  const selectedNodeIds = Array.from(fs.selectedNodes);
  const eachSelectedCanDelete =
    selectedNodeIds.length > 0 &&
    selectedNodeIds.every((id) => {
      // 根节点项目：nodePermissions 里有（来自 useNodePermissions，PROJECT_DELETE/owner）
      const rootPerm = a.nodePermissions.get(id);
      if (rootPerm) return rootPerm.canDelete === true;
      // 项目内文件：由项目权限 FILE_DELETE 决定
      return a.canDelete === true;
    });

  // 恢复权限：回收站视图派生（fs.canRestore）&& 回收站管理权限（a.canRestore）。
  // 根目录全局回收站（isAtRoot，urlProjectId 为空）下 a.canRestore 来自
  // useProjectPermissions('') → 恒 false，会导致「恢复/彻底删除」按钮整体禁用，
  // 与卡片下拉菜单（仅看 fs.canRestore/isTrashView）语义不一致（#回归）。
  // 因此根目录回收站不叠加项目级 FILE_TRASH_MANAGE 门控，只按回收站视图门控。
  const canRestore = fs.canRestore && (isAtRoot ? true : a.canRestore);

  // 动作按钮组（按视图分支）：
  // - 回收站：恢复 / 彻底删除（彻底删除由 canRestore 另行门控）
  // - 根目录（多选项目）：删除（按每节点权限）
  // - 项目内：剪切 / 复制 / 删除 / 批量下载（配置开关）
  let actions: BatchActionItem[] = [];
  if (isTrashView) {
    actions = [
      {
        key: 'restore',
        label: t('恢复'),
        icon: RotateCcw,
        disabled: !canRestore,
        onClick: fs.handleBatchRestore,
      },
      {
        key: 'permanent-delete',
        label: t('彻底删除'),
        icon: Trash2,
        variant: 'danger',
        disabled: !eachSelectedCanDelete || !canRestore,
        onClick: () => fs.handleBatchDelete(true),
      },
    ];
  } else if (isAtRoot) {
    actions = [
      {
        key: 'delete',
        label: t('删除'),
        icon: Trash2,
        variant: 'danger',
        disabled: !eachSelectedCanDelete,
        onClick: () => fs.handleBatchDelete(false),
      },
    ];
  } else {
    actions = [
      {
        key: 'cut',
        label: t('剪切'),
        icon: Scissors,
        disabled: !a.canCut,
        onClick: clipboard.clipboardHandleCut,
      },
      {
        key: 'copy',
        label: t('复制'),
        icon: Copy,
        disabled: !a.canCopy,
        onClick: clipboard.clipboardHandleCopy,
      },
      {
        key: 'delete',
        label: t('删除'),
        icon: Trash2,
        variant: 'danger',
        // fs.canDelete 是回收站视图标志（=isTrashView），非回收站恒 false，不能拿来
        // 与项目权限 AND 组合（7cb550a06 回归）：缺失会导致批量删除按钮恒禁用。
        disabled: !eachSelectedCanDelete,
        onClick: () => fs.handleBatchDelete(false),
      },
      ...(a.batchDownloadEnabled
        ? [
            {
              key: 'download',
              label: t('批量下载'),
              icon: Download,
              disabled: !a.canDownload,
              onClick: () => {
                const selectedNodesList = a.displayNodes.filter((n) =>
                  fs.selectedNodes.has(n.id)
                );
                if (selectedNodesList.length > 0) {
                  const fileItems = selectedNodesList.map((n) => ({
                    nodeId: n.id,
                    fileName: n.originalName || n.name,
                    formats: [],
                    isFolder: n.isFolder,
                  }));
                  useBatchDownloadStore.getState().openDialog(fileItems);
                }
              },
            },
          ]
        : []),
    ];
  }

  return {
    count: fs.selectedNodes.size,
    onClear: a.handleCancelBar,
    actions,
    // 剪贴板区（粘贴 + 清空）：剪贴板模式（无选中）或项目内选中时显示，
    // 与旧 SelectionBar 的 `(!showSelectionBar || (!isAtRoot && !isTrashView))` 语义一致
    clipboard:
      !showSelectionBar || (!isAtRoot && !isTrashView)
        ? {
            items: clipboard.clipboardItems,
            canPaste: clipboard.canPaste,
            onPaste: clipboard.clipboardHandlePaste,
            onClear: clipboard.clearClipboard,
            // 跨项目粘贴被拒原因（粘贴按钮 disabled 时 tooltip/提示）
            pasteDisabledReason: clipboard.clipboardPasteDisabledReason,
          }
        : undefined,
  };
}

function buildModalsProps(a: Actions): FileSystemModalsProps {
  const {
    fs,
    projectManagement,
    moveCopy,
    versionHistory,
    effects,
    urlEffects,
    mode,
  } = a;
  const showToast = fs.showToast;
  return {
    showCreateFolderModal: fs.showCreateFolderModal,
    folderName: fs.folderName,
    loading: fs.loading,
    setShowCreateFolderModal: fs.setShowCreateFolderModal,
    setFolderName: fs.setFolderName,
    handleCreateFolder: fs.handleCreateFolder,
    showCreateDrawingModal: fs.showCreateDrawingModal,
    drawingName: fs.drawingName,
    setShowCreateDrawingModal: fs.setShowCreateDrawingModal,
    setDrawingName: fs.setDrawingName,
    handleCreateDrawing: fs.handleCreateDrawing,
    showRenameModal: fs.showRenameModal,
    editingNode: fs.editingNode,
    setShowRenameModal: fs.setShowRenameModal,
    setEditingNode: fs.setEditingNode,
    handleRename: fs.handleRename,
    isProjectModalOpen: projectManagement.isModalOpen,
    editingProject: projectManagement.editingProject,
    projectFormData: projectManagement.formData,
    projectLoading: projectManagement.loading,
    closeProjectModal: projectManagement.closeModal,
    setProjectFormData: projectManagement.setFormData,
    handleSubmitProject: urlEffects.handleSubmitProject,
    deleteConfirmOpen: projectManagement.deleteConfirmOpen,
    projectToDelete: projectManagement.projectToDelete,
    cancelDelete: projectManagement.cancelDelete,
    confirmDelete: projectManagement.confirmDelete,
    isMembersModalOpen: effects.isMembersModalOpen,
    isProjectRolesModalOpen: effects.isProjectRolesModalOpen,
    isOperationHistoryModalOpen: effects.isOperationHistoryModalOpen,
    setIsMembersModalOpen: effects.setIsMembersModalOpen,
    setIsProjectRolesModalOpen: effects.setIsProjectRolesModalOpen,
    setIsOperationHistoryModalOpen: effects.setIsOperationHistoryModalOpen,
    setEditingProject: projectManagement.setEditingProject,
    urlProjectId: fs.urlProjectId,
    mode,
    showSelectFolderModal: moveCopy.showSelectFolderModal,
    moveSourceNode: moveCopy.moveSourceNode,
    copySourceNode: moveCopy.copySourceNode,
    setShowSelectFolderModal: moveCopy.setShowSelectFolderModal,
    setMoveSourceNode: moveCopy.setMoveSourceNode,
    setCopySourceNode: moveCopy.setCopySourceNode,
    handleConfirmMoveOrCopy: moveCopy.handleConfirmMoveOrCopy,
    handleUploadExternalReference: urlEffects.handleUploadExternalReference,
    currentNode: fs.currentNode,
    showDownloadFormatModal: fs.showDownloadFormatModal,
    downloadingNode: fs.downloadingNode,
    setShowDownloadFormatModal: fs.setShowDownloadFormatModal,
    setDownloadingNode: fs.setDownloadingNode,
    handleDownloadWithFormat: fs.handleDownloadWithFormat,
    projectId: a.projectId,
    showToast,
    showVersionHistoryModal: versionHistory.showVersionHistoryModal,
    versionHistoryNode: versionHistory.versionHistoryNode,
    versionHistoryEntries: versionHistory.versionHistoryEntries,
    versionHistoryTotal: versionHistory.versionHistoryTotal,
    versionHistoryLoading: versionHistory.versionHistoryLoading,
    versionHistoryError: versionHistory.versionHistoryError,
    openingRevision: versionHistory.openingRevision,
    openingVersionError: versionHistory.openingVersionError,
    closeVersionHistory: versionHistory.closeVersionHistory,
    handleOpenHistoricalVersion: versionHistory.handleOpenHistoricalVersion,
    shareDialogOpen: effects.shareDialogOpen,
    shareFileId: effects.shareFileId,
    shareFileName: effects.shareFileName,
    setShareDialogOpen: effects.setShareDialogOpen,
    setShareFileId: effects.setShareFileId,
    setShareFileName: effects.setShareFileName,
  };
}

export function buildFileSystemManagerViewProps(
  a: Actions
): FileSystemManagerViewProps {
  return {
    containerRef: a.containerRef,
    isMobile: a.isMobile,
    toasts: a.fs.toasts,
    removeToast: a.fs.removeToast,
    canUpload: a.canUpload,
    fileDropHandlers: a.effects.fileDropHandlers,
    headerProps: buildHeaderProps(a),
    statesProps: buildStatesProps(a),
    contentProps: buildContentProps(a),
    batchBarProps: buildBatchBarProps(a),
    modalsProps: buildModalsProps(a),
  };
}
