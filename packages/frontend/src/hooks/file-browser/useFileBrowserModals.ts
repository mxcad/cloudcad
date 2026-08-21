///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useRef, useState } from 'react';
import { t } from '@/languages';
import type { FileSystemNode } from '@/types/filesystem';
import type {
  FileBrowserModalId,
  FileBrowserModalState,
  FolderPickSourceNode,
} from './fileBrowserTypes';
import type { UseFileBrowserActionsReturn } from './useFileBrowserActions';

export interface UseFileBrowserModalsOptions {
  actions: UseFileBrowserActionsReturn;
  /** 当前节点列表（SelectFolder 批量源父目录解析） */
  nodes: FileSystemNode[];
  /** 当前选中集合（SelectFolder 批量判定） */
  selectedNodes: Set<string>;
  /** 批量操作成功后清空选择 */
  clearSelection: () => void;
  /** 批量移动/复制目标项目 id（undo 归属） */
  projectId?: string;
}

export interface UseFileBrowserModalsReturn {
  // ── SelectFolder（单节点移动/复制）收敛状态 ──
  showSelectFolderModal: boolean;
  moveSourceNode: FolderPickSourceNode;
  copySourceNode: FolderPickSourceNode;
  setShowSelectFolderModal: (v: boolean) => void;
  setMoveSourceNode: (v: FolderPickSourceNode) => void;
  setCopySourceNode: (v: FolderPickSourceNode) => void;
  /** 打开移动（单节点） */
  handleMove: (node: FileSystemNode) => void;
  /** 打开复制（单节点） */
  handleCopy: (node: FileSystemNode) => void;
  /** SelectFolderModal 确认回调 */
  handleConfirmMoveOrCopy: (targetParentId: string) => Promise<void>;
  /** 关闭 SelectFolderModal（清空源节点） */
  closeSelectFolder: () => void;
  /** SelectFolderModal 渲染便利 */
  selectFolderNodeId: string;
  selectFolderConfirmText: string;
  // ── 通用弹窗状态机（枚举身份 + payload + 表单值） ──
  state: FileBrowserModalState;
  open: (id: FileBrowserModalId, payload?: unknown) => void;
  close: () => void;
  closeAll: () => void;
  setForm: (id: FileBrowserModalId, name: string, value: unknown) => void;
  isOpen: (id: FileBrowserModalId) => boolean;
}

/**
 * useFileBrowserModals - 文件浏览器弹窗状态机内核（原子 D）
 *
 * SelectFolder 弹窗状态收敛（两外壳 useMoveCopy / useProjectDrawingsMoveCopy
 * 合体，支持单节点 + 批量）+
 * 通用弹窗状态机（activeId 单态 + payload 泛型 + 表单值）。
 * 渲染归外壳 adapter；外壳未渲染的 modal 由外壳自行过滤，内核不感知。
 */
export const useFileBrowserModals = ({
  actions,
  nodes,
  selectedNodes,
  clearSelection,
  projectId,
}: UseFileBrowserModalsOptions): UseFileBrowserModalsReturn => {
  // ── SelectFolder 状态 ─────────────────────────────────────────────
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] =
    useState<FolderPickSourceNode>(null);
  const [copySourceNode, setCopySourceNode] =
    useState<FolderPickSourceNode>(null);
  const sourceParentIdsRef = useRef<Map<string, string>>(new Map());

  const closeSelectFolder = useCallback(() => {
    setShowSelectFolderModal(false);
    setMoveSourceNode(null);
    setCopySourceNode(null);
  }, []);

  const handleMove = useCallback((node: FileSystemNode) => {
    sourceParentIdsRef.current.set(node.id, node.parentId || '');
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const handleCopy = useCallback((node: FileSystemNode) => {
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const handleConfirmMoveOrCopy = useCallback(
    async (targetParentId: string) => {
      const isMove = !!moveSourceNode;
      const sourceNodeId = (moveSourceNode ?? copySourceNode)?.id;
      const isBatch = !!(
        selectedNodes.size > 0 &&
        sourceNodeId &&
        selectedNodes.has(sourceNodeId)
      );
      const nodeIds = isBatch
        ? Array.from(selectedNodes)
        : sourceNodeId
          ? [sourceNodeId]
          : [];
      if (nodeIds.length === 0) return;

      const origParentIds = new Map(sourceParentIdsRef.current);
      if (isBatch) {
        nodeIds.forEach((id) => {
          const node = nodes.find((n) => n.id === id);
          if (node && !origParentIds.has(id)) {
            origParentIds.set(id, node.parentId || '');
          }
        });
      }
      // 批量时不传 description：由 orchestrator 按实际成功数生成「移动 N 个项目」
      const description = isMove
        ? isBatch
          ? undefined
          : t('移动 "{name}"', {
              name: (moveSourceNode as FileSystemNode)?.name || '',
            })
        : isBatch
          ? undefined
          : t('复制 "{name}"', {
              name: (copySourceNode as FileSystemNode)?.name || '',
            });

      const done = isMove
        ? await actions.move(nodeIds, targetParentId, 'modal', {
            sourceParentIds: origParentIds,
            description,
            projectId,
            onSuccess: closeSelectFolder,
          })
        : await actions.copy(nodeIds, targetParentId, 'modal', {
            description,
            projectId,
            onSuccess: closeSelectFolder,
          });
      if (done.length > 0 && isBatch) {
        clearSelection();
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      selectedNodes,
      nodes,
      clearSelection,
      actions,
      projectId,
      closeSelectFolder,
    ]
  );

  const selectFolderNodeId =
    moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch'
      ? ''
      : moveSourceNode?.id || copySourceNode?.id || '';

  const selectFolderConfirmText = moveSourceNode
    ? t('移动到此')
    : t('复制到此');

  // ── 通用弹窗状态机 ────────────────────────────────────────────────
  const [state, setState] = useState<FileBrowserModalState>({
    activeId: null,
    payload: null,
    forms: {},
  });

  const open = useCallback((id: FileBrowserModalId, payload?: unknown) => {
    setState({ activeId: id, payload: payload ?? null, forms: {} });
  }, []);

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, activeId: null, payload: null }));
  }, []);

  const closeAll = useCallback(() => {
    setState({ activeId: null, payload: null, forms: {} });
  }, []);

  const setForm = useCallback(
    (id: FileBrowserModalId, name: string, value: unknown) => {
      setState((prev) => ({
        ...prev,
        forms: { ...prev.forms, [`${id}:${name}`]: value },
      }));
    },
    []
  );

  const isOpen = useCallback(
    (id: FileBrowserModalId) => state.activeId === id,
    [state.activeId]
  );

  return {
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    setShowSelectFolderModal,
    setMoveSourceNode,
    setCopySourceNode,
    handleMove,
    handleCopy,
    handleConfirmMoveOrCopy,
    closeSelectFolder,
    selectFolderNodeId,
    selectFolderConfirmText,
    state,
    open,
    close,
    closeAll,
    setForm,
    isOpen,
  };
};
