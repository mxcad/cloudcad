import { useState, useCallback } from 'react';
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

export interface UseProjectRoleTemplatesOptions {
  load: () => Promise<void>;
  feedback: RoleFeedback;
  loadingControl: LoadingControl;
}

/**
 * 项目角色模板 CRUD（ADR-00XX）：系统管理员维护"创建项目时的默认角色"。
 * 模板只影响新建项目；模板名固定不可改（OWNER 模板按名保底），
 * 可编辑权限/描述；除 PROJECT_OWNER 外可删除（后端兜底）。
 */
export function useProjectRoleTemplates({
  load,
  feedback,
  loadingControl,
}: UseProjectRoleTemplatesOptions) {
  const { loading, setLoading } = loadingControl;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<ProjectRoleTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreateTemplate = useCallback(() => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateDesc('');
    setSelectedPerms([]);
    setModalOpen(true);
  }, []);

  const handleEditTemplate = useCallback((role: ProjectRoleTemplate) => {
    setEditingTemplate(role);
    setTemplateName(role.name);
    setTemplateDesc(role.description || '');
    setSelectedPerms(role.permissions);
    setModalOpen(true);
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName) {
      feedback.showError(t('请输入角色名称'));
      return;
    }

    setLoading(true);
    try {
      if (editingTemplate) {
        // 模板名不可改（后端 projectId=null 维度兜底），只更新描述与权限
        await rolesControllerUpdateProjectRole({
          path: { id: editingTemplate.id },
          body: {
            description: templateDesc,
            permissions: selectedPerms as CreateProjectRoleDto['permissions'],
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('模板更新成功'));
      } else {
        await rolesControllerCreateProjectRole({
          body: {
            name: templateName,
            description: templateDesc,
            permissions: selectedPerms as CreateProjectRoleDto['permissions'],
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('模板创建成功'));
      }

      setModalOpen(false);
      load();
    } catch (error) {
      const message = getErrorMessage(error) || t('保存失败');
      feedback.showError(message);
    } finally {
      setLoading(false);
    }
  }, [
    templateName,
    templateDesc,
    selectedPerms,
    editingTemplate,
    load,
    feedback,
    setLoading,
  ]);

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
      load();
    } catch (error) {
      const message = getErrorMessage(error) || t('删除失败');
      feedback.showError(message);
    } finally {
      setLoading(false);
    }
  }, [deleteId, load, feedback, setLoading]);

  return {
    modalOpen,
    editingTemplate,
    templateName,
    templateDesc,
    selectedPerms,
    deleteId,
    loading,
    setModalOpen,
    setTemplateName,
    setTemplateDesc,
    setSelectedPerms,
    handleCreateTemplate,
    handleEditTemplate,
    handleSaveTemplate,
    handleRequestDelete,
    handleConfirmDelete,
    closeDelete: () => setDeleteId(null),
  };
}
