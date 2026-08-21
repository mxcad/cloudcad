import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  projectRolesControllerCreateProjectRole,
  projectRolesControllerUpdateProjectRole,
  projectRolesControllerDeleteProjectRole,
  rolesControllerGetProjectRolesByProject,
} from '@/api-sdk';
import type { ProjectRoleDto, CreateProjectRoleDto } from '@/api-sdk';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';

const PROJECT_ROLES_BY_PROJECT_KEY = ['projectRolesByProject'] as const;

/** 从后端 ResponseInterceptor 包装的 { code, message, data, timestamp } 中提取 data */
function unwrapResponse<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw && 'code' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

/**
 * 项目内角色 CRUD（ADR-00XX 项目自治）：
 * 项目创建时从模板复制角色副本，项目内所有角色（含默认角色）完全自治，
 * 一律走项目端点（PROJECT_ROLE_MANAGE / PROJECT_ROLE_PERMISSION_MANAGE）；
 * 项目所有者使用的角色（isOwnerRole）不可删除（后端数据驱动兜底）。
 */
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

  // 创建项目角色（项目权限 PROJECT_ROLE_MANAGE，#262）
  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      permissions: string[];
    }) => {
      const result = await projectRolesControllerCreateProjectRole({
        path: { projectId },
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions as CreateProjectRoleDto['permissions'],
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

  // 更新项目角色（项目权限 PROJECT_ROLE_MANAGE，#262）
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { name: string; description: string; permissions: string[] };
    }) => {
      const result = await projectRolesControllerUpdateProjectRole({
        path: { projectId, id },
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions as CreateProjectRoleDto['permissions'],
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

  // 删除项目角色（项目权限 PROJECT_ROLE_MANAGE，#262）
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await projectRolesControllerDeleteProjectRole({
        path: { projectId, id },
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

  // 注意：deleteMutation 失败故意不进 hookError——删除动作由调用方
  // await 后自行 catch 并用 toast 反馈（见 ProjectRolesModal.confirmDeleteRole）。
  // 若把删除错误挂到这里，TanStack Query 的 mutation error 会持久挂载，
  // 导致弹框顶部错误横幅一直残留、重新打开弹框仍显示。
  const error = queryError
    ? getErrorMessage(queryError) || t('加载项目角色失败')
    : createMutation.isError
      ? getErrorMessage(createMutation.error) || t('创建项目角色失败')
      : updateMutation.isError
        ? getErrorMessage(updateMutation.error) || t('更新项目角色失败')
        : null;

  return {
    roles,
    loading: isLoading,
    isLoading,
    error,
    createRole: async (data: {
      name: string;
      description: string;
      permissions: string[];
    }) => {
      await createMutation.mutateAsync(data);
    },
    updateRole: async (
      id: string,
      data: { name: string; description: string; permissions: string[] }
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
