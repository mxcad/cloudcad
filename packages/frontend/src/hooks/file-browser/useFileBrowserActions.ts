///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useState } from 'react';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useFileSystemCRUD } from '@/hooks/file-system';
import { useMoveCopyOrchestrator } from '@/hooks/file-system';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import {
  evaluateCrossProjectTransfer,
  fetchProjectTransferSettings,
} from '@/lib/crossProjectPaste';
import type {
  CrossProjectTransferVerdict,
  ProjectTransferSettings,
} from '@/lib/crossProjectPaste';
import type { FileSystemNode } from '@/types/filesystem';
import type {
  FileBrowserPermissions,
  ShowConfirmFn,
  ShowToastFn,
} from './fileBrowserTypes';
import type { UseFileBrowserDataReturn } from './useFileBrowserData';
import type { UseFileBrowserSelectionReturn } from './useFileBrowserSelection';
import type { MoveCopyMode, MoveCopyCallOptions } from '@/hooks/file-system';
import type { UseFileSystemCrudReturn } from '@/hooks/file-system';

type UseMoveCopyCall = (
  sourceNodeIds: string[],
  targetParentId: string,
  mode: MoveCopyMode,
  options?: MoveCopyCallOptions
) => Promise<string[]>;

/** 回收站子域委托（外壳经 useTrashView 实例化后注入，内核不感知实现） */
export interface FileBrowserTrash {
  restore: (node: FileSystemNode) => void;
  batchRestore: () => void;
  clearTrash: (projectId?: string) => void;
  canRestore?: boolean;
  canDelete?: boolean;
}

export interface UseFileBrowserActionsOptions {
  data: Pick<
    UseFileBrowserDataReturn,
    | 'nodes'
    | 'currentNode'
    | 'urlProjectId'
    | 'refresh'
    | 'removeLocalNode'
    | 'updateLocalNode'
  >;
  selection: UseFileBrowserSelectionReturn;
  /** 项目级权限位 */
  permissions: FileBrowserPermissions;
  mode: 'project' | 'personal-space';
  showToast: ShowToastFn;
  showConfirm: ShowConfirmFn;
  /** 当前项目 id（剪贴板归属 / CRUD / 跨项目校验） */
  projectId: string;
  /** 粘贴目标（当前目录 id；全屏=currentNode?.id ?? projectId，侧边栏=面包屑末端 ?? 选中项目） */
  targetParentId: string;
  /** undo/redo 动作归属项目 id（库模式传 undefined） */
  undoProjectId?: string;
  /** 打开注入：全屏跳 URL，侧边栏调 onDrawingOpen */
  onOpen?: (node: FileSystemNode) => void;
  /** 剪贴板子域开关（默认 true） */
  enableClipboard?: boolean;
  /**
   * 查询项目 6 域 transfer 设置（跨项目粘贴 UI 门控用；默认经 SDK 查询，
   * 查询失败返回 null → 保守视为不支持跨项目转移）。测试可注入 mock。
   */
  getProjectTransferSettings?: (
    projectId: string
  ) => Promise<ProjectTransferSettings | null | undefined>;
  /** 回收站子域开关（全屏启用，侧边栏关闭；开启时须注入 trash） */
  enableTrash?: boolean;
  /** 回收站子域实例（enableTrash 时由外壳注入） */
  trash?: FileBrowserTrash | null;
  /** 动作完成后刷新 */
  refresh: () => void;
  /**
   * 外壳已实例化的 CRUD（useFileSystemCRUD 输出；两壳现状已有实例，
   * 复用避免双实例弹窗状态分裂）；不传则内核内部实例化。
   */
  crud?: Pick<
    UseFileSystemCrudReturn,
    | 'showCreateFolderModal'
    | 'setShowCreateFolderModal'
    | 'showCreateDrawingModal'
    | 'setShowCreateDrawingModal'
    | 'showRenameModal'
    | 'setShowRenameModal'
    | 'editingNode'
    | 'setEditingNode'
    | 'folderName'
    | 'setFolderName'
    | 'drawingName'
    | 'setDrawingName'
    | 'handleCreateFolder'
    | 'handleCreateDrawing'
    | 'handleRename'
    | 'handleDelete'
    | 'handlePermanentlyDelete'
    | 'handleBatchDelete'
    | 'handleOpenRename'
    | 'handleCreateProject'
    | 'handleUpdateProject'
    | 'handleDeleteProject'
    | 'handlePermanentlyDeleteProject'
  >;
}

