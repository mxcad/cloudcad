import { useState, useCallback, useRef, useEffect } from 'react';
import type { FileSystemNode } from '../../types/filesystem';

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (document.activeElement?.getAttribute('contenteditable') === 'true') return true;
  return false;
}

interface UseMultiSelectSelectionProps {
  nodes: FileSystemNode[];
}

export const useMultiSelectSelection = ({
  nodes,
}: UseMultiSelectSelectionProps) => {
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());

  const lastSelectedNodeIdRef = useRef<string | null | undefined>(null);
  const lastSelectedIndexRef = useRef<number>(-1);

  const handleNodeSelect = useCallback(
    (
      nodeId: string,
      isMultiSelect: boolean = false,
      isShift: boolean = false
    ) => {
      setSelectedNodes((prev) => {
        const newSet = new Set(prev);
        const currentIndex = nodes.findIndex((node) => node.id === nodeId);

        if (
          isShift &&
          lastSelectedNodeIdRef.current &&
          lastSelectedIndexRef.current !== -1
        ) {
          const lastIndex = lastSelectedIndexRef.current;
          const startIndex = Math.min(lastIndex, currentIndex);
          const endIndex = Math.max(lastIndex, currentIndex);

          for (let i = startIndex; i <= endIndex; i++) {
            const node = nodes[i];
            node && newSet.add(node.id);
          }

          lastSelectedNodeIdRef.current = nodeId;
          lastSelectedIndexRef.current = currentIndex;
        } else if (isMultiSelect) {
          if (newSet.has(nodeId)) {
            newSet.delete(nodeId);
            if (lastSelectedNodeIdRef.current === nodeId) {
              lastSelectedNodeIdRef.current = null;
              lastSelectedIndexRef.current = -1;
            }
          } else {
            newSet.add(nodeId);
            lastSelectedNodeIdRef.current = nodeId;
            lastSelectedIndexRef.current = currentIndex;
          }
        } else {
          newSet.clear();
          newSet.add(nodeId);
          lastSelectedNodeIdRef.current = nodeId;
          lastSelectedIndexRef.current = currentIndex;
        }

        return newSet;
      });
    },
    [nodes]
  );

  const handleSelectAll = useCallback(() => {
    const allNodeIds = nodes.map((node) => node.id);

    if (selectedNodes.size === allNodeIds.length && selectedNodes.size > 0) {
      setSelectedNodes(new Set());
      lastSelectedNodeIdRef.current = null;
      lastSelectedIndexRef.current = -1;
    } else {
      setSelectedNodes(new Set(allNodeIds));
      if (allNodeIds.length > 0) {
        lastSelectedNodeIdRef.current = allNodeIds[0];
        lastSelectedIndexRef.current = 0;
      }
    }
  }, [nodes, selectedNodes.size]);

  const clearSelection = useCallback(() => {
    setSelectedNodes(new Set());
    lastSelectedNodeIdRef.current = null;
    lastSelectedIndexRef.current = -1;
  }, []);

  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelectedNodes(new Set(nodeIds));
    if (nodeIds.length > 0) {
      const firstIndex = nodes.findIndex((n) => n.id === nodeIds[0]);
      lastSelectedNodeIdRef.current = nodeIds[nodeIds.length - 1];
      lastSelectedIndexRef.current = firstIndex >= 0 ? firstIndex : -1;
    } else {
      lastSelectedNodeIdRef.current = null;
      lastSelectedIndexRef.current = -1;
    }
  }, [nodes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSelectAll]);

  return {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectNodes,
  };
};
