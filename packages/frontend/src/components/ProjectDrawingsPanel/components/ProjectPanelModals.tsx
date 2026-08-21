///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { RenameModal } from '@/components/modals/RenameModal';
import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { MembersModal } from '@/components/modals/MembersModal';
import { ProjectRolesModal } from '@/components/modals/ProjectRolesModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { useTransferSettings } from '@/components/modals/hooks/useTransferSettings';
import { SelectFolderModal } from '@/components/modals/SelectFolderModal';
import { LibrarySelectFolderModal } from '@/components/modals/LibrarySelectFolderModal';
import { VersionHistoryModal } from '@/components/modals/VersionHistoryModal';
import { BatchDownloadDialog } from '@/components/modals/BatchDownloadDialog';
import { FileSystemNode, TransferSettings } from '@/types/filesystem';
import type { UseVersionHistoryReturn } from '@/hooks/useVersionHistory';

import type { LibraryType } from '../types';

interface ProjectPanelModalsProps {
  showRenameModal: boolean;
  editingNode: FileSystemNode | null;
  folderName: string;
  isRenameLoading: boolean;
  onCloseRename: () => void;
  onRenameNameChange: (name: string) => void;
  onRenameSubmit: () => void;
  libraryRenameModalOpen: boolean;
  libraryRenamingNode: FileSystemNode | null;
  libraryRenameName: string;
  onCloseLibraryRename: () => void;
  onLibraryRenameNameChange: (name: string) => void;
  onLibraryRenameSubmit: () => void;
  vh: UseVersionHistoryReturn;
  showDownloadFormatModal: boolean;
  downloadingFileName: string;
  onCloseDownloadFormat: () => void;
  onDownloadFormat: (
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: {
      width?: string;
      height?: string;
      colorPolicy?: 'mono' | 'color';
    }
  ) => void;
  isMembersModalOpen: boolean;
  membersProjectId: string;
  onCloseMembers: () => void;
  isProjectRolesModalOpen: boolean;
  projectRolesProjectId: string;
  onCloseProjectRoles: () => void;
  isProjectModalOpen: boolean;
  onCloseProjectModal: () => void;
  projectBeingEdited: FileSystemNode | null;
  projectFormData: { name: string; description: string };
  onProjectFormDataChange: (data: {
    name: string;
    description: string;
  }) => void;
  onSubmitProject: (e: React.FormEvent) => void;
  projectLoading: boolean;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
  showSelectFolderModal: boolean;
  selectFolderNodeId: string;
  selectFolderProjectId: string | null;
  onCloseSelectFolder: () => void;
  onConfirmSelectFolder: (targetParentId: string) => void;
  selectFolderConfirmText: string;
  isLibraryMode: boolean;
  showBatchSelectFolderModal: boolean;
  onCloseBatchSelectFolder: () => void;
  onConfirmBatchSelectFolder: (targetParentId: string) => void;
  showBatchDownloadDialog: boolean;
  onCloseBatchDownloadDialog: () => void;
  libraryType: LibraryType | undefined;
}

/**
 * ProjectDrawingsPanel 弹窗集合
 *
 * 聚合面板全部 modal：重命名（项目/库）、版本历史、下载格式、成员/角色、
 * 项目编辑、选择文件夹（单/批量）、批量下载。
 */
