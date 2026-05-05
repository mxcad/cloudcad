///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
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
  onDragStart: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, node: FileSystemNode) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onDeleteProject?: (nodeId: string, nodeName: string) => void;
  onPermanentlyDeleteProject?: (nodeId: string, nodeName: string) => void;
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
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onPageChange,
  onPageSizeChange,
  onDeleteProject,
  onPermanentlyDeleteProject,
}) => {
  // 获取节点权限信息
  const getNodePermissionProps = (node: FileSystemNode) => {
    const cachedPermissions = nodePermissions.get(node.id);
    const defaultPermissions = {
      canEdit: false,
      canDelete: false,
      canManageMembers: false,
      canManageRoles: false,
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
    let onEditHandler: ((node: FileSystemNode) => void) | undefined;
    let onDeleteHandler: ((node: FileSystemNode) => void) | undefined;
    let onShowMembersHandler: ((node: FileSystemNode) => void) | undefined;
    let onShowRolesHandler: ((node: FileSystemNode) => void) | undefined;

    if (node.isRoot && permissions.canEdit && onEdit) {
      onEditHandler = onEdit;
    }
    if (node.isRoot && permissions.canDelete && onDeleteNode) {
      onDeleteHandler = () => {
        if (isProjectTrashView && onPermanentlyDeleteProject) {
          onPermanentlyDeleteProject(node.id, node.name);
        } else if (onDeleteProject) {
          onDeleteProject(node.id, node.name);
        }
      };
    }
    if (node.isRoot && permissions.canManageMembers && onShowMembers) {
      onShowMembersHandler = onShowMembers;
    }
    if (node.isRoot && permissions.canManageRoles && onShowRoles) {
      onShowRolesHandler = onShowRoles;
    }

    return {
      ...fileItemProps,
      onEdit: onEditHandler,
      onDeleteNode: onDeleteHandler,
      onShowMembers: onShowMembersHandler,
      onShowRoles: onShowRolesHandler,
    };
  };

  return (
    <>
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
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              isDropTarget={dropTargetId === node.id}
              // @ts-ignore - pre-existing component prop type
              onEdit={extraProps.onEdit}
              // @ts-ignore - pre-existing component prop type
              onDeleteNode={extraProps.onDeleteNode}
              // @ts-ignore - pre-existing component prop type
              onShowMembers={extraProps.onShowMembers}
              // @ts-ignore - pre-existing component prop type
              onShowRoles={extraProps.onShowRoles}
              {...extraProps}
            />
          );
        })}
      </div>

      {/* 分页组件 */}
      <div
        className="px-6 py-4"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <Pagination
          meta={
            paginationMeta || { total: 0, page: 1, limit: 20, totalPages: 1 }
          }
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          showSizeChanger={true}
        />
      </div>
    </>
  );
};
