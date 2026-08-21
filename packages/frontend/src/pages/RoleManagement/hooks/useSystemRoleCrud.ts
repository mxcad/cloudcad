import { useState, useCallback } from 'react';
import { rolesControllerCreate, rolesControllerUpdate } from '@/api-sdk';
import type { CreateRoleDto } from '@/api-sdk';
import { t } from '@/languages';
import type { SystemRole } from '../types';
import type { RoleFeedback, LoadingControl } from './types';

export interface UseSystemRoleCrudOptions {
  load: () => Promise<void>;
  feedback: RoleFeedback;
  onRequestDelete: (id: string) => void;
  loadingControl: LoadingControl;
}

export function useSystemRoleCrud({
  load,
  feedback,
  onRequestDelete,
  loadingControl,
}: UseSystemRoleCrudOptions) {
  const { loading, setLoading } = loadingControl;
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [editingSystemRole, setEditingSystemRole] = useState<SystemRole | null>(
    null
  );
  const [systemRoleName, setSystemRoleName] = useState('');
  const [systemRoleDesc, setSystemRoleDesc] = useState('');
  const [selectedSystemPerms, setSelectedSystemPerms] = useState<string[]>([]);

  const handleCreateSystemRole = useCallback(() => {
    setEditingSystemRole(null);
    setSystemRoleName('');
    setSystemRoleDesc('');
    setSelectedSystemPerms([]);
    setSystemModalOpen(true);
  }, []);

  const handleEditSystemRole = useCallback((role: SystemRole) => {
    setEditingSystemRole(role);
    setSystemRoleName(role.name);
    setSystemRoleDesc(role.description || '');
    const permissions = Array.isArray(role.permissions)
      ? role.permissions
          .map((p: string | { permission: string }) => {
            if (typeof p === 'string') return p;
            if (p && p.permission) return p.permission;
            return null;
          })
          .filter((p): p is string => p !== null)
      : [];
    setSelectedSystemPerms(permissions);
    setSystemModalOpen(true);
  }, []);

  const handleSaveSystemRole = useCallback(async () => {
    if (!systemRoleName) {
      feedback.showError(t('请输入角色名称'));
      return;
    }

    setLoading(true);
    try {
      if (editingSystemRole) {
        await rolesControllerUpdate({
          path: { id: editingSystemRole.id },
          body: {
            name: systemRoleName,
            description: systemRoleDesc,
            permissions: selectedSystemPerms as CreateRoleDto['permissions'],
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('角色更新成功'));
      } else {
        await rolesControllerCreate({
          body: {
            name: systemRoleName,
            description: systemRoleDesc,
            permissions: selectedSystemPerms as CreateRoleDto['permissions'],
            category: 'CUSTOM',
            level: 0,
          },
          throwOnError: true,
        });
        feedback.showSuccess(t('角色创建成功'));
      }

      setSystemModalOpen(false);
      load();
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
        (error as Error).message ||
        t('保存失败');
      feedback.showError(message);
    } finally {
      setLoading(false);
    }
  }, [
    systemRoleName,
    systemRoleDesc,
    selectedSystemPerms,
    editingSystemRole,
    load,
    feedback,
    setLoading,
  ]);

  const handleDeleteSystemRole = useCallback(
    (id: string) => {
      onRequestDelete(id);
    },
    [onRequestDelete]
  );

  return {
    systemModalOpen,
    editingSystemRole,
    systemRoleName,
    systemRoleDesc,
    selectedSystemPerms,
    loading,
    setSystemModalOpen,
    setSystemRoleName,
    setSystemRoleDesc,
    setSelectedSystemPerms,
    handleCreateSystemRole,
    handleEditSystemRole,
    handleSaveSystemRole,
    handleDeleteSystemRole,
  };
}
