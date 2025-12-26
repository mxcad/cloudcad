import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileSystemNode } from '../../types/filesystem';

interface RenameModalProps {
  isOpen: boolean;
  editingNode: FileSystemNode | null;
  newName: string;
  loading: boolean;
  onClose: () => void;
  onNameChange: (name: string) => void;
  onRename: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  editingNode,
  newName,
  loading,
  onClose,
  onNameChange,
  onRename,
}) => {
  const handleClose = () => {
    onNameChange('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`重命名${editingNode?.isFolder ? '文件夹' : '文件'}`}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={onRename}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            新名称 *
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onRename()}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
            placeholder="请输入新名称"
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
};

export default RenameModal;
