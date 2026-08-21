import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CreateFolderModal } from '@/components/modals/CreateFolderModal';
import { NewDrawingModal } from '@/components/modals/NewDrawingModal';
import { RenameModal } from '@/components/modals/RenameModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { MembersModal } from '@/components/modals/MembersModal';
import { ProjectRolesModal } from '@/components/modals/ProjectRolesModal';
import { OperationHistoryModal } from '@/components/modals/OperationHistoryModal';
import { SelectFolderModal } from '@/components/modals/SelectFolderModal';
import { useTransferTargetRoots } from '@/components/modals/hooks/useTransferTargetRoots';
import { useTransferSettings } from '@/components/modals/hooks/useTransferSettings';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { BatchDownloadDialog } from '@/components/modals/BatchDownloadDialog';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import { VersionHistoryModal } from '@/components/modals/VersionHistoryModal';
import { ShareDialog } from '@/components/modals/ShareDialog';
import { t } from '@/languages';
import type { MxLogEntryDto } from '@/api-sdk';
import type { FileSystemNode, TransferSettings } from '@/types/filesystem';

export interface FileSystemModalsProps {
  showCreateFolderModal: boolean;
  folderName: string;
  loading: boolean;
  setShowCreateFolderModal: (v: boolean) => void;
  setFolderName: (v: string) => void;
  handleCreateFolder: () => void;
  showCreateDrawingModal: boolean;
  drawingName: string;
  setShowCreateDrawingModal: (v: boolean) => void;
  setDrawingName: (v: string) => void;
  handleCreateDrawing: () => void;
  showRenameModal: boolean;
  editingNode: FileSystemNode | null;
  setShowRenameModal: (v: boolean) => void;
  setEditingNode: (v: FileSystemNode | null) => void;
  handleRename: () => void;
  isProjectModalOpen: boolean;
  editingProject: FileSystemNode | null;
  projectFormData: { name: string; description: string };
  projectLoading: boolean;
  closeProjectModal: () => void;
  setProjectFormData: (v: { name: string; description: string }) => void;
  handleSubmitProject: (e: React.FormEvent) => void;
  deleteConfirmOpen: boolean;
  projectToDelete: FileSystemNode | null;
  cancelDelete: () => void;
  confirmDelete: () => void;
  isMembersModalOpen: boolean;
  isProjectRolesModalOpen: boolean;
  isOperationHistoryModalOpen: boolean;
  setIsMembersModalOpen: (v: boolean) => void;
  setIsProjectRolesModalOpen: (v: boolean) => void;
  setIsOperationHistoryModalOpen: (v: boolean) => void;
  setEditingProject: (v: FileSystemNode | null) => void;
  urlProjectId: string | undefined;
  /** 当前视图模式：项目 / 个人空间（跨项目转移门控判定源域用） */
  mode: 'project' | 'personal-space';
  showSelectFolderModal: boolean;
  moveSourceNode: FileSystemNode | { id: 'batch' } | null;
  copySourceNode: FileSystemNode | { id: 'batch' } | null;
  setShowSelectFolderModal: (v: boolean) => void;
  setMoveSourceNode: (v: FileSystemNode | { id: 'batch' } | null) => void;
  setCopySourceNode: (v: FileSystemNode | { id: 'batch' } | null) => void;
  handleConfirmMoveOrCopy: (targetParentId: string) => Promise<void>;
  handleUploadExternalReference: (node: FileSystemNode) => void;
  currentNode: FileSystemNode | null;
  showDownloadFormatModal: boolean;
  downloadingNode: FileSystemNode | null;
  setShowDownloadFormatModal: (v: boolean) => void;
  setDownloadingNode: (v: FileSystemNode | null) => void;
  handleDownloadWithFormat: (
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: {
      width?: string;
      height?: string;
      colorPolicy?: 'mono' | 'color';
    }
  ) => Promise<void>;
  projectId: string;
  showToast: (
    message: string,
    type?: 'info' | 'success' | 'error' | 'warning'
  ) => void;
  showVersionHistoryModal: boolean;
  versionHistoryNode: FileSystemNode | null;
  versionHistoryEntries: MxLogEntryDto[];
  versionHistoryTotal: number;
  versionHistoryLoading: boolean;
  versionHistoryError: string | null;
  openingRevision: number | null;
  openingVersionError: string | null;
  closeVersionHistory: () => void;
  handleOpenHistoricalVersion: (revision: number) => void;
  shareDialogOpen: boolean;
  shareFileId: string | null;
  shareFileName: string;
  setShareDialogOpen: (v: boolean) => void;
  setShareFileId: (v: string | null) => void;
  setShareFileName: (v: string) => void;
}

