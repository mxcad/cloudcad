///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef } from 'react';
import { fileSystemControllerMoveNode, fileSystemControllerCopyNode, fileSystemControllerDeleteNode } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import type { FileSystemNode } from '@/types/filesystem';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';

interface UseMoveCopyOptions {
  urlProjectId: string;
  selectedNodes: Set<string>;
  nodes: FileSystemNode[];
  handleRefresh: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export function useMoveCopy({
  urlProjectId,
  selectedNodes,
  nodes,
  handleRefresh,
  showToast,
}: UseMoveCopyOptions) {
  const pushAction = useFileSystemUndoRedoStore((s) => s.pushAction);
  const [showSelectFolderModal, setShowSelectFolderModal] = useState(false);
  const [moveSourceNode, setMoveSourceNode] = useState<
    FileSystemNode | { id: 'batch' } | null
  >(null);
  const [copySourceNode, setCopySourceNode] = useState<
    FileSystemNode | { id: 'batch' } | null
  >(null);

  const sourceParentIdsRef = useRef<Map<string, string>>(new Map());

  const closeMoveCopy = useCallback(() => {
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
      const isBatch = selectedNodes.size > 0;
      try {
        let movedNodeIds: string[] = [];

        if (isBatch) {
          const nodeIds = Array.from(selectedNodes) as string[];
          for (const nodeId of nodeIds) {
            if (isMove) {
              await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId } });
            } else {
              await fileSystemControllerCopyNode({ path: { nodeId }, body: { targetParentId } });
            }
          }
          movedNodeIds = nodeIds;
        } else if (moveSourceNode) {
          await fileSystemControllerMoveNode({ path: { nodeId: moveSourceNode.id }, body: { targetParentId } });
          movedNodeIds = [moveSourceNode.id];
        } else if (copySourceNode) {
          await fileSystemControllerCopyNode({ path: { nodeId: copySourceNode.id }, body: { targetParentId } });
        }
        handleRefresh();

        if (isMove) {
          const desc = isBatch
            ? `移动 ${movedNodeIds.length} 个项目`
            : `移动 "${(moveSourceNode as FileSystemNode)?.name || ''}"`;

          const origParentIds = new Map(sourceParentIdsRef.current);

          if (isBatch) {
            movedNodeIds.forEach((id) => {
              const node = nodes.find((n) => n.id === id);
              if (node && !origParentIds.has(id)) {
                origParentIds.set(id, node.parentId || '');
              }
            });
          }

          pushAction({
            type: 'move',
            description: desc,
            projectId: urlProjectId,
            execute: async () => {
              const ids = isBatch ? movedNodeIds : [moveSourceNode!.id];
              for (const id of ids) {
                await fileSystemControllerMoveNode({ path: { nodeId: id }, body: { targetParentId } });
              }
            },
            rollback: async () => {
              for (const [nodeId, srcParentId] of origParentIds) {
                if (!srcParentId) continue;
                await fileSystemControllerMoveNode({ path: { nodeId }, body: { targetParentId: srcParentId } });
              }
            },
          });
        }

        showToast(isMove ? '移动成功' : '复制成功', 'success');
        closeMoveCopy();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '操作失败，请重试';
        showToast(errorMessage, 'error');
      }
    },
    [
      moveSourceNode,
      copySourceNode,
      selectedNodes,
      nodes,
      handleRefresh,
      closeMoveCopy,
      showToast,
      pushAction,
      urlProjectId,
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
