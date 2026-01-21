import { apiClient } from './apiClient';

export const adminApi = {
  getStats: () => apiClient.get('/admin/stats'),

  getCacheStats: () => apiClient.get('/admin/permissions/cache'),

  cleanupCache: () => apiClient.post('/admin/permissions/cache/cleanup'),

  clearUserCache: (userId: string) =>
    apiClient.delete(`/admin/permissions/cache/user/${userId}`),

  clearProjectCache: (projectId: string) =>
    apiClient.delete(`/admin/permissions/cache/project/${projectId}`),

  clearFileCache: (fileId: string) =>
    apiClient.delete(`/admin/permissions/cache/file/${fileId}`),

  getUserPermissions: (userId: string) =>
    apiClient.get(`/admin/permissions/user/${userId}`),
};