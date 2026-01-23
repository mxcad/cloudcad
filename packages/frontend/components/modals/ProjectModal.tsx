import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FileSystemNode } from '../../types/filesystem';

interface ProjectModalProps {
  isOpen: boolean;
  editingProject: FileSystemNode | null;
  formData: { name: string; description: string };
  loading: boolean;
  onClose: () => void;
  onFormDataChange: (data: { name: string; description: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  editingProject,
  formData,
  loading,
  onClose,
  onFormDataChange,
  onSubmit,
}) => {
  const handleClose = () => {
    onFormDataChange({ name: '', description: '' });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={editingProject ? '编辑项目' : '创建新项目'}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button
            onClick={onSubmit}
            disabled={loading || !formData.name.trim()}
          >
            {loading ? '处理中...' : editingProject ? '保存' : '创建'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            名称 *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) =>
              onFormDataChange({ ...formData, name: e.target.value })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg overflow-hidden text-ellipsis whitespace-nowrap"
            placeholder="请输入名称"
            autoFocus
            maxLength={100}
          />
          <p className="text-xs text-slate-500 mt-1">
            {formData.name.length}/100
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            描述
          </label>
          <textarea
            value={formData.description}
            onChange={(e) =>
              onFormDataChange({ ...formData, description: e.target.value })
            }
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none overflow-hidden"
            placeholder="请输入描述（可选）"
            maxLength={500}
          />
          <p className="text-xs text-slate-500 mt-1">
            {formData.description.length}/500
          </p>
        </div>
      </form>
    </Modal>
  );
};

export default ProjectModal;
