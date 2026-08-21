// //////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// //////////////////////////////////////////////////////////////////////////////

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Scissors, Copy, Trash2, Download } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import { useLibrary } from '../../hooks/useLibrary';
import { useLibraryOperations } from '../../hooks/library/useLibraryOperations';
import { useLibraryModals } from '../../hooks/library/useLibraryModals';
import { useLibraryPagination } from '../../hooks/library/useLibraryPagination';
import { useAccumulatedPagination } from '@/hooks/common/useAccumulatedPagination';
import { usePermission } from '../../hooks/usePermission';
import { useSelectionShortcuts } from '@/hooks/common/useSelectionShortcuts';
import { useFileSystemClipboardStore } from '@/stores/fileSystemClipboardStore';
import { useFileSystemUndoRedoStore } from '@/stores/fileSystemUndoRedoStore';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { SystemPermission } from '../../constants/permissions';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { t } from '@/languages';
import { useLibraryClipboardActions } from './hooks/useLibraryClipboardActions';
import { useLibraryActions } from './hooks/useLibraryActions';
import { LibraryManagerExtraActions } from './components/LibraryManagerExtraActions';
import { LibraryManagerHeader } from './components/LibraryManagerHeader';
import { LibraryManagerContent } from './components/LibraryManagerContent';
import { LibraryManagerModals } from './components/LibraryManagerModals';

/**
 * 公共资源库管理页面
 *
 * 设计思想：
 * - 公共资源库是一个特殊的全局项目，不是某个人的资源库
 * - 使用与项目管理相同的 UI 和上传逻辑（MxCadUploader）
 * - 浏览/下载免登录，上传/删除需要管理员权限
 * - 无版本管理、无回收站（删除即永久删除）
 *
 * 功能：
 * - 普通用户：浏览、搜索、下载
 * - 管理员：+ 上传、创建文件夹、删除
 */
