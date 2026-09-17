import React from 'react';
import { FileSystemContent } from '../../FileSystemManager/FileSystemContent';
import { FileSystemStates } from '../../FileSystemManager/FileSystemStates';
import { LibraryManagerEmptyView } from './LibraryManagerEmptyView';
import { t } from '@/languages';
import { ProjectPermission } from '../../../constants/permissions';
import type { FileSystemNode } from '../../../types/filesystem';

type NodePermissionsMap = Map<
  string,
  {
    canEdit: boolean;
    canDelete: boolean;
    canCopy: boolean;
    canMove: boolean;
    canManageMembers: boolean;
    canManageRoles: boolean;
  }
>;

interface LibraryManagerContentProps {
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  isFetching: boolean;
  searchTerm: string;
  viewMode: 'grid' | 'list';
  isFolderMode: boolean;
  canManage: boolean;
  nodes: FileSystemNode[];
  /** 底部悬浮操作栏（透传给 FileListGrid，滚动容器内 sticky 吸底） */
  bottomBar?: React.ReactNode;
  /** 列表第一项所属页码（prev 触发防重复加载已存在页） */
  minLoadedPage?: number;
  selectedNodes: Set<string>;
  nodePermissions: NodePermissionsMap;
  total: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  clipboardItems: string[];
  enterNode: (node: FileSystemNode) => void;
  refresh: () => void;
  clearSelection: () => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  openCreateFolderModal: () => void;
  openDownloadFormatModal: (nodeId: string, fileName: string) => void;
  handleNodeSelect: (nodeId: string, ctrlKey?: boolean) => void;
  handleOpenInEditor: (node: {
    id: string;
    name: string;
    isFolder?: boolean;
    path?: string;
  }) => void;
  /** 未开放批量下载时为 undefined：文件夹打包动作自动隐藏（见 fileActionConfig） */
  handleFolderDownload?: (node: FileSystemNode) => void;
  handleDeleteConfirm: (nodeId: string, nodeName: string) => void;
  /** 批量删除（统一走 useLibraryOperations.handleBatchDelete，由父层注入） */
  onBatchDelete: (nodeIds: string[]) => void;
  handleRename: (node: {
    id: string;
    name: string;
    isFolder?: boolean;
  }) => void;
  handleMove: (node: { id: string; name: string }) => void;
  handleCopy: (node: { id: string; name: string }) => void;
  handleCopyClipboard: (node: FileSystemNode) => void;
  handleCutClipboard: (node: FileSystemNode) => void;
  clipboardHandlePaste: () => void;
  clipboardHandleCopy: () => void;
  clipboardHandleCut: () => void;
  selectMany: (nodeIds: string[]) => void;
  /** 滚动触发的翻页（追加/前插由父层 useAccumulatedPagination 处理） */
  onScrollPageChange: (page: number, direction: 'prev' | 'next') => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string
  ) => void;
}

