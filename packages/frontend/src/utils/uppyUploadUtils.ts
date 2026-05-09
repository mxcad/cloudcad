///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { mxCadControllerCheckFileExist } from '@/api-sdk';
import { getValidToken, refreshTokenIfNeeded } from '@/utils/tokenUtils';

/**
 * Uppy 事件负载类型——细分各种事件的回调参数，
 * 替代泛型 `any`，使类型检查更精确。
 */

/** upload-success 事件：Uppy 上传成功时触发 */
interface UppyUploadSuccessPayload {
  body?: {
    xhr?: XMLHttpRequest & { getResponseHeader?: (name: string) => string | null };
  };
}

/** total-progress 事件：上传进度更新 */
interface UppyTotalProgressPayload {
  bytesTotal: number;
  bytesUploaded: number;
}

/** complete 事件：上传完成 */
interface UppyCompletePayload {
  successful?: Array<Record<string, unknown>>;
  failed?: Array<{ error?: Error | string }>;
}

/** Extended Uppy type that includes close(), which exists at runtime
 *  but is missing from the @uppy/core type definitions. */
interface UppyWithClose extends Uppy {
  close?: () => void;
  on(event: string, callback: Function): this;
}

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

  const existData = existResponse.data;
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

  // 2. Tus 上传 — 先刷新 token
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const token = await refreshTokenIfNeeded();

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
      endpoint: `${apiBaseUrl}/v1/files`,
      chunkSize: 5 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      onBeforeRequest: (req) => {
        const freshToken = getValidToken();
        if (freshToken) {
          req.setHeader('Authorization', `Bearer ${freshToken}`);
        }
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
    uppy.on('upload-success', (_file: unknown, resp: UppyUploadSuccessPayload) => {
      try {
        const xhr = resp?.body?.xhr;
        if (xhr) {
          uploadedNodeId = xhr.getResponseHeader?.('X-Node-Id') || undefined;
        }
      } catch {
        // 浏览器可能拒绝读取未暴露的响应头
      }
    });

    (uppy as unknown as UppyWithClose).on('total-progress', ((progress: UppyTotalProgressPayload) => {
      if (progress?.bytesTotal > 0) {
        const percentage = Math.round(
          (progress.bytesUploaded / progress.bytesTotal) * 100,
        );
        onProgress?.(percentage);
      }
    }) as unknown as (...args: unknown[]) => void);

    (uppy as unknown as UppyWithClose).on('complete', ((result: UppyCompletePayload) => {
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
      (uppy as unknown as UppyWithClose).clear();
      (uppy as unknown as UppyWithClose).cancelAll?.();
      (uppy as unknown as UppyWithClose).close?.();
    }) as unknown as (...args: unknown[]) => void);

    uppy.on('upload-error', (_file: unknown, err: Error | string) => {
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
      uppy.cancelAll?.();
      (uppy as unknown as UppyWithClose).close?.();
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
      endpoint: `${apiBaseUrl}/v1/files`,
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
    uppy.on('upload-success', (_file: unknown, resp: UppyUploadSuccessPayload) => {
      try {
        const xhr = resp?.body?.xhr;
        if (xhr) {
          uploadedHash = xhr.getResponseHeader?.('X-File-Hash') || undefined;
          uploadedFileName = xhr.getResponseHeader?.('X-File-Name') || undefined;
        }
      } catch {
        // 浏览器可能拒绝读取未暴露的响应头
      }
    });

    (uppy as unknown as UppyWithClose).on('total-progress', ((progress: UppyTotalProgressPayload) => {
      if (progress?.bytesTotal > 0) {
        const percentage = Math.round(
          (progress.bytesUploaded / progress.bytesTotal) * 100,
        );
        onProgress?.(percentage);
      }
    }) as unknown as (...args: unknown[]) => void);

    (uppy as unknown as UppyWithClose).on('complete', ((result: UppyCompletePayload) => {
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
      (uppy as unknown as UppyWithClose).clear();
      (uppy as unknown as UppyWithClose).cancelAll?.();
      (uppy as unknown as UppyWithClose).close?.();
    }) as unknown as (...args: unknown[]) => void);

    uppy.on('upload-error', (_file: unknown, err: Error | string) => {
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
      uppy.cancelAll?.();
      (uppy as unknown as UppyWithClose).close?.();
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
