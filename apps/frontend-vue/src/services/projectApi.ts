import { getApiClient } from './apiClient';

const API = '/api/projects';

export type ProjectFilterType = 'all' | 'owned' | 'joined';

export interface CreateProjectDto {
  name: string;
  description?: string;
}

export const projectApi = {
  /** 获取项目列表 */
  list: (
    filter?: ProjectFilterType,
    params?: { page?: number; limit?: number },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().get(API, {
      params: { filter, ...params },
      ...(config?.signal ? { signal: config.signal } : {}),
    }),

  /** 获取已删除项目 */
  getDeleted: (
    params?: { page?: number; limit?: number },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().get(`${API}/deleted`, {
      params,
      ...(config?.signal ? { signal: config.signal } : {}),
    }),

  /** 创建项目 */
  create: (data: CreateProjectDto) =>
    getApiClient().post(API, data),

  /** 获取项目详情 */
  get: (projectId: string) =>
    getApiClient().get(`${API}/${projectId}`),

  /** 更新项目 */
  update: (projectId: string, data: CreateProjectDto) =>
    getApiClient().patch(`${API}/${projectId}`, data),

  /** 删除项目 */
  delete: (projectId: string, permanently: boolean = false) =>
    getApiClient().delete(`${API}/${projectId}`, { data: { permanently } }),

  /** 恢复项目 */
  restore: (projectId: string) =>
    getApiClient().post(`${API}/${projectId}/restore`),

  /** 获取存储信息 */
  getStorageInfo: () =>
    getApiClient().get(`${API}/storage`),

  /** 获取配额 */
  getQuota: (nodeId?: string) =>
    getApiClient().get(`${API}/storage-quota`, { params: nodeId ? { nodeId } : undefined }),

  /** 更新存储配额 */
  updateStorageQuota: (nodeId: string, quota: number) =>
    getApiClient().post(`${API}/storage-quota`, { nodeId, quota }),

  /** 获取当前用户的私人空间 */
  getPersonalSpace: () =>
    getApiClient().get(`${API}/personal-space`),

  /** 获取指定用户的私人空间（管理员） */
  getUserPersonalSpace: (userId: string) =>
    getApiClient().get(`${API}/personal-space/${userId}`),
};
