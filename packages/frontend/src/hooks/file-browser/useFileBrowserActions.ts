///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useEffect, useState } from 'react';
import { nodeControllerLookupNodes } from '@/api-sdk';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useFileSystemCRUD } from '@/hooks/file-system';
import { useMoveCopyOrchestrator } from '@/hooks/file-system';
import { handleError } from '@/utils/errorHandler';
import { t } from '@/languages';
import {
  evaluateCrossProjectTransfer,
  fetchProjectTransferSettings,
  resolveRootKindFromMode,
} from '@/lib/crossProjectPaste';
import type {
  CrossProjectTransferVerdict,
  ProjectTransferSettings,
  TransferRootKind,
} from '@/lib/crossProjectPaste';
import type { FileSystemNode } from '@/types/filesystem';
import type {
  FileBrowserPermissions,
  ShowConfirmFn,
  ShowToastFn,
} from './fileBrowserTypes';
import type { FileSystemBreadcrumbItem } from './fileBrowserTypes';
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
  /**
   * 当前目录面包屑链（粘贴环防护：剪贴板项命中祖先链时剔除该项）；
   * 缺省不过滤（侧栏等未注入面包屑的外壳由后端兜底）
   */
  breadcrumbs?: FileSystemBreadcrumbItem[];
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
  breadcrumbs: breadcrumbsProp,
}: UseFileBrowserActionsOptions): UseFileBrowserActionsReturn => {
  const { nodes, currentNode, urlProjectId, refresh: dataRefresh } = data;
  const breadcrumbs = breadcrumbsProp ?? [];
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
  // 源项目 6 域策略在复制/剪切时快照进剪贴板（源为项目时才查询；个人空间/库
  // 源无出向字段恒允许）；目标项目入向策略在粘贴时按当前域判定——仅目标为
  // 项目根才需要查询。任何一侧查询失败 → 保守视为不支持跨项目转移。
  const getProjectTransferSettings =
    optionsGetProjectTransferSettings ?? fetchProjectTransferSettings;

  /** 当前视图归属根类型（粘贴目标域） */
  const targetRootKind: TransferRootKind = resolveRootKindFromMode(mode);

  // 复制/剪切时快照剪贴板源域与源项目出向策略（快照失败则后端兜底）
  const snapshotSourceTransfer = useCallback(async () => {
    const sourceRootKind = resolveRootKindFromMode(mode);
    const settings =
      sourceRootKind === 'project'
        ? await getProjectTransferSettings(projectId)
        : null;
    useFileSystemClipboardStore.setState({
      sourceRootKind,
      sourceTransferSettings: settings,
    });
  }, [mode, projectId, getProjectTransferSettings]);

  const clipboardSourceProjectId = useFileSystemClipboardStore(
    (s) => s.sourceProjectId
  );
  const clipboardSourceRootKind = useFileSystemClipboardStore(
    (s) => s.sourceRootKind
  );
  const clipboardSourceTransferSettings = useFileSystemClipboardStore(
    (s) => s.sourceTransferSettings
  );

  // 剪贴板源与当前目录归属根不同时评估跨项目策略。乐观允许：verdict 未就绪
  // 不拦截，查询完成后若禁止则收紧 canPaste 并禁用粘贴按钮。
  // 域语义对齐后端 6 域矩阵：非项目根一侧无配置字段 → 跳过该侧检查。
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
    // 目标为非项目根（个人空间）时无入向策略字段，无需查询目标设置
    const needsTargetSettings = targetRootKind === 'project';
    Promise.resolve(
      needsTargetSettings ? getProjectTransferSettings(projectId) : undefined
    ).then((targetSettings) => {
      if (cancelled) return;
      setPasteVerdict(
        evaluateCrossProjectTransfer({
          // 粘贴=在目标位置创建节点：cut → 移动（move），copy → 复制（copy）
          operation: clipboardMode === 'cut' ? 'move' : 'copy',
          sourceProjectId: clipboardSourceProjectId,
          targetProjectId: projectId,
          sourceRootKind: clipboardSourceRootKind,
          targetRootKind,
          sourceSettings:
            clipboardSourceRootKind === 'project'
              ? (clipboardSourceTransferSettings ?? null)
              : undefined,
          targetSettings:
            needsTargetSettings && targetSettings != null
              ? targetSettings
              : null,
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
    clipboardSourceRootKind,
    clipboardSourceTransferSettings,
    projectId,
    targetRootKind,
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
    snapshotSourceTransfer();
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
    // 源父目录快照：当前视图可见项直接取；跨页/搜索选中的缺失项经
    // nodes/lookup 补全（undo rollback 需要完整源位置）
    const sourceParentIds: Record<string, string> = {};
    const missingIds: string[] = [];
    for (const id of nodeIds) {
      const node = nodes.find((n) => n.id === id);
      if (node?.parentId) sourceParentIds[id] = node.parentId;
      else missingIds.push(id);
    }
    const snapshotMissing = async () => {
      if (missingIds.length === 0) return;
      try {
        const res = await nodeControllerLookupNodes({
          body: { ids: missingIds },
          throwOnError: true,
        });
        // responseTransformer 已解包信封：res.data 即 NodeLookupItemDto[]
        const rows = (res.data ?? []) as Array<{
          id: string;
          parentId: string | null;
        }>;
        for (const row of rows) {
          if (row.parentId) sourceParentIds[row.id] = row.parentId;
        }
      } catch {
        // 快照失败不阻断剪切：undo 时缺源位置的项会被跳过
      }
    };
    snapshotMissing().then(() => {
      setClipboard(nodeIds, 'cut', projectId, { sourceParentIds });
    });
    snapshotSourceTransfer();
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

    // 环防护（D2）：粘贴目标（当前目录）位于某剪贴板项的子树内时剔除该项——
    // 目标目录的面包屑链上任一节点即为其祖先
    const ancestorIds = new Set(breadcrumbs.map((b) => b.id));
    if (currentNode?.id) ancestorIds.add(currentNode.id);

    // 去重：剪贴板同时包含父目录与子节点时只保留父目录
    const parentMap = new Map<string, string | null>();
    for (const n of nodes) {
      parentMap.set(n.id, n.parentId ?? null);
    }
    const items = clipboardItems.filter((id) => {
      if (ancestorIds.has(id)) return false;
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
    breadcrumbs,
    currentNode,
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
