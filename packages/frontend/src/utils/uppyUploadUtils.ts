///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { mxCadControllerCheckFileExist } from '@/api-sdk';

/**
 * 上传配置
 */
export interface UppyUploadOptions {
  /** 文件对象 */
  file: File;
  /** 文件哈希值 */
  hash: string;
  /** 目标节点 ID */
  nodeId: string;
  /** 冲突策略：skip（跳过）/ overwrite（覆盖）/ rename（重命名） */
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
  /** 开始上传回调 */
  onBeginUpload?: () => void;
  /** 进度回调 */
  onProgress?: (percentage: number) => void;
  /** 文件排队回调 */
  onFileQueued?: (file: File) => void;
}

/**
 * 上传结果
 */
export interface UppyUploadResult {
  /** 文件对象 */
  file: File;
  /** 文件哈希值 */
  hash: string;
  /** 节点 ID */
  nodeId: string;
  /** 文件名 */
  name: string;
  /** 文件大小 */
  size: number;
  /** MIME 类型 */
  type: string;
  /** 是否使用服务器已有文件（秒传） */
  isUseServerExistingFile: boolean;
  /** 是否为秒传 */
  isInstantUpload: boolean;
}

/**
 * 匿名上传结果
 */
export interface UppyPublicUploadResult {
  /** 文件哈希值 */
  hash: string;
  /** 文件名 */
  fileName: string;
}

/**
 * 上传错误
 */
export class UppyUploadError extends Error {
  constructor(
    message: string,
    public readonly fileName?: string,
  ) {
    super(message);
    this.name = 'UppyUploadError';
  }
}

/**
 * 上传文件（秒传预检查 + Tus 协议）
 *
 * @param options 上传配置
 * @returns 上传结果
 * @throws UppyUploadError 上传失败时抛出
 */
export const uploadFileWithUppy = async (
  options: UppyUploadOptions,
): Promise<UppyUploadResult> => {
  const {
    file,
    hash,
    nodeId,
    conflictStrategy,
    onBeginUpload,
    onProgress,
    onFileQueued,
  } = options;

  if (!nodeId) {
    throw new UppyUploadError('缺少节点 ID，请确保已选择目标文件夹');
  }

  onFileQueued?.(file);

  // 1. 秒传预检查
  const existResponse = await mxCadControllerCheckFileExist({
    body: {
      fileHash: hash,
      filename: file.name,
      nodeId,
      fileSize: file.size,
      conflictStrategy,
    },
  });

  const existData = existResponse.data as any;
  if (existData?.exists && existData?.nodeId) {
    return {
      file,
      hash,
      nodeId: existData.nodeId,
      name: file.name,
      size: file.size,
      type: file.type,
      isUseServerExistingFile: true,
      isInstantUpload: true,
    };
  }

  // 2. Tus 上传
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const token = localStorage.getItem('accessToken');

  return new Promise<UppyUploadResult>((resolve, reject) => {
    const uppy = new Uppy({
      debug: false,
      autoProceed: false,
      restrictions: {
        maxFileSize: 100 * 1024 * 1024,
        allowedFileTypes: ['.dwg', '.dxf', '.mxweb', '.mxwbe'],
        maxNumberOfFiles: 1,
      },
    });

    uppy.use(Tus, {
      endpoint: `${apiBaseUrl}/api/v1/files`,
      chunkSize: 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      metadata: {
        filename: file.name,
        fileHash: hash,
        fileSize: String(file.size),
        nodeId,
        fileType: file.type,
        ...(conflictStrategy ? { conflictStrategy } : {}),
      },
    });

    // 从 Tus 响应头中提取 nodeId
    let uploadedNodeId: string | undefined;
    uppy.on('upload-success', (_file: any, resp: any) => {
      const xhr = resp?.body?.xhr;
      if (xhr) {
        uploadedNodeId = xhr.getResponseHeader?.('X-Node-Id') || undefined;
      }
    });

    (uppy as any).on('total-progress', (progress: any) => {
      if (progress?.bytesTotal > 0) {
        const percentage = Math.round(
          (progress.bytesUploaded / progress.bytesTotal) * 100,
        );
        onProgress?.(percentage);
      }
    });

    uppy.on('complete', (result: any) => {
      const successful = result.successful?.[0];
      if (successful) {
        resolve({
          file,
          hash,
          nodeId: uploadedNodeId || nodeId,
          name: file.name,
          size: file.size,
          type: file.type,
          isUseServerExistingFile: false,
          isInstantUpload: false,
        });
      } else {
        const err = result.failed?.[0]?.error;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : '上传失败';
        reject(new UppyUploadError(message, file.name));
      }
      uppy.clear();
      // @ts-ignore - close exists at runtime despite missing type definitions
      uppy.cancelAll?.();
      uppy.close?.();
    });

    uppy.on('upload-error', (_file: any, err: any) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : '上传失败';
      reject(
        new UppyUploadError(
          `文件 ${file.name} 上传失败: ${message}`,
          file.name,
        ),
      );
      uppy.clear();
      // @ts-ignore - close exists at runtime despite missing type definitions
      uppy.cancelAll?.();
      uppy.close?.();
    });

    uppy.addFile({
      source: 'local',
      name: file.name,
      type: file.type,
      data: file,
      meta: { fileHash: hash },
    });

    uppy.upload();
  });
};

