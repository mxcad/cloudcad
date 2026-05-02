import React, { useState } from 'react';
import { FileItem } from '../../components/FileItem';
import {
  EmptyFolderIcon,
  GridIcon,
  ListIcon,
} from '../../components/FileIcons';
import { Pagination } from '../../components/ui/Pagination';
import { Button } from '../../components/ui/Button';
import { FileSystemNode } from '../../types/filesystem';
import { getFileItemPermissionProps } from '../../hooks/useFileItemProps';

interface FileGridProps {
  nodes: FileSystemNode[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  selectedNodes: Map<string, boolean>;
  isMultiSelectMode: boolean;
  isTrashView: boolean;
  dropTargetId: string | null;
  draggedNodes: FileSystemNode[];
  paginationMeta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onNodeSelect: (node: FileSystemNode, event?: React.MouseEvent) => void;
  onSelectAll: () => void;
  onFileOpen: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onOpenRename: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete: (node: FileSystemNode) => void;
  onRestore: (node: FileSystemNode) => void;
  onShowMembers: (node: FileSystemNode) => void;
  onMove: (node: FileSystemNode) => void;
  onCopy: (node: FileSystemNode) => void;
  onVersionHistory: (node: FileSystemNode) => void;
  onDragStart: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, node: FileSystemNode) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSetViewMode: (mode: 'grid' | 'list') => void;
}

export const FileGrid: React.FC<FileGridProps> = ({
  nodes,
  loading,
  viewMode,
  selectedNodes,
  isMultiSelectMode,
  isTrashView,
  dropTargetId,
  draggedNodes,
  paginationMeta,
  onNodeSelect,
  onSelectAll,
  onFileOpen,
  onDownload,
  onOpenRename,
  onDelete,
  onPermanentlyDelete,
  onRestore,
  onShowMembers,
  onMove,
  onCopy,
  onVersionHistory,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onPageChange,
  onPageSizeChange,
  onSetViewMode,
}) => {
  const allSelected =
    nodes.length > 0 && nodes.every((n) => selectedNodes.has(n.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onSelectAll}
            className="w-4 h-4 rounded border-[var(--border-default)]"
          />
          <span className="text-sm text-[var(--text-secondary)]">
            {selectedNodes.size > 0
              ? `已选择 ${selectedNodes.size} 项`
              : `共 ${paginationMeta?.total ?? nodes.length} 项`}
          </span>
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'grid' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onSetViewMode('grid')}
          >
            <GridIcon size={16} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onSetViewMode('list')}
          >
            <ListIcon size={16} />
          </Button>
        </div>
      </div>

      {nodes.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <EmptyFolderIcon
            size={64}
            className="text-[var(--text-muted)] mb-4"
          />
          <p className="text-[var(--text-tertiary)]">
            {isTrashView ? '回收站为空' : '文件夹为空'}
          </p>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
              : 'space-y-2'
          }
        >
          {nodes.map((node) => (
            <FileItem
              key={node.id}
              node={node}
              isSelected={selectedNodes.has(node.id)}
              isMultiSelectMode={isMultiSelectMode}
              isTrash={isTrashView}
              isDropTarget={dropTargetId === node.id}
              isDragging={draggedNodes.some((n) => n.id === node.id)}
              onSelect={(nodeId, isMulti, isRange) =>
                onNodeSelect(node, undefined)
              }
              onEnter={() => onFileOpen(node)}
              onDownload={() => onDownload(node)}
              onRename={() => onOpenRename(node)}
              onDelete={() => onDelete(node)}
              onPermanentlyDelete={() => onPermanentlyDelete(node)}
              onRestore={() => onRestore(node)}
              onShowMembers={() => onShowMembers(node)}
              onMove={() => onMove(node)}
              onCopy={() => onCopy(node)}
              onShowVersionHistory={() => onVersionHistory(node)}
              onDragStart={(e) => onDragStart(e, node)}
              onDragOver={(e) => onDragOver(e, node)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, node)}
            />
          ))}
        </div>
      )}

      {paginationMeta && paginationMeta.totalPages > 1 && (
        <Pagination
          meta={paginationMeta}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
};
