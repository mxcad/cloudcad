import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { FileItem } from '@/components/FileItem';
import { Menu } from '@/components/ui/Menu';
import { Pagination } from '@/components/ui/Pagination';
import { Z_LAYERS } from '@/constants/layers';
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
  /** 搜索结果模式 */
  isSearchResult?: boolean;
  onOpen?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onNewFolder?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onDownloadFolder?: (node: FileSystemNode) => void;
  onShowProperties?: (node: FileSystemNode) => void;
  /** 是否正在加载（用于阻止滚动加载） */
  loading?: boolean;
  /** 当前页码（用于滚动方向检测） */
  currentPage?: number;
  /** 总页数（用于检测是否还有更多） */
  totalPages?: number;
  /** 滚动加载上一页/下一页 */
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  /** 高亮节点 ID（搜索结果打开所在位置用） */
  highlightNodeId?: string;
  /** 在当前目录创建新文件夹 */
  onCreateFolderInCurrentDir?: () => void;
  /** 在当前目录创建新图纸 */
  onCreateDrawingInCurrentDir?: () => void;
  /** 上传文件 */
  onUpload?: () => void;
  /** 在当前目录粘贴 */
  onPasteInCurrentDir?: () => void;
  /** 剪贴板是否有内容 */
  clipboardHasItems?: boolean;
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
  highlightNodeId,
  isSearchResult = false,
  onOpen,
  onOpenInNewTab,
  onOpenFileLocation,
  onNewFolder,
  onCopyClipboard,
  onCut,
  onDownloadFolder,
  onShowProperties,
  onCreateFolderInCurrentDir,
  onCreateDrawingInCurrentDir,
  onUpload,
  onPasteInCurrentDir,
  clipboardHasItems = false,
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

  const [emptyContextMenuPos, setEmptyContextMenuPos] = useState<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    if (!highlightNodeId || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const timer = setTimeout(() => {
      const el = container.querySelector(`[data-node-id="${highlightNodeId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('file-item-highlight');
        setTimeout(() => {
          el.classList.remove('file-item-highlight');
        }, 3500);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [highlightNodeId, nodes]);

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

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    if (isTrashView) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-id]') || target.closest('[role="menu"]') || target.closest('[data-menu-content]')) return;
    e.preventDefault();
    setEmptyContextMenuPos({ x: e.clientX, y: e.clientY });
  }, [isTrashView]);

  const closeEmptyContextMenu = useCallback(() => {
    setEmptyContextMenuPos(null);
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
          onContextMenu={handleEmptyContextMenu}
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
                isSelected={selectedNodes.has(node.id)}
                viewMode={viewMode}
                hideSelectionCircle={false}
                isRubberBanding={!!rubberBand}
                selectedCount={selectedNodes.size}
                onBatchDelete={onBatchDelete}
                onBatchMove={isRootLevel ? undefined : onBatchMove}
                onBatchCopy={isRootLevel ? undefined : onBatchCopy}
                onBatchRestore={onBatchRestore}
                isTrash={isTrashView}
                onSelect={onNodeSelect}
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
                isSearchResult={isSearchResult}
                onOpen={onOpen}
                onOpenInNewTab={onOpenInNewTab}
                onOpenFileLocation={onOpenFileLocation}
                onNewFolder={onNewFolder}
                onCopyClipboard={onCopyClipboard}
                onCut={onCut}
                onDownloadFolder={onDownloadFolder}
                onShowProperties={onShowProperties}
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

        {emptyContextMenuPos && (
          <div
            style={{ position: 'fixed', left: emptyContextMenuPos.x, top: emptyContextMenuPos.y, width: 0, height: 0, overflow: 'visible', zIndex: Z_LAYERS.POPUP }}
            onClick={(e) => e.stopPropagation()}
          >
            <Menu open onOpenChange={(open) => { if (!open) closeEmptyContextMenu(); }} modal={false}>
              <Menu.Trigger asChild>
                <div style={{ width: 0, height: 0 }} />
              </Menu.Trigger>
              <Menu.Content align="start" side="bottom" sideOffset={0}>
                {!isAtRoot && onCreateDrawingInCurrentDir && (
                  <Menu.Item
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                    }
                    onClick={() => { onCreateDrawingInCurrentDir?.(); closeEmptyContextMenu(); }}
                  >
                    新建图纸
                  </Menu.Item>
                )}
                <Menu.Item
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" />
                      <line x1="12" y1="11" x2="12" y2="17" />
                      <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                  }
                  onClick={() => { onCreateFolderInCurrentDir?.(); closeEmptyContextMenu(); }}
                >
                  新建文件夹
                </Menu.Item>
                {!isAtRoot && onUpload && (
                  <Menu.Item
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    }
                    onClick={() => { onUpload?.(); closeEmptyContextMenu(); }}
                  >
                    上传
                  </Menu.Item>
                )}
                {clipboardHasItems && (
                  <Menu.Item
                    icon={
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    }
                    onClick={() => { onPasteInCurrentDir?.(); closeEmptyContextMenu(); }}
                  >
                    粘贴
                  </Menu.Item>
                )}
                <Menu.Separator />
                <Menu.Item
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  }
                  onClick={() => { onRefresh(); closeEmptyContextMenu(); }}
                >
                  刷新
                </Menu.Item>
              </Menu.Content>
            </Menu>
            <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={closeEmptyContextMenu} />
          </div>
        )}
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
