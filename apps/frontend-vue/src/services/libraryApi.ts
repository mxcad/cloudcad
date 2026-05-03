import axios from 'axios';
import { getApiClient } from './apiClient';

function post<T>(path: string, data?: unknown) {
  return getApiClient().post<T>(`/api/library${path}`, data);
}

function get<T>(path: string, params?: Record<string, unknown>) {
  return getApiClient().get<T>(`/api/library${path}`, { params });
}

function patch<T>(path: string, data?: unknown) {
  return getApiClient().patch<T>(`/api/library${path}`, data);
}

function del<T>(path: string, data?: unknown) {
  return getApiClient().delete<T>(`/api/library${path}`, data);
}

export interface LibraryNode {
  id: string;
  name: string;
  isFolder: boolean;
  parentId?: string;
  path?: string;
  size?: number;
  extension?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryQuota {
  total: number;
  used: number;
  usagePercent: number;
}

/**
 * 公共资源库 API — 来源：apps/frontend/src/services/libraryApi.ts
 */
export const libraryApi = {
  getDrawingLibrary: () => get<{ id: string; name: string }>('/drawing'),

  getDrawingChildren: (
    nodeId: string,
    query?: {
      search?: string;
      nodeType?: 'folder' | 'file';
      extension?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) => get<{ nodes: LibraryNode[]; total: number; page: number; limit: number }>(
    `/drawing/nodes/${nodeId}/children`,
    query
  ),

  getDrawingNode: (nodeId: string) =>
    get<LibraryNode>(`/drawing/nodes/${nodeId}`),

  downloadDrawingNode: (nodeId: string) =>
    get<Blob>(`/drawing/nodes/${nodeId}/download`, { responseType: 'blob' }),

  createDrawingFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => post<LibraryNode>('/drawing/folders', data),

  deleteDrawingNode: (nodeId: string, permanently: boolean = true) =>
    del<void>(`/drawing/nodes/${nodeId}`, { permanently }),

  renameDrawingNode: (nodeId: string, name: string) =>
    patch<LibraryNode>(`/drawing/nodes/${nodeId}`, { name }),

  moveDrawingNode: (nodeId: string, targetParentId: string) =>
    post<void>(`/drawing/nodes/${nodeId}/move`, { targetParentId }),

  copyDrawingNode: (nodeId: string, targetParentId: string) =>
    post<void>(`/drawing/nodes/${nodeId}/copy`, { targetParentId }),

  getBlockLibrary: () => get<{ id: string; name: string }>('/block'),

  getBlockChildren: (
    nodeId: string,
    query?: {
      search?: string;
      nodeType?: 'folder' | 'file';
      extension?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ) => get<{ nodes: LibraryNode[]; total: number; page: number; limit: number }>(
    `/block/nodes/${nodeId}/children`,
    query
  ),

  getBlockNode: (nodeId: string) =>
    get<LibraryNode>(`/block/nodes/${nodeId}`),

  downloadBlockNode: (nodeId: string) =>
    get<Blob>(`/block/nodes/${nodeId}/download`, { responseType: 'blob' }),

  createBlockFolder: (data: {
    name: string;
    parentId?: string;
    skipIfExists?: boolean;
  }) => post<LibraryNode>('/block/folders', data),

  deleteBlockNode: (nodeId: string, permanently: boolean = true) =>
    del<void>(`/block/nodes/${nodeId}`, { permanently }),

  renameBlockNode: (nodeId: string, name: string) =>
    patch<LibraryNode>(`/block/nodes/${nodeId}`, { name }),

  moveBlockNode: (nodeId: string, targetParentId: string) =>
    post<void>(`/block/nodes/${nodeId}/move`, { targetParentId }),

  copyBlockNode: (nodeId: string, targetParentId: string) =>
    post<void>(`/block/nodes/${nodeId}/copy`, { targetParentId }),

  saveDrawing: async (
    nodeId: string,
    file: Blob,
    onProgress?: (percentage: number) => void
  ): Promise<{ nodeId: string }> => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], 'drawing.mxweb', {
        type: 'application/octet-stream',
      })
    );
    const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '';
    const token = localStorage.getItem('accessToken');
    const response = await axios.post(`${baseURL}/api/library/drawing/nodes/${nodeId}/save`, formData, {
      headers: { Authorization: token ? `Bearer ${token}` : undefined },
      onUploadProgress: onProgress
        ? (event) => {
            if (event.total) {
              onProgress((event.loaded / event.total) * 100);
            }
          }
        : undefined,
    });
    return response.data.data || response.data;
  },

  saveDrawingAs: async (
    file: Blob,
    targetParentId: string,
    fileName: string,
    onProgress?: (percentage: number) => void
  ): Promise<{ nodeId: string }> => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], fileName + '.mxweb', {
        type: 'application/octet-stream',
      })
    );
    formData.append('targetParentId', targetParentId);
    formData.append('fileName', fileName);
    const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '';
    const token = localStorage.getItem('accessToken');
    const response = await axios.post(`${baseURL}/api/library/drawing/save-as`, formData, {
      headers: { Authorization: token ? `Bearer ${token}` : undefined },
      onUploadProgress: onProgress
        ? (event) => {
            if (event.total) {
              onProgress((event.loaded / event.total) * 100);
            }
          }
        : undefined,
    });
    return response.data.data || response.data;
  },

  saveBlock: async (
    nodeId: string,
    file: Blob,
    onProgress?: (percentage: number) => void
  ): Promise<{ nodeId: string }> => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], 'block.mxweb', {
        type: 'application/octet-stream',
      })
    );
    const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '';
    const token = localStorage.getItem('accessToken');
    const response = await axios.post(`${baseURL}/api/library/block/nodes/${nodeId}/save`, formData, {
      headers: { Authorization: token ? `Bearer ${token}` : undefined },
      onUploadProgress: onProgress
        ? (event) => {
            if (event.total) {
              onProgress((event.loaded / event.total) * 100);
            }
          }
        : undefined,
    });
    return response.data.data || response.data;
  },

  saveBlockAs: async (
    file: Blob,
    targetParentId: string,
    fileName: string,
    onProgress?: (percentage: number) => void
  ): Promise<{ nodeId: string }> => {
    const formData = new FormData();
    formData.append(
      'file',
      new File([file], fileName + '.mxweb', {
        type: 'application/octet-stream',
      })
    );
    formData.append('targetParentId', targetParentId);
    formData.append('fileName', fileName);
    const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '';
    const token = localStorage.getItem('accessToken');
    const response = await axios.post(`${baseURL}/api/library/block/save-as`, formData, {
      headers: { Authorization: token ? `Bearer ${token}` : undefined },
      onUploadProgress: onProgress
        ? (event) => {
            if (event.total) {
              onProgress((event.loaded / event.total) * 100);
            }
          }
        : undefined,
    });
    return response.data.data || response.data;
  },
};
