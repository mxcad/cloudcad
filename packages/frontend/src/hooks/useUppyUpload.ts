///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useRef, useCallback } from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { calculateFileHash } from '../utils/hashUtils';
import { getValidToken } from '@/utils/tokenUtils';

// 导出 LoadFileParam 接口，保持和 useMxCadUploadNative 的兼容性
export interface LoadFileParam {
  /** 原始文件对象 */
  file: File;
  /** 文件ID（哈希值） */
  id: string;
  /** 文件名 */
  name: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  type: string;
  /** 文件哈希值 */
  hash: string;
  /** 是否使用服务器已有文件（秒传） */
  isUseServerExistingFile: boolean;
  /** 是否为秒传 */
  isInstantUpload?: boolean;
  /** 节点ID（上传到的位置） */
  nodeId?: string;
}

/**
 * Uppy 文件对象（精简自 @uppy/core 的 UppyFile）
 */
interface UppyFile {
  id: string;
  name: string;
  size: number;
  type: string;
  data: File | Blob;
  meta: Record<string, unknown>;
  source?: string;
  isRemote?: boolean;
  remote?: { body?: { xhr?: XMLHttpRequest } };
}

/**
 * Uppy 上传结果
 */
interface UppyCompleteResult {
  successful: UppyFile[];
  failed: Array<{ error: unknown }>;
}

/**
 * Uppy 进度信息
 */
interface UppyProgress {
  bytesTotal: number;
  bytesUploaded: number;
}

/**
 * Uppy 扩展事件 — 补充 @uppy/core 类型定义中缺失的事件
 */
interface UppyExtended extends Uppy {
  on(event: 'upload-started', callback: () => void): this;
  on(event: 'total-progress', callback: (progress: UppyProgress) => void): this;
  close(): void;
}

export interface MxCadUploadConfig {
  nodeId?: string;
  onBeginUpload?: () => void;
  onProgress?: (percentage: number) => void;
  onSuccess?: (param: LoadFileParam) => void;
  onError?: (error: string) => void;
  onFileQueued?: (file: File) => void;
}

/**
 * 错误类型
 */
export class MxCadUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MxCadUploadError';
  }
}

/**
 * 使用 Uppy 实现 MxCAD 文件上传 Hook
 *
 * 功能特性：
 * - 使用标准 Tus 协议进行分片上传
 * - 支持断点续传
 * - 支持文件哈希计算和秒传（预留接口）
 * - 保持和 useMxCadUploadNative 相同的 API
 */
