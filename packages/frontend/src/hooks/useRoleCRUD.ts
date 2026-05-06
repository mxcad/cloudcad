import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  rolesControllerFindAll,
  rolesControllerCreate,
  rolesControllerUpdate,
  rolesControllerRemove,
  rolesControllerCreateProjectRole,
  rolesControllerGetSystemProjectRoles,
  rolesControllerUpdateProjectRole,
  rolesControllerDeleteProjectRole,
  authControllerGetProfile,
} from '@/api-sdk';
import type { UserResponseDto, ProjectRoleDto, ProjectRolePermissionDto } from '@/api-sdk';

export type SystemRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectRole = {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  _count: {
    members: number;
  };
};

const SYSTEM_ROLES_KEY = ['systemRoles'] as const;
const PROJECT_ROLES_KEY = ['projectRoles'] as const;
const CURRENT_USER_KEY = ['currentUser'] as const;

function mapProjectRoles(roles: ProjectRoleDto[]): ProjectRole[] {
  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p: ProjectRolePermissionDto | string) =>
      typeof p === 'string' ? p : (p as ProjectRolePermissionDto).permission || '',
    ),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    _count: {
      members: (role._count as any)?.members || 0,
    },
  }));
}

export function useRoleCRUD() {
  const queryClient = useQueryClient();

  const {
    data: systemRoles = [],
    isLoading: isSystemRolesLoading,
    error: systemRolesError,
  } = useQuery({
    queryKey: SYSTEM_ROLES_KEY,
    queryFn: async () => {
      const result = await rolesControllerFindAll();
      if (result.error) throw result.error;
      return (result.data || []) as SystemRole[];
    },
  });

  const {
    data: projectRoles = [],
    isLoading: isProjectRolesLoading,
    error: projectRolesError,
  } = useQuery({
    queryKey: PROJECT_ROLES_KEY,
    queryFn: async () => {
      const result = await rolesControllerGetSystemProjectRoles();
      if (result.error) throw result.error;
      return mapProjectRoles(result.data || []);
    },
  });

  const {
    data: currentUser,
    isLoading: isCurrentUserLoading,
    error: currentUserError,
  } = useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: async () => {
      const result = await authControllerGetProfile();
      if (result.error) throw result.error;
      return result.data as UserResponseDto;
    },
  });

  const createSystemRoleMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissions: string[] }) =>
      rolesControllerCreate({
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
          category: 'CUSTOM',
          level: 0,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SYSTEM_ROLES_KEY }),
  });

  const updateSystemRoleMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name: string; description: string; permissions: string[] };
    }) =>
      rolesControllerUpdate({
        path: { id },
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SYSTEM_ROLES_KEY }),
  });

  const deleteSystemRoleMutation = useMutation({
    mutationFn: (id: string) => rolesControllerRemove({ path: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SYSTEM_ROLES_KEY }),
  });

  const createProjectRoleMutation = useMutation({
    mutationFn: (data: { name: string; description: string; permissions: string[] }) =>
      rolesControllerCreateProjectRole({
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECT_ROLES_KEY }),
  });

  const updateProjectRoleMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name: string; description: string; permissions: string[] };
    }) =>
      rolesControllerUpdateProjectRole({
        path: { id },
        body: {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECT_ROLES_KEY }),
  });

  const deleteProjectRoleMutation = useMutation({
    mutationFn: (id: string) => rolesControllerDeleteProjectRole({ path: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECT_ROLES_KEY }),
  });

  const error =
    systemRolesError
      ? '加载系统角色失败'
      : projectRolesError
        ? '加载项目角色失败'
        : currentUserError
          ? '获取用户信息失败'
          : createSystemRoleMutation.isError
            ? '创建系统角色失败'
            : updateSystemRoleMutation.isError
              ? '更新系统角色失败'
              : deleteSystemRoleMutation.isError
                ? '删除系统角色失败'
                : createProjectRoleMutation.isError
                  ? '创建项目角色失败'
                  : updateProjectRoleMutation.isError
                    ? '更新项目角色失败'
                    : deleteProjectRoleMutation.isError
                      ? '删除项目角色失败'
                      : null;

  const isLoading = isSystemRolesLoading || isProjectRolesLoading || isCurrentUserLoading;

  return {
    systemRoles,
    projectRoles,
    currentUser,
    loading: isLoading,
    isLoading,
    error,
    createSystemRole: async (data: { name: string; description: string; permissions: string[] }) => {
      await createSystemRoleMutation.mutateAsync(data);
    },
    updateSystemRole: async (
      id: string,
      data: { name: string; description: string; permissions: string[] },
    ) => {
      await updateSystemRoleMutation.mutateAsync({ id, data });
    },
    deleteSystemRole: async (id: string) => {
      await deleteSystemRoleMutation.mutateAsync(id);
    },
    createProjectRole: async (data: { name: string; description: string; permissions: string[] }) => {
      await createProjectRoleMutation.mutateAsync(data);
    },
    updateProjectRole: async (
      id: string,
      data: { name: string; description: string; permissions: string[] },
    ) => {
      await updateProjectRoleMutation.mutateAsync({ id, data });
    },
    deleteProjectRole: async (id: string) => {
      await deleteProjectRoleMutation.mutateAsync(id);
    },
    reloadSystemRoles: () => queryClient.invalidateQueries({ queryKey: SYSTEM_ROLES_KEY }),
    reloadProjectRoles: () => queryClient.invalidateQueries({ queryKey: PROJECT_ROLES_KEY }),
    reloadCurrentUser: () => queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  };
}