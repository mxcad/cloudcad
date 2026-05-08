import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  usersControllerFindAll,
  usersControllerCreate,
  usersControllerUpdate,
  usersControllerRemove,
  usersControllerDeleteImmediately,
  usersControllerRestore,
  rolesControllerFindAll,
  userCleanupControllerGetStats,
  userCleanupControllerTriggerCleanup,
  fileSystemControllerGetStorageQuota,
  fileSystemControllerUpdateStorageQuota,
} from '@/api-sdk';
import type { UpdateUserDto, CreateUserDto } from '@/api-sdk';

const USERS_KEY = ['users'] as const;
const ROLES_KEY = ['roles'] as const;
const CLEANUP_STATS_KEY = ['user-cleanup-stats'] as const;

export interface UserSearchParams {
  search?: string;
  roleId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export function useUserCRUD(params?: UserSearchParams) {
  const queryClient = useQueryClient();

  const {
    data: usersResult,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: async () => {
      const result = await usersControllerFindAll({ query: params || {} });
      if (result.error) throw result.error;
      return result.data;
    },
  });

  const users = usersResult?.users || [];
  const totalUsers = usersResult?.total || 0;

  const { data: roles = [] } = useQuery({
    queryKey: ROLES_KEY,
    queryFn: async () => {
      const result = await rolesControllerFindAll();
      if (result.error) throw result.error;
      return result.data || [];
    },
  });

  const { data: cleanupStats } = useQuery({
    queryKey: CLEANUP_STATS_KEY,
    queryFn: async () => {
      const result = await userCleanupControllerGetStats();
      if (result.error) throw result.error;
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateUserDto) => usersControllerCreate({ body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserDto }) =>
      usersControllerUpdate({ path: { id }, body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, immediately }: { id: string; immediately?: boolean }) =>
      immediately
        ? usersControllerDeleteImmediately({ path: { id } })
        : usersControllerRemove({ path: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => usersControllerRestore({ path: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const error =
    queryError
      ? '加载用户列表失败'
      : createMutation.isError
        ? '创建用户失败'
        : updateMutation.isError
          ? '更新用户失败'
          : deleteMutation.isError
            ? '删除用户失败'
            : restoreMutation.isError
              ? '恢复用户失败'
              : null;

  return {
    users,
    totalUsers,
    loading: isLoading,
    isLoading,
    error,
    roles: roles.map((r) => ({ id: r.id, name: r.name, isSystem: r.isSystem })),
    mailEnabled: false,
    smsEnabled: false,
    cleanupStats,
    createUser: async (data: CreateUserDto) => {
      await createMutation.mutateAsync(data);
    },
    updateUser: async (id: string, data: UpdateUserDto) => {
      await updateMutation.mutateAsync({ id, data });
    },
    deleteUser: async (id: string, immediately?: boolean) => {
      await deleteMutation.mutateAsync({ id, immediately });
    },
    restoreUser: async (id: string) => {
      await restoreMutation.mutateAsync(id);
    },
    loadUsers: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
    triggerCleanup: async (delayDays?: number) => {
      const result = await userCleanupControllerTriggerCleanup({ body: { delayDays } });
      if (result.error) throw result.error;
      queryClient.invalidateQueries({ queryKey: CLEANUP_STATS_KEY });
      return result.data;
    },
    getStorageQuota: async (userId: string) => {
      const result = await fileSystemControllerGetStorageQuota({ query: { userId } });
      if (result.error) throw result.error;
      return result.data;
    },
    updateStorageQuota: async (nodeId: string, quotaGB: number) => {
      const result = await fileSystemControllerUpdateStorageQuota({ body: { nodeId, quota: quotaGB } });
      if (result.error) throw result.error;
      return result.data;
    },
  };
}
