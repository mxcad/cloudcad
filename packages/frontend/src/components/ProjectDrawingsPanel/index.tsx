///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

/**
 * ProjectDrawingsPanel - 统一的文件面板组件
 *
 * 支持四种模式：
 * - 项目模式 (默认): 显示项目列表和项目图纸
 * - 私人空间模式 (isPersonalSpace): 显示私人图纸
 * - 图纸库模式 (libraryType='drawing'): 显示公共图纸库
 * - 图块库模式 (libraryType='block'): 显示公共图块库
 *
 * 目录结构（ADR-0033 拆分）：
 * - index.tsx 组装（对外接口不变）
 * - hooks/useProjectDrawingsData | useProjectDrawingsClipboard |
 *   useProjectDrawingsActions | useProjectDrawingsEffects
 * - components/ProjectListView | ProjectPanelView | BatchActionBar | ProjectPanelModals
 */

import React from 'react';
import { t } from '@/languages';

import type { ProjectDrawingsPanelProps } from './types';
import { useProjectDrawingsData } from './hooks/useProjectDrawingsData';
import { useProjectDrawingsActions } from './hooks/useProjectDrawingsActions';
import { useProjectDrawingsInteractions } from './hooks/useProjectDrawingsInteractions';
import { useProjectDrawingsEffects } from './hooks/useProjectDrawingsEffects';
import { ProjectListView } from './components/ProjectListView';
import { ProjectPanelView } from './components/ProjectPanelView';
import { ProjectPanelModals } from './components/ProjectPanelModals';
import { BatchActionBar } from '@/components/common/BatchActionBar';
import { FolderInput, Copy, Trash2, Download, Undo2 } from 'lucide-react';
import { OperationHistoryModal } from '@/components/modals/OperationHistoryModal';
import styles from '@/components/sidebar/sidebar.module.css';

