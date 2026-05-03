///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';

const API = '/api/mxcad';

async function post<T>(path: string, data?: unknown): Promise<T> {
  const res = await getApiClient().post<T>(`${API}${path}`, data);
  return res.data;
}

async function get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await getApiClient().get<T>(`${API}${path}`, { params });
  return res.data;
}

async function calculateFileHash(file: File): Promise<string> {
  const { calculateFileHash: calcHash } = await import('@/utils/hashUtils');
  return calcHash(file);
}

/**
 * MxCAD API — 来源：apps/frontend/src/services/mxcadApi.ts
 */
export const mxcadApi = {
  checkFileExist: (params: { fileSize: number; fileHash: string; filename: string; nodeId: string }) =>
    post<{ exist: boolean }>('/check-file', params),

  checkDuplicateFile: (params: { fileHash: string; filename: string; nodeId: string; currentFileId?: string }) =>
    post<{ isDuplicate: boolean; existingFileId?: string }>('/check-duplicate', params),

  checkChunkExist: (params: { chunk: number; chunks: number; size: number; fileHash: string; filename: string; nodeId: string }) =>
    post<{ exist: boolean }>('/check-chunk', params),

  uploadChunk: (formData: FormData) =>
    post<{ ret: string; isLastChunk?: boolean }>('/upload-chunk', formData),

  getPreloadingData: (nodeId: string) =>
    get<{ fileHash: string; path: string; name: string; parentId: string }>(`/preloading/${nodeId}`),

  checkThumbnail: (nodeId: string) =>
    get<{ exist: boolean }>(`/thumbnail/${nodeId}/check`),

  uploadThumbnail: (nodeId: string, formData: FormData) =>
    post<void>(`/thumbnail/${nodeId}`, formData),

  checkExternalReference: (nodeId: string, fileName: string) =>
    get<{ exist: boolean }>(`/external-reference/${nodeId}/check`, { fileName }),

  refreshExternalReferences: (nodeId: string) =>
    post<void>(`/external-reference/${nodeId}/refresh`),

  uploadExtReferenceDwg: async (
    file: File,
    nodeId: string,
    extRefFile: string,
    _onProgress?: (percentage: number) => void
  ): Promise<void> => {
    const hash = await calculateFileHash(file);
    const formData = new FormData();
    formData.append('hash', hash);
    formData.append('ext_ref_file', extRefFile);
    formData.append('file', file);
    await post<void>(`/external-reference/${nodeId}/dwg`, formData);
  },

  uploadExtReferenceImage: async (
    file: File,
    nodeId: string,
    extRefFile: string,
    updatePreloading?: boolean,
    _onProgress?: (percentage: number) => void
  ): Promise<void> => {
    const hash = await calculateFileHash(file);
    const formData = new FormData();
    formData.append('hash', hash);
    formData.append('nodeId', nodeId);
    formData.append('ext_ref_file', extRefFile);
    if (updatePreloading !== undefined) {
      formData.append('updatePreloading', String(updatePreloading));
    }
    formData.append('file', file);
    await post<void>(`/external-reference/${nodeId}/image`, formData);
  },

  saveMxwebFile: async (
    blob: Blob,
    nodeId: string,
    _onProgress?: (percentage: number) => void,
    commitMessage?: string,
    expectedTimestamp?: string
  ): Promise<void> => {
    const file = new File([blob], 'drawing.mxweb', { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', file);
    if (commitMessage) formData.append('commitMessage', commitMessage);
    if (expectedTimestamp) formData.append('expectedTimestamp', expectedTimestamp);
    await post<void>(`/save/${nodeId}`, formData);
  },

  saveMxwebAs: async (
    blob: Blob,
    targetType: 'personal' | 'project',
    targetParentId: string,
    projectId: string | undefined,
    format: 'dwg' | 'dxf',
    _onProgress?: (percentage: number) => void,
    commitMessage?: string,
    fileName?: string
  ): Promise<{ nodeId: string }> => {
    const file = new File([blob], 'drawing.mxweb', { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetType', targetType);
    formData.append('targetParentId', targetParentId);
    if (projectId) formData.append('projectId', projectId);
    formData.append('format', format);
    if (commitMessage) formData.append('commitMessage', commitMessage);
    if (fileName) formData.append('fileName', fileName);
    return post<{ nodeId: string }>('/save-as', formData);
  },

  async checkFileUploadStatus(nodeId: string): Promise<{ fileHash?: string; path?: string; name?: string; parentId?: string } | null> {
    try {
      return await get<{ fileHash?: string; path?: string; name?: string; parentId?: string }>(`/status/${nodeId}`);
    } catch {
      return null;
    }
  },

  async waitForFileReady(nodeId: string, maxAttempts = 30, intervalMs = 2000): Promise<{ fileHash: string; path: string; name: string; parentId: string } | null> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const data = await get<{ fileHash?: string; path?: string; name?: string; parentId?: string }>(`/status/${nodeId}`);
        if (data.fileHash && data.path) {
          return {
            fileHash: data.fileHash,
            path: data.path,
            name: data.name || '',
            parentId: data.parentId || '',
          };
        }
      } catch { /* continue polling */ }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  },

  async downloadFile(nodeId: string, format: string): Promise<Blob> {
    const response = await get<ArrayBuffer>(`/download/${nodeId}`, { format, responseType: 'arraybuffer' } as Record<string, unknown>);
    return new Blob([response], { type: 'application/octet-stream' });
  },

  saveDrawing: (params: { fileHash: string; name: string; nodeId?: string; parentId?: string; projectId?: string; libraryKey?: string }) =>
    post<{ fileHash: string; nodeId: string }>('/save', params),
};