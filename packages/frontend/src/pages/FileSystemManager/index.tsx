///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToastContainer } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import MxCadUppyUploader, { MxCadUppyUploaderRef } from '@/components/MxCadUppyUploader';
import { useFileSystem } from '@/hooks/file-system';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { usePermission } from '@/hooks/usePermission';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import {
  fileSystemControllerUpdateNode,
  fileSystemControllerCreateProject,
  fileSystemControllerGetPersonalSpace,
} from '@/api-sdk';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { FileSystemNode } from '@/types/filesystem';
import { CreateFolderModal } from '@/components/modals/CreateFolderModal';
import { RenameModal } from '@/components/modals/RenameModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { MembersModal } from '@/components/modals/MembersModal';
import { ProjectRolesModal } from '@/components/modals/ProjectRolesModal';
import { SelectFolderModal } from '@/components/modals/SelectFolderModal';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { VersionHistoryModal } from '@/components/modals/VersionHistoryModal';
import { isAbortError, handleError } from '@/utils/errorHandler';
import type { ProjectFilterType } from '@/services/projectApi';

import { FileSystemHeader } from './FileSystemHeader';
import { FileSystemContent } from './FileSystemContent';
import { FileSystemStates } from './FileSystemStates';
import { useVersionHistory } from './hooks/useVersionHistory';
import { useMoveCopy } from './hooks/useMoveCopy';
import { useDragAndDrop } from './hooks/useDragAndDrop';

interface FileSystemManagerProps {
  mode?: 'project' | 'personal-space';
}

