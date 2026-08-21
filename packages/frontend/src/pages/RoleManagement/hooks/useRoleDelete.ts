import { useState, useCallback } from 'react';
import { rolesControllerRemove } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import type { RoleFeedback, LoadingControl } from './types';

export interface UseRoleDeleteOptions {
  load: () => Promise<void>;
  feedback: RoleFeedback;
  loadingControl: LoadingControl;
}

export function useRoleDelete({
  load,
  feedback,
  loadingControl,
}: UseRoleDeleteOptions) {
  const { setLoading } = loadingControl;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);

  const openDelete = useCallback((id: string) => {
    setRoleToDelete(id);
    setDeleteConfirmOpen(true);
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setRoleToDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!roleToDelete) return;

    setLoading(true);
    try {
      await rolesControllerRemove({
        path: { id: roleToDelete },
        throwOnError: true,
      });
      load();
      feedback.showSuccess(t('角色删除成功'));
    } catch (error) {
      // throwOnError 抛出的是后端 body 对象（带 message 字段），
      // 此前 .response?.data?.message 形状恒 undefined，永远落固定文案
      const message = getErrorMessage(error) || t('删除失败');
      feedback.showError(message);
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
    }
  }, [roleToDelete, load, feedback, setLoading]);

  return {
    deleteConfirmOpen,
    roleToDelete,
    openDelete,
    closeDelete,
    confirmDelete,
  };
}
