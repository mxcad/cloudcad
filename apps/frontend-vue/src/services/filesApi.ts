import { getApiClient } from './apiClient';

export interface FileNode {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  projectId?: string;
}

export const filesApi = {
  list: () => getApiClient().get('/api/file-system/projects'),

  get: (id: string) =>
    getApiClient().get(`/api/file-system/nodes/${id}`),

  download: (id: string) =>
    getApiClient().get(`/api/file-system/nodes/${id}/download`, { responseType: 'blob' }),

  downloadWithFormat: (id: string, format: 'dwg' | 'dxf' | 'mxweb' | 'pdf', pdfOptions?: { width?: number; height?: number; colorPolicy?: string }) => {
    const params: Record<string, unknown> = { nodeId: id, format };
    if (pdfOptions?.width) params.width = pdfOptions.width;
    if (pdfOptions?.height) params.height = pdfOptions.height;
    if (pdfOptions?.colorPolicy) params.colorPolicy = pdfOptions.colorPolicy;
    return getApiClient().get('/api/file-system/nodes/download-with-format', { params, responseType: 'blob' });
  },

  update: (id: string, data: Record<string, unknown>) =>
    getApiClient().patch(`/api/file-system/nodes/${id}`, data),

  delete: (id: string, permanent?: boolean) =>
    getApiClient().delete(`/api/file-system/nodes/${id}`, { data: { permanently: permanent ?? false } }),

  createFolder: (parentId: string, data: { name: string }) =>
    getApiClient().post(`/api/file-system/nodes/${parentId}/folder`, data),

  moveNode: (id: string, data: { targetParentId: string }) =>
    getApiClient().post(`/api/file-system/nodes/${id}/move`, data),

  copyNode: (id: string, data: { targetParentId: string }) =>
    getApiClient().post(`/api/file-system/nodes/${id}/copy`, data),

  getThumbnailUrl: (nodeId: string): string => {
    const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || '';
    return `${baseURL}/api/v1/file-system/nodes/${nodeId}/thumbnail`;
  },

  async saveFile(params: {
    fileHash: string;
    name: string;
    nodeId?: string;
    parentId?: string;
    projectId?: string;
    libraryKey?: string;
  }): Promise<{ fileHash: string; nodeId: string }> {
    return getApiClient().post('/api/file-system/files', params);
  },

  async deleteFile(nodeId: string): Promise<void> {
    return getApiClient().delete(`/api/file-system/files/${nodeId}`);
  },

  async getFileNode(nodeId: string): Promise<FileNode> {
    return getApiClient().get(`/api/file-system/nodes/${nodeId}`);
  },
};