export const ProjectDrawingsPanel: React.FC<ProjectDrawingsPanelProps> = ({
  projectId,
  onDrawingOpen,
  isPersonalSpace = false,
  currentOpenFileId,
  currentOpenProjectId,
  isModified = false,
  parentId: initialParentId,
  personalSpaceId,
  libraryType,
  doubleClickToOpen = false,
  visible = true,
  tabId,
}) => {
  const data = useProjectDrawingsData({
    projectId,
    isPersonalSpace,
    personalSpaceId,
    currentOpenFileId,
    isModified,
    libraryType,
    visible,
    tabId,
  });
  const actions = useProjectDrawingsActions({
    data,
    fileBrowser: data.fileBrowser,
    modals: data.modals,
  });
  const interactions = useProjectDrawingsInteractions({
    data,
    actions,
    doubleClickToOpen,
    onDrawingOpen,
  });
  const effects = useProjectDrawingsEffects({
    data,
    projectId,
    visible,
    isPersonalSpace,
    personalSpaceId,
    parentId: initialParentId,
    libraryType,
    tabId,
  });

  const {
    projects,
    nodePermissions,
    projectsPage,
    projectsTotalPages,
    projectsLoading,
    projectsError,
    handleProjectsScrollPageChange,
    retryProjectsLoadMore,
    projectsMinLoadedPage,
    projectFilter,
    setProjectFilter,
    selectedProjectId,
    breadcrumb,
    searchQuery,
    isLibraryMode,
    canManageLibrary,
    getCategoryNodeId,
    selectedCategoryPath,
    libraryRootId,
    loadNodes,
    setSearchQuery,
    setCurrentPage,
    refreshNodes,
    multiSelectedNodes,
    undoStack,
    showToast,
    clipboardItems,
    config,
    vh,
    total,
    totalPages,
    currentPage,
    pageSize,
    loading,
    loadNodesError,
    minLoadedPage,
    categories,
    handleCategorySelect,
    resourceItems,
  } = data;

  const { sidebarHandlePaste, sidebarHandleUndo } = {
    sidebarHandlePaste: data.fileBrowser.clipboard.paste,
    sidebarHandleUndo: data.fileBrowser.clipboard.undo,
  };

  const {
    handleDelete,
    handleRenameSubmit,
    setShowRenameModal,
    setEditingNode,
    setFolderName,
    showRenameModal,
    editingNode,
    folderName,
    isRenameLoading,
    libraryRenameModalOpen,
    libraryRenamingNode,
    libraryRenameName,
    setLibraryRenameModalOpen,
    setLibraryRenamingNode,
    setLibraryRenameName,
    handleLibraryRenameSubmit,
    showDownloadFormatModal,
    downloadingNode,
    setShowDownloadFormatModal,
    setDownloadingNode,
    handleLibraryDownloadWithFormat,
    handleDownloadWithFormat,
    isMembersModalOpen,
    setIsMembersModalOpen,
    isProjectRolesModalOpen,
    setIsProjectRolesModalOpen,
    isOperationHistoryModalOpen,
    setIsOperationHistoryModalOpen,
    editingProject,
    setEditingProject,
    isProjectModalOpen,
    closeProjectModal,
    projectBeingEdited,
    projectFormData,
    setProjectFormData,
    handleSubmitProject,
    projectLoading,
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    closeSelectFolderModal,
    handleConfirmMoveOrCopy,
    showBatchSelectFolderModal,
    showBatchDownloadDialog,
    setShowBatchDownloadDialog,
    handleBatchMoveClick,
    handleBatchCopyClick,
    handleBatchDeleteClick,
    handleBatchDownloadClick,
    handleCloseBatchSelectFolderModal,
    handleConfirmBatchMoveOrCopy,
    handleCancelBatchBar,
    handleShowMembers,
    handleShowRoles,
    handleShowOperationHistory,
    handleEditProject,
  } = actions;

  const {
    handleItemClick,
    handlePageChange,
    handlePageSizeChange,
    renderFileItem,
    handleBreadcrumbClick,
    handleGoBack,
    handleEnterProject,
    handleSearchChange,
    handleDeleteProject,
  } = interactions;

  const { panelRef } = effects;

  // 判断是否显示项目列表视图（我的项目 tab，未选中项目时）
  const showProjectList =
    !isPersonalSpace && !isLibraryMode && !selectedProjectId;

  const emptyText = searchQuery
    ? t('未找到匹配的内容')
    : t(
        `当前没有${libraryType === 'drawing' ? t('图纸') : libraryType === 'block' ? t('图块') : t('内容')}`
      );

  return (
    <div ref={panelRef} className={styles.projectDrawingsPanel}>
      {/* 项目列表视图 — 我的项目 tab 初始状态 */}
      <div
        className={`${styles.subTabPanel} ${showProjectList ? styles.active : ''}`}
      >
        <ProjectListView
          projects={projects}
          searchQuery={searchQuery}
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
          nodePermissions={nodePermissions}
          onEnterProject={handleEnterProject}
          onEditProject={handleEditProject}
          currentOpenProjectId={currentOpenProjectId}
          onShowMembers={handleShowMembers}
          onShowRoles={handleShowRoles}
          onShowOperationHistory={handleShowOperationHistory}
          onDeleteProject={handleDeleteProject}
          onRefresh={refreshNodes}
          currentPage={projectsPage}
          totalPages={projectsTotalPages}
          loading={projectsLoading}
          loadError={projectsError}
          onRetryLoadMore={retryProjectsLoadMore}
          onScrollPageChange={handleProjectsScrollPageChange}
          minLoadedPage={projectsMinLoadedPage}
        />
      </div>

      {/* 主视图 — 项目详情/图纸浏览/库浏览 */}
      <div
        className={`${styles.subTabPanel} ${!showProjectList ? styles.active : ''}`}
      >
        <ProjectPanelView
          isLibraryMode={isLibraryMode}
          canManageLibrary={canManageLibrary}
          categories={categories}
          selectedCategoryPath={selectedCategoryPath}
          onCategorySelect={handleCategorySelect}
          resourceItems={resourceItems}
          loading={loading}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onItemClick={handleItemClick}
          doubleClickToOpen={doubleClickToOpen}
          emptyText={emptyText}
          total={total}
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          renderItem={renderFileItem}
          onRubberBandSelect={data.selectMultiNodes}
          breadcrumb={breadcrumb}
          isPersonalSpace={isPersonalSpace}
          onBreadcrumbClick={handleBreadcrumbClick}
          onBreadcrumbBack={handleGoBack}
          clipboardItems={clipboardItems}
          onPasteClick={sidebarHandlePaste}
          onRefresh={refreshNodes}
          error={loadNodesError}
          onRetry={refreshNodes}
          loadError={loadNodesError}
          onRetryLoadMore={refreshNodes}
          minLoadedPage={minLoadedPage}
          // 底部悬浮操作栏：列表滚动容器内 mt-auto sticky（不遮分页栏；内容不足贴列表底部）
          bottomBar={
            isLibraryMode && canManageLibrary && multiSelectedNodes.size > 0 ? (
              <BatchActionBar
                count={multiSelectedNodes.size}
                onClear={handleCancelBatchBar}
                actions={[
                  {
                    key: 'move',
                    icon: FolderInput,
                    tooltip: t('移动到分类'),
                    onClick: handleBatchMoveClick,
                  },
                  {
                    key: 'copy',
                    icon: Copy,
                    tooltip: t('复制到分类'),
                    onClick: handleBatchCopyClick,
                  },
                  {
                    key: 'delete',
                    icon: Trash2,
                    variant: 'danger',
                    tooltip: t('删除'),
                    onClick: handleBatchDeleteClick,
                  },
                  ...(config.batchDownloadEnabled
                    ? [
                        {
                          key: 'download',
                          icon: Download,
                          tooltip: t('批量下载'),
                          onClick: handleBatchDownloadClick,
                        },
                      ]
                    : []),
                  ...(undoStack.length > 0
                    ? [
                        {
                          key: 'undo',
                          icon: Undo2,
                          tooltip: t('撤销'),
                          onClick: sidebarHandleUndo,
                        },
                      ]
                    : []),
                ]}
              />
            ) : undefined
          }
        />

        <ProjectPanelModals
          showRenameModal={showRenameModal}
          editingNode={editingNode}
          folderName={folderName}
          isRenameLoading={isRenameLoading}
          onCloseRename={() => {
            setShowRenameModal(false);
            setEditingNode(null);
            setFolderName('');
          }}
          onRenameNameChange={setFolderName}
          onRenameSubmit={handleRenameSubmit}
          libraryRenameModalOpen={libraryRenameModalOpen}
          libraryRenamingNode={libraryRenamingNode}
          libraryRenameName={libraryRenameName}
          onCloseLibraryRename={() => {
            setLibraryRenameModalOpen(false);
            setLibraryRenamingNode(null);
            setLibraryRenameName('');
          }}
          onLibraryRenameNameChange={setLibraryRenameName}
          onLibraryRenameSubmit={handleLibraryRenameSubmit}
          vh={vh}
          showDownloadFormatModal={showDownloadFormatModal}
          downloadingFileName={downloadingNode?.name || ''}
          onCloseDownloadFormat={() => {
            setShowDownloadFormatModal(false);
            setDownloadingNode(null);
          }}
          onDownloadFormat={
            isLibraryMode
              ? handleLibraryDownloadWithFormat
              : handleDownloadWithFormat
          }
          isMembersModalOpen={isMembersModalOpen}
          membersProjectId={editingProject?.id || ''}
          onCloseMembers={() => {
            setIsMembersModalOpen(false);
            setEditingProject(null);
          }}
          isProjectRolesModalOpen={isProjectRolesModalOpen}
          projectRolesProjectId={editingProject?.id || ''}
          onCloseProjectRoles={() => {
            setIsProjectRolesModalOpen(false);
            setEditingProject(null);
          }}
          isProjectModalOpen={isProjectModalOpen}
          onCloseProjectModal={closeProjectModal}
          projectBeingEdited={projectBeingEdited}
          projectFormData={projectFormData}
          onProjectFormDataChange={setProjectFormData}
          onSubmitProject={handleSubmitProject}
          projectLoading={projectLoading}
          showToast={showToast}
          showSelectFolderModal={showSelectFolderModal}
          selectFolderNodeId={moveSourceNode?.id || copySourceNode?.id || ''}
          selectFolderProjectId={selectedProjectId}
          onCloseSelectFolder={closeSelectFolderModal}
          onConfirmSelectFolder={handleConfirmMoveOrCopy}
          selectFolderConfirmText={
            moveSourceNode ? t('移动到此') : t('复制到此')
          }
          isLibraryMode={isLibraryMode}
          showBatchSelectFolderModal={showBatchSelectFolderModal}
          onCloseBatchSelectFolder={handleCloseBatchSelectFolderModal}
          onConfirmBatchSelectFolder={handleConfirmBatchMoveOrCopy}
          showBatchDownloadDialog={showBatchDownloadDialog}
          onCloseBatchDownloadDialog={() => setShowBatchDownloadDialog(false)}
          libraryType={libraryType}
        />
        <OperationHistoryModal
          isOpen={isOperationHistoryModalOpen}
          projectId={editingProject?.id || ''}
          projectName={editingProject?.name}
          onClose={() => {
            setIsOperationHistoryModalOpen(false);
            setEditingProject(null);
          }}
        />
      </div>
    </div>
  );
};

export default ProjectDrawingsPanel;
