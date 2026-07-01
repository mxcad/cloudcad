import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '@/components/ui/Input';
import { t } from '@/languages';

interface CreateFolderModalProps {
  isOpen: boolean;
  folderName: string;
  loading: boolean;
  onClose: () => void;
  onFolderNameChange: (name: string) => void;
  onCreate: () => void;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  folderName,
  loading,
  onClose,
  onFolderNameChange,
  onCreate,
}) => {
  const handleClose = () => {
    onFolderNameChange('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("新建文件夹")}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t("取消")}
          </Button>
          <Button onClick={onCreate}>{t("创建")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t("名称 *")}
          </label>
          <Input
            data-tour="folder-name-input"
            value={folderName}
            onChange={(e) => onFolderNameChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onCreate()}
            placeholder={t("请输入文件夹名称")}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
};

export default CreateFolderModal;