export const FileSystemManager: React.FC<FileSystemManagerProps> = ({
  mode = 'project',
}) => {
  useDocumentTitle(mode === 'personal-space' ? '我的图纸' : '项目管理');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [projectFilter, setProjectFilter] = useState<ProjectFilterType>('all');

  const {
    personalSpaceId,
    personalSpaceIdLoading,
    setPersonalSpaceId,
    setPersonalSpaceIdLoading,
  } = useFileSystemStore();

  const uploaderRef = useRef<MxCadUppyUploaderRef>(null);

  const {
    nodes,
    currentNode,
    breadcrumbs,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    handleSearchSubmit,
    viewMode,
    setViewMode,
    selectedNodes,
    isMultiSelectMode,
    setIsMultiSelectMode,
    toasts,
    confirmDialog,
    showToast,
    isProjectRootMode,
    isPersonalSpaceMode,
    urlProjectId,
    urlNodeId,
    showCreateFolderModal,
    showRenameModal,
    showDownloadFormatModal,
    folderName,
    setFolderName,
    editingNode,
    downloadingNode,
    setShowCreateFolderModal,
    setShowRenameModal,
    setShowDownloadFormatModal,
    setEditingNode,
    setDownloadingNode,
    removeToast,
    closeConfirm,
    handleRefresh,
    handleGoBack,
    handleNodeSelect,
    handleSelectAll,
    handleCreateFolder,
    handleRename,
    handleDelete,
    handlePermanentlyDelete,
    handleBatchDelete,
    handleFileOpen,
    handleDownload,
    handleDownloadWithFormat,
    handleOpenRename,
    draggedNodes,
    setDraggedNodes,
    dropTargetId,
    setDropTargetId,
    paginationMeta,
    handlePageChange,
    handlePageSizeChange,
    handleDeleteProject,
    handlePermanentlyDeleteProject,
    isTrashView,
    handleToggleTrashView,
    handleRestoreNode,
    handleClearProjectTrash,
    handleBatchRestore,
    isProjectTrashView,
    handleToggleProjectTrashView,
    handleClearTrash,
  } = useFileSystem({
    mode,
    personalSpaceId,
    projectFilter,
  });

  const {
    isModalOpen: isProjectModalOpen,
    editingProject,
    setEditingProject,
    formData: projectFormData,
    loading: projectLoading,
    openCreateModal: openCreateProject,
    openEditModal: openEditProject,
    closeModal: closeProjectModal,
    setFormData: setProjectFormData,
    handleCreate: handleCreateProjectSubmit,
    handleUpdate: handleUpdateProjectSubmit,
    deleteConfirmOpen,
    projectToDelete,
    confirmDelete,
    cancelDelete,
  } = useProjectManagement({
    onProjectCreated: handleRefresh,
    onProjectUpdated: handleRefresh,
    onProjectDeleted: handleRefresh,
    showToast,
  });

  const [personalSpaceErrorCount, setPersonalSpaceErrorCount] = useState(0);
  const MAX_RETRY_COUNT = 3;

  useEffect(() => {
    if (mode !== 'personal-space') return;
    if (personalSpaceId) return;
    if (personalSpaceIdLoading) return;
    if (personalSpaceErrorCount >= MAX_RETRY_COUNT) {
      showToast('获取私人空间失败，请刷新页面重试', 'error');
      return;
    }

    const fetchPersonalSpace = async () => {
      setPersonalSpaceIdLoading(true);
      try {
        const { data: response } = await fileSystemControllerGetPersonalSpace();
        if (response?.id) {
          setPersonalSpaceId(response.id);
          setPersonalSpaceErrorCount(0);
        }
      } catch (error) {
        if (isAbortError(error)) return;
        handleError(error, '获取私人空间失败');
        setPersonalSpaceErrorCount((prev) => prev + 1);
        showToast(
          `获取私人空间失败 (${personalSpaceErrorCount + 1}/${MAX_RETRY_COUNT})`,
          'error'
        );
      } finally {
        setPersonalSpaceIdLoading(false);
      }
    };

    fetchPersonalSpace();
  }, [
    mode,
    personalSpaceId,
    personalSpaceIdLoading,
    setPersonalSpaceId,
    setPersonalSpaceIdLoading,
    showToast,
    personalSpaceErrorCount,
  ]);

  const { hasPermission } = usePermission();
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);

  const canCreateProject = true;

  const [nodePermissions, setNodePermissions] = useState<
    Map<
      string,
      {
        canEdit: boolean;
        canDelete: boolean;
        canManageMembers: boolean;
        canManageRoles: boolean;
      }
    >
  >(new Map());

  const [permissionsLoading, setPermissionsLoading] = useState(false);

  const { permissions: projectPermissions } =
    useProjectPermissions(urlProjectId);

  const projectPermissionsRecord: Record<string, boolean> =
    projectPermissions as unknown as Record<string, boolean>;

  const {
    showVersionHistoryModal,
    versionHistoryNode,
    versionHistoryEntries,
    versionHistoryLoading,
    versionHistoryError,
    handleShowVersionHistory,
    handleOpenHistoricalVersion,
    closeVersionHistory,
  } = useVersionHistory({
    urlProjectId,
    projectPermissions: projectPermissionsRecord,
    showToast,
  });

  const {
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    handleMove,
    handleCopy,
    handleConfirmMoveOrCopy,
    setMoveSourceNode,
    setCopySourceNode,
    setShowSelectFolderModal,
  } = useMoveCopy({
    isMultiSelectMode,
    selectedNodes,
    handleRefresh,
    showToast,
  });

  const isAtRoot = mode === 'personal-space' ? false : !urlProjectId;

  const displayNodes = Array.isArray(nodes) ? nodes : [];

  const currentNodeIdRef = useRef<string | null>(null);
  const getCurrentParentId = useCallback(() => {
    if (currentNodeIdRef.current) return currentNodeIdRef.current;
    if (urlNodeId) return urlNodeId;
    if (urlNodeId && nodes.length > 0) {
      const currentNodeData = nodes.find((n) => n.id === urlNodeId);
      if (currentNodeData) return currentNodeData.id;
    }
    if (urlProjectId) return urlProjectId;
    return '';
  }, [urlNodeId, urlProjectId, nodes]);

  useEffect(() => {
    if (currentNode?.id) {
      currentNodeIdRef.current = currentNode.id;
    }
  }, [currentNode]);

  useEffect(() => {
    if (!user) return;

    let nodesToLoad: string[] = [];

    if (isAtRoot) {
      nodesToLoad = displayNodes
        .filter((node) => node.isRoot)
        .map((node) => node.id);
    } else if (urlProjectId) {
      nodesToLoad = [urlProjectId];
    }

    if (nodesToLoad.length === 0) return;

    const loadPermissions = async () => {
      setPermissionsLoading(true);

      try {
        const {
          canEditNode,
          canDeleteNode,
          canManageNodeMembers,
          canManageNodeRoles,
        } = await import('@/utils/permissionUtils');

        const permissionsPromises = nodesToLoad.map(async (nodeId) => {
          const [canEdit, canDelete, canManageMembers, canManageRoles] =
            await Promise.all([
              canEditNode(user, nodeId),
              canDeleteNode(user, nodeId),
              canManageNodeMembers(user, nodeId),
              canManageNodeRoles(user, nodeId),
            ]);

          return { nodeId, canEdit, canDelete, canManageMembers, canManageRoles };
        });

        const permissionsResults = await Promise.all(permissionsPromises);

        setNodePermissions((prev) => {
          const newMap = new Map(prev);
          permissionsResults.forEach((result) => {
            newMap.set(result.nodeId, {
              canEdit: result.canEdit,
              canDelete: result.canDelete,
              canManageMembers: result.canManageMembers,
              canManageRoles: result.canManageRoles,
            });
          });
          return newMap;
        });
      } catch (error) {
        handleError(error, '加载权限信息失败');
      } finally {
        setPermissionsLoading(false);
      }
    };

    loadPermissions();
  }, [user, isAtRoot, urlProjectId, nodes.length]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'upload' || isAtRoot || loading) return;

    const timer = setTimeout(() => {
      if (uploaderRef.current) {
        uploaderRef.current.triggerUpload();
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('action');
        navigate({ search: newSearchParams.toString() }, { replace: true });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchParams, isAtRoot, loading, navigate]);

  const handleShowMembers = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setIsMembersModalOpen(true);
  }, []);

  const handleShowRoles = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setIsProjectRolesModalOpen(true);
  }, []);

  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (editingProject) {
        handleUpdateProjectSubmit(async (id, data) => {
          await fileSystemControllerUpdateNode({
            path: { nodeId: id },
            body: { name: data.name ?? undefined, description: data.description },
          } as any);
        });
      } else {
        handleCreateProjectSubmit(async (name, description) => {
          await fileSystemControllerCreateProject({ body: { name, description } } as any);
        });
      }
    },
    [editingProject, handleCreateProjectSubmit, handleUpdateProjectSubmit]
  );

  const handleUploadExternalReference = useCallback((_node: FileSystemNode) => {
    // External reference upload handled in FileItem component
  }, []);

  const { handleDragStart, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop({
      draggedNodes,
      setDraggedNodes,
      dropTargetId,
      setDropTargetId,
      handleRefresh,
      showToast,
    });

  const showEmpty = displayNodes.length === 0 && !loading && !error;

  return (
    <>
      {createPortal(
        <ToastContainer toasts={toasts} onRemove={removeToast} />,
        document.body
      )}

      {createPortal(
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText || '确定'}
          onConfirm={confirmDialog.onConfirm}
          onCancel={closeConfirm}
          type={confirmDialog.type}
        />,
        document.body
      )}

      <div className="max-w-7xl mx-auto space-y-6 relative">
        <FileSystemHeader
          mode={mode}
          isAtRoot={isAtRoot}
          isTrashView={isTrashView}
          isProjectTrashView={isProjectTrashView}
          isPersonalSpaceMode={isPersonalSpaceMode}
          isProjectRootMode={isProjectRootMode}
          loading={loading}
          searchTerm={searchTerm}
          viewMode={viewMode}
          isMultiSelectMode={isMultiSelectMode}
          selectedNodes={selectedNodes}
          nodesCount={nodes.length}
          projectFilter={projectFilter}
          breadcrumbs={breadcrumbs}
          canCreateProject={canCreateProject}
          uploaderRef={uploaderRef as React.RefObject<MxCadUppyUploaderRef>}
          getCurrentParentId={getCurrentParentId}
          onSetSearchTerm={setSearchTerm}
          onSetViewMode={setViewMode}
          onSetIsMultiSelectMode={setIsMultiSelectMode}
          onSearchSubmit={handleSearchSubmit}
          onSelectAll={handleSelectAll}
          onToggleTrashView={handleToggleTrashView}
          onToggleProjectTrashView={handleToggleProjectTrashView}
          onClearProjectTrash={handleClearProjectTrash}
          onClearTrash={handleClearTrash}
          onProjectFilterChange={setProjectFilter}
          onRefresh={handleRefresh}
          onCreateFolder={() => setShowCreateFolderModal(true)}
          onCreateProject={openCreateProject}
          onGoBack={handleGoBack}
          onBreadcrumbNavigate={() => {}}
          showToast={showToast}
        />
      </div>

      <div
        className="max-w-7xl mx-auto mt-6 rounded-2xl relative min-h-[400px] shadow-sm overflow-visible"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="overflow-hidden h-full rounded-2xl">
          <FileSystemStates
            loading={loading}
            error={error}
            isEmpty={showEmpty}
            isAtRoot={isAtRoot}
            isTrashView={isTrashView}
            isProjectTrashView={isProjectTrashView}
            searchTerm={searchTerm}
            canCreateProject={canCreateProject}
            onRefresh={handleRefresh}
            onCreateProject={openCreateProject}
          />

          {!loading && !error && !showEmpty && (
            <FileSystemContent
              nodes={displayNodes}
              viewMode={viewMode}
              isMultiSelectMode={isMultiSelectMode}
              isTrashView={isTrashView}
              isProjectTrashView={isProjectTrashView}
              isAtRoot={isAtRoot}
              selectedNodes={selectedNodes}
              dropTargetId={dropTargetId}
              nodePermissions={nodePermissions}
              projectPermissions={projectPermissionsRecord}
              paginationMeta={paginationMeta}
              onNodeSelect={handleNodeSelect}
              onFileOpen={handleFileOpen}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onPermanentlyDelete={handlePermanentlyDelete}
              onRename={handleOpenRename}
              onRefresh={handleRefresh}
              onRestore={isTrashView || isProjectTrashView ? handleRestoreNode : undefined}
              onEdit={isAtRoot ? (node: FileSystemNode) => openEditProject(node) : undefined}
              onDeleteNode={isAtRoot ? (node: FileSystemNode) => {
                if (isProjectTrashView) {
                  handlePermanentlyDeleteProject(node.id, node.name);
                } else {
                  handleDeleteProject(node.id, node.name);
                }
              } : undefined}
              onShowMembers={isAtRoot ? (node: FileSystemNode) => handleShowMembers(node) : undefined}
              onShowRoles={isAtRoot ? (node: FileSystemNode) => handleShowRoles(node) : undefined}
              onMove={handleMove}
              onCopy={handleCopy}
              onShowVersionHistory={handleShowVersionHistory}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onDeleteProject={handleDeleteProject}
              onPermanentlyDeleteProject={handlePermanentlyDeleteProject}
            />
          )}
        </div>

        {isMultiSelectMode && selectedNodes.size > 0 && (
          <div
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="text-sm font-semibold">已选中 {selectedNodes.size} 项</span>
            <div className="w-px h-4" style={{ background: 'var(--border-default)' }} />

            {(isTrashView || isProjectTrashView) && (
              <button
                onClick={handleBatchRestore}
                className="text-emerald-400 hover:text-white text-sm font-medium transition-colors"
              >
                恢复
              </button>
            )}

            {!isTrashView && !isProjectTrashView && (
              <>
                <button
                  onClick={() => {
                    setMoveSourceNode({ id: 'batch' });
                    setCopySourceNode(null);
                    setShowSelectFolderModal(true);
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary-500)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  移动
                </button>
                <button
                  onClick={() => {
                    setMoveSourceNode(null);
                    setCopySourceNode({ id: 'batch' });
                    setShowSelectFolderModal(true);
                  }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--primary-500)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  复制
                </button>
              </>
            )}

            {(isTrashView || isProjectTrashView) && (
              <button
                onClick={() => handleBatchDelete(true)}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--error)' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                彻底删除
              </button>
            )}

            {!isTrashView && !isProjectTrashView && (
              <button
                onClick={() => handleBatchDelete(false)}
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--error)' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                删除
              </button>
            )}
            <button
              onClick={() => {
                selectedNodes.clear();
                setIsMultiSelectMode(false);
              }}
              className="text-sm font-medium transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        folderName={folderName}
        loading={loading}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderNameChange={setFolderName}
        onCreate={handleCreateFolder}
      />

      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={loading}
        onClose={() => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        }}
        onNameChange={setFolderName}
        onRename={handleRename}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={editingProject}
        formData={projectFormData}
        loading={projectLoading}
        onClose={closeProjectModal}
        onFormDataChange={setProjectFormData}
        onSubmit={handleSubmitProject}
      />

      {/* Delete project confirm modal */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        title="确认删除项目"
        footer={
          <>
            <Button variant="ghost" onClick={cancelDelete} disabled={projectLoading}>
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={projectLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {projectLoading ? '删除中...' : '确认删除'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-lg"
            style={{ background: 'var(--warning-dim)', border: '1px solid var(--warning)' }}
          >
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p className="font-semibold mb-1">重要提示</p>
              <p style={{ color: 'var(--text-tertiary)' }}>
                删除项目后，项目中的所有文件和数据可能无法恢复。
              </p>
            </div>
          </div>
          {projectToDelete && (
            <div className="space-y-2">
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                删除项目：
              </p>
              <div className="p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {projectToDelete.name}
                </p>
                {projectToDelete.description && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {projectToDelete.description}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            确定要删除该项目吗？此操作不可恢复。
          </p>
        </div>
      </Modal>

      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id || urlProjectId || ''}
        onClose={() => {
          setIsMembersModalOpen(false);
          setEditingProject(null);
        }}
      />

      <ProjectRolesModal
        isOpen={isProjectRolesModalOpen}
        projectId={editingProject?.id || urlProjectId || ''}
        onClose={() => {
          setIsProjectRolesModalOpen(false);
          setEditingProject(null);
        }}
      />

      <SelectFolderModal
        isOpen={showSelectFolderModal}
        currentNodeId={
          moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch'
            ? ''
            : moveSourceNode?.id || copySourceNode?.id || ''
        }
        projectId={urlProjectId}
        onClose={() => {
          setShowSelectFolderModal(false);
          setMoveSourceNode(null);
          setCopySourceNode(null);
        }}
        onConfirm={handleConfirmMoveOrCopy}
      />

      {/* @ts-ignore - pre-existing component prop type */}
      <KeyboardShortcuts
        onUploadExternalReference={handleUploadExternalReference}
        // @ts-ignore - pre-existing component prop type
        currentNode={currentNode}
      />

      {/* @ts-ignore - pre-existing component prop type */}
      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        // @ts-ignore - pre-existing component prop type
        node={downloadingNode}
        onClose={() => {
          setShowDownloadFormatModal(false);
          setDownloadingNode(null);
        }}
        onDownload={handleDownloadWithFormat}
      />

      {/* @ts-ignore - pre-existing component prop type */}
      <VersionHistoryModal
        isOpen={showVersionHistoryModal}
        node={versionHistoryNode}
        entries={versionHistoryEntries}
        loading={versionHistoryLoading}
        error={versionHistoryError}
        onClose={closeVersionHistory}
        // @ts-ignore - pre-existing component prop type
        onOpenHistoricalVersion={handleOpenHistoricalVersion}
      />
    </>
  );
};

export default FileSystemManager;
