import { useState, useCallback } from 'react';
import { usersApi } from '@/services/usersApi';
import { rolesApi } from '@/services/rolesApi';
import { runtimeConfigApi } from '@/services/runtimeConfigApi';
import { projectApi } from '@/services/projectApi';
import { userCleanupApi } from '@/services/userCleanupApi';
import { UserResponseDto, UpdateUserDto } from '@/types/api-client';

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
      const response = await usersApi.list({});
      setUsers(response.data?.users || []);
    } catch (err) {
      setError('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(async (data: any) => {
    setLoading(true);
    try {
      await usersApi.create(data);
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
      await usersApi.update(id, data);
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
        await usersApi.deleteImmediately(id);
      } else {
        await usersApi.delete(id);
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
      await usersApi.restore(id);
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
