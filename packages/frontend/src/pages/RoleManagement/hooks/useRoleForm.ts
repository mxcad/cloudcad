import { useCallback, useRef, useState } from 'react';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import type { RoleFeedback, LoadingControl } from './types';

export interface RoleFormValues {
  name: string;
  desc: string;
  perms: string[];
}

export interface UseRoleFormOptions<T> {
  loadingControl: LoadingControl;
  feedback: RoleFeedback;
  /** 保存成功后的列表刷新 */
  load: () => Promise<void> | void;
  /** 编辑时把角色行映射为表单值（各角色类型权限形状不同，映射归调用方） */
  toFormValues: (role: T) => RoleFormValues;
  /**
   * 保存（创建/更新由调用方按 editing 分支调各自端点并弹成功提示）。
   * 抛错由本 hook 统一反馈（getErrorMessage 单一出口），调用方不要自行 catch。
   */
  onSave: (values: RoleFormValues, editing: T | null) => Promise<void>;
}

/**
 * 角色表单生命周期单点：五元组状态（modalOpen/editing/name/desc/perms）+
 * 创建重置序列 + 编辑填充 + 「校验→保存→收尾」骨架。
 * useSystemRoleCrud 与 useProjectRoleTemplates 共用，禁止再各自声明副本。
 */
export function useRoleForm<T extends { id: string }>(
  options: UseRoleFormOptions<T>
) {
  const { loading, setLoading } = options.loadingControl;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const handleCreate = useCallback(() => {
    setEditing(null);
    setName('');
    setDesc('');
    setSelectedPerms([]);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((role: T) => {
    const values = optionsRef.current.toFormValues(role);
    setEditing(role);
    setName(values.name);
    setDesc(values.desc);
    setSelectedPerms(values.perms);
    setModalOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name) {
      optionsRef.current.feedback.showError(t('请输入角色名称'));
      return;
    }

    setLoading(true);
    try {
      await optionsRef.current.onSave(
        { name, desc, perms: selectedPerms },
        editing
      );
      setModalOpen(false);
      await optionsRef.current.load();
    } catch (error) {
      optionsRef.current.feedback.showError(
        getErrorMessage(error) || t('保存失败')
      );
    } finally {
      setLoading(false);
    }
  }, [name, desc, selectedPerms, editing, setLoading]);

  return {
    modalOpen,
    editing,
    name,
    desc,
    selectedPerms,
    loading,
    setModalOpen,
    setName,
    setDesc,
    setSelectedPerms,
    handleCreate,
    handleEdit,
    handleSave,
  };
}
