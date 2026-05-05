import { useState, useCallback } from 'react';
import {
  usersControllerFindAll,
  usersControllerCreate,
  usersControllerUpdate,
  usersControllerRemove,
  usersControllerDeleteImmediately,
  usersControllerRestore,
} from '@/api-sdk';
import { userCleanupApi } from '@/services/userCleanupApi';
import type { UserResponseDto, UpdateUserDto } from '@/api-sdk';

type RoleDto = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

interface UseUserCRUDReturn {
  users: UserResponseDto[];
  loading: boolean;
  error: string | null;
  roles: RoleDto[];
  mailEnabled: boolean;
  smsEnabled: boolean;
  createUser: (data: any) => Promise<void>;
  updateUser: (id: string, data: UpdateUserDto) => Promise<void>;
  deleteUser: (id: string, immediately?: boolean) => Promise<void>;
  restoreUser: (id: string) => Promise<void>;
  loadUsers: () => Promise<void>;
}

export function useUserCRUD(): UseUserCRUDReturn {
  const [users, setUsers] = useState<UserResponseDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailEnabled, setMailEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: response } = await usersControllerFindAll({ query: {} });
      setUsers((response as any)?.users || []);
    } catch (err) {
      setError('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (data: any) => {
    setLoading(true);
    try {
      await usersControllerCreate({ body: data });
    } catch (err) {
      setError('创建用户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback(async (id: string, data: UpdateUserDto) => {
    setLoading(true);
    try {
      await usersControllerUpdate({ path: { id }, body: data });
    } catch (err) {
      setError('更新用户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteUser = useCallback(async (id: string, immediately?: boolean) => {
    setLoading(true);
    try {
      if (immediately) {
        await usersControllerDeleteImmediately({ path: { id } });
      } else {
        await usersControllerRemove({ path: { id } });
      }
    } catch (err) {
      setError('删除用户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreUser = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await usersControllerRestore({ path: { id } });
    } catch (err) {
      setError('恢复用户失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    users,
    loading,
    error,
    roles,
    mailEnabled,
    smsEnabled,
    createUser,
    updateUser,
    deleteUser,
    restoreUser,
    loadUsers,
  };
}
