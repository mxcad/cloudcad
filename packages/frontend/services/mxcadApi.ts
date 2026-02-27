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
  code: number;
  message: string;
  stats?: RefreshExternalReferencesStats;
}

export const mxcadApi = {
  getPreloadingData: (nodeId: string) =>
    apiClient.get<import('../types/api').PreloadingData>(
      `/mxcad/file/${nodeId}/preloading`
    ),

  checkThumbnail: (nodeId: string) =>
    apiClient.get<{ code: number; message: string; exists: boolean }>(
      `/mxcad/thumbnail/${nodeId}`
    ),

  uploadThumbnail: (nodeId: string, formData: FormData) =>
    apiClient.post<{
      code: number;
      message: string;
      data?: { fileName: string };
    }>(`/mxcad/thumbnail/${nodeId}`, formData, {
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

          if (response.data?.code === 0) {
            resolve(response);
          } else {
            reject(new Error(response.data?.message || '上传失败'));
          }
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

          if (response.data?.code === 0) {
            resolve(response);
          } else {
            reject(new Error(response.data?.message || '上传失败'));
          }
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
          const file = new File([blob], 'drawing.mxweb', { type: 'application/octet-stream' });

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
                  const percentage = (progressEvent.loaded / progressEvent.total) * 100;
                  onProgress(percentage);
                }
              },
            }
          );

          if (response.data?.code === 'SUCCESS') {
            resolve(response);
          } else {
            reject(new Error(response.data?.message || '保存失败'));
          }
        } catch (error) {
          reject(error);
        }
      })();
    });
  },
};