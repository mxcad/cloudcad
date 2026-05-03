///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { AxiosProgressEvent, AxiosInstance } from 'axios';
import { getApiClient } from './apiClient';

function getAxios(): AxiosInstance {
  return getApiClient();
}

export const API_BASE_URL = '/api';

/** 秒传检查请求参数 */
export interface CheckFilePublicParams {
  filename: string;
  fileHash: string;
}

/** 秒传检查响应 */
export interface CheckFilePublicResponse {
  exist: boolean;
  hash?: string;
  fileName?: string;
}

/** 分片上传响应 */
export interface UploadChunkResponse {
  ret: 'success' | 'error';
  isLastChunk?: boolean;
}

/** 合并分片响应 */
export interface MergeChunksResponse {
  ret: 'success' | 'error';
  hash: string;
  fileName: string;
}

/**
 * 公开文件服务 API
 * 提供无需认证的分片上传和临时令牌访问功能
 */
export const publicFileApi = {
  /** 检查文件是否已存在（秒传） */
  checkFile: async (params: CheckFilePublicParams): Promise<CheckFilePublicResponse> => {
    const res = await getAxios().post<CheckFilePublicResponse>(`${API_BASE_URL}/public-file/file/check`, params);
    return res.data;
  },

  /** 检查分片是否存在 */
  checkChunk: async (params: { hash: string; chunk: number; chunks: number; size: number }): Promise<{ exist: boolean }> => {
    const res = await getAxios().post<{ exist: boolean }>(`${API_BASE_URL}/public-file/chunk/check`, params);
    return res.data;
  },

  /** 上传分片 */
  uploadChunk: async (formData: FormData, onProgress?: (e: AxiosProgressEvent) => void): Promise<UploadChunkResponse> => {
    const res = await getAxios().post<UploadChunkResponse>(`${API_BASE_URL}/public-file/chunk/upload`, formData, {
      onUploadProgress: onProgress,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  /** 合并分片 */
  mergeChunks: async (params: { hash: string; name: string; size: number; chunks: number }): Promise<MergeChunksResponse> => {
    const res = await getAxios().post<MergeChunksResponse>(`${API_BASE_URL}/public-file/chunk/merge`, params, { timeout: 300000 });
    return res.data;
  },

  /** 获取文件访问 URL */
  getFileAccessUrl: (hash: string, filename?: string): string => {
    if (filename) return `${API_BASE_URL}/public-file/access/${hash}/${filename}`;
    return `${API_BASE_URL}/public-file/access/${hash}.mxweb`;
  },

  /** 完整的分片上传流程（照搬 publicFileApi.uploadFile） */
  uploadFile: async (
    file: File,
    chunkSize: number = 5 * 1024 * 1024,
    onProgress?: (percentage: number) => void,
    noCache?: boolean,
  ): Promise<MergeChunksResponse> => {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    const hash = await calculateFileHash(file);

    if (!noCache) {
      const check = await publicFileApi.checkFile({ filename: file.name, fileHash: hash });
      if (check.exist && check.hash) {
        return { ret: 'success', hash: check.hash, fileName: check.fileName || file.name };
      }
    }

    let uploaded = 0;
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunk = file.slice(start, end);
      const fd = new FormData();
      fd.append('hash', hash);
      fd.append('name', file.name);
      fd.append('size', totalSize.toString());
      fd.append('chunk', i.toString());
      fd.append('chunks', totalChunks.toString());
      fd.append('file', chunk);

      await publicFileApi.uploadChunk(fd, (evt) => {
        if (onProgress && evt.total) {
          const chunkPct = evt.loaded / evt.total;
          onProgress(((uploaded + chunkPct) / totalChunks) * 100);
        }
      });
      uploaded++;
      onProgress?.((uploaded / totalChunks) * 100);
    }

    return publicFileApi.mergeChunks({ hash, name: file.name, size: totalSize, chunks: totalChunks });
  },
};

async function calculateFileHash(file: File): Promise<string> {
  const { calculateFileHash } = await import('@/utils/hashUtils');
  return calculateFileHash(file);
}
