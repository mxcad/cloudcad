import { getApiClient } from './apiClient';

const API = '/api/projects';

export const projectMemberApi = {
  /** 获取项目成员列表 */
  getMembers: (projectId: string) =>
    getApiClient().get(`${API}/${projectId}/members`),

  /** 添加成员 */
  addMember: (projectId: string, data: { userId: string; projectRoleId: string }) =>
    getApiClient().post(`${API}/${projectId}/members`, data),

  /** 移除成员 */
  removeMember: (projectId: string, userId: string) =>
    getApiClient().delete(`${API}/${projectId}/members/${userId}`),

  /** 更新成员角色 */
  updateMember: (projectId: string, userId: string, data: { projectRoleId: string }) =>
    getApiClient().post(`${API}/${projectId}/members/${userId}`, data),

  /** 转移项目所有权 */
  transferOwnership: (projectId: string, newOwnerId: string) =>
    getApiClient().post(`${API}/${projectId}/transfer-ownership`, { newOwnerId }),
};
