///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';

const API = '/api/projects';

function post<T>(path: string, data?: unknown) {
  return getApiClient().post<T>(`${API}${path}`, data);
}

function get<T>(path: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }) {
  return getApiClient().get<T>(`${API}${path}`, { params, ...(options?.signal ? { signal: options.signal } : {}) });
}

function del<T>(path: string, data?: unknown) {
  return getApiClient().delete<T>(`${API}${path}`, data ? { data } : undefined);
}

/**
 * 项目 API — 来源：apps/frontend/src/services/projectsApi.ts
 */
export const projectsApi = {
  /** 获取项目列表 — 来源：projectsApi.list */
  list: (filter?: 'all' | 'owned' | 'joined', params?: { page?: number; limit?: number }, options?: { signal?: AbortSignal }) =>
    get<{ nodes: FileSystemNodeDto[]; total: number; page: number; limit: number; totalPages: number }>('/',
      { filter, ...params } as Record<string, unknown>, options?.signal ? { signal: options.signal } : undefined),

  /** 创建项目 — 来源：projectsApi.create */
  create: (data: { name: string; description?: string }) =>
    post<FileSystemNodeDto>('/', data),

  /** 获取个人空间 — 来源：projectsApi.getPersonalSpace */
  getPersonalSpace: () =>
    get<FileSystemNodeDto>('/personal-space'),

  /** 获取子节点 — 来源：projectsApi.getChildren */
  getChildren: (parentId: string, params?: { page?: number; limit?: number; search?: string }, options?: { signal?: AbortSignal }) =>
    get<{ nodes: FileSystemNodeDto[]; total: number; page: number; limit: number; totalPages: number }>(`/${parentId}/children`, params as Record<string, unknown>, options?.signal ? { signal: options.signal } : undefined),

  /** 获取单个节点 — 来源：projectsApi.getNode */
  getNode: (nodeId: string, options?: { signal?: AbortSignal }) =>
    get<FileSystemNodeDto>(`/nodes/${nodeId}`, undefined, options?.signal ? { signal: options.signal } : undefined),

  /** 更新节点 — 来源：projectsApi.updateNode */
  updateNode: (nodeId: string, data: { name?: string; description?: string }) =>
    post<FileSystemNodeDto>(`/nodes/${nodeId}`, data),

  /** 删除项目 — 来源：projectsApi.delete */
  delete: (projectId: string, permanently?: boolean) =>
    del(`/projects/${projectId}`, { permanently }),

  /** 删除节点 — 来源：projectsApi.deleteNode */
  deleteNode: (nodeId: string, permanently?: boolean) =>
    del(`/nodes/${nodeId}`, { permanently }),

  /** 搜索 — 来源：projectsApi.search */
  search: (query: string, params: {
    scope?: 'project' | 'project_files';
    filter?: 'all' | 'owned' | 'joined';
    projectId?: string;
    page?: number;
    limit?: number;
  }, options?: { signal?: AbortSignal }) =>
    get<{ nodes: FileSystemNodeDto[]; total: number; page: number; limit: number; totalPages: number }>('/search',
      { q: query, ...params } as Record<string, unknown>, options?.signal ? { signal: options.signal } : undefined),

  /** 获取回收站 — 来源：projectsApi.getDeleted */
  getDeleted: (params?: { page?: number; limit?: number }, options?: { signal?: AbortSignal }) =>
    get<{ nodes: FileSystemNodeDto[]; total: number; page: number; limit: number; totalPages: number }>('/deleted', params as Record<string, unknown>, options?.signal ? { signal: options.signal } : undefined),

  /** 获取项目回收站 — 来源：projectsApi.getProjectTrash */
  getProjectTrash: (projectId: string, params?: { page?: number; limit?: number }) =>
    get<{ nodes: FileSystemNodeDto[]; total: number; page: number; limit: number; totalPages: number }>(`/${projectId}/trash`, params as Record<string, unknown>),

  /** 恢复项目 — 来源：projectsApi.restoreProject */
  restoreProject: (projectId: string) =>
    post(`/projects/${projectId}/restore`),

  /** 恢复节点 — 来源：projectsApi.restoreNode */
  restoreNode: (nodeId: string) =>
    post(`/nodes/${nodeId}/restore`),

  /** 清空项目回收站 — 来源：projectsApi.clearProjectTrash */
  clearProjectTrash: (projectId: string) =>
    del(`/${projectId}/trash`),

  /** 创建文件夹 — 来源：projectsApi.createFolder */
  createFolder: (parentId: string, data: { name: string }) =>
    post<FileSystemNodeDto>(`/${parentId}/folder`, data),

  /** 移动节点 — 来源：projectsApi.moveNode */
  moveNode: (nodeId: string, targetParentId: string) =>
    post(`/nodes/${nodeId}/move`, { targetParentId }),

  /** 复制节点 — 来源：projectsApi.copyNode */
  copyNode: (nodeId: string, targetParentId: string) =>
    post(`/nodes/${nodeId}/copy`, { targetParentId }),

  /** 获取项目成员列表 */
  getMembers: (projectId: string) =>
    get(`/${projectId}/members`),

  /** 添加项目成员 */
  addMember: (projectId: string, data: { userId: string; projectRoleId: string }) =>
    post(`/${projectId}/members`, data),

  /** 移除项目成员 */
  removeMember: (projectId: string, userId: string) =>
    del(`/${projectId}/members/${userId}`),

  /** 更新项目成员角色 */
  updateMember: (projectId: string, userId: string, data: { projectRoleId: string }) =>
    post(`/${projectId}/members/${userId}`, data),

  /** 转移项目所有权 */
  transferOwnership: (projectId: string, newOwnerUserId: string) =>
    post(`/${projectId}/transfer-ownership`, { newOwnerUserId }),

  /** 批量操作节点 */
  batchOperation: (params: { action: string; nodeIds: string[]; targetParentId?: string }) =>
    post('/batch', params),

  /** 永久删除节点 */
  permanentlyDelete: (nodeId: string) =>
    del(`/nodes/${nodeId}`, { permanently: true }),
};

/** 来源：apps/frontend/src/types/api-client.ts FileSystemNodeDto */
export interface FileSystemNodeDto {
  id: string;
  name: string;
  isRoot?: boolean;
  isFolder: boolean;
  status?: string;
  ownerId?: string;
  parentId?: string;
  path?: string;
  personalSpaceKey?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  size?: number;
  extension?: string;
  deletedAt?: string;
}
