import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import {
  usersControllerFindAll,
  usersControllerCreate,
  usersControllerUpdate,
  usersControllerRemove,
  usersControllerDeleteImmediately,
  usersControllerRestore,
  usersControllerUpdateMembership,
  rolesControllerFindAll,
  userCleanupControllerGetStats,
  userCleanupControllerTriggerCleanup,
} from '@/api-sdk';
import type { UpdateUserDto, CreateUserDto } from '@/api-sdk';
import { t } from '@/languages';

const USERS_KEY = ['users'] as const;
const ROLES_KEY = ['roles'] as const;
const CLEANUP_STATS_KEY = ['user-cleanup-stats'] as const;

export interface UserSearchParams {
  search?: string;
  roleId?: string;
  status?: string;
  tierLevel?: string;
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
    isFetching,
    error: queryError,
  } = useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: async () => {
      const result = await usersControllerFindAll({ query: params || {} });
      if (result.error) throw result.error;
      return result.data;
    },
    placeholderData: keepPreviousData,
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

  // SDK 默认不抛错：非 2xx 响应以 { data, error } 返回。mutationFn 必须检查 error 并抛出，
  // 否则 mutateAsync 恒 resolve，界面会"保存失败仍显示成功"（历史 bug：编辑/注销/会员更新）。
  // 命名避开 utils/mxcadUploadErrors.ts 的同名 throwOnSdkError（MxCAD 专属语义）
  const throwIfSdkError = <T extends { data?: unknown; error?: unknown }>(
    result: T
  ): T['data'] => {
    if (result.error) throw result.error;
    return result.data;
  };

  const createMutation = useMutation({
    mutationFn: async (data: CreateUserDto) =>
      throwIfSdkError(await usersControllerCreate({ body: data })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserDto }) =>
      throwIfSdkError(
        await usersControllerUpdate({ path: { id }, body: data })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({
      id,
      immediately,
    }: {
      id: string;
      immediately?: boolean;
    }) =>
      immediately
        ? throwIfSdkError(
            await usersControllerDeleteImmediately({ path: { id } })
          )
        : throwIfSdkError(await usersControllerRemove({ path: { id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) =>
      throwIfSdkError(await usersControllerRestore({ path: { id } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const membershipMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { tierLevel: number; expiresAt?: string; adjustDays?: number };
    }) =>
      throwIfSdkError(
        await usersControllerUpdateMembership({ path: { id }, body: data })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  // 该 error 仅表示「列表加载失败」；创建/编辑/删除/恢复/会员等 mutation 错误
  // 不再混入此处 —— 由调用方在对应弹窗/toast 中展示（mutateAsync 抛出的 SDK error
  // 在调用方 catch 中取得到），否则列表非空时错误被渲染成表格底部失败条、
  // 弹窗打开时用户完全看不到任何提示（历史 bug：创建用户重名无提示）。
  const error = queryError ? t('加载用户列表失败') : null;

  return {
    users,
    totalUsers,
    // 翻页期间 keepPreviousData 占位 isLoading=false，须含 isFetching：
    // 否则滚动控制器 loading 恒 false（边界阻塞/链式预载/displayedPage 延迟全部失效，
    // 页码抢先于数据 → 「页码快速滚动」）
    loading:
      isLoading ||
      isFetching ||
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      restoreMutation.isPending ||
      membershipMutation.isPending,
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
    updateUserMembership: async (
      id: string,
      data: { tierLevel: number; expiresAt?: string; adjustDays?: number }
    ) => {
      await membershipMutation.mutateAsync({ id, data });
    },
    loadUsers: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
    triggerCleanup: async (delayDays?: number) => {
      const result = await userCleanupControllerTriggerCleanup({
        body: { delayDays },
      });
      if (result.error) throw result.error;
      queryClient.invalidateQueries({ queryKey: CLEANUP_STATS_KEY });
      return result.data;
    },
  };
}