export const FileSystemModals: React.FC<FileSystemModalsProps> = (props) => {
  const {
    showCreateFolderModal,
    folderName,
    loading,
    setShowCreateFolderModal,
    setFolderName,
    handleCreateFolder,
    showCreateDrawingModal,
    drawingName,
    setShowCreateDrawingModal,
    setDrawingName,
    handleCreateDrawing,
    showRenameModal,
    editingNode,
    setShowRenameModal,
    setEditingNode,
    handleRename,
    isProjectModalOpen,
    editingProject,
    projectFormData,
    projectLoading,
    closeProjectModal,
    setProjectFormData,
    handleSubmitProject,
    deleteConfirmOpen,
    projectToDelete,
    cancelDelete,
    confirmDelete,
    isMembersModalOpen,
    isProjectRolesModalOpen,
    isOperationHistoryModalOpen,
    setIsMembersModalOpen,
    setIsProjectRolesModalOpen,
    setIsOperationHistoryModalOpen,
    setEditingProject,
    urlProjectId,
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    setShowSelectFolderModal,
    setMoveSourceNode,
    setCopySourceNode,
    handleConfirmMoveOrCopy,
    handleUploadExternalReference,
    currentNode,
    showDownloadFormatModal,
    downloadingNode,
    setShowDownloadFormatModal,
    setDownloadingNode,
    handleDownloadWithFormat,
    projectId,
    showToast,
    showVersionHistoryModal,
    versionHistoryNode,
    versionHistoryEntries,
    versionHistoryTotal,
    versionHistoryLoading,
    versionHistoryError,
    openingRevision,
    openingVersionError,
    closeVersionHistory,
    handleOpenHistoricalVersion,
    shareDialogOpen,
    shareFileId,
    shareFileName,
    setShareDialogOpen,
    setShareFileId,
    setShareFileName,
    mode,
  } = props;

  // 跨项目目标根（个人空间 + 我的项目）：弹窗打开时才拉取
  const transferRoots = useTransferTargetRoots(showSelectFolderModal);
  // 跨项目转移设置（编辑项目时按 PROJECT_TRANSFER_MANAGE 门控显示）
  const {
    canManage: canManageTransfer,
    save: saveTransferSettings,
  } = useTransferSettings(editingProject?.id);

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
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        folderName={folderName}
        loading={loading}
        onClose={() => setShowCreateFolderModal(false)}
        onFolderNameChange={setFolderName}
        onCreate={handleCreateFolder}
      />

      <NewDrawingModal
        isOpen={showCreateDrawingModal}
        drawingName={drawingName}
        loading={loading}
        onClose={() => {
          setShowCreateDrawingModal(false);
          setDrawingName('');
        }}
        onDrawingNameChange={setDrawingName}
        onCreate={handleCreateDrawing}
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
        transferSettings={editingProject ?? null}
        canManageTransferSettings={canManageTransfer}
        onTransferSettingsChange={handleTransferSettingsChange}
      />

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={cancelDelete}
        title={t('确认删除项目')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={cancelDelete}
              disabled={projectLoading}
            >
              {t('取消')}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={projectLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {projectLoading ? t('删除中...') : t('确认删除')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-lg"
            style={{
              background: 'var(--warning-dim)',
              border: '1px solid var(--warning)',
            }}
          >
            <AlertCircle
              size={20}
              className="flex-shrink-0 mt-0.5"
              style={{ color: 'var(--warning)' }}
            />
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p className="font-semibold mb-1">{t('重要提示')}</p>
              <p style={{ color: 'var(--text-tertiary)' }}>
                {t('删除项目后，项目中的所有文件和数据可能无法恢复。')}
              </p>
            </div>
          </div>
          {projectToDelete && (
            <div className="space-y-2">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('删除项目：')}
              </p>
              <div
                className="p-3 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {projectToDelete.name}
                </p>
                {projectToDelete.description && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {projectToDelete.description}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {t('确定要删除该项目吗？此操作不可恢复。')}
          </p>
        </div>
      </Modal>

      <MembersModal
        isOpen={isMembersModalOpen}
        projectId={editingProject?.id ?? ''}
        onClose={() => {
          setIsMembersModalOpen(false);
          setEditingProject(null);
        }}
      />

      <ProjectRolesModal
        isOpen={isProjectRolesModalOpen}
        projectId={editingProject?.id ?? ''}
        onClose={() => {
          setIsProjectRolesModalOpen(false);
          setEditingProject(null);
        }}
      />

      <OperationHistoryModal
        isOpen={isOperationHistoryModalOpen}
        projectId={editingProject?.id ?? ''}
        projectName={editingProject?.name}
        onClose={() => {
          setIsOperationHistoryModalOpen(false);
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
        roots={transferRoots}
        // 跨项目转移门控：源为项目视图时才启用（个人空间源不做策略拦截）
        sourceProjectId={mode === 'project' ? urlProjectId : undefined}
        operation={moveSourceNode ? 'move' : 'copy'}
        onClose={() => {
          setShowSelectFolderModal(false);
          setMoveSourceNode(null);
          setCopySourceNode(null);
        }}
        onConfirm={handleConfirmMoveOrCopy}
      />

      <KeyboardShortcuts
        onUploadExternalReference={handleUploadExternalReference}
        selectedNode={currentNode}
      />

      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingNode?.name ?? ''}
        onClose={() => {
          setShowDownloadFormatModal(false);
          setDownloadingNode(null);
        }}
        onDownload={handleDownloadWithFormat}
      />

      <BatchDownloadDialog
        isOpen={useBatchDownloadStore((s) => s.isDialogOpen)}
        onClose={() => useBatchDownloadStore.getState().closeDialog()}
        projectId={projectId}
        showToast={showToast}
      />

      <VersionHistoryModal
        isOpen={showVersionHistoryModal}
        node={versionHistoryNode}
        entries={versionHistoryEntries}
        totalCount={versionHistoryTotal}
        loading={versionHistoryLoading}
        error={versionHistoryError}
        openingRevision={openingRevision}
        openingVersionError={openingVersionError}
        onClose={closeVersionHistory}
        onOpenVersion={handleOpenHistoricalVersion}
      />

      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => {
          setShareDialogOpen(false);
          setShareFileId(null);
          setShareFileName('');
        }}
        fileId={shareFileId ?? undefined}
        fileName={shareFileName}
      />
    </>
  );
};