export const LibraryManager: React.FC = () => {
  const { libraryType: urlLibraryType } = useParams<{
    libraryType: 'drawing' | 'block';
  }>();
  const navigate = useNavigate();

  const libraryType: 'drawing' | 'block' =
    urlLibraryType === 'block' ? 'block' : 'drawing';

  useDocumentTitle(libraryType === 'drawing' ? t('图纸库') : t('图块库'));

  const {
    currentPage,
    pageSize,
    totalPages,
    total,
    setCurrentPage,
    setPageSize,
    handlePageChange,
    handleTotalPagesChange,
    handleTotalChange,
  } = useLibraryPagination();

  const {
    libraryId,
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    isFetching,
    searchTerm,
    viewMode,
    isFolderMode,
    setLibraryType,
    enterNode,
    refresh,
    setSearchTerm,
    setViewMode,
    clearError,
    selectedNodes,
    handleNodeSelect,
    handleSelectAll,
    clearSelection,
    selectMany,
  } = useLibrary({
    page: currentPage,
    limit: pageSize,
    onPageChange: handlePageChange,
    onTotalPagesChange: handleTotalPagesChange,
    onTotalChange: handleTotalChange,
    onNavigate: () => setCurrentPage(1),
  });

  // 滚动分页数据合并（追加/前插）：与 CAD 编辑器侧边栏图纸库/图块库行为一致，
  // 向下滚动追加下一页、向上滚动前插上一页，导航/搜索/每页数量变化时整体替换
  const {
    viewNodes,
    handleScrollPageChange,
    minLoadedPage,
  } = useAccumulatedPagination({
    displayNodes: nodes,
    currentPage,
    handlePageChange: setCurrentPage,
    resetKey: `${libraryType}|${currentNode?.id ?? ''}|${searchTerm}|${pageSize}`,
  });

  const { hasPermission } = usePermission();

  const canManage =
    libraryType === 'drawing'
      ? hasPermission(SystemPermission.LIBRARY_DRAWING_MANAGE)
      : hasPermission(SystemPermission.LIBRARY_BLOCK_MANAGE);

  const { showToast, showConfirm: showConfirmPromise } = useNotification();

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void | Promise<void>,
      type?: 'danger' | 'warning' | 'info',
      confirmText?: string
    ) => {
      showConfirmPromise({ title, message, type, confirmText }).then(
        (confirmed) => {
          if (confirmed) {
            onConfirm();
          }
        }
      );
    },
    [showConfirmPromise]
  );

  const modals = useLibraryModals();

  const {
    openCreateFolderModal,
    closeCreateFolderModal,
    openRenameModal,
    openMoveModal,
    openCopyModal,
    openDownloadFormatModal,
  } = modals;

  const [showDirectoryImport, setShowDirectoryImport] = useState(false);

  const libraryOperations = useLibraryOperations({
    libraryType,
    showToast,
    refreshNodes: refresh,
    showConfirm,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const clipboardItems = useFileSystemClipboardStore((s) => s.items);
  const clipboardMode = useFileSystemClipboardStore((s) => s.mode);
  const clearClipboard = useFileSystemClipboardStore((s) => s.clearClipboard);
  const undoStack = useFileSystemUndoRedoStore((s) => s.undoStack);
  const redoStack = useFileSystemUndoRedoStore((s) => s.redoStack);
  const { config } = useRuntimeConfig();

  const {
    clipboardHandleCopy,
    clipboardHandleCut,
    handleCopyClipboard,
    handleCutClipboard,
    clipboardHandlePaste,
    clipboardHandleUndo,
    clipboardHandleRedo,
    handleDeleteSelected,
  } = useLibraryClipboardActions({
    libraryType,
    libraryId,
    nodes: viewNodes,
    currentNode,
    selectedNodes,
    clipboardItems,
    clipboardMode,
    refresh,
    clearSelection,
    showToast,
    showConfirm,
    libraryOperations,
  });

  const {
    handleOpenInEditor,
    handleDownloadWithFormat,
    handleCreateFolder,
    handleDeleteConfirm,
    handleDownload,
    handleFolderDownload,
    handleRename,
    handleRenameSelected,
    handleRenameSubmit,
    handleMove,
    handleCopy,
    handleSelectFolderConfirm,
    handleSearchSubmit,
    handleSwitchLibrary,
    handleBreadcrumbNav,
    handleBreadcrumbPathSubmit,
    handleGoBack,
  } = useLibraryActions({
    libraryType,
    libraryId,
    nodes: viewNodes,
    currentNode,
    breadcrumbs,
    selectedNodes,
    canManage,
    clearSelection,
    setCurrentPage,
    setSearchTerm,
    setLibraryType,
    showToast,
    libraryOperations,
    modals,
  });

  useSelectionShortcuts({
    containerRef,
    // Layout 内全屏页：侧边栏/顶栏导航持焦点时快捷键照常生效
    // （框选 hook mousedown preventDefault 阻止点击列表时焦点回落 body）
    containerFocusMode: 'loose',
    enabled: true,
    onSelectAll: handleSelectAll,
    onUndo: clipboardHandleUndo,
    onRedo: clipboardHandleRedo,
    onCopy: clipboardHandleCopy,
    onCut: clipboardHandleCut,
    onPaste: clipboardHandlePaste,
    onDeleteSelected: handleDeleteSelected,
    onRenameSelected: handleRenameSelected,
    // ESC 递进语义：有选中 → 清空选中（剪贴板保留）；无选中（剪贴板模式）→ 清空剪贴板并退出
    onClearSelection: () => {
      if (selectedNodes.size > 0) {
        clearSelection();
      } else {
        clearClipboard();
      }
    },
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });

  // 搜索时重置页码：避免滚动到第 N 页后搜索，结果仍停留在第 N 页
  const handleSearchTermChange = useCallback(
    (term: string) => {
      setSearchTerm(term);
      setCurrentPage(1);
    },
    [setSearchTerm, setCurrentPage]
  );

  const isAtRoot = !currentNode?.id || currentNode.id === libraryId;

  const nodePermissions = useMemo(() => {
    const map = new Map<
      string,
      {
        canEdit: boolean;
        canDelete: boolean;
        canCopy: boolean;
        canMove: boolean;
        canManageMembers: boolean;
        canManageRoles: boolean;
      }
    >();
    for (const node of viewNodes) {
      map.set(node.id, {
        canEdit: canManage,
        canDelete: canManage,
        canCopy: canManage,
        canMove: canManage,
        canManageMembers: false,
        canManageRoles: false,
      });
    }
    return map;
  }, [viewNodes, canManage]);

  const handleCancelBar = useCallback(() => {
    clearSelection();
    clearClipboard();
  }, [clearSelection, clearClipboard]);

  const isEmpty = viewNodes.length === 0 && !loading && !error;

  const renderExtraActions = useMemo(
    () => (
      <LibraryManagerExtraActions
        libraryType={libraryType}
        canManage={canManage}
        handleSwitchLibrary={handleSwitchLibrary}
        openDirectoryImport={() => setShowDirectoryImport(true)}
      />
    ),
    [libraryType, canManage, handleSwitchLibrary]
  );

  return (
    <>
      <div
        ref={containerRef}
        className="h-full flex flex-col overflow-hidden p-6"
      >
        <div className="flex-shrink-0 max-w-7xl mx-auto w-full space-y-6 relative">
          <LibraryManagerHeader
            loading={loading}
            isFetching={isFetching}
            searchTerm={searchTerm}
            viewMode={viewMode}
            selectedNodes={selectedNodes}
            nodesCount={viewNodes.length}
            breadcrumbs={breadcrumbs}
            canManage={canManage}
            isAtRoot={isAtRoot}
            clipboardItems={clipboardItems}
            clipboardMode={clipboardMode}
            currentNodeId={currentNode?.id || null}
            libraryId={libraryId}
            setSearchTerm={handleSearchTermChange}
            setViewMode={setViewMode}
            handleSearchSubmit={handleSearchSubmit}
            handleSelectAll={handleSelectAll}
            refresh={refresh}
            openCreateFolderModal={openCreateFolderModal}
            handleGoBack={handleGoBack}
            handleBreadcrumbNav={handleBreadcrumbNav}
            handleBreadcrumbPathSubmit={handleBreadcrumbPathSubmit}
            showToast={showToast}
            clipboardHandleCopy={clipboardHandleCopy}
            clipboardHandleCut={clipboardHandleCut}
            clipboardHandlePaste={clipboardHandlePaste}
            renderExtraActions={renderExtraActions}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={clipboardHandleUndo}
            onRedo={clipboardHandleRedo}
          />
        </div>

        <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full mt-6 flex flex-col gap-3">
          <LibraryManagerContent
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            isFetching={isFetching}
            searchTerm={searchTerm}
            viewMode={viewMode}
            isFolderMode={isFolderMode}
            canManage={canManage}
            nodes={viewNodes}
            minLoadedPage={minLoadedPage}
            selectedNodes={selectedNodes}
            nodePermissions={nodePermissions}
            total={total}
            currentPage={currentPage}
            pageSize={pageSize}
            totalPages={totalPages}
            clipboardItems={clipboardItems}
            enterNode={enterNode}
            refresh={refresh}
            clearSelection={clearSelection}
            setCurrentPage={setCurrentPage}
            setPageSize={setPageSize}
            openCreateFolderModal={openCreateFolderModal}
            openDownloadFormatModal={openDownloadFormatModal}
            handleNodeSelect={handleNodeSelect}
            handleOpenInEditor={handleOpenInEditor}
            handleFolderDownload={handleFolderDownload}
            handleDeleteConfirm={handleDeleteConfirm}
            onBatchDelete={libraryOperations.handleBatchDelete}
            handleRename={handleRename}
            handleMove={handleMove}
            handleCopy={handleCopy}
            handleCopyClipboard={handleCopyClipboard}
            handleCutClipboard={handleCutClipboard}
            clipboardHandlePaste={clipboardHandlePaste}
            clipboardHandleCopy={clipboardHandleCopy}
            clipboardHandleCut={clipboardHandleCut}
            selectMany={selectMany}
            showConfirm={showConfirm}
            onScrollPageChange={handleScrollPageChange}
            // 底部悬浮操作栏：列表滚动容器内 sticky 吸底（列表撑满一屏，不遮分页栏）
            bottomBar={
              selectedNodes.size > 0 || clipboardItems.length > 0 ? (
                <BatchActionBar
                  count={selectedNodes.size}
                  onClear={handleCancelBar}
                  actions={
                    canManage
                      ? [
                          {
                            key: 'cut',
                            label: t('剪切'),
                            icon: Scissors,
                            onClick: clipboardHandleCut,
                          },
                          {
                            key: 'copy',
                            label: t('复制'),
                            icon: Copy,
                            onClick: clipboardHandleCopy,
                          },
                          {
                            key: 'delete',
                            label: t('删除'),
                            icon: Trash2,
                            variant: 'danger',
                            onClick: handleDeleteSelected,
                          },
                          ...(config.batchDownloadEnabled
                            ? [
                                {
                                  key: 'download',
                                  label: t('批量下载'),
                                  icon: Download,
                                  onClick: () => {
                                    const selectedNodesList = viewNodes.filter(
                                      (n) => selectedNodes.has(n.id)
                                    );
                                    if (selectedNodesList.length > 0) {
                                      const fileItems = selectedNodesList.map(
                                        (n) => ({
                                          nodeId: n.id,
                                          fileName: n.name,
                                          formats: [],
                                          isFolder: n.isFolder,
                                        })
                                      );
                                      useBatchDownloadStore
                                        .getState()
                                        .openDialog(fileItems);
                                    }
                                  },
                                },
                              ]
                            : []),
                        ]
                      : []
                  }
                  clipboard={
                    canManage
                      ? {
                          items: clipboardItems,
                          canPaste: true,
                          onPaste: clipboardHandlePaste,
                          onClear: clearClipboard,
                        }
                      : undefined
                  }
                />
              ) : undefined
            }
          />
        </div>
      </div>

      <LibraryManagerModals
        modals={modals}
        handleCreateFolder={handleCreateFolder}
        handleRenameSubmit={handleRenameSubmit}
        handleSelectFolderConfirm={handleSelectFolderConfirm}
        handleDownloadWithFormat={handleDownloadWithFormat}
        libraryType={libraryType}
        showToast={showToast}
        showDirectoryImport={showDirectoryImport}
        setShowDirectoryImport={setShowDirectoryImport}
        targetParentId={currentNode?.id || libraryId || ''}
        onImportSuccess={(success) => {
          refresh();
          showToast(
            success ? t('批量导入成功') : t('批量导入完成（部分文件导入失败）'),
            success ? 'success' : 'warning'
          );
        }}
      />
    </>
  );
};

export default LibraryManager;
