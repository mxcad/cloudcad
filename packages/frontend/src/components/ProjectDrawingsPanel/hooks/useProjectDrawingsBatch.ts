///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useState } from 'react';
import { useLibraryOperations } from '@/hooks/library/useLibraryOperations';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import { t } from '@/languages';

import type { UseProjectDrawingsDataReturn } from './useProjectDrawingsData';

export interface UseProjectDrawingsBatchOptions {
  data: UseProjectDrawingsDataReturn;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string
  ) => void;
  libraryOperations: ReturnType<typeof useLibraryOperations>;
}

/**
 * ProjectDrawingsPanel 多选批量操作层
 *
 * 库管理员的批量移动/复制/删除/下载（浮条操作），含批量选择文件夹模态。
 */
export function useProjectDrawingsBatch({
  data,
  showConfirm,
  libraryOperations,
}: UseProjectDrawingsBatchOptions) {
  const {
    multiSelectedNodes,
    selectedNodesArray,
    clearMultiSelection,
    pushAction,
    undoProjectId,
    nodes,
  } = data;

  const [showBatchSelectFolderModal, setShowBatchSelectFolderModal] =
    useState(false);
  const [batchOperationMode, setBatchOperationMode] = useState<
    'move' | 'copy' | null
  >(null);
  const [showBatchDownloadDialog, setShowBatchDownloadDialog] = useState(false);

  const handleBatchMoveClick = useCallback(() => {
    if (multiSelectedNodes.size === 0) return;
    setBatchOperationMode('move');
    setShowBatchSelectFolderModal(true);
  }, [multiSelectedNodes]);

  const handleBatchCopyClick = useCallback(() => {
    if (multiSelectedNodes.size === 0) return;
    setBatchOperationMode('copy');
    setShowBatchSelectFolderModal(true);
  }, [multiSelectedNodes]);

  const handleBatchDeleteClick = useCallback(() => {
    if (multiSelectedNodes.size === 0) return;
    showConfirm(
      t('确认批量删除'),
      t(
        `确定要永久删除选中的 ${multiSelectedNodes.size} 个项目吗？公共资源库中的文件删除后无法恢复。`
      ),
      async () => {
        try {
          await libraryOperations.handleBatchDelete(selectedNodesArray);
          clearMultiSelection();
        } catch {
          // handled in libraryOperations
        }
      },
      'danger',
      t('删除')
    );
  }, [
    multiSelectedNodes,
    selectedNodesArray,
    libraryOperations,
    showConfirm,
    clearMultiSelection,
  ]);

  const handleBatchDownloadClick = useCallback(() => {
    if (multiSelectedNodes.size === 0) return;
    const fileItems = selectedNodesArray.map((nodeId) => {
      const node = nodes.find((n) => n.id === nodeId);
      return {
        nodeId,
        fileName: node?.name || '',
        formats: [] as string[],
        isFolder: node?.isFolder || false,
      };
    });
    if (fileItems.length > 0) {
      useBatchDownloadStore.getState().openDialog(fileItems);
      setShowBatchDownloadDialog(true);
    }
  }, [multiSelectedNodes, selectedNodesArray, nodes]);

  const handleCloseBatchSelectFolderModal = useCallback(() => {
    setShowBatchSelectFolderModal(false);
    setBatchOperationMode(null);
  }, []);

  const handleConfirmBatchMoveOrCopy = useCallback(
    async (targetParentId: string) => {
      if (selectedNodesArray.length === 0) return;
      const mode = batchOperationMode;
      const nodeIds = [...selectedNodesArray];
      const origParentIds: Record<string, string> = {};
      for (const id of nodeIds) {
        const node = nodes.find((n) => n.id === id);
        if (node?.parentId) origParentIds[id] = node.parentId;
      }
      try {
        if (mode === 'move') {
          await libraryOperations.handleBatchMove(nodeIds, targetParentId);
          pushAction({
            type: 'move',
            description: t(`移动 ${nodeIds.length} 个项目`),
            projectId: undoProjectId,
            execute: async () => {
              await libraryOperations.handleBatchMove(nodeIds, targetParentId);
            },
            rollback: async () => {
              for (const [nid, srcPid] of Object.entries(origParentIds)) {
                if (srcPid) await libraryOperations.handleMove(nid, srcPid);
              }
            },
          });
        } else {
          await libraryOperations.handleBatchCopy(nodeIds, targetParentId);
          pushAction({
            type: 'delete',
            description: t(`复制 ${nodeIds.length} 个项目`),
            projectId: undoProjectId,
            execute: async () => {
              await libraryOperations.handleBatchCopy(nodeIds, targetParentId);
            },
            rollback: async () => {
              await libraryOperations.handleBatchDelete(nodeIds);
            },
          });
        }
        clearMultiSelection();
        setShowBatchSelectFolderModal(false);
        setBatchOperationMode(null);
      } catch {
        // handled in libraryOperations
      }
    },
    [
      selectedNodesArray,
      batchOperationMode,
      nodes,
      libraryOperations,
      clearMultiSelection,
      pushAction,
      undoProjectId,
    ]
  );

  const handleCancelBatchBar = useCallback(() => {
    clearMultiSelection();
  }, [clearMultiSelection]);

  return {
    showBatchSelectFolderModal,
    batchOperationMode,
    showBatchDownloadDialog,
    setShowBatchDownloadDialog,
    handleBatchMoveClick,
    handleBatchCopyClick,
    handleBatchDeleteClick,
    handleBatchDownloadClick,
    handleCloseBatchSelectFolderModal,
    handleConfirmBatchMoveOrCopy,
    handleCancelBatchBar,
  };
}

export type UseProjectDrawingsBatchReturn = ReturnType<
  typeof useProjectDrawingsBatch
>;
