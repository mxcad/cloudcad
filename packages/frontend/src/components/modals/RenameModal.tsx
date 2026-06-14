import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileNameInput } from '@/components/ui/FileNameInput';
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

  // 获取文件的扩展名（仅文件）
  const getExtension = (node: FileSystemNode | null): string => {
    if (!node || node.isFolder) return '';
    const name = node.name || '';
    const lastDotIndex = name.lastIndexOf('.');
    return lastDotIndex !== -1 ? name.substring(lastDotIndex) : '';
  };

  const extension = getExtension(editingNode);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`重命名${editingNode?.isFolder ? '文件夹' : '文件'}`}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={onRename}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            新名称 *
          </label>
          <FileNameInput
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onRename()}
            placeholder="请输入新名称"
            autoFocus
            suffix={editingNode && !editingNode.isFolder ? extension : undefined}
          />
        </div>
      </div>
    </Modal>
  );
};

export default RenameModal;
