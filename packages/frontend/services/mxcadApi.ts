import { apiClient } from './apiClient';
import { calculateFileHash } from '../utils/hashUtils';

export const mxcadApi = {
  getPreloadingData: (fileHash: string) =>
    apiClient.get<import('../types/api').PreloadingData>(
      `/mxcad/file/${fileHash}/preloading`
    ),

  checkExternalReferenceExists: (fileHash: string, fileName: string) =>
    apiClient.post<import('../types/api').CheckReferenceExistsResult>(
      `/mxcad/file/${fileHash}/check-reference`,
      { fileName }
    ),

  uploadExtReferenceDwg: (
    file: File,
    srcDwgFileHash: string,
    extRefFile: string,
    onProgress?: (progressEvent: any) => void
  ) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const hash = await calculateFileHash(file);

          const formData = new FormData();
          formData.append('hash', hash);
          formData.append('src_dwgfile_hash', srcDwgFileHash);
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
    srcDwgFileHash: string,
    extRefFile: string,
    onProgress?: (progressEvent: any) => void
  ) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const hash = await calculateFileHash(file);

          const formData = new FormData();
          formData.append('hash', hash);
          formData.append('src_dwgfile_hash', srcDwgFileHash);
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