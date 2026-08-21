import React from 'react';
import { SelectFileModal } from '@/components/modals/SelectFileModal';
import { ShareDialog } from '@/components/modals/ShareDialog';
import { EditExpiryModal } from '@/components/modals/EditExpiryModal';
import { ConfirmRevokeModal } from '@/components/modals/ConfirmRevokeModal';
import { t } from '@/languages';
import type { ShareFileInfo } from '../types';

interface ShareModalsProps {
  showFileSelector: boolean;
  shareFiles: ShareFileInfo[];
  showShareDialog: boolean;
  editTarget: { token: string; expiresAt: string | null } | null;
  showEditModal: boolean;
  showRevokeConfirm: boolean;
  revoking: boolean;
  showBatchRevokeConfirm: boolean;
  batchRevoking: boolean;
  batchCount: number;
  onCloseFileSelector: () => void;
  onSelectFiles: (files: ShareFileInfo[]) => void;
  onCloseShareDialog: () => void;
  onCloseEditModal: () => void;
  onSaveEdit: (expiresAt: string | null) => Promise<void>;
  onCloseRevokeConfirm: () => void;
  onConfirmRevoke: () => Promise<void>;
  onCloseBatchRevokeConfirm: () => void;
  onConfirmBatchRevoke: () => Promise<void>;
}

export const ShareModals: React.FC<ShareModalsProps> = ({
  showFileSelector,
  shareFiles,
  showShareDialog,
  editTarget,
  showEditModal,
  showRevokeConfirm,
  revoking,
  showBatchRevokeConfirm,
  batchRevoking,
  batchCount,
  onCloseFileSelector,
  onSelectFiles,
  onCloseShareDialog,
  onCloseEditModal,
  onSaveEdit,
  onCloseRevokeConfirm,
  onConfirmRevoke,
  onCloseBatchRevokeConfirm,
  onConfirmBatchRevoke,
}) => {
  return (
    <>
      <SelectFileModal
        isOpen={showFileSelector}
        onClose={onCloseFileSelector}
        onConfirm={onSelectFiles}
      />

      {shareFiles.length > 0 && (
        <ShareDialog
          isOpen={showShareDialog}
          onClose={onCloseShareDialog}
          files={shareFiles}
        />
      )}

      {editTarget && (
        <EditExpiryModal
          isOpen={showEditModal}
          onClose={onCloseEditModal}
          currentExpiresAt={editTarget.expiresAt}
          onSave={onSaveEdit}
        />
      )}

      <ConfirmRevokeModal
        isOpen={showRevokeConfirm}
        onClose={onCloseRevokeConfirm}
        onConfirm={onConfirmRevoke}
        loading={revoking}
      />

      <ConfirmRevokeModal
        isOpen={showBatchRevokeConfirm}
        onClose={onCloseBatchRevokeConfirm}
        onConfirm={onConfirmBatchRevoke}
        title={t('批量撤销分享')}
        message={t('确定要撤销选中的 {count} 个分享链接？', {
          count: String(batchCount),
        })}
        loading={batchRevoking}
      />
    </>
  );
};
