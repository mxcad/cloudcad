///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  UseFileBrowserSelectionOptions,
  UseFileBrowserSelectionReturn,
} from './fileBrowserTypes';

export type {
  UseFileBrowserSelectionOptions,
  UseFileBrowserSelectionReturn,
} from './fileBrowserTypes';

/**
 * useFileBrowserSelection - 文件浏览器选择模型（内核原子 B）
 *
 * 多选状态机（Ctrl 单选切换 / Shift 区间选择 / 全选 / 清空 / 批量注入）+
 * 批量模式开关（multiple: 'always' | 'batch-only' | false）。
 *
 * 零 DOM 感知：全局快捷键（Ctrl+A 等）是外壳职责（useSelectionShortcuts），
 * 本 hook 只输出选择原语，测试可单点命中。
 *
 * 泛型 T 仅要求含 id 字段：文件系统节点（FileSystemNode）与分享记录等
 * 任意列表项均可复用（如分享页以 token 作为 id）。
 */
export const useFileBrowserSelection = <T extends { id: string }>({
  nodes,
  multiple,
  batchEnabled = false,
}: UseFileBrowserSelectionOptions<T>): UseFileBrowserSelectionReturn<T> => {
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [batchModeOn, setBatchModeOn] = useState(false);

  const lastSelectedNodeIdRef = useRef<string | null>(null);
  const lastSelectedIndexRef = useRef(-1);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const multipleEnabled = multiple !== false;

  const handleNodeSelect = useCallback(
    (nodeId: string, ctrlKey = false, shiftKey = false) => {
      if (!multipleEnabled) {
        return;
      }
      const currentNodes = nodesRef.current;
      setSelectedNodes((prev) => {
        const newSet = new Set(prev);
        const currentIndex = currentNodes.findIndex((node) => node.id === nodeId);

        if (
          shiftKey &&
          lastSelectedNodeIdRef.current &&
          lastSelectedIndexRef.current !== -1
        ) {
          const lastIndex = lastSelectedIndexRef.current;
          const startIndex = Math.min(lastIndex, currentIndex);
          const endIndex = Math.max(lastIndex, currentIndex);

          for (let i = startIndex; i <= endIndex; i++) {
            const node = currentNodes[i];
            node && newSet.add(node.id);
          }

          lastSelectedNodeIdRef.current = nodeId;
          lastSelectedIndexRef.current = currentIndex;
        } else if (ctrlKey) {
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
    [multipleEnabled]
  );

  const handleSelectAll = useCallback(() => {
    if (!multipleEnabled) {
      return;
    }
    const currentNodes = nodesRef.current;
    const allNodeIds = currentNodes.map((node) => node.id);

    setSelectedNodes((prev) => {
      if (prev.size === allNodeIds.length && prev.size > 0) {
        lastSelectedNodeIdRef.current = null;
        lastSelectedIndexRef.current = -1;
        return new Set();
      }
      if (allNodeIds.length > 0) {
        lastSelectedNodeIdRef.current = allNodeIds[0] ?? null;
        lastSelectedIndexRef.current = 0;
      }
      return new Set(allNodeIds);
    });
  }, [multipleEnabled]);

  const clearSelection = useCallback(() => {
    setSelectedNodes(new Set());
    lastSelectedNodeIdRef.current = null;
    lastSelectedIndexRef.current = -1;
  }, []);

  const selectMany = useCallback((nodeIds: string[]) => {
    setSelectedNodes(new Set(nodeIds));
    if (nodeIds.length > 0) {
      const currentNodes = nodesRef.current;
      const firstIndex = currentNodes.findIndex((n) => n.id === nodeIds[0]);
      lastSelectedNodeIdRef.current = nodeIds[nodeIds.length - 1] ?? null;
      lastSelectedIndexRef.current = firstIndex >= 0 ? firstIndex : -1;
    } else {
      lastSelectedNodeIdRef.current = null;
      lastSelectedIndexRef.current = -1;
    }
  }, []);

  const deselectNode = useCallback((nodeId: string) => {
    setSelectedNodes((prev) => {
      if (!prev.has(nodeId)) return prev;
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      if (lastSelectedNodeIdRef.current === nodeId) {
        lastSelectedNodeIdRef.current = null;
        lastSelectedIndexRef.current = -1;
      }
      return newSet;
    });
  }, []);

  // 批量模式开关（仅 batch-only 生效；always 恒 true，false 恒 false）
  const isBatchMode =
    multiple === 'batch-only' ? batchModeOn : multiple === 'always';
  const canBatch =
    multiple === 'always' || (multiple === 'batch-only' && batchEnabled);
  const selectionVisible =
    multiple === 'always' ||
    (multiple === 'batch-only' && batchModeOn && batchEnabled);

  const setBatchMode = useCallback(
    (v: boolean) => {
      if (multiple !== 'batch-only') {
        return;
      }
      setBatchModeOn(v);
      if (!v) {
        clearSelection();
      }
    },
    [multiple, clearSelection]
  );

  const selectedNodesArray = useMemo(() => {
    if (selectedNodes.size === 0) return [];
    const currentNodes = nodesRef.current;
    return currentNodes.filter((n) => selectedNodes.has(n.id));
  }, [selectedNodes]);

  return {
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
    deselectNode,
    isBatchMode,
    setBatchMode,
    canBatch,
    selectionVisible,
    selectedNodesArray,
  };
};
