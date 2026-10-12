import { useCallback } from 'react';
import { rolesControllerCreate, rolesControllerUpdate } from '@/api-sdk';
import type { CreateRoleDto } from '@/api-sdk';
import { t } from '@/languages';
import type { SystemRole } from '../types';
import type { RoleFeedback, LoadingControl } from './types';
import { useRoleForm } from './useRoleForm';

export interface UseSystemRoleCrudOptions {
  load: () => Promise<void>;
  feedback: RoleFeedback;
  onRequestDelete: (id: string) => void;
  loadingControl: LoadingControl;
}

/** 运行时权限字段可能是字符串或 { permission } 对象（API 形状漂移），统一归一为字符串 */
function normalizeSystemRolePermissions(
  permissions: SystemRole['permissions']
): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .map((p: string | { permission: string }) => {
      if (typeof p === 'string') return p;
      if (p && p.permission) return p.permission;
      return null;
    })
    .filter((p): p is string => p !== null);
}

/**
 * 系统角色 CRUD：表单生命周期在 useRoleForm（单点），本 hook 只负责
 * 系统角色端点调用与删除委托。
 */
export function useSystemRoleCrud({
  load,
  feedback,
  onRequestDelete,
  loadingControl,
}: UseSystemRoleCrudOptions) {
  const form = useRoleForm<SystemRole>({
    loadingControl,
    feedback,
    load,
    toFormValues: (role) => ({
      name: role.name,
      desc: role.description || '',
      perms: normalizeSystemRolePermissions(role.permissions),
    }),
    onSave: async (values, editing) => {
      if (editing) {
        await rolesControllerUpdate({
          path: { id: editing.id },
          body: {
            name: values.name,
            description: values.desc,
            permissions: values.perms as CreateRoleDto['permissions'],
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('角色更新成功'));
      } else {
        await rolesControllerCreate({
          body: {
            name: values.name,
            description: values.desc,
            permissions: values.perms as CreateRoleDto['permissions'],
            category: 'CUSTOM',
            level: 0,
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('角色创建成功'));
      }
    },
  });

  const handleDeleteSystemRole = useCallback(
    (id: string) => {
      onRequestDelete(id);
    },
    [onRequestDelete]
  );

  return {
    systemModalOpen: form.modalOpen,
    editingSystemRole: form.editing,
    systemRoleName: form.name,
    systemRoleDesc: form.desc,
    selectedSystemPerms: form.selectedPerms,
    loading: form.loading,
    setSystemModalOpen: form.setModalOpen,
    setSystemRoleName: form.setName,
    setSystemRoleDesc: form.setDesc,
    setSelectedSystemPerms: form.setSelectedPerms,
    handleCreateSystemRole: form.handleCreate,
    handleEditSystemRole: form.handleEdit,
    handleSaveSystemRole: form.handleSave,
    handleDeleteSystemRole,
  };
}
