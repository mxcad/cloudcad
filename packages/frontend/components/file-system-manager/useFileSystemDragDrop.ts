import React, { useCallback } from 'react';
import { FileSystemNode } from '../../types/filesystem';
import { projectsApi } from '../../services/apiService';

interface FileSystemDragDropHandlerProps {
  draggedNodes: FileSystemNode[];
  setDraggedNodes: (nodes: FileSystemNode[]) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  onRefresh: () => void;
}

export const useFileSystemDragDrop = ({
  draggedNodes,
  setDraggedNodes,
  dropTargetId,
  setDropTargetId,
  onRefresh,
}: FileSystemDragDropHandlerProps) => {
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

      const draggedNodeId = draggedNodes[0].id;
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
        alert('����ʧ�ܣ�������');
      } finally {
        setDraggedNodes([]);
      }
    },
    [draggedNodes, onRefresh, setDraggedNodes, setDropTargetId]
  );

  return {
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};
