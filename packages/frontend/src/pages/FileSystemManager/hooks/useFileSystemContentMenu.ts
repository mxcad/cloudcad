import { useState, useCallback, useEffect, useRef } from 'react';
import type { FileSystemNode } from '@/types/filesystem';

export interface UseFileSystemContentMenuOptions {
  nodes: FileSystemNode[];
  selectedNodes: Set<string>;
  onNodeSelect?: (nodeId: string, ctrlKey?: boolean) => void;
  highlightNodeId?: string;
}

export interface FileSystemContentMenuState {
  contextMenuPos: { x: number; y: number } | null;
  contextMenuNode: FileSystemNode | null;
}

/**
 * FileSystemContent 右键菜单状态与事件处理：
 * 菜单位置/节点、节点高亮滚动、移动端长按触发菜单
 */
export function useFileSystemContentMenu({
  nodes,
  selectedNodes,
  onNodeSelect,
  highlightNodeId,
}: UseFileSystemContentMenuOptions) {
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [contextMenuNode, setContextMenuNode] = useState<FileSystemNode | null>(
    null
  );
  const highlightHandledRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    if (!highlightNodeId) {
      highlightHandledRef.current = false;
      return;
    }
    if (highlightHandledRef.current) return;
    highlightHandledRef.current = true;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 30;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-node-id="${highlightNodeId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('file-item-highlight');
        setTimeout(() => {
          el.classList.remove('file-item-highlight');
        }, 3500);
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryScroll, 100);
      }
    };

    const timer = setTimeout(tryScroll, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [highlightNodeId]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[role="menu"]') ||
        target.closest('[data-menu-content]')
      )
        return;
      e.preventDefault();

      const fileItem = target.closest('[data-node-id]');
      if (fileItem) {
        const nodeId = fileItem.getAttribute('data-node-id');
        if (!nodeId) return;
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (!selectedNodes.has(nodeId) && onNodeSelect) {
          onNodeSelect(nodeId, false);
        }
        setContextMenuNode(node);
      } else {
        setContextMenuNode(null);
      }
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    },
    [nodes, selectedNodes, onNodeSelect]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile) return;
      longPressTimer.current = setTimeout(() => {
        const touch = e.touches[0];
        if (!touch) return;
        const syntheticEvent = {
          preventDefault: () => {},
          clientX: touch.clientX,
          clientY: touch.clientY,
          target: e.target,
        } as unknown as React.MouseEvent;
        handleContextMenu(syntheticEvent);
      }, 500);
    },
    [isMobile, handleContextMenu]
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
    setContextMenuNode(null);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return {
    contextMenuPos,
    contextMenuNode,
    handleContextMenu,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    closeContextMenu,
  };
}