export const LibraryManagerContent: React.FC<LibraryManagerContentProps> = ({
  loading,
  error,
  isEmpty,
  isFetching,
  searchTerm,
  viewMode,
  isFolderMode,
  canManage,
  nodes,
  bottomBar,
  minLoadedPage,
  selectedNodes,
  nodePermissions,
  total,
  currentPage,
  pageSize,
  totalPages,
  clipboardItems,
  enterNode,
  refresh,
  clearSelection,
  setCurrentPage,
  setPageSize,
  openCreateFolderModal,
  openDownloadFormatModal,
  handleNodeSelect,
  handleOpenInEditor,
  handleFolderDownload,
  handleDeleteConfirm,
  onBatchDelete,
  handleRename,
  handleMove,
  handleCopy,
  handleCopyClipboard,
  handleCutClipboard,
  clipboardHandlePaste,
  clipboardHandleCopy,
  clipboardHandleCut,
  selectMany,
  showConfirm,
  onScrollPageChange,
}) => {
  const handleBatchDelete = () => {
    const nodeIds = Array.from(selectedNodes);
    const count = nodeIds.length;
    showConfirm(
      t('确认删除'),
      t('确定要永久删除这 {count} 个项目吗？删除后无法恢复。', {
        count: String(count),
      }),
      async () => {
        try {
          await onBatchDelete(nodeIds);
          clearSelection();
        } catch {
          // 错误 toast 已由 useLibraryOperations.handleBatchDelete 统一提示
        }
      }
    );
  };

  return (
    <div
      className="flex-1 min-h-0 rounded-2xl shadow-sm overflow-hidden"
      style={{
        background: 'transparent',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="h-full rounded-2xl flex flex-col overflow-hidden">
        {/* 列表已有内容（滚动翻页/后台刷新失败）时不整页替换：错误降级为底部失败条 */}
        {loading || (error && nodes.length === 0) || isEmpty ? (
          <div className="flex-1 flex items-center justify-center">
            <FileSystemStates
              loading={loading}
              error={error && nodes.length === 0 ? error : null}
              isEmpty={isEmpty}
              isAtRoot={false}
              isTrashView={false}
              searchTerm={searchTerm}
              canCreateProject={false}
              projectFilter="all"
              onRefresh={refresh}
              onCreateProject={() => {}}
              renderEmptyView={
                <LibraryManagerEmptyView
                  isFolderMode={isFolderMode}
                  canManage={canManage}
                  openCreateFolderModal={openCreateFolderModal}
                />
              }
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <FileSystemContent
              nodes={nodes}
              viewMode={viewMode}
              isTrashView={false}
              isAtRoot={false}
              selectedNodes={selectedNodes}
              dropTargetId={null}
              nodePermissions={nodePermissions}
              projectPermissions={{
                [ProjectPermission.CAD_EXTERNAL_REFERENCE]: canManage,
              }}
              bottomBar={bottomBar}
              paginationMeta={{
                total,
                page: currentPage,
                limit: pageSize,
                // 不 max(…,1)：totalPages 未同步（初始 0）时让 useScrollPagination 不误报「已经是最后一页」
                totalPages,
              }}
              onNodeSelect={(nodeId, ctrlKey) =>
                handleNodeSelect(nodeId, ctrlKey)
              }
              onFileOpen={(node) => {
                if (node.isFolder) {
                  enterNode(node);
                } else {
                  handleOpenInEditor(node);
                }
              }}
              onDownload={(node) => {
                if (!node.isFolder) {
                  openDownloadFormatModal(node.id, node.name);
                }
              }}
              onFolderDownload={handleFolderDownload}
              onDelete={(node) => handleDeleteConfirm(node.id, node.name)}
              onPermanentlyDelete={() => {}}
              onRename={(node) =>
                handleRename({ id: node.id, name: node.name })
              }
              onRefresh={refresh}
              onRestore={undefined}
              onEdit={undefined}
              onDeleteNode={undefined}
              onShowMembers={undefined}
              onShowRoles={undefined}
              onShowOperationHistory={undefined}
              onMove={
                canManage
                  ? (node) => handleMove({ id: node.id, name: node.name })
                  : undefined
              }
              onCopy={
                canManage
                  ? (node) => handleCopy({ id: node.id, name: node.name })
                  : undefined
              }
              onShowVersionHistory={undefined}
              onShare={undefined}
              onDragStart={() => {}}
              onDragOver={() => {}}
              onDragLeave={() => {}}
              onDrop={() => {}}
              onPageChange={(newPage) => {
                setCurrentPage(newPage);
              }}
              onPageSizeChange={(newPageSize) => {
                setPageSize(newPageSize);
                setCurrentPage(1);
              }}
              onRubberBandSelect={selectMany}
              onBatchDelete={canManage ? handleBatchDelete : undefined}
              onBatchMove={canManage ? clipboardHandleCut : undefined}
              onBatchCopy={canManage ? clipboardHandleCopy : undefined}
              loading={loading || isFetching}
              onScrollPageChange={onScrollPageChange}
              minLoadedPage={minLoadedPage}
              loadError={error && nodes.length > 0 ? error : null}
              onRetryLoadMore={refresh}
              isSearchResult={false}
              onOpen={(node) => {
                if (node.isFolder) {
                  enterNode(node);
                } else {
                  handleOpenInEditor(node);
                }
              }}
              onOpenInNewTab={(node) => {
                if (!node.isFolder) {
                  handleOpenInEditor(node);
                }
              }}
              onCopyClipboard={canManage ? handleCopyClipboard : undefined}
              onCut={canManage ? handleCutClipboard : undefined}
              onCreateFolderInCurrentDir={
                canManage ? openCreateFolderModal : undefined
              }
              onPasteInCurrentDir={canManage ? clipboardHandlePaste : undefined}
              clipboardHasItems={clipboardItems.length > 0}
            />
          </div>
        )}
      </div>
    </div>
  );
};
