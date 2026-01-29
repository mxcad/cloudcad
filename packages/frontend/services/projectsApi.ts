import { apiClient } from './apiClient';
import type { AxiosRequestConfig } from 'axios';

export const projectsApi = {
  list: (config?: AxiosRequestConfig) =>
    apiClient.get('/file-system/projects', config),

  getDeletedProjects: (config?: AxiosRequestConfig) =>
    apiClient.get('/file-system/projects/trash', config),

  create: (data: { name: string; description?: string }) =>
    apiClient.post('/file-system/projects', data),

  get: (projectId: string) =>
    apiClient.get(`/file-system/projects/${projectId}`),

  update: (
    projectId: string,
    data: { name?: string; description?: string; status?: string }
  ) => apiClient.patch(`/file-system/projects/${projectId}`, data),

  delete: (projectId: string, permanently: boolean = false) =>
    apiClient.delete(`/file-system/projects/${projectId}`, {
      params: { permanently },
    }),

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

  deleteNode: (nodeId: string, permanently: boolean = false) =>
    apiClient.delete(`/file-system/nodes/${nodeId}`, {
      params: { permanently },
    }),

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
    apiClient.post(`/file-system/projects/${projectId}/transfer`, {
      newOwnerId,
    }),

  // ========== 项目权限检查 ==========

  /**
   * 获取用户在项目中的所有权限
   */
  getPermissions: (projectId: string) =>
    apiClient.get(`/file-system/projects/${projectId}/permissions`),

  /**
   * 检查用户是否具有特定权限
   */
  checkPermission: (projectId: string, permission: string) =>
    apiClient.get(`/file-system/projects/${projectId}/permissions/check`, {
      params: { permission },
    }),

  /**
   * 获取用户在项目中的角色
   */
  getRole: (projectId: string) =>
    apiClient.get(`/file-system/projects/${projectId}/role`),

  // ========== 项目内回收站 ==========

  /**
   * 获取项目内回收站内容
   */
  getProjectTrash: (projectId: string, config?: AxiosRequestConfig) =>
    apiClient.get(`/file-system/projects/${projectId}/trash`, config),

  /**
   * 恢复已删除的节点
   */
  restoreNode: (nodeId: string) =>
    apiClient.post(`/file-system/nodes/${nodeId}/restore`),

  /**
   * 清空项目回收站
   */
  clearProjectTrash: (projectId: string) =>
    apiClient.delete(`/file-system/projects/${projectId}/trash`),
};
