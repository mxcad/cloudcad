import { apiClient } from './apiClient';

// 系统角色 API
export const rolesApi = {
  list: () => apiClient.get('/roles'),

  get: (id: string) => apiClient.get(`/roles/${id}`),

  create: (data: {
    name: string;
    description?: string;
    permissions: string[];
    category?: string;
    level?: number;
  }) => apiClient.post('/roles', data),

  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
      category?: string;
      level?: number;
    }
  ) => apiClient.patch(`/roles/${id}`, data),

  delete: (id: string) => apiClient.delete(`/roles/${id}`),

  getPermissions: (id: string) => apiClient.get(`/roles/${id}/permissions`),

  addPermissions: (id: string, permissions: string[]) =>
    apiClient.post(`/roles/${id}/permissions`, { permissions }),

  removePermissions: (id: string, permissions: string[]) =>
    apiClient.delete(`/roles/${id}/permissions`, { data: { permissions } }),
};

// 项目角色 API
export const projectRolesApi = {
  list: () => apiClient.get('/roles/project-roles/all'),

  get: (id: string) => apiClient.get(`/roles/project-roles/${id}`),

  create: (data: {
    ownerId: string;
    name: string;
    description?: string;
    permissions: string[];
  }) => apiClient.post('/roles/project-roles', data),

  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
    }
  ) => apiClient.patch(`/roles/project-roles/${id}`, data),

  delete: (id: string) => apiClient.delete(`/roles/project-roles/${id}`),

  getPermissions: (id: string) =>
    apiClient.get(`/roles/project-roles/${id}/permissions`),

  addPermissions: (id: string, permissions: string[]) =>
    apiClient.post(`/roles/project-roles/${id}/permissions`, { permissions }),

  removePermissions: (id: string, permissions: string[]) =>
    apiClient.delete(`/roles/project-roles/${id}/permissions`, {
      data: { permissions },
    }),
};
