import { apiClient } from './apiClient';
import type { AxiosRequestConfig } from 'axios';
import { NodeAccessRole } from '../hooks/usePermission';

export const projectsApi = {
  list: (config?: AxiosRequestConfig) =>
    apiClient.get('/file-system/projects', config),

  create: (data: { name: string; description?: string }) =>
    apiClient.post('/file-system/projects', data),

  get: (projectId: string) =>
    apiClient.get(`/file-system/projects/${projectId}`),

  update: (
    projectId: string,
    data: { name?: string; description?: string; status?: string }
  ) => apiClient.patch(`/file-system/projects/${projectId}`, data),

  delete: (projectId: string) =>
    apiClient.delete(`/file-system/projects/${projectId}`),

  createFolder: (parentId: string, data: { name: string }) =>
    apiClient.post(`/file-system/nodes/${parentId}/folders`, data),

  getNode: (nodeId: string, config?: AxiosRequestConfig) =>
    apiClient.get(`/file-system/nodes/${nodeId}`, config),

  getChildren: (nodeId: string, config?: AxiosRequestConfig) =>
    apiClient.get(`/file-system/nodes/${nodeId}/children`, config),

  updateNode: (nodeId: string, data: { name?: string; description?: string }) =>
    apiClient.patch(`/file-system/nodes/${nodeId}`, data),

  renameNode: (nodeId: string, data: { name: string }) =>
    apiClient.patch(`/file-system/nodes/${nodeId}`, data),

  deleteNode: (nodeId: string) =>
    apiClient.delete(`/file-system/nodes/${nodeId}`),

  moveNode: (nodeId: string, targetParentId: string) =>
    apiClient.post(`/file-system/nodes/${nodeId}/move`, { targetParentId }),

  copyNode: (nodeId: string, targetParentId: string) =>
    apiClient.post(`/file-system/nodes/${nodeId}/copy`, { targetParentId }),

  getStorageInfo: () => apiClient.get('/file-system/storage'),

  getMembers: (projectId: string) =>
    apiClient.get(`/file-system/projects/${projectId}/members`),

  addMember: (projectId: string, data: { userId: string; roleId: string }) =>
    apiClient.post(`/file-system/projects/${projectId}/members`, data),

  removeMember: (projectId: string, userId: string) =>
    apiClient.delete(`/file-system/projects/${projectId}/members/${userId}`),

  updateMember: (projectId: string, userId: string, data: { roleId: string }) =>
    apiClient.patch(
      `/file-system/projects/${projectId}/members/${userId}`,
      data
    ),

  transferOwnership: (projectId: string, newOwnerId: string) =>
    apiClient.post(`/file-system/projects/${projectId}/transfer`, { newOwnerId }),
};
