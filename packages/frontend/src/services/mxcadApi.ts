///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { getApiClient } from './apiClient';
import { calculateFileHash } from '../utils/hashUtils';
import type { AxiosProgressEvent } from 'axios';
import axios from 'axios';
import type {
  CheckFileExistDto,
  CheckChunkExistDto,
  UploadFilesDto,
  UploadExtReferenceDto,
  UploadExtReferenceFileDto,
  SaveMxwebDto,
  SaveMxwebAsDto,
  UploadThumbnailDto,
} from '../types/api-client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
    const res = await getApiClient().MxCadController_checkFileExist(
      undefined,
      params
    );
    return res.data;
  },

  /**
   * 检查目录中是否存在重复文件（相同文件名和hash）
   * @param params 检查参数
   * @returns 重复检查结果
   */
  checkDuplicateFile: async (params: {
    fileHash: string;
    filename: string;
    nodeId: string;
    currentFileId?: string;
  }) => {
    const res = await getApiClient().MxCadController_checkDuplicateFile(
      undefined,
      params
    );
    return res.data;
  },

  /**
   * 检查分片是否已存在
   */
  checkChunkExist: async (params: CheckChunkExistDto) => {
    const res = await getApiClient().MxCadController_checkChunkExist(
      undefined,
      params
    );
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
    const res = await getApiClient().MxCadController_getPreloadingData({
      nodeId,
    });
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
    const res = await getApiClient().MxCadController_refreshExternalReferences({
      nodeId,
    });
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
          formData.append('ext_ref_file', extRefFile);
          formData.append('file', file);

          const response =
            await getApiClient().MxCadController_uploadExtReferenceDwg(
              { nodeId },
              asFormData<UploadExtReferenceFileDto>(formData),
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
    updatePreloading?: boolean,
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
          if (updatePreloading !== undefined) {
            formData.append('updatePreloading', String(updatePreloading));
          }
          formData.append('file', file);

          const response =
            await getApiClient().MxCadController_uploadExtReferenceImage(
              undefined,
              asFormData<UploadExtReferenceFileDto>(formData),
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
    commitMessage?: string,
    expectedTimestamp?: string
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
          if (expectedTimestamp) {
            formData.append('expectedTimestamp', expectedTimestamp);
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

  /**
   * 保存 mxweb 文件为新文件（Save As）
   * @param blob mxweb 文件的 Blob 对象
   * @param targetType 保存类型: personal-我的图纸, project-项目
   * @param targetParentId 目标父节点ID
   * @param projectId 项目ID（targetType为project时必填）
   * @param format 保存格式: dwg, dxf
   * @param onProgress 上传进度回调
   * @param commitMessage 提交信息（可选）
   * @returns Promise
   */
  saveMxwebAs: (
    blob: Blob,
    targetType: 'personal' | 'project',
    targetParentId: string,
    projectId: string | undefined,
    format: 'dwg' | 'dxf',
    onProgress?: (percentage: number) => void,
    commitMessage?: string,
    fileName?: string
  ) => {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const file = new File([blob], 'drawing.mxweb', {
            type: 'application/octet-stream',
          });

          const formData = new FormData();
          formData.append('file', file);
          formData.append('targetType', targetType);
          formData.append('targetParentId', targetParentId);
          if (projectId) {
            formData.append('projectId', projectId);
          }
          formData.append('format', format);
          if (commitMessage) {
            formData.append('commitMessage', commitMessage);
          }
          if (fileName) {
            formData.append('fileName', fileName);
          }

          const response = await getApiClient().MxCadController_saveMxwebAs(
            {},
            asFormData<SaveMxwebAsDto>(formData),
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
