import { ref } from 'vue';
import type { FileSystemNode } from './useFileSystemData';

export function useFileSystemDragDrop() {
  const draggedNodes = ref<FileSystemNode[]>([]);
  const dropTargetId = ref<string | null>(null);

  function handleDragStart(e: DragEvent, node: FileSystemNode): void {
    if (node.isRoot) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', node.id);
    e.dataTransfer!.effectAllowed = 'copyMove';
    draggedNodes.value = [node];
  }

  function handleDragOver(e: DragEvent, node: FileSystemNode): void {
    e.preventDefault();
    if (node.isFolder && node.id !== draggedNodes.value[0]?.id) {
      e.dataTransfer!.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
      dropTargetId.value = node.id;
    }
  }

  function handleDragLeave(): void {
    dropTargetId.value = null;
  }

  async function handleDrop(
    e: DragEvent,
    targetNode: FileSystemNode,
    moveNode: (draggedNodeId: string, targetParentId: string) => Promise<void>,
    copyNode: (draggedNodeId: string, targetParentId: string) => Promise<void>,
    refresh: () => void,
    showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void
  ): Promise<void> {
    e.preventDefault();
    dropTargetId.value = null;

    if (!targetNode.isFolder) return;
    if (draggedNodes.value.length === 0) return;

    const draggedNode = draggedNodes.value[0];
    if (!draggedNode) return;
    const draggedNodeId = draggedNode.id;
    if (draggedNodeId === targetNode.id) return;

    const isCopy = e.ctrlKey || e.metaKey;

    try {
      if (isCopy) {
        await copyNode(draggedNodeId, targetNode.id);
      } else {
        await moveNode(draggedNodeId, targetNode.id);
      }
      refresh();
    } catch (error) {
      const errorMessage = (error as Error).message || '操作失败，请重试';
      showToast(errorMessage, 'error');
    } finally {
      draggedNodes.value = [];
    }
  }

  return {
    draggedNodes,
    dropTargetId,
    setDraggedNodes: (nodes: FileSystemNode[]) => { draggedNodes.value = nodes; },
    setDropTargetId: (id: string | null) => { dropTargetId.value = id; },
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
