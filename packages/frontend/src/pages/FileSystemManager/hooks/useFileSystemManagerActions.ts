import { useCallback, useRef } from 'react';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { useVersionHistory } from '@/hooks/useVersionHistory';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { useFileBrowserActions } from '@/hooks/file-browser';
import { useFileBrowserModals } from '@/hooks/file-browser';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import { useFileSystemUrlEffects } from './useFileSystemUrlEffects';
import { useNodePermissions } from './useNodePermissions';
import { useFileSystemManagerEffects } from './useFileSystemManagerEffects';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import type { MxCadUploaderRef } from '@/components/MxCadUploader';
import type { FileSystemNode } from '@/types/filesystem';

export type UseFileSystemManagerData = ReturnType<
  typeof import('./useFileSystemManagerData').useFileSystemManagerData
>;

export type UseFileSystemManagerActionsReturn = ReturnType<
  typeof useFileSystemManagerActions
>;

interface UseFileSystemManagerActionsOptions {
  data: UseFileSystemManagerData;
}

/**
 * 文件系统管理器动作层：
 * 聚合动作类 hook。剪贴板 / 移动复制 / 拖拽回调收敛至 FileBrowserCore 内核
 * （useFileBrowserActions + useFileBrowserModals，#283），
 * 项目管理 / 版本历史 / URL 效果 / 文件拖放上传保留外壳。
 * 对外输出形状与重构前一致（buildFileSystemManagerViewProps 零改动消费）。
 */
