import { useState } from 'react';
import { FileSystemNode } from '../../types/filesystem';

export const useFileSystemDragDrop = () => {
  const [draggedNodes, setDraggedNodes] = useState<FileSystemNode[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  return {
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,
  };
};
