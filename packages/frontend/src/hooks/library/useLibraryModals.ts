///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback } from 'react';

// ── 类型定义 ──

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

interface SourceNode {
  id: string;
  name: string;
}

// ── Options ──

export interface UseLibraryModalsOptions {
  /** 初始确认对话框状态 */
  initialConfirmDialog?: ConfirmDialogState;
}

// ── Return ──

export interface UseLibraryModalsReturn {
  // 创建文件夹
  isCreateFolderModalOpen: boolean;
  openCreateFolderModal: () => void;
  closeCreateFolderModal: () => void;

  // 重命名
  isRenameModalOpen: boolean;
  renamingNode: SourceNode | null;
  renameName: string;
  openRenameModal: (node: SourceNode & { isFolder?: boolean }) => void;
  closeRenameModal: () => void;
  setRenameName: (name: string) => void;

  // 选择目标文件夹（移动/复制）
  showSelectFolderModal: boolean;
  moveSourceNode: SourceNode | null;
  copySourceNode: SourceNode | null;
  openMoveModal: (node: SourceNode) => void;
  openCopyModal: (node: SourceNode) => void;
  openBatchMoveModal: (count: number) => void;
  openBatchCopyModal: (count: number) => void;
  closeSelectFolderModal: () => void;

  // 确认对话框
  confirmDialog: ConfirmDialogState;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => Promise<void> | void,
    _type?: 'danger' | 'warning' | 'info' | 'success',
    _confirmText?: string
  ) => void;
  closeConfirmDialog: () => void;

  // 下载格式选择
  showDownloadFormatModal: boolean;
  downloadingNodeId: string | null;
  downloadingFileName: string | null;
  openDownloadFormatModal: (nodeId: string, fileName: string) => void;
  closeDownloadFormatModal: () => void;
}

// ── Hook ──

/**
 * 资源库 UI 状态 Hook
 *
 * 管理所有模态框的打开/关闭状态和表单输入状态。
 * 不包含任何业务逻辑（API 调用等），只负责 UI 状态。
 */
export function useLibraryModals(
  options: UseLibraryModalsOptions = {}
): UseLibraryModalsReturn {
  const {
    initialConfirmDialog = {
      isOpen: false,
      title: '',
      message: '',
      onConfirm: () => {},
    },
  } = options;

  // ── 创建文件夹 ──
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const openCreateFolderModal = useCallback(() => setIsCreateFolderModalOpen(true), []);
  const closeCreateFolderModal = useCallback(() => setIsCreateFolderModalOpen(false), []);

  // ── 重命名 ──
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamingNode, setRenamingNode] = useState<SourceNode | null>(null);
  const [renameName, setRenameName] = useState('');

  const openRenameModal = useCallback(
    (node: SourceNode & { isFolder?: boolean }) => {
      setRenamingNode({ id: node.id, name: node.name });
      if (!node.isFolder && node.name) {
        const lastDotIndex = node.name.lastIndexOf('.');
        const nameWithoutExtension =
          lastDotIndex !== -1
            ? node.name.substring(0, lastDotIndex)
            : node.name;
        setRenameName(nameWithoutExtension);
      } else {
        setRenameName(node.name);
      }
      setIsRenameModalOpen(true);
    },
    []
  );

  const closeRenameModal = useCallback(() => {
    setIsRenameModalOpen(false);
    setRenamingNode(null);
    setRenameName('');
  }, []);

  // ── 选择目标文件夹（移动/复制） ──
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<SourceNode | null>(null);
  const [copySourceNode, setCopySourceNode] = useState<SourceNode | null>(null);

  const openMoveModal = useCallback((node: SourceNode) => {
    setMoveSourceNode(node);
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const openCopyModal = useCallback((node: SourceNode) => {
    setCopySourceNode(node);
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const openBatchMoveModal = useCallback((count: number) => {
    setMoveSourceNode({ id: 'batch', name: `${count} 个项目` });
    setCopySourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const openBatchCopyModal = useCallback((count: number) => {
    setCopySourceNode({ id: 'batch', name: `${count} 个项目` });
    setMoveSourceNode(null);
    setShowSelectFolderModal(true);
  }, []);

  const closeSelectFolderModal = useCallback(() => {
    setShowSelectFolderModal(false);
    setMoveSourceNode(null);
    setCopySourceNode(null);
  }, []);

  // ── 确认对话框 ──
  const [confirmDialog, setConfirmDialog] =
    useState<ConfirmDialogState>(initialConfirmDialog);

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => Promise<void> | void,
      _type?: 'danger' | 'warning' | 'info' | 'success',
      _confirmText?: string
    ) => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        onConfirm: async () => {
          await onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    []
  );

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // ── 下载格式选择 ──
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState<string | null>(null);
  const [downloadingFileName, setDownloadingFileName] = useState<string | null>(null);

  const openDownloadFormatModal = useCallback(
    (nodeId: string, fileName: string) => {
      setDownloadingNodeId(nodeId);
      setDownloadingFileName(fileName);
      setShowDownloadFormatModal(true);
    },
    []
  );

  const closeDownloadFormatModal = useCallback(() => {
    setShowDownloadFormatModal(false);
    setDownloadingNodeId(null);
    setDownloadingFileName(null);
  }, []);

  return {
    isCreateFolderModalOpen,
    openCreateFolderModal,
    closeCreateFolderModal,

    isRenameModalOpen,
    renamingNode,
    renameName,
    openRenameModal,
    closeRenameModal,
    setRenameName,

    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    openMoveModal,
    openCopyModal,
    openBatchMoveModal,
    openBatchCopyModal,
    closeSelectFolderModal,

    confirmDialog,
    showConfirm,
    closeConfirmDialog,

    showDownloadFormatModal,
    downloadingNodeId,
    downloadingFileName,
    openDownloadFormatModal,
    closeDownloadFormatModal,
  };
}
