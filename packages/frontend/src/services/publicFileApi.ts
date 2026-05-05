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
// @deprecated Use @/api-sdk instead.

import { AxiosProgressEvent, AxiosInstance } from 'axios';
import type {
  CheckChunkDto,
  MergeChunksDto,
} from '../types/api-client';
import { getAxiosInstance } from './apiClient';

// 延迟获取 axios 实例，避免模块加载时 API client 未初始化
function getAxios(): AxiosInstance {
  return getAxiosInstance();
}

// API 基础路径
export const API_BASE_URL = '/api';

/**
 * 将 FormData 转换为 API 客户端期望的请求体类型
 * OpenAPI 生成的 multipart/form-data 类型定义不精确，需要类型转换
 */
function asFormData<T>(formData: FormData): T {
  return formData as unknown as T;
}

/**
 * 秒传检查请求参数
 */
export interface CheckFilePublicParams {
  /** 文件名 */
  filename: string;
  /** 文件 MD5 哈希 */
  fileHash: string;
}

/**
 * 秒传检查响应
 */
export interface CheckFilePublicResponse {
  /** 文件是否已存在 */
  exist: boolean;
  /** 如果存在，返回文件哈希 */
  hash?: string;
  /** 原始文件名 */
  fileName?: string;
}

/**
 * 分片上传响应
 */
export interface UploadChunkResponse {
  ret: 'success' | 'error';
  isLastChunk?: boolean;
}

/**
 * 合并分片响应
 */
export interface MergeChunksResponse {
  ret: 'success' | 'error';
  /** 文件哈希 */
  hash: string;
  /** 原始文件名 */
  fileName: string;
}

/**
 * 公开文件服务 API
 * 提供无需认证的分片上传和临时令牌访问功能
 */