export const ProjectPanelModals: React.FC<ProjectPanelModalsProps> = ({
  showRenameModal,
  editingNode,
  folderName,
  isRenameLoading,
  onCloseRename,
  onRenameNameChange,
  onRenameSubmit,
  libraryRenameModalOpen,
  libraryRenamingNode,
  libraryRenameName,
  onCloseLibraryRename,
  onLibraryRenameNameChange,
  onLibraryRenameSubmit,
  vh,
  showDownloadFormatModal,
  downloadingFileName,
  onCloseDownloadFormat,
  onDownloadFormat,
  isMembersModalOpen,
  membersProjectId,
  onCloseMembers,
  isProjectRolesModalOpen,
  projectRolesProjectId,
  onCloseProjectRoles,
  isProjectModalOpen,
  onCloseProjectModal,
  projectBeingEdited,
  projectFormData,
  onProjectFormDataChange,
  onSubmitProject,
  projectLoading,
  showToast,
  showSelectFolderModal,
  selectFolderNodeId,
  selectFolderProjectId,
  onCloseSelectFolder,
  onConfirmSelectFolder,
  selectFolderConfirmText,
  isLibraryMode,
  showBatchSelectFolderModal,
  onCloseBatchSelectFolder,
  onConfirmBatchSelectFolder,
  showBatchDownloadDialog,
  onCloseBatchDownloadDialog,
  libraryType,
}) => {
  // 跨项目转移设置（编辑项目时按 PROJECT_TRANSFER_MANAGE 门控显示）
  const {
    canManage: canManageTransfer,
    save: saveTransferSettings,
  } = useTransferSettings(projectBeingEdited?.id);

  const handleTransferSettingsChange = async (settings: TransferSettings) => {
    try {
      await saveTransferSettings(settings);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      );
    }
  };

  return (
    <>
      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={isRenameLoading}
        onClose={onCloseRename}
        onNameChange={onRenameNameChange}
        onRename={onRenameSubmit}
      />
      <RenameModal
        isOpen={libraryRenameModalOpen}
        editingNode={libraryRenamingNode}
        newName={libraryRenameName}
        loading={false}
        onClose={onCloseLibraryRename}
        onNameChange={onLibraryRenameNameChange}
        onRename={onLibraryRenameSubmit}
      />
      <VersionHistoryModal
        isOpen={vh.showVersionHistoryModal}
        node={vh.versionHistoryNode}
        entries={vh.versionHistoryEntries}
        totalCount={vh.versionHistoryTotal}
        loading={vh.versionHistoryLoading}
        error={vh.versionHistoryError}
        openingRevision={vh.openingRevision}
        openingVersionError={vh.openingVersionError}
        onClose={() => vh.setShowVersionHistoryModal(false)}
        onOpenVersion={vh.handleOpenHistoricalVersion}
      />
      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingFileName}
        onClose={onCloseDownloadFormat}
        onDownload={onDownloadFormat}
      />
      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={membersProjectId}
        onClose={onCloseMembers}
      />
      <ProjectRolesModal
        isOpen={isProjectRolesModalOpen}
        projectId={projectRolesProjectId}
        onClose={onCloseProjectRoles}
      />
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={onCloseProjectModal}
        editingProject={projectBeingEdited}
        formData={projectFormData}
        onFormDataChange={onProjectFormDataChange}
        onSubmit={onSubmitProject}
        loading={projectLoading}
        transferSettings={projectBeingEdited}
        canManageTransferSettings={canManageTransfer}
        onTransferSettingsChange={handleTransferSettingsChange}
      />
      <SelectFolderModal
        isOpen={showSelectFolderModal}
        currentNodeId={selectFolderNodeId}
        projectId={selectFolderProjectId || undefined}
        onClose={onCloseSelectFolder}
        onConfirm={onConfirmSelectFolder}
        confirmButtonText={selectFolderConfirmText}
      />
      {isLibraryMode && (
        <LibrarySelectFolderModal
          isOpen={showBatchSelectFolderModal}
          libraryTypes={['drawing', 'block']}
          currentNodeId=""
          onClose={onCloseBatchSelectFolder}
          onConfirm={onConfirmBatchSelectFolder}
        />
      )}
      {showBatchDownloadDialog && (
        <BatchDownloadDialog
          isOpen={showBatchDownloadDialog}
          onClose={onCloseBatchDownloadDialog}
          libraryType={libraryType}
        />
      )}
    </>
  );
};

export default ProjectPanelModals;
