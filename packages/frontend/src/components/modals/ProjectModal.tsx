import React from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FileSystemNode } from '../../types/filesystem';
import { t } from '@/languages';

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
      title={editingProject ? t('编辑项目') : t('创建新项目')}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t("取消")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={loading || !(formData?.name || '').trim()}
            data-tour="project-create-submit"
          >
            {loading ? t('处理中...') : editingProject ? t('保存') : t('创建')}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
             {t("名称 *")}
          </label>
          <Input
            required
            value={formData.name}
            onChange={(e) =>
              onFormDataChange({ ...formData, name: e.target.value })
            }
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            placeholder="请输入名称"
            autoFocus
            maxLength={100}
            data-tour="project-name-input"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {formData.name.length}/100
          </p>
        </div>
        <div>
          <label className="block font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            描述
          </label>
          <Textarea
            value={formData.description}
            onChange={(e) =>
              onFormDataChange({ ...formData, description: e.target.value })
            }
            rows={3}
            resize="none"
            placeholder="请输入描述（可选）"
            maxLength={500}
            data-tour="project-desc-input"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {formData.description.length}/500
          </p>
        </div>
      </form>
    </Modal>
  );
};

export default ProjectModal;
