import { getApiClient } from './apiClient';

const API = '/api/projects';

export const projectPermissionApi = {
  /** 获取用户在项目中的所有权限 */
  getPermissions: (projectId: string) =>
    getApiClient().get(`${API}/${projectId}/permissions`),

  /** 检查用户是否具有特定权限 */
  checkPermission: (projectId: string, permission: string) =>
    getApiClient().post(`${API}/${projectId}/permissions/check`, { permission }),

  /** 获取用户在项目中的角色 */
  getRole: (projectId: string) =>
    getApiClient().get(`${API}/${projectId}/role`),
};
