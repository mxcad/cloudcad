import { ref, computed } from 'vue';
import { projectsApi } from '@/services/projectsApi';
import type { FileSystemNode } from './useFileSystemData';

export interface UseProjectManagementOptions {
  onProjectCreated?: () => void;
  onProjectUpdated?: () => void;
  onProjectDeleted?: () => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export interface ProjectFormData {
  name: string;
  description: string;
}

export function useProjectManagement(options: UseProjectManagementOptions = {}) {
  const isModalOpen = ref(false);
  const editingProject = ref<FileSystemNode | null>(null);
  const formData = ref<ProjectFormData>({
    name: '',
    description: '',
  });
  const loading = ref(false);

  const deleteConfirmOpen = ref(false);
  const projectToDelete = ref<FileSystemNode | null>(null);
  const deleteCallback = ref<((id: string, name: string) => Promise<void>) | null>(null);

  function openCreateModal(): void {
    editingProject.value = null;
    formData.value = { name: '', description: '' };
    isModalOpen.value = true;
  }

  function openEditModal(project: FileSystemNode): void {
    editingProject.value = project;
    formData.value = {
      name: project.name,
      description: project.description || '',
    };
    isModalOpen.value = true;
  }

  function closeModal(): void {
    isModalOpen.value = false;
    editingProject.value = null;
    formData.value = { name: '', description: '' };
  }

  async function handleCreate(createProject: (name: string, description: string) => Promise<void>): Promise<void> {
    if (!formData.value.name.trim()) return;

    loading.value = true;
    try {
      await createProject(formData.value.name.trim(), formData.value.description.trim());
      options.onProjectCreated?.();
      closeModal();
    } catch (error) {
      const errorMessage = (error as Error).message || '创建项目失败';
      options.showToast?.(errorMessage, 'error');
    } finally {
      loading.value = false;
    }
  }

  async function handleUpdate(
    updateProject: (id: string, data: { name: string; description?: string }) => Promise<void>
  ): Promise<void> {
    if (!editingProject.value || !formData.value.name.trim()) return;

    loading.value = true;
    try {
      await updateProject(editingProject.value.id, {
        name: formData.value.name.trim(),
        description: formData.value.description.trim() || undefined,
      });
      options.onProjectUpdated?.();
      closeModal();
    } catch (error) {
      const errorMessage = (error as Error).message || '更新项目失败';
      options.showToast?.(errorMessage, 'error');
    } finally {
      loading.value = false;
    }
  }

  function handleDelete(
    project: FileSystemNode,
    deleteProject: (id: string, name: string) => Promise<void>
  ): void {
    projectToDelete.value = project;
    deleteCallback.value = deleteProject;
    deleteConfirmOpen.value = true;
  }

  async function confirmDelete(): Promise<void> {
    if (!projectToDelete.value || !deleteCallback.value) return;

    loading.value = true;
    try {
      await deleteCallback.value(projectToDelete.value.id, projectToDelete.value.name);
      options.onProjectDeleted?.();
      deleteConfirmOpen.value = false;
      projectToDelete.value = null;
      deleteCallback.value = null;
    } catch (error) {
      const errorMessage = (error as Error).message || '删除项目失败';
      options.showToast?.(errorMessage, 'error');
    } finally {
      loading.value = false;
    }
  }

  function cancelDelete(): void {
    deleteConfirmOpen.value = false;
    projectToDelete.value = null;
    deleteCallback.value = null;
  }

  return {
    isModalOpen,
    editingProject,
    formData,
    loading,
    openCreateModal,
    openEditModal,
    closeModal,
    setFormData: (data: ProjectFormData) => { formData.value = data; },
    handleCreate,
    handleUpdate,
    handleDelete,
    deleteConfirmOpen,
    projectToDelete,
    confirmDelete,
    cancelDelete,
  };
}
