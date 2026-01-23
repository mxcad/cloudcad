import { apiClient } from './apiClient';

export const rolesApi = {
  list: () => apiClient.get('/roles'),

  get: (id: string) => apiClient.get(`/roles/${id}`),

  create: (data: {
    name: string;
    description?: string;
    permissions: string[];
  }) => apiClient.post('/roles', data),

  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
    }
  ) => apiClient.patch(`/roles/${id}`, data),

  delete: (id: string) => apiClient.delete(`/roles/${id}`),
};
