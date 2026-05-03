import { getApiClient } from './apiClient';

const API = '/api/projects';

export const projectTrashApi = {
  /** 获取项目内回收站内容 */
  getProjectTrash: (projectId: string, params?: { page?: number; limit?: number }) =>
    getApiClient().get(`${API}/${projectId}/trash`, { params }),

  /** 清空项目回收站 */
  clearProjectTrash: (projectId: string) =>
    getApiClient().delete(`${API}/${projectId}/trash`),
};
