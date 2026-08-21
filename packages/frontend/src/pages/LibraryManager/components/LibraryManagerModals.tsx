import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { RenameModal } from '../../../components/modals/RenameModal';
import { LibrarySelectFolderModal } from '../../../components/modals/LibrarySelectFolderModal';
import { DownloadFormatModal } from '../../../components/modals/DownloadFormatModal';
import { BatchDownloadDialog } from '../../../components/modals/BatchDownloadDialog';
import { DirectoryImportDialog } from '../../../components/DirectoryImportDialog';
import { useBatchDownloadStore } from '@/stores/useBatchDownloadStore';
import type { UseLibraryModalsReturn } from '../../../hooks/library/useLibraryModals';
import { t } from '@/languages';
import type { FileSystemNode } from '../../../types/filesystem';

type ShowToast = (
  message: string,
  type: 'success' | 'error' | 'warning' | 'info'
) => void;

export interface LibraryManagerModalsProps {
  modals: UseLibraryModalsReturn;
  handleCreateFolder: (name: string) => Promise<void>;
  handleRenameSubmit: (name: string) => Promise<void>;
  handleSelectFolderConfirm: (targetParentId: string) => Promise<void>;
  handleDownloadWithFormat: (
    format: 'dwg' | 'dxf' | 'mxweb' | 'pdf',
    pdfOptions?: {
      width?: string;
      height?: string;
      colorPolicy?: 'mono' | 'color';
    }
  ) => Promise<void>;
  libraryType: 'drawing' | 'block';
  showToast: ShowToast;
  showDirectoryImport: boolean;
  setShowDirectoryImport: (open: boolean) => void;
  targetParentId: string;
  onImportSuccess: (success: boolean) => void;
}

export const LibraryManagerModals: React.FC<LibraryManagerModalsProps> = ({
  modals,
  handleCreateFolder,
  handleRenameSubmit,
  handleSelectFolderConfirm,
  handleDownloadWithFormat,
  libraryType,
  showToast,
  showDirectoryImport,
  setShowDirectoryImport,
  targetParentId,
  onImportSuccess,
}) => {
  const {
    isCreateFolderModalOpen,
    closeCreateFolderModal,
    isRenameModalOpen,
    renamingNode,
    renameName,
    setRenameName,
    closeRenameModal,
    showSelectFolderModal,
    moveSourceNode,
    copySourceNode,
    closeSelectFolderModal,
    showDownloadFormatModal,
    downloadingFileName,
    closeDownloadFormatModal,
  } = modals;

  return (
    <>
      <Modal
        isOpen={isCreateFolderModalOpen}
        onClose={closeCreateFolderModal}
        title={t('新建文件夹')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const name = formData.get('name') as string;
            if (name.trim()) {
              handleCreateFolder(name.trim());
            }
          }}
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="folderName"
                className="block text-sm font-medium mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('文件夹名称')}
              </label>
              <Input
                type="text"
                id="folderName"
                name="name"
                required
                placeholder={t('请输入文件夹名称')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateFolderModal}
              >
                {t('取消')}
              </Button>
              <Button type="submit" variant="primary">
                {t('创建')}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <RenameModal
        isOpen={isRenameModalOpen}
        editingNode={renamingNode as FileSystemNode | null}
        newName={renameName}
        loading={false}
        onClose={closeRenameModal}
        onNameChange={setRenameName}
        onRename={() => handleRenameSubmit(renameName)}
      />

      <LibrarySelectFolderModal
        isOpen={showSelectFolderModal}
        libraryType={libraryType}
        currentNodeId={moveSourceNode?.id || copySourceNode?.id || ''}
        onConfirm={handleSelectFolderConfirm}
        onClose={closeSelectFolderModal}
      />

      <DownloadFormatModal
        isOpen={showDownloadFormatModal}
        fileName={downloadingFileName || ''}
        onClose={closeDownloadFormatModal}
        onDownload={handleDownloadWithFormat}
      />

      <BatchDownloadDialog
        isOpen={useBatchDownloadStore((s) => s.isDialogOpen)}
        onClose={() => useBatchDownloadStore.getState().closeDialog()}
        libraryType={libraryType}
        showToast={showToast}
      />

      <DirectoryImportDialog
        open={showDirectoryImport}
        onClose={() => setShowDirectoryImport(false)}
        targetParentId={targetParentId}
        libraryType={libraryType}
        enableAutoXrefDiscovery
        onSuccess={onImportSuccess}
      />
    </>
  );
};
