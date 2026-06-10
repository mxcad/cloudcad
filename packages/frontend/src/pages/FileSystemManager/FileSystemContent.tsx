import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { FileItem } from '@/components/FileItem';
import { Pagination } from '@/components/ui/Pagination';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import type { FileSystemNode } from '@/types/filesystem';

interface FileSystemContentProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  isTrashView: boolean;
  isAtRoot: boolean;
  selectedNodes: Set<string>;
  dropTargetId: string | null;
  nodePermissions: Map<string, { canEdit: boolean; canDelete: boolean; canManageMembers: boolean; canManageRoles: boolean }>;
  projectPermissions: Record<string, boolean>;
  paginationMeta: { total: number; page: number; limit: number; totalPages: number } | null;
  onNodeSelect: (nodeId: string, ctrlKey?: boolean) => void;
  onFileOpen: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onRefresh: () => void;
  onRestore: ((node: FileSystemNode) => void) | undefined;
  onEdit: ((node: FileSystemNode) => void) | undefined;
  onDeleteNode: ((node: FileSystemNode) => void) | undefined;
  onShowMembers: ((node: FileSystemNode) => void) | undefined;
  onShowRoles: ((node: FileSystemNode) => void) | undefined;
  onMove: ((node: FileSystemNode) => void) | undefined;
  onCopy: ((node: FileSystemNode) => void) | undefined;
  onShowVersionHistory: ((node: FileSystemNode) => void) | undefined;
  onShare: ((node: FileSystemNode) => void) | undefined;
  onDragStart: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, node: FileSystemNode) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onDeleteProject?: (nodeId: string, nodeName: string) => void;
  onPermanentlyDeleteProject?: (nodeId: string, nodeName: string) => void;
  /** 外部文件拖拽上传的事件处理器 */
  fileDropHandlers?: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** 是否显示拖拽上传提示 */
  isFileDragOver?: boolean;
  /** 框选完成回调 */
  onRubberBandSelect?: (nodeIds: string[]) => void;
  /** 批量操作回调 */
  onBatchDelete?: () => void;
  onBatchMove?: () => void;
  onBatchCopy?: () => void;
  onBatchRestore?: () => void;
  /** 是否正在加载（用于阻止滚动加载） */
  loading?: boolean;
  /** 当前页码（用于滚动方向检测） */
  currentPage?: number;
  /** 总页数（用于检测是否还有更多） */
  totalPages?: number;
  /** 滚动加载上一页/下一页 */
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
}

