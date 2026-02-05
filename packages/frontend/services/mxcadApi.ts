import { apiClient } from './apiClient';
import { calculateFileHash } from '../utils/hashUtils';

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
    apiClient.post<{ code: number; message: string; stats?: any }>(
      `/mxcad/file/${nodeId}/refresh-external-references`
    ),

  uploadExtReferenceDwg: (
    file: File,
    nodeId: string,
    extRefFile: string,
    onProgress?: (progressEvent: any) => void
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
    onProgress?: (progressEvent: any) => void
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
};
