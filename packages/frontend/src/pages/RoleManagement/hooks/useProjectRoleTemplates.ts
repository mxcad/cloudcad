import { useCallback, useState } from 'react';
import {
  rolesControllerCreateProjectRole,
  rolesControllerUpdateProjectRole,
  rolesControllerDeleteProjectRole,
} from '@/api-sdk';
import type { CreateProjectRoleDto } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import type { ProjectRoleTemplate } from '../types';
import type { RoleFeedback, LoadingControl } from './types';
import { useRoleForm } from './useRoleForm';

export interface UseProjectRoleTemplatesOptions {
  load: () => Promise<void>;
  feedback: RoleFeedback;
  loadingControl: LoadingControl;
}

/**
 * 项目角色模板 CRUD（ADR-00XX）：系统管理员维护"创建项目时的默认角色"。
 * 模板只影响新建项目；模板名固定不可改（OWNER 模板按名保底），
 * 可编辑权限/描述；除 PROJECT_OWNER 外可删除（后端兜底）。
 * 表单生命周期在 useRoleForm（单点），本 hook 只负责模板端点调用与删除确认流。
 */
export function useProjectRoleTemplates({
  load,
  feedback,
  loadingControl,
}: UseProjectRoleTemplatesOptions) {
  const { setLoading } = loadingControl;
  const form = useRoleForm<ProjectRoleTemplate>({
    loadingControl,
    feedback,
    load,
    toFormValues: (role) => ({
      name: role.name,
      desc: role.description || '',
      perms: role.permissions,
    }),
    onSave: async (values, editing) => {
      if (editing) {
        // 模板名不可改（后端 projectId=null 维度兜底），只更新描述与权限
        await rolesControllerUpdateProjectRole({
          path: { id: editing.id },
          body: {
            description: values.desc,
            permissions: values.perms as CreateProjectRoleDto['permissions'],
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('模板更新成功'));
      } else {
        await rolesControllerCreateProjectRole({
          body: {
            name: values.name,
            description: values.desc,
            permissions: values.perms as CreateProjectRoleDto['permissions'],
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('模板创建成功'));
      }
    },
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleRequestDelete = useCallback((id: string) => {
    setDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteId) return;

    setLoading(true);
    try {
      await rolesControllerDeleteProjectRole({
        path: { id: deleteId },
        throwOnError: true,
      });
      feedback.showSuccess(t('模板删除成功'));
      setDeleteId(null);
      await load();
    } catch (error) {
      const message = getErrorMessage(error) || t('删除失败');
      feedback.showError(message);
    } finally {
      setLoading(false);
    }
  }, [deleteId, load, feedback, setLoading]);

  return {
    modalOpen: form.modalOpen,
    editingTemplate: form.editing,
    templateName: form.name,
    templateDesc: form.desc,
    selectedPerms: form.selectedPerms,
    deleteId,
    loading: form.loading,
    setModalOpen: form.setModalOpen,
    setTemplateName: form.setName,
    setTemplateDesc: form.setDesc,
    setSelectedPerms: form.setSelectedPerms,
    handleCreateTemplate: form.handleCreate,
    handleEditTemplate: form.handleEdit,
    handleSaveTemplate: form.handleSave,
    handleRequestDelete,
    handleConfirmDelete,
    closeDelete: () => setDeleteId(null),
  };
}