export const useUppyUpload = () => {
  const uppyRef = useRef<Uppy | null>(null);
  const currentConfigRef = useRef<MxCadUploadConfig>({});
  const isUploadingRef = useRef(false);

  /**
   * 获取 API Base URL
   */
  const getApiBaseUrl = useCallback((): string => {
    // 从环境变量或默认值获取
    return import.meta.env.VITE_API_BASE_URL || '';
  }, []);

  /**
   * 获取认证 Token
   */
  const getAuthToken = useCallback((): string | null => {
    return getValidToken();
  }, []);

  /**
   * 初始化 Uppy 实例
   */
  const createUppyInstance = useCallback((config: MxCadUploadConfig): Uppy => {
    const apiBaseUrl = getApiBaseUrl();
    const token = getAuthToken();
    
    const uppy = new Uppy({
      debug: false,
      autoProceed: false,
      allowMultipleUploads: false,
      restrictions: {
        maxFileSize: 100 * 1024 * 1024, // 100MB
        allowedFileTypes: ['.dwg', '.dxf', '.mxweb', '.mxwbe'],
        maxNumberOfFiles: 1,
      },
    });

    // 安装 Tus 插件
    uppy.use(Tus, {
      endpoint: `${apiBaseUrl}/api/v1/files`,
      chunkSize: 5 * 1024 * 1024, // 5MB，和后端保持一致
      retryDelays: [0, 1000, 3000, 5000],
      // 添加认证 header
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // 元数据配置
      metadata: (file: UppyFile) => {
        const fileMeta = file.meta || {};
        return {
          filename: file.name,
          fileHash: (fileMeta.fileHash as string) || '',
          fileSize: String(file.size),
          nodeId: config.nodeId || '',
          fileType: file.type,
        };
      },
    });

    // 文件添加事件：计算文件哈希
    let uploadStarted = false;
    uppy.on('file-added', async (file: UppyFile) => {
      // 防止并发：若 upload 已调用则跳过，避免 Uppy 抛出 "already uploading"
      if (uploadStarted) return;
      uploadStarted = true;

      try {
        // 计算文件哈希值
        const hash = await calculateFileHash(file.data as File);
        // 更新文件元数据
        uppy.setFileMeta(file.id, {
          fileHash: hash,
        });
        // 触发 onFileQueued 回调
        config.onFileQueued?.(file.data as File);

        // 哈希计算完成后再启动上传（autoProceed 关闭时需手动触发）
        uppy.upload();
      } catch (error) {
        uploadStarted = false;
        console.error('[useUppyUpload] 文件哈希计算失败:', error);
      }
    });

    // 上传开始事件（@uppy/core 类型定义缺少此事件，使用扩展类型）
    (uppy as UppyExtended).on('upload-started', () => {
      config.onBeginUpload?.();
    });

    // 上传进度事件（@uppy/core 类型定义缺少此事件，使用扩展类型）
    (uppy as UppyExtended).on('total-progress', (progress: UppyProgress) => {
      if (progress && typeof progress.bytesTotal === 'number' && progress.bytesTotal > 0) {
        const percentage = Math.round((progress.bytesUploaded / progress.bytesTotal) * 100);
        config.onProgress?.(percentage);
      }
    });

    // 从 Tus 响应头中提取 nodeId
    let uploadedNodeId: string | undefined;
    uppy.on('upload-success', (_file: UppyFile, resp: { body?: { xhr?: XMLHttpRequest } }) => {
      const xhr = resp?.body?.xhr;
      if (xhr) {
        uploadedNodeId = xhr.getResponseHeader?.('X-Node-Id') || undefined;
      }
    });

    // 上传完成事件
    uppy.on('complete', (result: UppyCompleteResult) => {
      if (result.successful && result.successful.length > 0) {
        const file = result.successful[0];
        if (!file) return;

        // 构建成功回调参数
        const successParam: LoadFileParam = {
          file: file.data as File,
          id: (file.meta?.fileHash as string) || file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          hash: (file.meta?.fileHash as string) || '',
          isUseServerExistingFile: false,
          isInstantUpload: false,
          // uploadedNodeId 来自 Tus 响应头 X-Node-Id；上传失败时 fallback 到目标文件夹 nodeId
          nodeId: uploadedNodeId || config.nodeId,
        };

        config.onSuccess?.(successParam);
      } else if (result.failed && result.failed.length > 0) {
        const failedItem = result.failed[0];
        if (!failedItem) return;
        const uploadError = failedItem.error;
        const errorMessage = uploadError instanceof Error
          ? uploadError.message
          : typeof uploadError === 'string'
            ? uploadError
            : '上传失败';

        config.onError?.(errorMessage);
      }

      // 清理 Uppy 实例（@uppy/core 类型定义缺少 close 方法，使用扩展类型）
      (uppy as UppyExtended).close();
      isUploadingRef.current = false;
    });

    // 上传失败事件
    uppy.on('upload-error', (file: UppyFile, uploadError: unknown) => {
      const errorMessage = uploadError instanceof Error
        ? uploadError.message
        : typeof uploadError === 'string'
          ? uploadError
          : '上传失败';

      config.onError?.(`文件 ${file.name} 上传失败: ${errorMessage}`);
      isUploadingRef.current = false;
    });

    return uppy;
  }, [getApiBaseUrl, getAuthToken]);

  /**
   * 触发文件选择
   */
  const selectFiles = useCallback((config: MxCadUploadConfig) => {
    // 防止并发：如果已有上传在进行中，忽略新的文件选择
    if (isUploadingRef.current) return;

    currentConfigRef.current = config;

    // 销毁旧实例（防止残留上传与新实例冲突）
    if (uppyRef.current) {
      (uppyRef.current as UppyExtended).close();
      uppyRef.current = null;
    }

    isUploadingRef.current = true;

    // 创建 Uppy 实例
    const uppy = createUppyInstance(config);
    uppyRef.current = uppy;

    // 创建临时文件输入元素
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,.dxf,.mxweb,.mxwbe';
    input.style.display = 'none';
    document.body.appendChild(input);

    // 监听文件选择
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        // 将文件添加到 Uppy
        Array.from(files).forEach(file => {
          uppy.addFile({
            source: 'local',
            name: file.name,
            type: file.type,
            data: file,
          });
        });

        // autoProceed 已关闭，upload 由 file-added 事件中的哈希计算完成后触发
      }

      // 清理
      document.body.removeChild(input);
    };

    // 触发文件选择
    input.click();
  }, [createUppyInstance]);

  /**
   * 销毁上传器
   */
  const destroy = useCallback(() => {
    if (uppyRef.current) {
      (uppyRef.current as UppyExtended).close();
      uppyRef.current = null;
    }
    isUploadingRef.current = false;
  }, []);

  return {
    selectFiles,
    destroy,
  };
};
