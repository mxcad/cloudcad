///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useCallback, useRef, type ReactNode } from 'react';
import { FileItem } from '@/components/FileItem';
import { Pagination } from '@/components/ui/Pagination';
import { getFileItemPermissionProps } from '@/hooks/useFileItemProps';
import type { FileSystemNode } from '@/types/filesystem';

interface FileSystemContentProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  isMultiSelectMode: boolean;
  isTrashView: boolean;
  isProjectTrashView: boolean;
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
  onViewShares: ((node: FileSystemNode) => void) | undefined;
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
  /** 底部操作条（多选时替换分页） */
  bottomBar?: ReactNode;
}

export const FileSystemContent: React.FC<FileSystemContentProps> = ({
  nodes,
  viewMode,
  isMultiSelectMode,
  isTrashView,
  isProjectTrashView,
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
  onViewShares,
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
  bottomBar,
}) => {
  // 获取节点权限信息
  const getNodePermissionProps = (node: FileSystemNode) => {
    const cachedPermissions = nodePermissions.get(node.id);
    // 乐观默认值：假设项目所有者拥有全部权限，按钮立即显示
    // API 返回后会纠正（如有变化），避免权限加载延迟导致的按钮闪烁
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

    // Build on-handler wrappers that need the permission check injected
    let onEditHandler: ((e: React.MouseEvent) => void) | undefined;
    let onDeleteHandler: ((e: React.MouseEvent) => void) | undefined;
    let onShowMembersHandler: ((e: React.MouseEvent) => void) | undefined;
    let onShowRolesHandler: ((e: React.MouseEvent) => void) | undefined;

    if (node.isRoot && permissions.canEdit && onEdit) {
      onEditHandler = () => onEdit(node);
    }
    if (node.isRoot && permissions.canDelete) {
      onDeleteHandler = () => {
        if (isProjectTrashView && onPermanentlyDeleteProject) {
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

  const showPaginationBorder = !bottomBar;

  const lastLoadTimeRef = useRef(0);
  const paginationMetaRef = useRef(paginationMeta);
  paginationMetaRef.current = paginationMeta;
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 1000) return;

    const meta = paginationMetaRef.current;
    if (!meta) return;

    const target = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = target;

    if (scrollHeight - scrollTop - clientHeight < 300) {
      if (meta.page < meta.totalPages) {
        lastLoadTimeRef.current = now;
        onPageChangeRef.current(meta.page + 1);
      }
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto" onScroll={handleScroll}>
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

            return (
              <FileItem
                key={node.id}
                node={node}
                isSelected={selectedNodes.has(node.id)}
                viewMode={viewMode}
                isMultiSelectMode={isMultiSelectMode}
                isTrash={isTrashView || isProjectTrashView}
                onSelect={onNodeSelect}
                onEnter={onFileOpen}
                onDownload={onDownload}
                onDelete={onDelete}
                onPermanentlyDelete={onPermanentlyDelete}
                onRename={onRename}
                onRefresh={onRefresh}
                onRestore={
                  isTrashView || isProjectTrashView
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
                onViewShares={
                  !node.isFolder && onViewShares
                    ? onViewShares
                    : undefined
                }
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                isDropTarget={dropTargetId === node.id}
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
        </div>
      </div>

      {/* 多选操作条 */}
      {bottomBar && (
        <div className="flex-shrink-0 flex justify-center py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="inline-flex items-center gap-4 px-6 py-3 rounded-full shadow-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            {bottomBar}
          </div>
        </div>
      )}

      {/* 分页 */}
      <div
        className="flex-shrink-0 px-6 py-4"
        style={{ borderTop: showPaginationBorder ? '1px solid var(--border-subtle)' : undefined }}
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
