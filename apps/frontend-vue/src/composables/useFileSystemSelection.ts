import { ref, watch, onMounted, onUnmounted } from 'vue';
import type { FileSystemNode } from './useFileSystemData';

export interface UseFileSystemSelectionOptions {
  nodes: FileSystemNode[];
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export function useFileSystemSelection(options: UseFileSystemSelectionOptions) {
  const selectedNodes = ref<Set<string>>(new Set());
  const isMultiSelectMode = ref(false);

  const lastSelectedNodeIdRef = ref<string | null | undefined>(null);
  const lastSelectedIndexRef = ref<number>(-1);

  function handleNodeSelect(
    nodeId: string,
    isMultiSelect: boolean = false,
    isShift: boolean = false
  ): void {
    setSelectedNodes((prev) => {
      const newSet = new Set(prev);
      const currentIndex = options.nodes.findIndex((node) => node.id === nodeId);

      if (isShift && lastSelectedNodeIdRef.value && lastSelectedIndexRef.value !== -1) {
        const lastIndex = lastSelectedIndexRef.value;
        const startIndex = Math.min(lastIndex, currentIndex);
        const endIndex = Math.max(lastIndex, currentIndex);

        if (!isMultiSelectMode.value) {
          newSet.clear();
        }

        for (let i = startIndex; i <= endIndex; i++) {
          const node = options.nodes[i];
          node && newSet.add(node.id);
        }

        lastSelectedNodeIdRef.value = nodeId;
        lastSelectedIndexRef.value = currentIndex;
      } else if (isMultiSelect) {
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
          if (lastSelectedNodeIdRef.value === nodeId) {
            lastSelectedNodeIdRef.value = null;
            lastSelectedIndexRef.value = -1;
          }
        } else {
          newSet.add(nodeId);
          lastSelectedNodeIdRef.value = nodeId;
          lastSelectedIndexRef.value = currentIndex;
        }
      } else {
        newSet.clear();
        newSet.add(nodeId);
        lastSelectedNodeIdRef.value = nodeId;
        lastSelectedIndexRef.value = currentIndex;
      }

      return newSet;
    });
  }

  function handleSelectAll(): void {
    const allNodeIds = options.nodes.map((node) => node.id);

    if (selectedNodes.value.size === allNodeIds.length) {
      selectedNodes.value = new Set();
      lastSelectedNodeIdRef.value = null;
      lastSelectedIndexRef.value = -1;
    } else {
      selectedNodes.value = new Set(allNodeIds);
      if (allNodeIds.length > 0) {
        lastSelectedNodeIdRef.value = allNodeIds[0];
        lastSelectedIndexRef.value = 0;
      }
    }
  }

  function clearSelection(): void {
    selectedNodes.value = new Set();
    lastSelectedNodeIdRef.value = null;
    lastSelectedIndexRef.value = -1;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      if (!isMultiSelectMode.value) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      handleSelectAll();
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });

  return {
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode: (value: boolean) => { isMultiSelectMode.value = value; },
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
  };
}
