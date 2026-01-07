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
          {editingNode && !editingNode.isFolder && extension ? (
            // 文件：显示输入框 + 扩展名
            <div className="flex items-center">
              <input
                type="text"
                value={newName}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && onRename()}
                className="flex-1 px-4 py-2.5 border border-slate-300 rounded-l-lg"
                placeholder="请输入新名称"
                autoFocus
              />
              <div className="px-4 py-2.5 bg-slate-100 border border-l-0 border-slate-300 rounded-r-lg text-slate-600">
                {extension}
              </div>
            </div>
          ) : (
            // 文件夹：显示完整输入框
            <input
              type="text"
              value={newName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onRename()}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg"
              placeholder="请输入新名称"
              autoFocus
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RenameModal;
