import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  rolesControllerGetProjectRolesByProject,
  rolesControllerCreateProjectRole,
  rolesControllerUpdateProjectRole,
  rolesControllerDeleteProjectRole,
} from '@/api-sdk';
import type { ProjectRoleDto } from '@/api-sdk';

const PROJECT_ROLES_BY_PROJECT_KEY = ['projectRolesByProject'] as const;

/** 从后端 ResponseInterceptor 包装的 { code, message, data, timestamp } 中提取 data */
function unwrapResponse<T>(raw: unknown): T {
  if (
    raw &&
    typeof raw === 'object' &&
    'data' in raw &&
    'code' in raw
  ) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export const useProjectRoleCRUD = (projectId: string) => {
  const queryClient = useQueryClient();

  // 查询项目角色列表
  const {
    data: roles = [],
    isLoading,
    error: queryError,
  } = useQuery<ProjectRoleDto[]>({
    queryKey: [...PROJECT_ROLES_BY_PROJECT_KEY, projectId],
    queryFn: async () => {
      const result = await rolesControllerGetProjectRolesByProject({
        path: { projectId },
      });
      if (result.error) throw result.error;
      return unwrapResponse<ProjectRoleDto[]>(result.data) || [];
    },
    enabled: !!projectId,
  });

  // 创建角色
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; permissions: string[] }) => {
      const result = await rolesControllerCreateProjectRole({
        body: {
          projectId,
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...PROJECT_ROLES_BY_PROJECT_KEY, projectId],
      });
    },
  });

  // 更新角色
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name: string; description: string; permissions: string[] };
    }) => {
      const result = await rolesControllerUpdateProjectRole({
        path: { id },
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...PROJECT_ROLES_BY_PROJECT_KEY, projectId],
      });
    },
  });

  // 删除角色
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await rolesControllerDeleteProjectRole({
        path: { id },
      });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...PROJECT_ROLES_BY_PROJECT_KEY, projectId],
      });
    },
  });

  const error = queryError
    ? '加载项目角色失败'
    : createMutation.isError
      ? '创建项目角色失败'
      : updateMutation.isError
        ? '更新项目角色失败'
        : deleteMutation.isError
          ? '删除项目角色失败'
          : null;

  return {
    roles,
    loading: isLoading,
    isLoading,
    error,
    systemRoles: roles.filter((r) => r.isSystem),
    customRoles: roles.filter((r) => !r.isSystem),
    createRole: async (data: { name: string; description: string; permissions: string[] }) => {
      await createMutation.mutateAsync(data);
    },
    updateRole: async (
      id: string,
      data: { name: string; description: string; permissions: string[] },
    ) => {
      await updateMutation.mutateAsync({ id, data });
    },
    deleteRole: async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    reloadRoles: () =>
      queryClient.invalidateQueries({
        queryKey: [...PROJECT_ROLES_BY_PROJECT_KEY, projectId],
      }),
  };
};
