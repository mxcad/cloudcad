import React from 'react';
import { Button } from '../../ui/Button';
import { EmptyFolderIcon, RefreshIcon } from '../FileIcons';
import { AlertCircle } from 'lucide-react';
import { FileItem } from '../FileItem';
import { FileSystemNode } from '../../types/filesystem';
import { Pagination } from '../../ui/Pagination';
import { PaginationMeta } from '../../ui/Pagination';

interface FileSystemContentProps {
  nodes: FileSystemNode[];
  loading: boolean;
  error: string | null;
  viewMode: 'grid' | 'list';
  isMultiSelectMode: boolean;
  selectedNodes: Set<string>;
  searchQuery: string;
  isAtRoot: boolean;
  paginationMeta: PaginationMeta | null;
  onNodeSelect: (
    nodeId: string,
    isMultiSelect?: boolean,
    isShift?: boolean
  ) => void;
  onFileOpen: (node: FileSystemNode) => void;
  onDownload: (node: FileSystemNode) => void;
  onDelete: (node: FileSystemNode) => void;
  onPermanentlyDelete?: (node: FileSystemNode) => void;
  onRename: (node: FileSystemNode) => void;
  onRefresh: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDeleteNode?: (e: React.MouseEvent) => void;
  onShowMembers?: (e: React.MouseEvent) => void;
  onMove?: (node: FileSystemNode) => void;
  onCopy?: (node: FileSystemNode) => void;
  onAddToGallery?: (node: FileSystemNode) => void;
  onDragStart?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragOver?: (e: React.DragEvent, node: FileSystemNode) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent, node: FileSystemNode) => void;
  isDropTarget?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onCreateProject?: () => void;
}

export const FileSystemContent: React.FC<FileSystemContentProps> = ({
  nodes,
  loading,
  error,
  viewMode,
  isMultiSelectMode,
  selectedNodes,
  searchQuery,
  isAtRoot,
  paginationMeta,
  onNodeSelect,
  onFileOpen,
  onDownload,
  onDelete,
  onPermanentlyDelete,
  onRename,
  onRefresh,
  onEdit,
  onDeleteNode,
  onShowMembers,
  onMove,
  onCopy,
  onAddToGallery,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDropTarget,
  onPageChange,
  onPageSizeChange,
  onCreateProject,
}) => {
  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <EmptyFolderIcon
        size={80}
        className="text-slate-300 mb-6 animate-float"
      />
      <h3 className="text-xl font-bold text-slate-900 mb-2">
        {isAtRoot ? '没有项目' : '文件夹是空的'}
      </h3>
      <p className="text-slate-500 text-sm mb-6">
        {searchQuery
          ? '没有找到匹配的结果'
          : isAtRoot
            ? '开始创建您的第一个项目'
            : '上传文件或创建文件夹开始使用'}
      </p>
      {isAtRoot && onCreateProject && (
        <Button
          onClick={onCreateProject}
          variant="outline"
          size="sm"
          className="hover:shadow-md transition-all"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mr-2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            <path d="M12 11v6M9 14h6" />
          </svg>
          创建项目
        </Button>
      )}
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-full bg-error-100 flex items-center justify-center mb-4">
        <AlertCircle size={32} className="text-error-600" />
      </div>
      <p className="text-error-600 font-medium mb-4">{error}</p>
      <Button onClick={onRefresh} variant="outline">
        <RefreshIcon size={16} className="mr-2" />
        刷新
      </Button>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-slate-200" />
        <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-4 border-primary-600 border-t-transparent animate-spin" />
      </div>
      <p className="mt-4 text-slate-500 font-medium">加载中...</p>
    </div>
  );

  const renderNodes = () => (
    <>
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 p-6'
            : 'divide-y divide-slate-100'
        }
      >
        {nodes.map((node) => (
          <FileItem
            key={node.id}
            node={node}
            isSelected={selectedNodes.has(node.id)}
            viewMode={viewMode}
            isMultiSelectMode={isMultiSelectMode}
            onSelect={onNodeSelect}
            onEnter={onFileOpen}
            onDownload={onDownload}
            onDelete={onDelete}
            onPermanentlyDelete={onPermanentlyDelete}
            onRename={onRename}
            onRefresh={onRefresh}
            onEdit={node.isRoot ? onEdit : undefined}
            onDeleteNode={node.isRoot ? onDeleteNode : undefined}
            onShowMembers={node.isRoot ? onShowMembers : undefined}
            onMove={!node.isRoot ? onMove : undefined}
            onCopy={!node.isRoot ? onCopy : undefined}
            onAddToGallery={!node.isFolder ? onAddToGallery : undefined}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            isDropTarget={isDropTarget}
          />
        ))}
      </div>

      {paginationMeta && (
        <div className="px-6 py-4 border-t border-slate-100">
          <Pagination
            meta={paginationMeta}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            showSizeChanger={true}
          />
        </div>
      )}
    </>
  );

  if (loading) return renderLoading();
  if (error) return renderError();
  if (nodes.length === 0) return renderEmpty();
  return renderNodes();
};
