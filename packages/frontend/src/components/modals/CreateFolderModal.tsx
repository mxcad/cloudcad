import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

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
      title="新建文件夹"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={onCreate}>创建</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            名称 *
          </label>
          <input
            type="text"
            value={folderName}
            onChange={(e) => onFolderNameChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onCreate()}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
            placeholder="请输入文件夹名称"
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
};

export default CreateFolderModal;