export function useFileSystemManagerActions({
  data,
}: UseFileSystemManagerActionsOptions) {
  const {
    mode,
    navigate,
    isMobile,
    projectFilter,
    setProjectFilter,
    projectId,
    projectQuota,
    fs,
    isAtRoot,
    displayNodes,
    viewNodes,
    minLoadedPage,
    currentAncestorPath,
    handleFileOpen,
    handleScrollPageChange,
    projectPermissionsRecord,
    permissionsLoading,
    canCut,
    canCopy,
    canDelete,
    canRestore,
    canUpload,
    canDownload,
  } = data;

  const containerRef = useRef<HTMLDivElement>(null);
  const uploaderRef = useRef<MxCadUploaderRef>(null);

  const { config } = useRuntimeConfig();

  const { nodes, currentNode, urlProjectId, urlNodeId } = fs;

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

  // ── FileBrowserCore 内核：剪贴板 / 移动复制 / 拖拽 / SelectFolder ──
  const fileBrowserActions = useFileBrowserActions({
    data: {
      nodes: displayNodes,
      currentNode,
      urlProjectId: urlProjectId || '',
      refresh: fs.handleRefresh,
      removeLocalNode: undefined,
      updateLocalNode: undefined,
    },
    // 粘贴环防护：剪贴板项命中当前目录祖先链时剔除
    breadcrumbs: fs.breadcrumbs,
    selection: {
      selectedNodes: fs.selectedNodes,
      clearSelection: fs.clearSelection,
      handleNodeSelect: fs.handleNodeSelect,
      handleSelectAll: fs.handleSelectAll,
      selectMany: fs.selectMany,
      deselectNode: () => {},
      isBatchMode: true,
      setBatchMode: () => {},
      canBatch: true,
      selectionVisible: true,
      selectedNodesArray: [],
    },
    permissions: {
      canCreate: projectPermissionsRecord['FILE_CREATE'] === true,
      canEdit: projectPermissionsRecord['FILE_EDIT'] === true,
      canDelete: canDelete,
      canMove: canCut,
      canCopy,
      canRestore,
    },
    mode,
    showToast: fs.showToast,
    showConfirm,
    projectId,
    targetParentId: currentNode?.id || projectId,
    undoProjectId: urlProjectId,
    enableClipboard: true,
    enableTrash: true,
    trash: {
      restore: fs.handleRestoreNode,
      batchRestore: fs.handleBatchRestore,
      clearTrash: fs.handleClearTrash,
    },
    refresh: fs.handleRefresh,
    // CRUD 复用 useFileSystem（避免双实例弹窗状态分裂）
    crud: fs,
  });

  const modals = useFileBrowserModals({
    actions: fileBrowserActions,
    nodes: displayNodes,
    selectedNodes: fs.selectedNodes,
    clearSelection: fs.clearSelection,
    projectId: urlProjectId || '',
  });

  // ── 剪贴板输出（保持旧形状，view props 零改动） ───────────────────
  const clipboard = {
    clipboardItems: fileBrowserActions.clipboard.items,
    clipboardMode: fileBrowserActions.clipboard.mode,
    clipboardHandleCopy: fileBrowserActions.clipboard.copy,
    clipboardHandleCut: fileBrowserActions.clipboard.cut,
    clipboardHandlePaste: fileBrowserActions.clipboard.paste,
    clipboardHandleUndo: fileBrowserActions.clipboard.undo,
    clipboardHandleRedo: fileBrowserActions.clipboard.redo,
    handleRubberBandSelect: (nodeIds: string[]) => fs.selectMany(nodeIds),
    handleDeleteSelected: () => fs.handleBatchDelete(false),
    handleRenameSelected: () => {
      if (fs.selectedNodes.size !== 1) return;
      const nodeId = fs.selectedNodes.values().next().value;
      if (!nodeId) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (node) fs.handleOpenRename(node);
    },
    clearClipboard: fileBrowserActions.clipboard.clear,
    canPaste: fileBrowserActions.clipboard.canPaste,
    // 跨项目粘贴被拒原因（已插值文案；粘贴按钮 tooltip/提示用）
    clipboardPasteDisabledReason:
      fileBrowserActions.clipboard.pasteDisabledReason,
  };

  // 快捷键注册（原 useClipboardActions 内，现收口到动作层）
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);
  useSelectionShortcuts({
    containerRef,
    // Layout 内全屏页：侧边栏/顶栏导航持焦点时快捷键照常生效
    // （框选 hook mousedown preventDefault 阻止点击列表时焦点回落 body）
    containerFocusMode: 'loose',
    enabled: true,
    onSelectAll: fs.handleSelectAll,
    onUndo: () => clipboard.clipboardHandleUndo(),
    onRedo: () => clipboard.clipboardHandleRedo(),
    onCopy: () => clipboard.clipboardHandleCopy(),
    onCut: () => clipboard.clipboardHandleCut(),
    onPaste: () => clipboard.clipboardHandlePaste(),
    onDeleteSelected: clipboard.handleDeleteSelected,
    onRenameSelected: clipboard.handleRenameSelected,
    // ESC 递进语义：有选中 → 清空选中（剪贴板保留，跨页粘贴能力不丢）；
    // 无选中（剪贴板模式）→ 清空剪贴板并退出（与操作栏「取消」按钮行为一致）
    onClearSelection: () => {
      if (fs.selectedNodes.size > 0) {
        fs.clearSelection();
      } else {
        clipboard.clearClipboard();
      }
    },
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    canCopy,
    canCut,
    canDelete,
    canPaste: clipboard.canPaste,
    canRename: projectPermissionsRecord['FILE_EDIT'] === true,
  });

  const projectManagement = useProjectManagement({
    onProjectCreated: fs.handleRefresh,
    onProjectUpdated: fs.handleRefresh,
    onProjectDeleted: fs.handleRefresh,
    showToast: fs.showToast,
  });

  const versionHistory = useVersionHistory({
    projectId: urlProjectId,
    projectPermissions: projectPermissionsRecord,
    showToast: fs.showToast,
  });

  // ── SelectFolder 输出（保持旧形状，FileSystemModals props 零改动） ──
  const moveCopy = {
    showSelectFolderModal: modals.showSelectFolderModal,
    moveSourceNode: modals.moveSourceNode,
    copySourceNode: modals.copySourceNode,
    selectFolderExcludeNodeIds: modals.selectFolderExcludeNodeIds,
    setShowSelectFolderModal: modals.setShowSelectFolderModal,
    setMoveSourceNode: modals.setMoveSourceNode,
    setCopySourceNode: modals.setCopySourceNode,
    handleConfirmMoveOrCopy: modals.handleConfirmMoveOrCopy,
    handleMove: modals.handleMove,
    handleCopy: modals.handleCopy,
  };

  const { nodePermissions, permissionsLoading: nodePermissionsLoading } =
    useNodePermissions({
      isAtRoot,
      urlProjectId,
      displayNodes,
    });

  const effects = useFileSystemManagerEffects({
    isAtRoot,
    loading: fs.loading,
    currentNode,
    urlNodeId,
    urlProjectId,
    uploaderRef,
    handleRefresh: fs.handleRefresh,
    setShowCreateDrawingModal: fs.setShowCreateDrawingModal,
    setEditingProject: projectManagement.setEditingProject,
  });

  const urlEffects = useFileSystemUrlEffects({
    mode,
    urlProjectId,
    isAtRoot,
    searchTerm: fs.searchTerm,
    setSearchTerm: fs.setSearchTerm,
    pagination: fs.pagination,
    handlePageChange: fs.handlePageChange,
    editingProject: projectManagement.editingProject,
    handleEnterFolder: fs.handleEnterFolder,
    handleUpdateProjectSubmit: projectManagement.handleUpdate,
    handleCreateProjectSubmit: projectManagement.handleCreate,
    showToast: fs.showToast,
  });

  // 拖拽回调与高亮目标（内核管理拖拽状态）
  const dragAndDrop = fileBrowserActions.dragDrop;

  const showSelectionBar = fs.selectedNodes.size > 0;
  const showClipboardBar =
    !isAtRoot &&
    fs.selectedNodes.size === 0 &&
    clipboard.clipboardItems.length > 0;

  const { clearSelection } = fs;
  const { clearClipboard } = clipboard;
  const {
    handleClearTrash: rawHandleClearTrash,
    isTrashView,
    handleToggleTrashView,
    isPersonalSpaceMode,
  } = fs;

  const handleCancelBar = useCallback(() => {
    clearSelection();
    clearClipboard();
  }, [clearSelection, clearClipboard]);

  const handleClearTrash = useCallback(() => {
    rawHandleClearTrash(isTrashView && !isAtRoot ? urlProjectId : undefined);
  }, [rawHandleClearTrash, isTrashView, isAtRoot, urlProjectId]);

  const handleBreadcrumbNavigate = useCallback(
    (crumb: { id: string; name: string; isRoot?: boolean }) => {
      if (isTrashView && crumb.id !== 'trash') {
        handleToggleTrashView();
      }
      if (isPersonalSpaceMode) {
        if (crumb.isRoot) {
          navigate('/personal-space');
        } else {
          navigate(`/personal-space/${crumb.id}`);
        }
      } else {
        if (crumb.isRoot) {
          navigate(`/projects/${crumb.id}/files`);
        } else {
          navigate(`/projects/${urlProjectId}/files/${crumb.id}`);
        }
      }
    },
    [
      isTrashView,
      handleToggleTrashView,
      isPersonalSpaceMode,
      navigate,
      urlProjectId,
    ]
  );

  return {
    containerRef,
    uploaderRef,
    mode,
    isMobile,
    navigate,
    projectId,
    fs,
    clipboard,
    projectManagement,
    versionHistory,
    moveCopy,
    nodePermissions,
    effects,
    urlEffects,
    dragAndDrop,
    projectQuota,
    projectFilter,
    setProjectFilter,
    isAtRoot,
    displayNodes,
    viewNodes,
    minLoadedPage,
    currentAncestorPath,
    handleFileOpen,
    handleScrollPageChange,
    projectPermissionsRecord,
    // 节点权限与项目权限任一仍在加载即视为加载中（悲观门控，加载期不显示编辑/删除按钮）
    permissionsLoading: permissionsLoading || nodePermissionsLoading,
    canCut,
    canCopy,
    canDelete,
    canRestore,
    canUpload,
    canDownload,
    // 撤销/重做：命令栈长度（供工具栏按钮禁用态与快捷键守卫）
    undoStack,
    redoStack,
    // 批量下载配置开关（多选栏 actions 条件渲染）
    batchDownloadEnabled: config.batchDownloadEnabled,
    showSelectionBar,
    showClipboardBar,
    handleCancelBar,
    handleClearTrash,
    handleBreadcrumbNavigate,
    // 内核输出（供视图 props 消费）
    fileBrowserActions,
    modals,
    dropTargetId: fileBrowserActions.dropTargetId,
  };
}
