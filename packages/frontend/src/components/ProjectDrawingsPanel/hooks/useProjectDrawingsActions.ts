///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import { useCallback, useState } from 'react';
import { nodeControllerUpdateNode } from '@/api-sdk';
import { useFileSystemNavigation } from '@/hooks/file-system';
import { useLibraryOperations } from '@/hooks/library/useLibraryOperations';
import { useConfirmDialog } from '@/contexts/NotificationContext';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { handleError, getErrorMessage } from '@/utils/errorHandler';
import { t } from '@/languages';
import { FileSystemNode } from '@/types/filesystem';
import type { UseFileBrowserActionsReturn } from '@/hooks/file-browser';
import type { UseFileBrowserModalsReturn } from '@/hooks/file-browser';

import type { UseProjectDrawingsDataReturn } from './useProjectDrawingsData';
import { useProjectDrawingsBatch } from './useProjectDrawingsBatch';

/**
 * ProjectDrawingsPanel 动作层（#283 内核化后）
 *
 * CRUD（内核 useFileBrowserActions 输出）、库操作（useLibraryOperations）、
 * 项目管理（useProjectManagement）、重命名、选择文件夹移动/复制
 * （内核 useFileBrowserModals SelectFolder 收敛）、多选批量操作。
 */
export function useProjectDrawingsActions({
  data,
  fileBrowser,
  modals,
}: {
  data: UseProjectDrawingsDataReturn;
  fileBrowser: UseFileBrowserActionsReturn;
  modals: UseFileBrowserModalsReturn;
}) {
  const {
    selectedProjectId,
    refreshNodes,
    currentNode,
    removeLocalNode,
    updateLocalNode,
    isPersonalSpace,
    isLibraryMode,
    libraryType,
    undoProjectId,
    pushAction,
    showToast,
  } = data;

  const { showConfirm: showConfirmPromise } = useConfirmDialog();

  // Adapt Promise-based showConfirm to callback-style
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

  // Library operations
  const libraryOperations = useLibraryOperations({
    libraryType: libraryType || 'drawing',
    showToast,
    refreshNodes,
    showConfirm,
    removeLocalNode,
    updateLocalNode,
  });

  // CRUD hook（内核输出：useFileBrowserActions 内部实例化 useFileSystemCRUD）
  const {
    showRenameModal,
    setShowRenameModal,
    editingNode,
    setEditingNode,
    folderName,
    setFolderName,
    handleRename,
    handleDelete,
    handleOpenRename,
  } = fileBrowser;

  const {
    handleDownload,
    handleDownloadWithFormat,
    showDownloadFormatModal,
    setShowDownloadFormatModal,
    downloadingNode,
    setDownloadingNode,
  } = useFileSystemNavigation({
    urlProjectId: selectedProjectId || undefined,
    currentNode,
    showToast,
    mode: isPersonalSpace ? 'personal-space' : 'project',
  });

  // Library rename
  const [libraryRenameModalOpen, setLibraryRenameModalOpen] = useState(false);
  const [libraryRenamingNode, setLibraryRenamingNode] =
    useState<FileSystemNode | null>(null);
  const [libraryRenameName, setLibraryRenameName] = useState('');

  const handleLibraryOpenRename = useCallback((node: FileSystemNode) => {
    setLibraryRenamingNode(node);
    if (!node.isFolder && node.name) {
      const lastDot = node.name.lastIndexOf('.');
      setLibraryRenameName(
        lastDot !== -1 ? node.name.substring(0, lastDot) : node.name
      );
    } else setLibraryRenameName(node.name);
    setLibraryRenameModalOpen(true);
  }, []);

  const handleLibraryRenameSubmit = useCallback(async () => {
    if (!libraryRenamingNode || !libraryRenameName.trim()) return;
    try {
      await libraryOperations.handleRename(
        libraryRenamingNode.id,
        libraryRenameName.trim(),
        () => {
          setLibraryRenameModalOpen(false);
          setLibraryRenamingNode(null);
          setLibraryRenameName('');
        }
      );
    } catch {
      /* handled in libraryOperations */
    }
  }, [libraryRenamingNode, libraryRenameName, libraryOperations]);

  const handleLibraryDownloadWithFormat = useCallback(
    async (
      format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
      pdfOptions?: {
        width?: string;
        height?: string;
        colorPolicy?: 'mono' | 'color';
      }
    ) => {
      if (!downloadingNode || downloadingNode.isFolder) return;
      await libraryOperations.handleDownloadWithFormat(
        downloadingNode.id,
        downloadingNode.name,
        format,
        pdfOptions
      );
      setShowDownloadFormatModal(false);
      setDownloadingNode(null);
    },
    [downloadingNode, libraryOperations]
  );

  // Project management
  const {
    isModalOpen: isProjectModalOpen,
    editingProject: projectBeingEdited,
    formData: projectFormData,
    loading: projectLoading,
    openCreateModal: openCreateProjectModal,
    openEditModal: openEditProjectModal,
    closeModal: closeProjectModal,
    setFormData: setProjectFormData,
    handleUpdate: handleUpdateProjectSubmit,
  } = useProjectManagement({
    onProjectUpdated: refreshNodes,
    onProjectDeleted: refreshNodes,
    showToast,
  });

  // Multi-select batch operations
  const batch = useProjectDrawingsBatch({
    data,
    showConfirm,
    libraryOperations,
  });

  // Handlers for project view
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isProjectRolesModalOpen, setIsProjectRolesModalOpen] = useState(false);
  const [isOperationHistoryModalOpen, setIsOperationHistoryModalOpen] =
    useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(
    null
  );

  const handleShowMembers = useCallback((node: FileSystemNode) => {
    setEditingProject(node);
    setIsMembersModalOpen(true);
  }, []);
  const handleShowRoles = useCallback((node: FileSystemNode) => {
    setEditingProject(node);
    setIsProjectRolesModalOpen(true);
  }, []);
  const handleShowOperationHistory = useCallback((node: FileSystemNode) => {
    setEditingProject(node);
    setIsOperationHistoryModalOpen(true);
  }, []);
  const handleEditProject = useCallback(
    (node: FileSystemNode) => {
      openEditProjectModal(node);
    },
    [openEditProjectModal]
  );

  const handleSubmitProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleUpdateProjectSubmit(async (id, data) => {
        const result = await nodeControllerUpdateNode({
          path: { nodeId: id },
          body: { name: data.name ?? undefined, description: data.description },
        });
        // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
        // 否则外层 catch 不触发，弹窗照常关闭提示"更新成功"（历史 bug）
        if (result.error) throw result.error;
      });
    },
    [handleUpdateProjectSubmit]
  );

  // Rename submit
  const [isRenameLoading, setIsRenameLoading] = useState(false);

  const handleRenameSubmit = useCallback(async () => {
    if (!editingNode || !folderName.trim()) return;
    setIsRenameLoading(true);
    try {
      if (isLibraryMode) {
        const oldName = editingNode.name;
        const nodeId = editingNode.id;
        await libraryOperations.handleRename(nodeId, folderName.trim(), () => {
          setShowRenameModal(false);
          setEditingNode(null);
          setFolderName('');
        });
        pushAction({
          type: 'rename',
          description: t(`重命名: ${oldName} → ${folderName.trim()}`),
          projectId: undoProjectId,
          execute: async () => {
            await libraryOperations.handleRename(nodeId, folderName.trim());
          },
          rollback: async () => {
            await libraryOperations.handleRename(nodeId, oldName);
          },
        });
      } else await handleRename();
    } catch (error: unknown) {
      handleError(error, 'ProjectDrawingsPanel: 重命名失败');
      showToast(getErrorMessage(error), 'error');
    } finally {
      setIsRenameLoading(false);
    }
  }, [
    editingNode,
    folderName,
    isLibraryMode,
    libraryOperations,
    handleRename,
    showToast,
    pushAction,
    undoProjectId,
    setShowRenameModal,
    setEditingNode,
    setFolderName,
  ]);

  // SelectFolder（内核 useFileBrowserModals 收敛，输出兼容旧 useProjectDrawingsMoveCopy）
  const selectFolder = {
    showSelectFolderModal: modals.showSelectFolderModal,
    moveSourceNode: modals.moveSourceNode,
    copySourceNode: modals.copySourceNode,
    handleMove: modals.handleMove,
    handleCopy: modals.handleCopy,
    handleConfirmMoveOrCopy: modals.handleConfirmMoveOrCopy,
    closeSelectFolderModal: modals.closeSelectFolder,
  };

  return {
    showConfirm,
    libraryOperations,
    showRenameModal,
    setShowRenameModal,
    editingNode,
    setEditingNode,
    folderName,
    setFolderName,
    isRenameLoading,
    handleRename,
    handleDelete,
    handleOpenRename,
    handleDownload,
    handleDownloadWithFormat,
    showDownloadFormatModal,
    setShowDownloadFormatModal,
    downloadingNode,
    setDownloadingNode,
    libraryRenameModalOpen,
    setLibraryRenameModalOpen,
    libraryRenamingNode,
    setLibraryRenamingNode,
    libraryRenameName,
    setLibraryRenameName,
    handleLibraryOpenRename,
    handleLibraryRenameSubmit,
    handleLibraryDownloadWithFormat,
    isProjectModalOpen,
    projectBeingEdited,
    projectFormData,
    projectLoading,
    openCreateProjectModal,
    closeProjectModal,
    setProjectFormData,
    handleUpdateProjectSubmit,
    ...selectFolder,
    ...batch,
    isMembersModalOpen,
    setIsMembersModalOpen,
    isProjectRolesModalOpen,
    setIsProjectRolesModalOpen,
    isOperationHistoryModalOpen,
    setIsOperationHistoryModalOpen,
    editingProject,
    setEditingProject,
    handleShowMembers,
    handleShowRoles,
    handleShowOperationHistory,
    handleEditProject,
    handleSubmitProject,
    handleRenameSubmit,
  };
}

export type UseProjectDrawingsActionsReturn = ReturnType<
  typeof useProjectDrawingsActions
>;