export const publicFileApi = {
  /**
   * 检查文件是否已存在（秒传检查）
   * 如果文件已存在，直接返回临时令牌
   * @param params 检查参数
   * @returns 文件存在状态和临时令牌
   */
  checkFile: async (params: CheckFilePublicParams): Promise<CheckFilePublicResponse> => {
    const response = await getAxios().post<CheckFilePublicResponse>(
      `${API_BASE_URL}/public-file/file/check`,
      params
    );
    return response.data;
  },

  /**
   * 检查分片是否存在
   * @param params 检查参数
   * @returns 分片存在状态
   */
  checkChunk: async (params: CheckChunkDto): Promise<{ exist: boolean }> => {
    const response = await getAxios().post<{ exist: boolean }>(
      `${API_BASE_URL}/public-file/chunk/check`,
      params
    );
    return response.data;
  },

  /**
   * 上传分片
   * @param formData 包含分片数据的 FormData
   * @param onProgress 上传进度回调
   * @returns 上传结果
   */
  uploadChunk: async (
    formData: FormData,
    onProgress?: (progressEvent: AxiosProgressEvent) => void
  ): Promise<UploadChunkResponse> => {
    const response = await getAxios().post<UploadChunkResponse>(
      `${API_BASE_URL}/public-file/chunk/upload`,
      formData,
      {
        onUploadProgress: onProgress,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * 合并分片并获取文件访问信息
   * @param params 合并参数
   * @returns 文件信息（hash 和扩展名）
   */
  mergeChunks: async (params: MergeChunksDto): Promise<MergeChunksResponse> => {
    const response = await getAxios().post<MergeChunksResponse>(
      `${API_BASE_URL}/public-file/chunk/merge`,
      params,
      { timeout: 300000 }, // 5分钟，合并+图纸转换可能耗时较长
    );
    return response.data;
  },

  /**
   * 获取文件访问 URL（同步，直接返回 API 地址）
   * @param hash 文件哈希
   * @param filename 原始文件名（可选，用于构造更友好的 URL）
   * @returns 文件 URL
   */
  getFileAccessUrl: (hash: string, filename?: string): string => {
    if (filename) {
      return `${API_BASE_URL}/public-file/access/${hash}/${filename}`;
    }
    return `${API_BASE_URL}/public-file/access/${hash}.mxweb`;
  },

  /**
   * 完整的分片上传流程
   * @param file 要上传的文件
   * @param chunkSize 分片大小（默认 5MB）
   * @param onProgress 进度回调
   * @param noCache 是否跳过秒传检查，强制上传（默认 false）
   * @returns 临时令牌信息
   */
  uploadFile: async (
    file: File,
    chunkSize: number = 5 * 1024 * 1024,
    onProgress?: (percentage: number) => void,
    noCache?: boolean
  ): Promise<MergeChunksResponse> => {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / chunkSize);

    // 计算文件 hash
    const { calculateFileHash } = await import('../utils/hashUtils');
    const hash = await calculateFileHash(file);
    if (!noCache) {
      // 先检查秒传
      const checkResult = await publicFileApi.checkFile({
        filename: file.name,
        fileHash: hash,
      });

      if (checkResult.exist && checkResult.hash) {
        return {
          ret: 'success',
          hash: checkResult.hash,
          fileName: checkResult.fileName || file.name,
        };
      }
    }


    let uploadedChunks = 0;

    // 上传每个分片
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      // 重要：先添加其他字段，最后添加 file
      // 这样 Multer 处理文件时 req.body 已经有值了
      formData.append('hash', hash);
      formData.append('name', file.name);
      formData.append('size', totalSize.toString());
      formData.append('chunk', i.toString());
      formData.append('chunks', totalChunks.toString());
      formData.append('file', chunk);  // file 必须最后添加

      await publicFileApi.uploadChunk(formData, (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const chunkProgress = progressEvent.loaded / progressEvent.total;
          const totalProgress = ((uploadedChunks + chunkProgress) / totalChunks) * 100;
          onProgress(totalProgress);
        }
      });

      uploadedChunks++;
      if (onProgress) {
        onProgress((uploadedChunks / totalChunks) * 100);
      }
    }

    // 合并分片
    const result = await publicFileApi.mergeChunks({
      hash,
      name: file.name,
      size: totalSize,
      chunks: totalChunks,
    });

    console.log('[publicFileApi] mergeChunks result:', JSON.stringify(result));

    return result;
  },

  /**
   * 上传外部参照文件（公开接口，无需认证）
   * @param file 外部参照文件
   * @param srcFileHash 主图纸文件的 hash
   * @param extRefFileName 外部参照文件名
   * @param fileHash 文件哈希值（可选）
   * @param onProgress 上传进度回调
   * @returns 上传结果
   */
  uploadExtReference: async (
    file: File,
    srcFileHash: string,
    extRefFileName: string,
    fileHash?: string,
    onProgress?: (progressEvent: AxiosProgressEvent) => void
  ): Promise<{ ret: string; hash?: string; message?: string }> => {
    const formData = new FormData();
    formData.append('srcFileHash', srcFileHash);
    formData.append('extRefFile', extRefFileName);
    if (fileHash) {
      formData.append('hash', fileHash);
    }
    formData.append('file', file);

    const response = await getAxios().post<{ ret: string; hash?: string; message?: string }>(
      `${API_BASE_URL}/public-file/ext-reference/upload`,
      formData,
      {
        onUploadProgress: onProgress,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * 检查外部参照文件是否存在
   * @param srcFileHash 主图纸文件的 hash
   * @param extRefFileName 外部参照文件名
   * @returns 文件存在状态
   */
  checkExtReference: async (
    srcFileHash: string,
    extRefFileName: string
  ): Promise<{ exists: boolean }> => {
    const response = await getAxios().get<{ exists: boolean }>(
      `${API_BASE_URL}/public-file/ext-reference/check`,
      {
        params: {
          srcHash: srcFileHash,
          fileName: extRefFileName,
        },
      }
    );
    return response.data;
  },

  /**
   * 获取预加载数据（外部参照信息）
   * @param hash 文件 hash
   * @returns 预加载数据
   */
  getPreloadingData: async (hash: string) => {
    try {
      const response = await getAxios().get(
        `${API_BASE_URL}/public-file/preloading/${hash}`
      );
      return response.data;
    } catch (error) {
      console.warn('[publicFileApi] getPreloadingData failed:', error);
      return null;
    }
  },
};
