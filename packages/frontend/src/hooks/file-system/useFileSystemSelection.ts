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

import { useState, useCallback, useRef, useEffect } from 'react';
import { FileSystemNode } from '../../types/filesystem';

interface UseFileSystemSelectionProps {
  nodes: FileSystemNode[];
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

export const useFileSystemSelection = ({
  nodes,
  showToast,
}: UseFileSystemSelectionProps) => {
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

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

          if (!isMultiSelectMode) {
            newSet.clear();
          }

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
    [nodes, isMultiSelectMode]
  );

  const handleSelectAll = useCallback(() => {
    const allNodeIds = nodes.map((node) => node.id);

    if (selectedNodes.size === allNodeIds.length) {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (!isMultiSelectMode) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        handleSelectAll();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMultiSelectMode, handleSelectAll]);

  return {
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
  };
};
