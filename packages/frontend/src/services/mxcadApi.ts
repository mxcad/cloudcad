import { getApiClient } from './apiClient';
import { calculateFileHash } from '../utils/hashUtils';
import type { AxiosProgressEvent } from 'axios';
import type {
  CheckFileExistDto,
  CheckChunkExistDto,
} from '../types/api-client';

export const mxcadApi = {
  /**
   * 检查文件是否已存在（秒传检查）
   */
  checkFileExist: (params: CheckFileExistDto) =>
    getApiClient().MxCadController_checkFileExist(undefined, params)
      .then(res => res.data),

  /**
   * 检查分片是否已存在
   */
  checkChunkExist: (params: CheckChunkExistDto) =>
    getApiClient().MxCadController_checkChunkExist(undefined, params)
      .then(res => res.data),

  /**
   * 上传分片
   */
  uploadChunk: (formData: FormData) =>
    getApiClient().MxCadController_uploadFile(
      undefined,
      formData as any
    ).then(res => res.data),

  /**
   * 获取预加载数据
   */
  getPreloadingData: (nodeId: string) =>
    getApiClient().MxCadController_getPreloadingData({ nodeId })
      .then(res => res.data),

  /**
   * 检查缩略图是否存在
   */
  checkThumbnail: (nodeId: string) =>
    getApiClient().MxCadController_checkThumbnail({ nodeId })
      .then(res => res.data),

  /**
   * 上传缩略图
   */
  uploadThumbnail: (nodeId: string, formData: FormData) =>
    getApiClient().MxCadController_uploadThumbnail(
      { nodeId },
      formData as any
    ).then(res => res.data),

  /**
   * 检查外部参照是否存在
   */
  checkExternalReferenceExists: (nodeId: string, fileName: string) =>
    getApiClient().MxCadController_checkExternalReference(
      { nodeId },
      { fileName }
    ).then(res => res.data),

  /**
   * 刷新外部参照
   */
  refreshExternalReferences: (nodeId: string) =>
    getApiClient().MxCadController_refreshExternalReferences({ nodeId })
      .then(res => res.data),

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

          const response = await getApiClient().MxCadController_uploadExtReferenceDwg(
            undefined,
            formData as any,
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

          const response = await getApiClient().MxCadController_uploadExtReferenceImage(
            undefined,
            formData as any,
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
            formData as any,
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