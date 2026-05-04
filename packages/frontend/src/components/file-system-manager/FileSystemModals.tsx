import React from 'react';
import { CreateFolderModal } from '../modals/CreateFolderModal';
import { RenameModal } from '../modals/RenameModal';
import { ProjectModal } from '../modals/ProjectModal';
import { MembersModal } from '../modals/MembersModal';
import { SelectFolderModal } from '../modals/SelectFolderModal';
import { FileSystemNode } from '../../types/filesystem';

interface FileSystemModalsProps {
  showCreateFolderModal: boolean;
  showRenameModal: boolean;
  isProjectModalOpen: boolean;
  isMembersModalOpen: boolean;
  showSelectFolderModal: boolean;
  folderName: string;
  editingNode: FileSystemNode | null;
  editingProject: FileSystemNode | null;
  projectFormData: { name: string; description: string };
  projectLoading: boolean;
  loading: boolean;
  moveSourceNode: FileSystemNode | null;
  copySourceNode: FileSystemNode | null;
  projectId: string;
  onFolderNameChange: (name: string) => void;
  onCreateFolder: () => void;
  onRename: () => void;
  onProjectFormDataChange: (data: {
    name: string;
    description: string;
  }) => void;
  onSubmitProject: (e: React.FormEvent) => void;
  onConfirmMoveOrCopy: (targetParentId: string) => void;
  onCloseCreateFolderModal: () => void;
  onCloseRenameModal: () => void;
  onCloseProjectModal: () => void;
  onCloseMembersModal: () => void;
  onCloseSelectFolderModal: () => void;
}

export const FileSystemModals: React.FC<FileSystemModalsProps> = ({
  showCreateFolderModal,
  showRenameModal,
  isProjectModalOpen,
  isMembersModalOpen,
  showSelectFolderModal,
  folderName,
  editingNode,
  editingProject,
  projectFormData,
  projectLoading,
  loading,
  moveSourceNode,
  copySourceNode,
  projectId,
  onFolderNameChange,
  onCreateFolder,
  onRename,
  onProjectFormDataChange,
  onSubmitProject,
  onConfirmMoveOrCopy,
  onCloseCreateFolderModal,
  onCloseRenameModal,
  onCloseProjectModal,
  onCloseMembersModal,
  onCloseSelectFolderModal,
}) => {
  return (
    <>
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        folderName={folderName}
        loading={loading}
        onClose={onCloseCreateFolderModal}
        onFolderNameChange={onFolderNameChange}
        onCreate={onCreateFolder}
      />

      <RenameModal
        isOpen={showRenameModal}
        editingNode={editingNode}
        newName={folderName}
        loading={loading}
        onClose={onCloseRenameModal}
        onNameChange={onFolderNameChange}
        onRename={onRename}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        editingProject={editingProject}
        formData={projectFormData}
        loading={projectLoading}
        onClose={onCloseProjectModal}
        onFormDataChange={onProjectFormDataChange}
        onSubmit={onSubmitProject}
      />

      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id || projectId || ''}
        onClose={onCloseMembersModal}
      />

      <SelectFolderModal
        isOpen={showSelectFolderModal}
        currentNodeId={
          moveSourceNode?.id === 'batch' || copySourceNode?.id === 'batch'
            ? ''
            : moveSourceNode?.id || copySourceNode?.id || ''
        }
        projectId={projectId}
        onClose={onCloseSelectFolderModal}
        onConfirm={onConfirmMoveOrCopy}
      />
    </>
  );
};
