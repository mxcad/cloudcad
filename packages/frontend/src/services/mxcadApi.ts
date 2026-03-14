import { getApiClient } from './apiClient';
import { calculateFileHash } from '../utils/hashUtils';
import type { AxiosProgressEvent } from 'axios';
import type {
  CheckFileExistDto,
  CheckChunkExistDto,
  UploadFilesDto,
  UploadExtReferenceDto,
  SaveMxwebDto,
  UploadThumbnailDto,
} from '../types/api-client';

/**
 * 将 FormData 转换为 API 客户端期望的请求体类型
 * OpenAPI 生成的 multipart/form-data 类型定义不精确，需要类型转换
 */
function asFormData<T>(formData: FormData): T {
  return formData as unknown as T;
}

export const mxcadApi = {
  /**
   * 检查文件是否已存在（秒传检查）
   */
  checkFileExist: async (params: CheckFileExistDto) => {
    const res = await getApiClient().MxCadController_checkFileExist(undefined, params);
    return res.data;
  },

  /**
   * 检查分片是否已存在
   */
  checkChunkExist: async (params: CheckChunkExistDto) => {
    const res = await getApiClient().MxCadController_checkChunkExist(undefined, params);
    return res.data;
  },

  /**
   * 上传分片
   */
  uploadChunk: async (formData: FormData) => {
    const res = await getApiClient().MxCadController_uploadFile(
      undefined,
      asFormData<UploadFilesDto>(formData)
    );
    return res.data;
  },

  /**
   * 获取预加载数据
   */
  getPreloadingData: async (nodeId: string) => {
    const res = await getApiClient().MxCadController_getPreloadingData({ nodeId });
    return res.data;
  },

  /**
   * 检查缩略图是否存在
   */
  checkThumbnail: async (nodeId: string) => {
    const res = await getApiClient().MxCadController_checkThumbnail({ nodeId });
    return res.data;
  },

  /**
   * 上传缩略图
   */
  uploadThumbnail: async (nodeId: string, formData: FormData) => {
    const res = await getApiClient().MxCadController_uploadThumbnail(
      { nodeId },
      asFormData<UploadThumbnailDto>(formData)
    );
    return res.data;
  },

  /**
   * 检查外部参照是否存在
   */
  checkExternalReferenceExists: async (nodeId: string, fileName: string) => {
    const res = await getApiClient().MxCadController_checkExternalReference(
      { nodeId },
      { fileName }
    );
    return res.data;
  },

  /**
   * 刷新外部参照
   */
  refreshExternalReferences: async (nodeId: string) => {
    const res = await getApiClient().MxCadController_refreshExternalReferences({ nodeId });
    return res.data;
  },

  /**
   * 上传外部参照 DWG 文件
   */
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

          const response =
            await getApiClient().MxCadController_uploadExtReferenceDwg(
              undefined,
              asFormData<UploadExtReferenceDto>(
                formData
              ),
              { onUploadProgress: onProgress }
            );

          resolve(response.data);
        } catch (error) {
          reject(error);
        }
      })();
    });
  },

  /**
   * 上传外部参照图片文件
   */
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

          const response =
            await getApiClient().MxCadController_uploadExtReferenceImage(
              undefined,
              asFormData<UploadExtReferenceDto>(
                formData
              ),
              { onUploadProgress: onProgress }
            );

          resolve(response.data);
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

          const response = await getApiClient().MxCadController_saveMxwebToNode(
            { nodeId },
            asFormData<SaveMxwebDto>(formData),
            {
              onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                if (onProgress && progressEvent.total) {
                  const percentage =
                    (progressEvent.loaded / progressEvent.total) * 100;
                  onProgress(percentage);
                }
              },
            }
          );

          resolve(response.data);
        } catch (error) {
          reject(error);
        }
      })();
    });
  },
};
