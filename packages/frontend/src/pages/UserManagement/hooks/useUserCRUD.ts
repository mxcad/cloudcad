import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  usersControllerFindAll,
  usersControllerCreate,
  usersControllerUpdate,
  usersControllerRemove,
  usersControllerDeleteImmediately,
  usersControllerRestore,
} from '@/api-sdk';
import type { UserResponseDto, UpdateUserDto } from '@/api-sdk';

const USERS_KEY = ['users'] as const;

export function useUserCRUD() {
  const queryClient = useQueryClient();

  const {
    data: users = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => {
      const result = await usersControllerFindAll({ query: {} });
      if (result.error) throw result.error;
      return result.data?.users || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => usersControllerCreate({ body: data }),
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
    loading: isLoading,
    isLoading,
    error,
    // TODO: extract to useSystemConfig hook in next slice
    roles: [] as any[],
    mailEnabled: false,
    smsEnabled: false,
    createUser: async (data: any) => {
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
  };
}