export interface FileBrowserClipboard {
  items: string[];
  mode: 'copy' | 'cut' | null;
  canPaste: boolean;
  /** 跨项目转移被拒原因（已插值的可读文案；粘贴按钮 tooltip/提示用） */
  pasteDisabledReason: string | null;
  /** 复制选中项到剪贴板 */
  copy: () => void;
  /** 剪切选中项到剪贴板 */
  cut: () => void;
  /** 粘贴到 targetParentId */
  paste: () => Promise<void>;
  /** 清空剪贴板 */
  clear: () => void;
  /** 撤销（undo stack） */
  undo: () => Promise<void>;
  /** 重做（redo stack） */
  redo: () => Promise<void>;
}

export interface UseFileBrowserActionsReturn {
  /** CRUD（useFileSystemCRUD 全量委托） */
  showCreateFolderModal: boolean;
  setShowCreateFolderModal: (v: boolean) => void;
  showCreateDrawingModal: boolean;
  setShowCreateDrawingModal: (v: boolean) => void;
  showRenameModal: boolean;
  setShowRenameModal: (v: boolean) => void;
  editingNode: FileSystemNode | null;
  setEditingNode: (v: FileSystemNode | null) => void;
  folderName: string;
  setFolderName: (v: string) => void;
  drawingName: string;
  setDrawingName: (v: string) => void;
  handleCreateFolder: () => Promise<null>;
  handleCreateDrawing: () => Promise<null>;
  handleRename: () => Promise<void>;
  handleDelete: (node: FileSystemNode, permanently?: boolean) => Promise<void>;
  handlePermanentlyDelete: (node: FileSystemNode) => Promise<void>;
  handleBatchDelete: (permanently?: boolean) => void;
  handleOpenRename: (node: FileSystemNode) => void;
  handleCreateProject: (name: string, description?: string) => Promise<void>;
  handleUpdateProject: (
    id: string,
    data: { name?: string; description?: string }
  ) => Promise<void>;
  handleDeleteProject: (id: string, name: string) => Promise<void>;
  handlePermanentlyDeleteProject: (id: string, name: string) => Promise<void>;
  /** 剪贴板子域 */
  clipboard: FileBrowserClipboard;
  /** 拖拽回调（useMoveCopyOrchestrator 委托；拖拽状态由内核管理） */
  dragDrop: {
    handleDragStart: (e: React.DragEvent, node: FileSystemNode) => void;
    handleDragOver: (e: React.DragEvent, node: FileSystemNode) => void;
    handleDragLeave: () => void;
    handleDrop: (e: React.DragEvent, node: FileSystemNode) => Promise<void>;
  };
  /** 拖拽高亮目标 */
  dropTargetId: string | null;
  /** 移动/复制执行（SelectFolderModal 确认回调等） */
  move: UseMoveCopyCall;
  copy: UseMoveCopyCall;
  /** 回收站子域（enableTrash 时透传） */
  restore: ((node: FileSystemNode) => void) | undefined;
  batchRestore: (() => void) | undefined;
  clearTrash: ((projectId?: string) => void) | undefined;
  /** 打开注入 */
  handleOpen: (node: FileSystemNode) => void;
}

/**
 * useFileBrowserActions - 文件浏览器动作内核（原子 C）
 *
 * 收敛两外壳动作层：CRUD（useFileSystemCRUD 共享底座委托）、剪贴板
 * （cut/copy/paste/undo/redo 权限矩阵）、移动/复制与拖拽
 * （useMoveCopyOrchestrator 统一编排）、回收站子域开关（enableTrash，
 * 实例由外壳注入）、打开行为注入（onOpen）。
 *
 * 零 JSX 零 DOM 感知：快捷键注册（useSelectionShortcuts 超集，ADR-0052）与弹窗渲染归外壳。
 */
