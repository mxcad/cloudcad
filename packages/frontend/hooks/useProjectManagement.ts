import { useState, useCallback } from 'react';
import { FileSystemNode } from '../types/filesystem';

interface UseProjectManagementOptions {
  onProjectCreated?: () => void;
  onProjectUpdated?: () => void;
  onProjectDeleted?: () => void;
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void;
}

interface ProjectFormData {
  name: string;
  description: string;
}

export function useProjectManagement(
  options: UseProjectManagementOptions = {}
) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<FileSystemNode | null>(
    null
  );
  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);

  const openCreateModal = useCallback(() => {
    setEditingProject(null);
    setFormData({ name: '', description: '' });
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((project: FileSystemNode) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
    });
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingProject(null);
    setFormData({ name: '', description: '' });
  }, []);

  const handleCreate = useCallback(
    async (
      createProject: (name: string, description: string) => Promise<void>
    ) => {
      if (!formData.name.trim()) return;

      setLoading(true);
      try {
        await createProject(formData.name.trim(), formData.description.trim());
        options.onProjectCreated?.();
        closeModal();
      } catch (error) {
        const errorMessage = (error as Error).message || '创建项目失败';
        options.showToast?.(errorMessage, 'error');
      } finally {
        setLoading(false);
      }
    },
    [formData, options, closeModal]
  );

  const handleUpdate = useCallback(
    async (
      updateProject: (
        id: string,
        data: { name: string; description?: string }
      ) => Promise<void>
    ) => {
      if (!editingProject || !formData.name.trim()) return;

      setLoading(true);
      try {
        await updateProject(editingProject.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
        });
        options.onProjectUpdated?.();
        closeModal();
      } catch (error) {
        const errorMessage = (error as Error).message || '更新项目失败';
        options.showToast?.(errorMessage, 'error');
      } finally {
        setLoading(false);
      }
    },
    [editingProject, formData, options, closeModal]
  );

  const handleDelete = useCallback(
    async (
      project: FileSystemNode,
      deleteProject: (id: string, name: string) => Promise<void>
    ) => {
      if (
        window.confirm(`确定要删除项目"${project.name}"吗？此操作不可恢复。`)
      ) {
        try {
          await deleteProject(project.id, project.name);
          options.onProjectDeleted?.();
        } catch (error) {
          const errorMessage = (error as Error).message || '删除项目失败';
          options.showToast?.(errorMessage, 'error');
        }
      }
    },
    [options]
  );

  return {
    isModalOpen,
    editingProject,
    setEditingProject,
    formData,
    loading,
    openCreateModal,
    openEditModal,
    closeModal,
    setFormData,
    handleCreate,
    handleUpdate,
    handleDelete,
  };
}

export default useProjectManagement;
