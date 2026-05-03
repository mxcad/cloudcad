import { getApiClient } from './apiClient';

const API = '/api/file-system/nodes';

export interface CreateFolderDto {
  name: string;
}

export interface UpdateNodeDto {
  name?: string;
  description?: string;
}

export interface MoveNodeDto {
  targetParentId: string;
}

export interface CopyNodeDto {
  targetParentId: string;
}

export const nodeApi = {
  /** 创建文件夹 */
  createFolder: (parentId: string, data: CreateFolderDto) =>
    getApiClient().post(`${API}/${parentId}/folder`, data),

  /** 获取节点详情 */
  getNode: (nodeId: string, config?: { signal?: AbortSignal }) =>
    getApiClient().get(`${API}/${nodeId}`, config),

  /** 获取子节点列表 */
  getChildren: (
    nodeId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      nodeType?: 'folder' | 'file';
    },
    config?: { signal?: AbortSignal }
  ) =>
    getApiClient().get(`${API}/${nodeId}/children`, {
      params,
      ...(config?.signal ? { signal: config.signal } : {}),
    }),

  /** 更新节点 */
  updateNode: (nodeId: string, data: UpdateNodeDto) =>
    getApiClient().patch(`${API}/${nodeId}`, data),

  /** 重命名节点 */
  renameNode: (nodeId: string, data: { name: string }) =>
    getApiClient().patch(`${API}/${nodeId}`, data),

  /** 删除节点 */
  deleteNode: (nodeId: string, permanently: boolean = false) =>
    getApiClient().delete(`${API}/${nodeId}`, { data: { permanently } }),

  /** 移动节点 */
  moveNode: (nodeId: string, targetParentId: string) =>
    getApiClient().post(`${API}/${nodeId}/move`, { targetParentId } as MoveNodeDto),

  /** 复制节点 */
  copyNode: (nodeId: string, targetParentId: string) =>
    getApiClient().post(`${API}/${nodeId}/copy`, { targetParentId } as CopyNodeDto),
};