export const useFileBrowserActions = ({
  data,
  selection,
  permissions,
  mode,
  showToast,
  showConfirm,
  projectId,
  targetParentId,
  undoProjectId,
  onOpen,
  enableClipboard = true,
  getProjectTransferSettings: optionsGetProjectTransferSettings,
  enableTrash = false,
  trash,
  refresh,
  crud,
}: UseFileBrowserActionsOptions): UseFileBrowserActionsReturn => {
  const { nodes, currentNode, urlProjectId, refresh: dataRefresh } = data;
  const { selectedNodes, clearSelection } = selection;
  const loadData = refresh ?? dataRefresh;

  const canMove = permissions.canMove === true;
  const canCopy = permissions.canCopy === true;
  const canDelete = permissions.canDelete === true;
  const canCreate = permissions.canCreate === true;

  // ── 拖拽状态（内核管理，orchestrator 单一事实源） ─────────────────
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // ── CRUD（外壳注入复用，缺省内核实例化 useFileSystemCRUD） ───────
  const crudState =
    crud ??
    useFileSystemCRUD({
      urlProjectId: urlProjectId || projectId || undefined,
      currentNode,
      loadData,
      showToast,
      showConfirm,
      selectedNodes,
      nodes,
      clearSelection,
      mode,
      removeLocalNode: data.removeLocalNode,
      updateLocalNode: data.updateLocalNode,
    });

  // ── 移动/复制编排（move/copy + 拖拽手势） ─────────────────────────
  const orchestrator = useMoveCopyOrchestrator({
    urlProjectId: projectId || undefined,
    handleRefresh: loadData,
    showToast,
    canMove,
    canCopy,
    draggedNodes,
    setDraggedNodes,
    setDropTargetId,
  });

  // ── 剪贴板子域 ────────────────────────────────────────────────────
  const clipboardItems = useFileSystemClipboardStore((s) => s.items);
  const clipboardMode = useFileSystemClipboardStore((s) => s.mode);
  const setClipboard = useFileSystemClipboardStore((s) => s.setClipboard);
  const clearClipboard = useFileSystemClipboardStore((s) => s.clearClipboard);
  const undoStoreUndo = useFileSystemUndoRedoStore((s) => s.undo);
  const undoStoreRedo = useFileSystemUndoRedoStore((s) => s.redo);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);

  // ── 跨项目转移策略（UI 门控 + 执行校验） ──────────────────────────
  // 源项目出向策略（transferOutToProject）在复制/剪切时快照进剪贴板
  // （复制时位于源项目页面，必可查询）；目标项目入向策略在粘贴时按当前
  // 项目查询。任何一侧查询失败 → 保守视为不支持跨项目转移。
  const getProjectTransferSettings =
    optionsGetProjectTransferSettings ?? fetchProjectTransferSettings;

  // 复制/剪切时快照源项目出向策略（供后续跨项目粘贴判断；快照失败则后端兜底）
  const snapshotSourceTransfer = useCallback(
    async (pid: string) => {
      const project = await getProjectTransferSettings(pid);
      useFileSystemClipboardStore.setState({
        sourceTransferOutToProject: project?.transferOutToProject ?? null,
      });
    },
    [getProjectTransferSettings]
  );

  const clipboardSourceProjectId = useFileSystemClipboardStore(
    (s) => s.sourceProjectId
  );
  const clipboardSourceTransferOut = useFileSystemClipboardStore(
    (s) => s.sourceTransferOutToProject
  );

  // 剪贴板源为其他项目时评估跨项目策略。乐观允许：verdict 未就绪不拦截，
  // 查询完成后若禁止则收紧 canPaste 并禁用粘贴按钮（快照异步更新会重新触发评估）。
  const [pasteVerdict, setPasteVerdict] =
    useState<CrossProjectTransferVerdict | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (
      !clipboardItems.length ||
      !clipboardMode ||
      !clipboardSourceProjectId ||
      clipboardSourceProjectId === projectId
    ) {
      setPasteVerdict(null);
      return;
    }
    getProjectTransferSettings(projectId).then((targetSettings) => {
      if (cancelled) return;
      setPasteVerdict(
        evaluateCrossProjectTransfer({
          // 粘贴=在目标位置创建节点：cut → 移动（move），copy → 复制（copy）
          operation: clipboardMode === 'cut' ? 'move' : 'copy',
          sourceProjectId: clipboardSourceProjectId,
          targetProjectId: projectId,
          // 源为项目 → 出向只读 transferOutToProject（目标恒为项目）
          sourceSettings:
            clipboardSourceTransferOut == null
              ? null
              : { transferOutToProject: clipboardSourceTransferOut },
          targetSettings: targetSettings ?? null,
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    clipboardItems,
    clipboardMode,
    clipboardSourceProjectId,
    clipboardSourceTransferOut,
    projectId,
    getProjectTransferSettings,
  ]);

  // 粘贴=在目标位置创建节点：门控用目标上下文 canCreate（跨项目粘贴后
  // 源项目的 canMove/canCopy 已不可用；目标权限由后端矩阵校验兜底）。
  // 跨项目粘贴时叠加策略判定：策略禁止 → 禁用（悲观门控）
  const canPaste =
    enableClipboard && canCreate && pasteVerdict?.allowed !== false;

  // 跨项目粘贴被拒原因（tooltip/提示用；已按操作类型插值 {action}）
  const pasteDisabledReason =
    pasteVerdict?.allowed === false && pasteVerdict.reasonKey
      ? t(pasteVerdict.reasonKey, {
          action: clipboardMode === 'cut' ? t('移动') : t('复制'),
        })
      : null;

  const clipboardHandleCopy = useCallback(() => {
    if (!enableClipboard) return;
    if (selectedNodes.size === 0) {
      showToast(t('请先选择要复制的文件'), 'info');
      return;
    }
    if (!canCopy) {
      showToast(t('没有复制权限'), 'error');
      return;
    }
    setClipboard(Array.from(selectedNodes), 'copy', projectId);
    snapshotSourceTransfer(projectId);
    showToast(t(`已复制 ${selectedNodes.size} 个项目`), 'info');
  }, [
    enableClipboard,
    selectedNodes,
    setClipboard,
    projectId,
    snapshotSourceTransfer,
    showToast,
    canCopy,
  ]);

  const clipboardHandleCut = useCallback(() => {
    if (!enableClipboard) return;
    if (selectedNodes.size === 0) {
      showToast(t('请先选择要剪切的文件'), 'info');
      return;
    }
    if (!canMove) {
      showToast(t('没有移动权限'), 'error');
      return;
    }
    const nodeIds = Array.from(selectedNodes);
    const sourceParentIds: Record<string, string> = {};
    for (const id of nodeIds) {
      const node = nodes.find((n) => n.id === id);
      if (node?.parentId) sourceParentIds[id] = node.parentId;
    }
    setClipboard(nodeIds, 'cut', projectId, sourceParentIds);
    snapshotSourceTransfer(projectId);
    showToast(t(`已剪切 ${selectedNodes.size} 个项目`), 'info');
  }, [
    enableClipboard,
    selectedNodes,
    nodes,
    setClipboard,
    projectId,
    snapshotSourceTransfer,
    showToast,
    canMove,
  ]);

  // 粘贴执行内核（去重 → 目标校验 → move/copy 编排）
  // 定义在 clipboardHandlePaste 之前：跨项目确认回调与主路径都引用它，
  // 且须进入 paste 的依赖数组，避免切目录后仍执行旧 targetParentId 闭包
  const doPaste = useCallback(async () => {
    if (clipboardItems.length === 0 || !clipboardMode) return;

    // 去重：剪贴板同时包含父目录与子节点时只保留父目录
    const parentMap = new Map<string, string | null>();
    for (const n of nodes) {
      parentMap.set(n.id, n.parentId ?? null);
    }
    const items = clipboardItems.filter((id) => {
      const parentId = parentMap.get(id);
      return !(parentId && clipboardItems.includes(parentId));
    });

    if (items.length === 0) {
      showToast(t('没有可粘贴的项目'), 'info');
      return;
    }

    if (!targetParentId) {
      showToast(t('无法确定粘贴位置'), 'error');
      return;
    }

    if (clipboardMode === 'cut') {
      const sourceParentIds = new Map(
        Object.entries(useFileSystemClipboardStore.getState().sourceParentIds)
      );
      const movedIds = await orchestrator.move(
        items,
        targetParentId,
        'clipboard',
        {
          sourceParentIds,
          failureLabel: t('粘贴'),
        }
      );
      if (movedIds.length > 0) clearClipboard();
    } else {
      await orchestrator.copy(items, targetParentId, 'clipboard', {
        failureLabel: t('粘贴'),
      });
    }
  }, [
    clipboardItems,
    clipboardMode,
    targetParentId,
    nodes,
    clearClipboard,
    orchestrator,
    showToast,
  ]);

  const clipboardHandlePaste = useCallback(async () => {
    if (!enableClipboard) return;
    if (clipboardItems.length === 0 || !clipboardMode) {
      return;
    }

    // 跨项目剪切粘贴影响大（文件从源项目移走）：先确认再执行
    const sourceProjectId =
      useFileSystemClipboardStore.getState().sourceProjectId;
    if (
      clipboardMode === 'cut' &&
      sourceProjectId &&
      sourceProjectId !== projectId
    ) {
      showConfirm(
        t('跨项目移动'),
        t('将把 {count} 个项目移动到当前项目，源项目的文件将被移走，确定？', {
          count: String(clipboardItems.length),
        }),
        () => doPaste(),
        'warning',
        t('确认移动')
      );
      return;
    }
    await doPaste();
  }, [
    enableClipboard,
    clipboardItems,
    clipboardMode,
    projectId,
    showConfirm,
    doPaste,
  ]);

  const clipboardHandleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    try {
      const action = undoStack[undoStack.length - 1];
      if (!action) return;
      await undoStoreUndo(undoProjectId);
      showToast(t(`已撤销: ${action.description}`), 'info');
      loadData();
    } catch (error) {
      const appError = handleError(error, t('撤销'), 'medium');
      showToast(appError.message, 'error');
    }
  }, [undoStack, undoStoreUndo, undoProjectId, loadData, showToast]);

  const clipboardHandleRedo = useCallback(async () => {
    if (redoStack.length === 0) return;
    try {
      const action = redoStack[redoStack.length - 1];
      if (!action) return;
      await undoStoreRedo(undoProjectId);
      showToast(t(`已重做: ${action.description}`), 'info');
      loadData();
    } catch (error) {
      const appError = handleError(error, t('重做'), 'medium');
      showToast(appError.message, 'error');
    }
  }, [redoStack, undoStoreRedo, undoProjectId, loadData, showToast]);

  const handleOpen = useCallback(
    (node: FileSystemNode) => {
      onOpen?.(node);
    },
    [onOpen]
  );

  return {
    // CRUD
    showCreateFolderModal: crudState.showCreateFolderModal,
    setShowCreateFolderModal: crudState.setShowCreateFolderModal,
    showCreateDrawingModal: crudState.showCreateDrawingModal,
    setShowCreateDrawingModal: crudState.setShowCreateDrawingModal,
    showRenameModal: crudState.showRenameModal,
    setShowRenameModal: crudState.setShowRenameModal,
    editingNode: crudState.editingNode,
    setEditingNode: crudState.setEditingNode,
    folderName: crudState.folderName,
    setFolderName: crudState.setFolderName,
    drawingName: crudState.drawingName,
    setDrawingName: crudState.setDrawingName,
    handleCreateFolder: crudState.handleCreateFolder,
    handleCreateDrawing: crudState.handleCreateDrawing,
    handleRename: crudState.handleRename,
    handleDelete: crudState.handleDelete,
    handlePermanentlyDelete: crudState.handlePermanentlyDelete,
    handleBatchDelete: crudState.handleBatchDelete,
    handleOpenRename: crudState.handleOpenRename,
    handleCreateProject: crudState.handleCreateProject,
    handleUpdateProject: crudState.handleUpdateProject,
    handleDeleteProject: crudState.handleDeleteProject,
    handlePermanentlyDeleteProject: crudState.handlePermanentlyDeleteProject,
    // 剪贴板
    clipboard: {
      items: clipboardItems,
      mode: clipboardMode,
      canPaste,
      pasteDisabledReason,
      copy: clipboardHandleCopy,
      cut: clipboardHandleCut,
      paste: clipboardHandlePaste,
      clear: clearClipboard,
      undo: clipboardHandleUndo,
      redo: clipboardHandleRedo,
    },
    // 拖拽
    dragDrop: {
      handleDragStart: orchestrator.handleDragStart,
      handleDragOver: orchestrator.handleDragOver,
      handleDragLeave: orchestrator.handleDragLeave,
      handleDrop: orchestrator.handleDrop,
    },
    dropTargetId,
    move: orchestrator.move,
    copy: orchestrator.copy,
    // 回收站子域
    restore: enableTrash ? trash?.restore : undefined,
    batchRestore: enableTrash ? trash?.batchRestore : undefined,
    clearTrash: enableTrash ? trash?.clearTrash : undefined,
    // 打开注入
    handleOpen,
  };
};