export const FileSystemContent: React.FC<FileSystemContentProps> = ({
  nodes,
  viewMode,
  isTrashView,
  isAtRoot,
  selectedNodes,
  dropTargetId,
  nodePermissions,
  projectPermissions,
  paginationMeta,
  onNodeSelect,
  onFileOpen,
  onDownload,
  onDelete,
  onPermanentlyDelete,
  onRename,
  onRefresh,
  onRestore,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onShowRoles,
  onMove,
  onCopy,
  onShowVersionHistory,
  onShare,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onPageChange,
  onPageSizeChange,
  onDeleteProject,
  onPermanentlyDeleteProject,
  fileDropHandlers,
  isFileDragOver,
  onRubberBandSelect,
  onBatchDelete,
  onBatchMove,
  onBatchCopy,
  onBatchRestore,
  loading = false,
  currentPage: _currentPage,
  totalPages: _totalPages,
  onScrollPageChange,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [rubberBand, setRubberBand] = useState<{
    startVX: number;
    startVY: number;
    currentVX: number;
    currentVY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return;
    if ((e.target as HTMLElement).closest('[role="menu"], [data-menu-content]')) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    setRubberBand({
      startVX: e.clientX,
      startVY: e.clientY,
      currentVX: e.clientX,
      currentVY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
    });
  }, []);

  const onRubberBandSelectRef = useRef(onRubberBandSelect);
  onRubberBandSelectRef.current = onRubberBandSelect;
  const lastSelectTimeRef = useRef(0);

  const applyRubberBandSelection = useCallback((startVX: number, startVY: number, currVX: number, currVY: number, startSL: number, startST: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const curSL = container.scrollLeft;
    const curST = container.scrollTop;

    const scx = startVX - cr.left + startSL;
    const scy = startVY - cr.top + startST;
    const ccx = currVX - cr.left + curSL;
    const ccy = currVY - cr.top + curST;

    const x1 = Math.min(scx, ccx);
    const y1 = Math.min(scy, ccy);
    const x2 = Math.max(scx, ccx);
    const y2 = Math.max(scy, ccy);

    if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) return;

    const items = container.querySelectorAll('[data-node-id]');
    const ids: string[] = [];
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const iL = rect.left - cr.left + curSL;
      const iR = rect.right - cr.left + curSL;
      const iT = rect.top - cr.top + curST;
      const iB = rect.bottom - cr.top + curST;
      if (iL < x2 && iR > x1 && iT < y2 && iB > y1) {
        const id = item.getAttribute('data-node-id');
        if (id) ids.push(id);
      }
    });
    onRubberBandSelectRef.current?.(ids);
  }, []);

  const cancelAutoScroll = useCallback(() => {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!rubberBand) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY;
    const EDGE = 40;
    const MAX_SPEED = 12;

    let direction = 0;
    let speed = 0;

    if (mouseY >= rect.top && mouseY < rect.top + EDGE) {
      direction = -1;
      speed = 1 + (EDGE - (mouseY - rect.top)) / EDGE * (MAX_SPEED - 1);
    } else if (mouseY > rect.bottom - EDGE && mouseY <= rect.bottom) {
      direction = 1;
      speed = 1 + (EDGE - (rect.bottom - mouseY)) / EDGE * (MAX_SPEED - 1);
    }

    cancelAutoScroll();

    if (direction !== 0) {
      const scroll = () => {
        if (!container) return;
        container.scrollTop += direction * Math.round(speed);
        autoScrollRef.current = requestAnimationFrame(scroll);
      };
      autoScrollRef.current = requestAnimationFrame(scroll);
    }

    setRubberBand((prev) => prev ? {
      ...prev,
      currentVX: e.clientX,
      currentVY: e.clientY,
    } : null);

    const now = Date.now();
    if (now - lastSelectTimeRef.current > 40) {
      lastSelectTimeRef.current = now;
      applyRubberBandSelection(rubberBand.startVX, rubberBand.startVY, e.clientX, e.clientY, rubberBand.startScrollLeft, rubberBand.startScrollTop);
    }
  }, [rubberBand, cancelAutoScroll, applyRubberBandSelection]);

  const handleMouseLeave = useCallback(() => {
    cancelAutoScroll();
  }, [cancelAutoScroll]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    cancelAutoScroll();
    if (rubberBand) {
      applyRubberBandSelection(rubberBand.startVX, rubberBand.startVY, rubberBand.currentVX, rubberBand.currentVY, rubberBand.startScrollLeft, rubberBand.startScrollTop);
    }
    setRubberBand(null);
  }, [rubberBand, cancelAutoScroll, applyRubberBandSelection]);

  useEffect(() => {
    if (!rubberBand) return;
    const onWindowMouseUp = () => {
      cancelAutoScroll();
      applyRubberBandSelection(rubberBand.startVX, rubberBand.startVY, rubberBand.currentVX, rubberBand.currentVY, rubberBand.startScrollLeft, rubberBand.startScrollTop);
      setRubberBand(null);
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', onWindowMouseUp);
      cancelAutoScroll();
    };
  }, [rubberBand, cancelAutoScroll, applyRubberBandSelection]);

  const getNodePermissionProps = (node: FileSystemNode) => {
    const cachedPermissions = nodePermissions.get(node.id);
    const defaultPermissions = {
      canEdit: true,
      canDelete: true,
      canManageMembers: true,
      canManageRoles: true,
    };

    const permissions = node.isRoot
      ? cachedPermissions || defaultPermissions
      : {
          canEdit: true,
          canDelete: true,
          canManageMembers: false,
          canManageRoles: false,
        };

    const fileItemProps = getFileItemPermissionProps(node, {
      projectPermissions,
      nodePermissions: permissions,
    });

    let onEditHandler: ((e: React.MouseEvent) => void) | undefined;
    let onDeleteHandler: ((e: React.MouseEvent) => void) | undefined;
    let onShowMembersHandler: ((e: React.MouseEvent) => void) | undefined;
    let onShowRolesHandler: ((e: React.MouseEvent) => void) | undefined;

    if (node.isRoot && permissions.canEdit && onEdit) {
      onEditHandler = () => onEdit(node);
    }
    if (node.isRoot && permissions.canDelete) {
      onDeleteHandler = () => {
        if (isTrashView && onPermanentlyDeleteProject) {
          onPermanentlyDeleteProject(node.id, node.name);
        } else if (onDeleteProject) {
          onDeleteProject(node.id, node.name);
        }
      };
    }
    if (node.isRoot && permissions.canManageMembers && onShowMembers) {
      onShowMembersHandler = () => onShowMembers(node);
    }
    if (node.isRoot && permissions.canManageRoles && onShowRoles) {
      onShowRolesHandler = () => onShowRoles(node);
    }

    return {
      ...fileItemProps,
      onEdit: onEditHandler,
      onDeleteNode: onDeleteHandler,
      onShowMembers: onShowMembersHandler,
      onShowRoles: onShowRolesHandler,
    };
  };

  const paginationMetaRef = useRef(paginationMeta);
  paginationMetaRef.current = paginationMeta;
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const onScrollPageChangeRef = useRef(onScrollPageChange);
  onScrollPageChangeRef.current = onScrollPageChange;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const lastScrollTopRef = useRef(0);
  const scrollBlockedRef = useRef(false);

  useLayoutEffect(() => {
    scrollBlockedRef.current = true;
    const t = setTimeout(() => { scrollBlockedRef.current = false; }, 100);
    return () => clearTimeout(t);
  }, [nodes]);

  const rubberBandRef = useRef(rubberBand);
  rubberBandRef.current = rubberBand;
  const autoScrollRef = useRef<number | null>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (rubberBandRef.current) return;
    if (loadingRef.current) return;
    if (scrollBlockedRef.current) return;

    const meta = paginationMetaRef.current;
    if (!meta) return;

    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;

    const scrollDirection = scrollTop > lastScrollTopRef.current ? 'down' : 'up';
    lastScrollTopRef.current = scrollTop;

    if (scrollDirection === 'down' && scrollTop + clientHeight >= scrollHeight - 200) {
      if (meta.page < meta.totalPages) {
        onScrollPageChangeRef.current?.(meta.page + 1, 'next');
      }
    } else if (scrollDirection === 'up' && scrollTop <= 200) {
      if (meta.page > 1) {
        onScrollPageChangeRef.current?.(meta.page - 1, 'prev');
      }
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
        <div className="relative">
          <div
            data-view-mode={viewMode}
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-2'
                : 'divide-y'
            }
            style={
              viewMode !== 'grid' ? { borderColor: 'var(--border-subtle)' } : {}
            }
          >
            {nodes.map((node) => {
            const extraProps = getNodePermissionProps(node);
            const isRootLevel = isAtRoot;

            return (
              <FileItem
                key={node.id}
                node={node}
                isSelected={isRootLevel ? false : selectedNodes.has(node.id)}
                viewMode={viewMode}
                hideSelectionCircle={isRootLevel}
                isRubberBanding={!!rubberBand}
                selectedCount={selectedNodes.size}
                onBatchDelete={isRootLevel ? undefined : onBatchDelete}
                onBatchMove={isRootLevel ? undefined : onBatchMove}
                onBatchCopy={isRootLevel ? undefined : onBatchCopy}
                onBatchRestore={isRootLevel ? undefined : onBatchRestore}
                isTrash={isTrashView}
                onSelect={isRootLevel ? undefined : onNodeSelect}
                onEnter={onFileOpen}
                onDownload={onDownload}
                onDelete={onDelete}
                onPermanentlyDelete={onPermanentlyDelete}
                onRename={onRename}
                onRefresh={onRefresh}
                onRestore={
                  isTrashView
                    ? onRestore
                    : undefined
                }
                onEdit={extraProps.onEdit}
                onDeleteNode={extraProps.onDeleteNode}
                onShowMembers={extraProps.onShowMembers}
                onShowRoles={extraProps.onShowRoles}
                onMove={
                  !node.isRoot &&
                  projectPermissions['FILE_MOVE' as keyof typeof projectPermissions]
                    ? onMove
                    : undefined
                }
                onCopy={
                  !node.isRoot &&
                  projectPermissions['FILE_COPY' as keyof typeof projectPermissions]
                    ? onCopy
                    : undefined
                }
                onShowVersionHistory={
                  !node.isFolder &&
                  !isTrashView &&
                  (node.extension === '.dwg' || node.extension === '.dxf')
                    ? onShowVersionHistory
                    : undefined
                }
                onShare={
                  !node.isFolder && onShare
                    ? onShare
                    : undefined
                }
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                isDropTarget={isRootLevel ? false : dropTargetId === node.id}
                canUpload={extraProps.canUpload}
                canEdit={extraProps.canEdit}
                canDelete={extraProps.canDelete}
                canDownload={extraProps.canDownload}
                canViewVersionHistory={extraProps.canViewVersionHistory}
                canManageExternalReference={extraProps.canManageExternalReference}
              />
            );
          })}
          </div>
          {rubberBand && (() => {
            const c = scrollContainerRef.current;
            if (!c) return null;
            const cr = c.getBoundingClientRect();
            const scx = rubberBand.startVX - cr.left + rubberBand.startScrollLeft;
            const scy = rubberBand.startVY - cr.top + rubberBand.startScrollTop;
            const ccx = rubberBand.currentVX - cr.left + c.scrollLeft;
            const ccy = rubberBand.currentVY - cr.top + c.scrollTop;
            const left = Math.min(scx, ccx);
            const top = Math.min(scy, ccy);
            const width = Math.abs(ccx - scx);
            const height = Math.abs(ccy - scy);
            return (
              <div
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width,
                  height,
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.5)',
                  pointerEvents: 'none',
                  zIndex: 100,
                  borderRadius: '4px',
                }}
              />
            );
          })()}
        </div>
      </div>

      <div
        className="flex-shrink-0 px-6 py-4"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <Pagination
          meta={
            paginationMeta || { total: 0, page: 1, limit: 30, totalPages: 1 }
          }
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          showSizeChanger={true}
        />
      </div>
    </div>
  );
};
