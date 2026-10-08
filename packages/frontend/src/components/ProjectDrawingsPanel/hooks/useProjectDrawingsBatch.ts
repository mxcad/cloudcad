///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useState } from 'react';
import { useLibraryOperations } from '@/hooks/library/useLibraryOperations';
import { buildCopyAction } from '@/hooks/file-system/moveCopyActions';
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
          // 复制 undo 的 rollback 必须删副本 id（outcome.createdIds），
          // 绝不能删源 nodeIds——公共库删除即永久删除（数据丢失事故）
          const outcome = await libraryOperations.handleBatchCopy(
            nodeIds,
            targetParentId
          );
          if (outcome.createdIds.length > 0) {
            pushAction(
              buildCopyAction({
                sourceNodeIds: nodeIds,
                targetParentId,
                createdIds: outcome.createdIds,
                description: t(`复制 ${nodeIds.length} 个项目`),
                projectId: undoProjectId,
                endpoints: {
                  copyNode: (id, pid) => libraryOperations.copyNode(id, pid),
                  deleteNode: (id) => libraryOperations.deleteNode(id),
                },
              })
            );
          }
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
