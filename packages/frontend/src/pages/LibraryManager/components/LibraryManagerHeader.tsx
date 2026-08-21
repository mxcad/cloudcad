import React from 'react';
import MxCadUploader from '../../../components/MxCadUploader';
import { FileSystemHeader } from '../../FileSystemManager/FileSystemHeader';
import { t } from '@/languages';

interface LibraryManagerHeaderProps {
  loading: boolean;
  isFetching: boolean;
  searchTerm: string;
  viewMode: 'grid' | 'list';
  selectedNodes: Set<string>;
  nodesCount: number;
  breadcrumbs: Array<{ id: string; name: string }>;
  canManage: boolean;
  isAtRoot: boolean;
  clipboardItems: string[];
  clipboardMode: 'copy' | 'cut' | null;
  currentNodeId: string | null;
  libraryId: string | null;
  setSearchTerm: (term: string) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  handleSearchSubmit: () => void;
  handleSelectAll: () => void;
  refresh: () => void;
  openCreateFolderModal: () => void;
  handleGoBack: () => void;
  handleBreadcrumbNav: (crumb: {
    id: string;
    name: string;
    isRoot?: boolean;
  }) => void;
  handleBreadcrumbPathSubmit: (path: string) => Promise<void>;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info'
  ) => void;
  clipboardHandleCopy: () => void;
  clipboardHandleCut: () => void;
  clipboardHandlePaste: () => void;
  renderExtraActions: React.ReactNode;
  /** 撤销/重做（命令栈 fileSystemUndoRedoStore，undefined 时不渲染按钮） */
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void | Promise<void>;
  onRedo?: () => void | Promise<void>;
}

export const LibraryManagerHeader: React.FC<LibraryManagerHeaderProps> = ({
  loading,
  isFetching,
  searchTerm,
  viewMode,
  selectedNodes,
  nodesCount,
  breadcrumbs,
  canManage,
  isAtRoot,
  clipboardItems,
  clipboardMode,
  currentNodeId,
  libraryId,
  setSearchTerm,
  setViewMode,
  handleSearchSubmit,
  handleSelectAll,
  refresh,
  openCreateFolderModal,
  handleGoBack,
  handleBreadcrumbNav,
  handleBreadcrumbPathSubmit,
  showToast,
  clipboardHandleCopy,
  clipboardHandleCut,
  clipboardHandlePaste,
  renderExtraActions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => (
  <FileSystemHeader
    mode="project"
    isAtRoot={false}
    isTrashView={false}
    isPersonalSpaceMode={false}
    isProjectRootMode={false}
    loading={loading}
    isFetching={isFetching}
    searchTerm={searchTerm}
    viewMode={viewMode}
    selectedNodes={selectedNodes}
    nodesCount={nodesCount}
    projectFilter="all"
    breadcrumbs={breadcrumbs}
    canCreateProject={false}
    uploadButton={
      canManage && (
        <MxCadUploader
          nodeId={() => currentNodeId || libraryId || ''}
          openAfterUpload={false}
          onSuccess={() => {
            refresh();
            showToast(t('文件上传成功'), 'success');
          }}
          buttonText=""
          buttonClassName="hover:bg-[var(--bg-tertiary)]"
        />
      )
    }
    onSetSearchTerm={setSearchTerm}
    onSetViewMode={setViewMode}
    onSearchSubmit={handleSearchSubmit}
    onSelectAll={handleSelectAll}
    onToggleTrashView={() => {}}
    onClearTrash={() => {}}
    onProjectFilterChange={() => {}}
    onRefresh={refresh}
    onCreateFolder={canManage ? openCreateFolderModal : undefined}
    onCreateProject={() => {}}
    onGoBack={handleGoBack}
    onBreadcrumbNavigate={handleBreadcrumbNav}
    onBreadcrumbPathSubmit={handleBreadcrumbPathSubmit}
    showToast={showToast}
    clipboardCount={clipboardItems.length}
    clipboardMode={clipboardMode}
    onCopy={clipboardHandleCopy}
    onCut={clipboardHandleCut}
    onPaste={clipboardHandlePaste}
    hideTrashButton={true}
    hideBackButton={isAtRoot}
    renderExtraActions={renderExtraActions}
    canUndo={canUndo}
    canRedo={canRedo}
    onUndo={onUndo}
    onRedo={onRedo}
  />
);
