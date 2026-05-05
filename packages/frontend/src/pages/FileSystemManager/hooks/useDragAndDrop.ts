///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback } from 'react';
import { fileSystemControllerMoveNode, fileSystemControllerCopyNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { FileSystemNode } from '@/types/filesystem';

interface UseDragAndDropOptions {
  draggedNodes: FileSystemNode[];
  setDraggedNodes: (nodes: FileSystemNode[]) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  handleRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function useDragAndDrop({
  draggedNodes,
  setDraggedNodes,
  dropTargetId: _dropTargetId,
  setDropTargetId,
  handleRefresh,
  showToast,
}: UseDragAndDropOptions) {
  const handleDragStart = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      if (node.isRoot) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'copyMove';
      setDraggedNodes([node]);
    },
    [setDraggedNodes]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      e.preventDefault();
      if (node.isFolder && node.id !== draggedNodes[0]?.id) {
        e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
        setDropTargetId(node.id);
      }
    },
    [draggedNodes, setDropTargetId]
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, [setDropTargetId]);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetNode: FileSystemNode) => {
      e.preventDefault();
      setDropTargetId(null);

      if (!targetNode.isFolder) return;
      if (draggedNodes.length === 0) return;

      const draggedNode = draggedNodes[0];
      if (!draggedNode) return;
      const draggedNodeId = draggedNode.id;
      if (draggedNodeId === targetNode.id) return;

      const isCopy = e.ctrlKey || e.metaKey;

      try {
        if (isCopy) {
          await fileSystemControllerCopyNode({ path: { nodeId: draggedNodeId }, body: { targetParentId: targetNode.id } } as any);
        } else {
          await fileSystemControllerMoveNode({ path: { nodeId: draggedNodeId }, body: { targetParentId: targetNode.id } } as any);
        }
        handleRefresh();
      } catch (error: unknown) {
        handleError(error, '拖拽操作失败');
        showToast('操作失败，请重试', 'error');
      } finally {
        setDraggedNodes([]);
      }
    },
    [draggedNodes, handleRefresh, setDropTargetId, setDraggedNodes, showToast]
  );

  return {
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
