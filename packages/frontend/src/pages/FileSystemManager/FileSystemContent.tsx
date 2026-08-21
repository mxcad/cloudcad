import React from 'react';
import { FileItem } from '@/components/FileItem';
import { FileListGrid } from '@/components/common/FileListGrid';
import { useFileSystemContentMenu } from './hooks/useFileSystemContentMenu';
import { useFileSystemNodePermissionProps } from './hooks/useFileSystemNodePermissionProps';
import type { FileSystemNode } from '@/types/filesystem';
import { FileSystemContextMenu } from './FileSystemContextMenu';

export interface FileSystemContentProps {
  nodes: FileSystemNode[];
  viewMode: 'grid' | 'list';
  isTrashView: boolean;
  isAtRoot: boolean;
  selectedNodes: Set<string>;
  dropTargetId: string | null;
  nodePermissions: Map<
    string,
    {
      canEdit: boolean;
      canDelete: boolean;
      canManageMembers: boolean;
      canManageRoles: boolean;
    }
  >;
  projectPermissions: Record<string, boolean>;
  /** 节点/项目权限加载中（悲观门控：加载期节点编辑/删除按钮不显示，根节点不回退乐观默认） */
  permissionsLoading?: boolean;
  paginationMeta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
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
  onShowOperationHistory: ((node: FileSystemNode) => void) | undefined;
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
  fileDropHandlers?: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  isFileDragOver?: boolean;
  onRubberBandSelect?: (nodeIds: string[]) => void;
  onBatchDelete?: () => void;
  onBatchMove?: () => void;
  onBatchCopy?: () => void;
  onBatchRestore?: () => void;
  isSearchResult?: boolean;
  currentAncestorPath?: string;
  onOpen?: (node: FileSystemNode) => void;
  onOpenInNewTab?: (node: FileSystemNode) => void;
  onOpenFileLocation?: (node: FileSystemNode) => void;
  onCopyClipboard?: (node: FileSystemNode) => void;
  onCut?: (node: FileSystemNode) => void;
  onFolderDownload?: (node: FileSystemNode) => void;
  onCopyPath?: (node: FileSystemNode) => void;
  loading?: boolean;
  currentPage?: number;
  totalPages?: number;
  onScrollPageChange?: (page: number, direction: 'prev' | 'next') => void;
  /** 底部悬浮操作栏（透传给 FileListGrid，滚动容器内 sticky 吸底） */
  bottomBar?: React.ReactNode;
  /** 翻页/后台刷新失败信息（列表已有内容时显示为底部失败条，不整页替换） */
  loadError?: string | null;
  /** 失败条重试回调（如 react-query refetch） */
  onRetryLoadMore?: () => void;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  highlightNodeId?: string;
  onCreateFolderInCurrentDir?: () => void;
  onCreateDrawingInCurrentDir?: () => void;
  onPasteInCurrentDir?: () => void;
  clipboardHasItems?: boolean;
  clipboardMode?: 'copy' | 'cut' | null;
  onCreateProject?: () => void;
  onClearTrash?: (projectId?: string) => void;
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
  permissionsLoading,
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
  onShowOperationHistory,
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
  fileDropHandlers: _fileDropHandlers,
  isFileDragOver: _isFileDragOver,
  onRubberBandSelect,
  onBatchDelete,
  onBatchMove,
  onBatchCopy,
  onBatchRestore,
  loading = false,
  currentPage: _currentPage,
  totalPages: _totalPages,
  onScrollPageChange,
  bottomBar,
  loadError,
  onRetryLoadMore,
  minLoadedPage,
  highlightNodeId,
  isSearchResult = false,
  currentAncestorPath,
  onOpen,
  onOpenInNewTab,
  onOpenFileLocation,
  onCopyClipboard,
  onCut,
  onFolderDownload,
  onCopyPath,
  onCreateFolderInCurrentDir,
  onCreateDrawingInCurrentDir,
  onPasteInCurrentDir,
  clipboardHasItems = false,
  clipboardMode = null,
  onCreateProject,
  onClearTrash,
}) => {
  const { getNodePermissionProps } = useFileSystemNodePermissionProps({
    nodePermissions,
    projectPermissions,
    permissionsLoading,
    isTrashView,
    onEdit,
    onDeleteProject,
    onPermanentlyDeleteProject,
    onShowMembers,
    onShowRoles,
    onShowOperationHistory,
  });

  const {
    contextMenuPos,
    contextMenuNode,
    handleContextMenu,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    closeContextMenu,
  } = useFileSystemContentMenu({
    nodes,
    selectedNodes,
    onNodeSelect,
    highlightNodeId,
  });

  const canCreate = projectPermissions['FILE_CREATE'] === true;
  const canUpload = projectPermissions['FILE_UPLOAD'] === true;
  const canDeleteFile = projectPermissions['FILE_DELETE'] === true;
  const canMoveFile = projectPermissions['FILE_MOVE'] === true;
  const canCopyFile = projectPermissions['FILE_COPY'] === true;
  const canRestoreFile = projectPermissions['FILE_TRASH_MANAGE'] === true;
  // 粘贴=在目标位置创建节点：与剪贴板内核 canPaste（canCreate）语义一致
  const canPaste = canCreate;

  const canBatchCopy =
    selectedNodes.size > 0 &&
    Array.from(selectedNodes).every((id) => {
      const node = nodes.find((n) => n.id === id);
      return node ? getNodePermissionProps(node).canCopy !== false : false;
    });
  const canBatchMove =
    selectedNodes.size > 0 &&
    Array.from(selectedNodes).every((id) => {
      const node = nodes.find((n) => n.id === id);
      return node ? getNodePermissionProps(node).canMove !== false : false;
    });
  const canBatchDelete =
    selectedNodes.size > 0 &&
    Array.from(selectedNodes).every((id) => {
      const node = nodes.find((n) => n.id === id);
      return node ? getNodePermissionProps(node).canDelete !== false : false;
    });

  return (
    <>
      <FileListGrid
        nodes={nodes}
        viewMode={viewMode}
        selectedNodes={selectedNodes}
        loading={loading}
        bottomBar={bottomBar}
        paginationMeta={paginationMeta}
        onNodeSelect={onNodeSelect}
        onRubberBandSelect={onRubberBandSelect}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onScrollPageChange={onScrollPageChange}
        loadError={loadError}
        onRetryLoadMore={onRetryLoadMore}
        minLoadedPage={minLoadedPage}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        renderItem={(
          node,
          _index,
          { isRubberBanding, rubberBandJustEndedRef }
        ) => {
          const extraProps = getNodePermissionProps(node);
          const isRootLevel = isAtRoot;

          return (
            <FileItem
              node={node}
              isSelected={selectedNodes.has(node.id)}
              viewMode={viewMode}
              hideSelectionCircle={false}
              isRubberBanding={isRubberBanding}
              rubberBandJustEndedRef={rubberBandJustEndedRef}
              selectedCount={selectedNodes.size}
              onBatchDelete={isRootLevel ? undefined : onBatchDelete}
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
              onRestore={isTrashView ? onRestore : undefined}
              onEdit={extraProps.onEdit}
              onDeleteNode={extraProps.onDeleteNode}
              onShowMembers={extraProps.onShowMembers}
              onShowRoles={extraProps.onShowRoles}
              onShowOperationHistory={extraProps.onShowOperationHistory}
              onMove={
                !node.isRoot &&
                projectPermissions[
                  'FILE_MOVE' as keyof typeof projectPermissions
                ]
                  ? onMove
                  : undefined
              }
              onCopy={
                !node.isRoot &&
                projectPermissions[
                  'FILE_COPY' as keyof typeof projectPermissions
                ]
                  ? onCopy
                  : undefined
              }
              onShowVersionHistory={
                !node.isFolder &&
                !isTrashView &&
                (node.extension === '.dwg' ||
                  node.extension === '.dxf' ||
                  node.extension === '.mxweb')
                  ? onShowVersionHistory
                  : undefined
              }
              onShare={!node.isFolder && onShare ? onShare : undefined}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              isDropTarget={isRootLevel ? false : dropTargetId === node.id}
              canUpload={extraProps.canUpload}
              canEdit={extraProps.canEdit}
              canDelete={extraProps.canDelete}
              canShare={extraProps.canShare}
              canDownload={extraProps.canDownload}
              canViewVersionHistory={extraProps.canViewVersionHistory}
              canCopy={extraProps.canCopy}
              canMove={extraProps.canMove}
              canManageExternalReference={extraProps.canManageExternalReference}
              canCreate={canCreate}
              isSearchResult={isSearchResult}
              isProjectRootLevel={isAtRoot}
              currentAncestorPath={currentAncestorPath}
              onOpen={onOpen}
              onOpenInNewTab={onOpenInNewTab}
              onOpenFileLocation={onOpenFileLocation}
              onCopyClipboard={onCopyClipboard}
              onCut={onCut}
              onFolderDownload={onFolderDownload}
              onCopyPath={onCopyPath}
            />
          );
        }}
      />
      <FileSystemContextMenu
        contextMenuPos={contextMenuPos}
        contextMenuNode={contextMenuNode}
        selectedNodes={selectedNodes}
        isTrashView={isTrashView}
        isAtRoot={isAtRoot}
        nodes={nodes}
        canBatchDelete={canBatchDelete}
        canBatchMove={canBatchMove}
        canBatchCopy={canBatchCopy}
        canCreate={canCreate}
        canRestoreFile={canRestoreFile}
        canPaste={canPaste}
        clipboardHasItems={clipboardHasItems}
        isSearchResult={isSearchResult}
        getNodePermissionProps={getNodePermissionProps}
        onFileOpen={onFileOpen}
        onDownload={onDownload}
        onDelete={onDelete}
        onPermanentlyDelete={onPermanentlyDelete}
        onRename={onRename}
        onRestore={onRestore}
        onMove={onMove}
        onCopy={onCopy}
        onShare={onShare}
        onShowVersionHistory={onShowVersionHistory}
        onOpenInNewTab={onOpenInNewTab}
        onOpenFileLocation={onOpenFileLocation}
        onCopyClipboard={onCopyClipboard}
        onCut={onCut}
        onFolderDownload={onFolderDownload}
        onCopyPath={onCopyPath}
        onBatchDelete={onBatchDelete}
        onBatchMove={onBatchMove}
        onBatchCopy={onBatchCopy}
        onBatchRestore={onBatchRestore}
        onClearTrash={onClearTrash}
        onRefresh={onRefresh}
        onCreateProject={onCreateProject}
        onCreateDrawingInCurrentDir={onCreateDrawingInCurrentDir}
        onCreateFolderInCurrentDir={onCreateFolderInCurrentDir}
        onPasteInCurrentDir={onPasteInCurrentDir}
        onClose={closeContextMenu}
      />
    </>
  );
};
