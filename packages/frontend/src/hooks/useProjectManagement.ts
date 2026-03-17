///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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

  // 删除确认模态框状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<FileSystemNode | null>(
    null
  );
  const [deleteCallback, setDeleteCallback] = useState<
    ((id: string, name: string) => Promise<void>) | null
  >(null);

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
    (
      project: FileSystemNode,
      deleteProject: (id: string, name: string) => Promise<void>
    ) => {
      setProjectToDelete(project);
      setDeleteCallback(() => deleteProject);
      setDeleteConfirmOpen(true);
    },
    []
  );

  const confirmDelete = useCallback(async () => {
    if (!projectToDelete || !deleteCallback) return;

    setLoading(true);
    try {
      await deleteCallback(projectToDelete.id, projectToDelete.name);
      options.onProjectDeleted?.();
      setDeleteConfirmOpen(false);
      setProjectToDelete(null);
      setDeleteCallback(null);
    } catch (error) {
      const errorMessage = (error as Error).message || '删除项目失败';
      options.showToast?.(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectToDelete, deleteCallback, options]);

  const cancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setProjectToDelete(null);
    setDeleteCallback(null);
  }, []);

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
    // 删除确认模态框
    deleteConfirmOpen,
    projectToDelete,
    confirmDelete,
    cancelDelete,
  };
}

export default useProjectManagement;
