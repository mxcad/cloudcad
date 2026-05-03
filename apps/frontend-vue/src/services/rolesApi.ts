import { getApiClient } from './apiClient';

export interface RoleDto {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRoleDto extends RoleDto {
  _count?: {
    members: number;
  };
}

export const rolesApi = {
  list: () =>
    getApiClient().get('/api/roles'),

  get: (id: string) =>
    getApiClient().get(`/api/roles/${id}`),

  create: (data: { name: string; description?: string; permissions: string[]; category?: string; level?: number }) =>
    getApiClient().post('/api/roles', data),

  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    getApiClient().patch(`/api/roles/${id}`, data),

  delete: (id: string) =>
    getApiClient().delete(`/api/roles/${id}`),

  getPermissions: (id: string) =>
    getApiClient().get(`/api/roles/${id}/permissions`),

  addPermissions: (id: string, permissions: string[]) =>
    getApiClient().post(`/api/roles/${id}/permissions`, { permissions }),

  removePermissions: (id: string, permissions: string[]) =>
    getApiClient().delete(`/api/roles/${id}/permissions`, { data: { permissions } }),

  getWechatDeactivateQr: () =>
    getApiClient().get<{ token: string; qrUrl: string }>('/api/users/me/deactivate/wechat-qr'),
};

export const projectRolesApi = {
  list: () =>
    getApiClient().get('/api/project-roles'),

  getSystemRoles: () =>
    getApiClient().get('/api/project-roles/system'),

  getByProject: (projectId: string) =>
    getApiClient().get(`/api/project-roles/project/${projectId}`),

  create: (data: { projectId?: string; name: string; description?: string; permissions: string[] }) =>
    getApiClient().post('/api/project-roles', data),

  update: (id: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    getApiClient().patch(`/api/project-roles/${id}`, data),

  delete: (id: string) =>
    getApiClient().delete(`/api/project-roles/${id}`),

  getPermissions: (id: string) =>
    getApiClient().get(`/api/project-roles/${id}/permissions`),

  addPermissions: (id: string, permissions: string[]) =>
    getApiClient().post(`/api/project-roles/${id}/permissions`, { permissions }),

  removePermissions: (id: string, permissions: string[]) =>
    getApiClient().delete(`/api/project-roles/${id}/permissions`, { data: { permissions } }),
};