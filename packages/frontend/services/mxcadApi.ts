import { apiClient } from './apiClient';
import { calculateFileHash } from '../utils/hashUtils';
import type { AxiosProgressEvent } from 'axios';

/** 外部引用刷新统计 */
interface RefreshExternalReferencesStats {
  added?: number;
  updated?: number;
  removed?: number;
}

/** 外部引用刷新响应 */
interface RefreshExternalReferencesResponse {
  stats?: RefreshExternalReferencesStats;
}

/** 文件存在检查响应 */
interface FileExistResponse {
  exists: boolean;
  nodeId?: string;
}

/** 分片存在检查响应 */
interface ChunkExistResponse {
  exists: boolean;
}

/** 分片上传响应 */
interface ChunkUploadResponse {
  nodeId?: string;
  tz?: boolean;
}

export const mxcadApi = {
  /**
   * 检查文件是否已存在（秒传检查）
   */
  checkFileExist: (params: {
    fileHash: string;
    filename: string;
    nodeId: string;
    fileSize: number;
  }) =>
    apiClient.post<FileExistResponse>('/mxcad/files/fileisExist', params),

  /**
   * 检查分片是否已存在
   */
  checkChunkExist: (params: {
    fileHash: string;
    filename: string;
    nodeId: string;
    chunk: number;
    chunks: number;
    size: number;
  }) => apiClient.post<ChunkExistResponse>('/mxcad/files/chunkisExist', params),

  /**
   * 上传分片
   */
  uploadChunk: (formData: FormData) =>
    apiClient.post<ChunkUploadResponse>('/mxcad/files/uploadFiles', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getPreloadingData: (nodeId: string) =>
    apiClient.get<import('../types/api').PreloadingData>(
      `/mxcad/file/${nodeId}/preloading`
    ),

  checkThumbnail: (nodeId: string) =>
    apiClient.get<{ exists: boolean }>(`/mxcad/thumbnail/${nodeId}`),

  uploadThumbnail: (nodeId: string, formData: FormData) =>
    apiClient.post<{ fileName: string }>(`/mxcad/thumbnail/${nodeId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  checkExternalReferenceExists: (nodeId: string, fileName: string) =>
    apiClient.post<import('../types/api').CheckReferenceExistsResult>(
      `/mxcad/file/${nodeId}/check-reference`,
      { fileName }
    ),

  refreshExternalReferences: (nodeId: string) =>
    apiClient.post<RefreshExternalReferencesResponse>(
      `/mxcad/file/${nodeId}/refresh-external-references`
    ),

  uploadExtReferenceDwg: (
    file: File,
    nodeId: string,
    extRefFile: string,
    onProgress?: (progressEvent: AxiosProgressEvent) => void
  ) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const hash = await calculateFileHash(file);

          const formData = new FormData();
          formData.append('hash', hash);
          formData.append('nodeId', nodeId);
          formData.append('ext_ref_file', extRefFile);
          formData.append('file', file);

          const response = await apiClient.post(
            '/mxcad/up_ext_reference_dwg',
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: onProgress,
            }
          );

          // apiClient 已经解包，直接返回数据
          resolve(response);
        } catch (error) {
          reject(error);
        }
      })();
    });
  },

  uploadExtReferenceImage: (
    file: File,
    nodeId: string,
    extRefFile: string,
    onProgress?: (progressEvent: AxiosProgressEvent) => void
  ) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const hash = await calculateFileHash(file);

          const formData = new FormData();
          formData.append('hash', hash);
          formData.append('nodeId', nodeId);
          formData.append('ext_ref_file', extRefFile);
          formData.append('file', file);

          const response = await apiClient.post(
            '/mxcad/up_ext_reference_image',
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: onProgress,
            }
          );

          // apiClient 已经解包，直接返回数据
          resolve(response);
        } catch (error) {
          reject(error);
        }
      })();
    });
  },

  /**
   * 保存 mxweb 文件到指定节点
   * @param blob mxweb 文件的 Blob 对象
   * @param nodeId 节点 ID
   * @param onProgress 上传进度回调
   * @param commitMessage 提交信息（可选）
   * @returns Promise
   */
  saveMxwebFile: (
    blob: Blob,
    nodeId: string,
    onProgress?: (percentage: number) => void,
    commitMessage?: string
  ) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          // 将 Blob 转换为 File 对象
          const file = new File([blob], 'drawing.mxweb', {
            type: 'application/octet-stream',
          });

          const formData = new FormData();
          formData.append('file', file);
          if (commitMessage) {
            formData.append('commitMessage', commitMessage);
          }

          const response = await apiClient.post(
            `/mxcad/savemxweb/${nodeId}`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                if (onProgress && progressEvent.total) {
                  const percentage =
                    (progressEvent.loaded / progressEvent.total) * 100;
                  onProgress(percentage);
                }
              },
            }
          );

          // apiClient 已经解包，直接返回数据
          resolve(response);
        } catch (error) {
          reject(error);
        }
      })();
    });
  },
};