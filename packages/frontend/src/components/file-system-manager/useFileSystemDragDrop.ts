///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import React, { useCallback, useState } from 'react';
import { FileSystemNode } from '../../types/filesystem';
import { projectsApi } from '../../services/projectsApi';
import { useNotification } from '../../contexts/NotificationContext';

export const useFileSystemDragDrop = () => {
  const { showToast } = useNotification();
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, node: FileSystemNode) => {
      e.preventDefault();
      if (node.isFolder && draggedNodes[0] && node.id !== draggedNodes[0].id) {
        e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
        setDropTargetId(node.id);
      }
    },
    [draggedNodes]
  );

  const handleDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const handleDrop = useCallback(
    async (
      e: React.DragEvent,
      targetNode: FileSystemNode,
      onRefresh: () => void
    ) => {
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
          await projectsApi.copyNode(draggedNodeId, targetNode.id);
        } else {
          await projectsApi.moveNode(draggedNodeId, targetNode.id);
        }
        onRefresh();
      } catch (error) {
        showToast('移动失败，请重试', 'error');
      } finally {
        setDraggedNodes([]);
      }
    },
    [draggedNodes, showToast]
  );

  return {
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};
