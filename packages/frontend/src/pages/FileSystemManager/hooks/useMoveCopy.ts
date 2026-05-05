///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback } from 'react';
import { fileSystemControllerMoveNode, fileSystemControllerCopyNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { FileSystemNode } from '@/types/filesystem';

interface UseMoveCopyOptions {
  isMultiSelectMode: boolean;
  selectedNodes: Set<string>;
  handleRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function useMoveCopy({
  isMultiSelectMode,
  selectedNodes,
  handleRefresh,
  showToast,
}: UseMoveCopyOptions) {
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<
    FileSystemNode | { id: 'batch' } | null
  >(null);
  const [copySourceNode, setCopySourceNode] = useState<
    FileSystemNode | { id: 'batch' } | null
  >(null);

  const closeMoveCopy = useCallback(() => {
    setShowSelectFolderModal(false);
    setMoveSourceNode(null);
    setCopySourceNode(null);
  }, []);

  const handleMove = useCallback((node: FileSystemNode) => {
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
      try {
        if (isMultiSelectMode && selectedNodes.size > 0) {
          const nodeIds = Array.from(selectedNodes) as string[];
          for (const nodeId of nodeIds) {
            if (moveSourceNode) {
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId } } as any);
            } else {
              await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId } } as any);
            }
          }
        } else if (moveSourceNode) {
          await fileSystemControllerMoveNode({ path: { nodeId: moveSourceNode.id }, body: { targetParentId } } as any);
        } else if (copySourceNode) {
          await fileSystemControllerCopyNode({ path: { nodeId: copySourceNode.id }, body: { targetParentId } } as any);
        }
        handleRefresh();
        closeMoveCopy();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '操作失败，请重试';
        showToast(errorMessage, 'error');
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      isMultiSelectMode,
      selectedNodes,
      handleRefresh,
      closeMoveCopy,
      showToast,
    ]
  );

  return {
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    handleMove,
    handleCopy,
    handleConfirmMoveOrCopy,
    closeMoveCopy,
    setMoveSourceNode,
    setCopySourceNode,
    setShowSelectFolderModal,
  };
}