/**
 * 匿名上传文件（未登录用户，Tus 协议）
 *
 * @param options 上传配置
 * @returns 匿名上传结果（hash + fileName）
 * @throws UppyUploadError 上传失败时抛出
 */
export const uploadFilePublic = async (options: {
  file: File;
  hash: string;
  onProgress?: (percentage: number) => void;
}): Promise<UppyPublicUploadResult> => {
  const { file, hash, onProgress } = options;

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';

  return new Promise<UppyPublicUploadResult>((resolve, reject) => {
    const uppy = new Uppy({
      debug: false,
      autoProceed: false,
      restrictions: {
        maxFileSize: 500 * 1024 * 1024,
        maxNumberOfFiles: 1,
      },
    });

    uppy.use(Tus, {
      endpoint: `${apiBaseUrl}/api/v1/files`,
      chunkSize: 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      metadata: {
        filename: file.name,
        fileHash: hash,
        fileSize: String(file.size),
        fileType: file.type,
      },
    });

    // 从 Tus 响应头中提取 hash 和 fileName
    let uploadedHash: string | undefined;
    let uploadedFileName: string | undefined;
    uppy.on('upload-success', (_file: any, resp: any) => {
      const xhr = resp?.body?.xhr;
      if (xhr) {
        uploadedHash = xhr.getResponseHeader?.('X-File-Hash') || undefined;
        uploadedFileName = xhr.getResponseHeader?.('X-File-Name') || undefined;
      }
    });

    (uppy as any).on('total-progress', (progress: any) => {
      if (progress?.bytesTotal > 0) {
        const percentage = Math.round(
          (progress.bytesUploaded / progress.bytesTotal) * 100,
        );
        onProgress?.(percentage);
      }
    });

    uppy.on('complete', (result: any) => {
      const successful = result.successful?.[0];
      if (successful) {
        resolve({
          hash: uploadedHash || hash,
          fileName: uploadedFileName || file.name,
        });
      } else {
        const err = result.failed?.[0]?.error;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : '上传失败';
        reject(new UppyUploadError(message, file.name));
      }
      uppy.clear();
      // @ts-ignore - close exists at runtime despite missing type definitions
      uppy.cancelAll?.();
      uppy.close?.();
    });

    uppy.on('upload-error', (_file: any, err: any) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : '上传失败';
      reject(
        new UppyUploadError(
          `文件 ${file.name} 上传失败: ${message}`,
          file.name,
        ),
      );
      uppy.clear();
      // @ts-ignore - close exists at runtime despite missing type definitions
      uppy.cancelAll?.();
      uppy.close?.();
    });

    uppy.addFile({
      source: 'local',
      name: file.name,
      type: file.type,
      data: file,
      meta: { fileHash: hash },
    });

    uppy.upload();
  });
};
