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

export interface MxCadUploadConfig {
  nodeId?: string;
  onBeginUpload?: () => void;
  onProgress?: (percentage: number) => void;
  onSuccess?: (param: LoadFileParam) => void;
  onError?: (error: string) => void;
  onFileQueued?: (file: File) => void;
}

export class MxCadUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MxCadUploadError';
  }
}

/**
 * 创建 Uppy 实例
 */
function createUppy(config: MxCadUploadConfig, onDone: () => void): Uppy {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const token = getValidToken();

  const uppy = new Uppy({
    debug: false,
    autoProceed: false,
    allowMultipleUploads: false,
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
      filename: '',
      fileHash: '',
      fileSize: '',
      nodeId: config.nodeId || '',
      fileType: '',
    },
  });

  // 文件添加事件：计算文件哈希后自动上传
  let hashComputed = false;
  uppy.on('file-added', (file) => {
    if (hashComputed) return;
    hashComputed = true;

    uppy.setFileMeta(file.id, {
      filename: file.name,
      fileSize: String(file.size),
      fileType: file.type,
      nodeId: config.nodeId || '',
    });

    void (async () => {
      try {
        const hash = await calculateFileHash(file.data as File);
        uppy.setFileMeta(file.id, { fileHash: hash });
        config.onFileQueued?.(file.data as File);
        uppy.upload();
      } catch (error) {
        hashComputed = false;
        console.error('[useUppyUpload] 文件哈希计算失败:', error);
        config.onError?.('文件哈希计算失败');
        onDone();
      }
    })();
  });

  uppy.on('upload-start', () => {
    config.onBeginUpload?.();
  });

  uppy.on('progress', (percentage) => {
    if (typeof percentage === 'number' && percentage >= 0) {
      config.onProgress?.(Math.round(percentage));
    }
  });

  let uploadedNodeId: string | undefined;
  uppy.on('upload-success', (_file, response) => {
    try {
      const body = response?.body as unknown as { xhr?: XMLHttpRequest } | undefined;
      const xhr = body?.xhr;
      if (xhr) {
        uploadedNodeId = xhr.getResponseHeader?.('X-Node-Id') || undefined;
      }
    } catch {
      // 浏览器可能拒绝读取未暴露的响应头
    }
  });

  uppy.on('complete', (result) => {
    if (result.successful && result.successful.length > 0) {
      const file = result.successful[0];
      if (!file) return;

      config.onSuccess?.({
        file: file.data as File,
        id: (file.meta?.fileHash as string) || file.id,
        name: file.name,
        size: file.size ?? 0,
        type: file.type,
        hash: (file.meta?.fileHash as string) || '',
        isUseServerExistingFile: false,
        isInstantUpload: false,
        nodeId: uploadedNodeId || config.nodeId,
      });
    } else if (result.failed && result.failed.length > 0) {
      const failedItem = result.failed[0];
      if (!failedItem) return;
      const uploadError = failedItem.error;
      const errorMessage = typeof uploadError === 'string' ? uploadError : '上传失败';
      config.onError?.(errorMessage);
    }
    onDone();
  });

  uppy.on('upload-error', (_file, error) => {
    config.onError?.(`上传失败: ${error?.message || '未知错误'}`);
    onDone();
  });

  return uppy;
}

/**
 * 使用 Uppy 实现 MxCAD 文件上传 Hook
 *
 * 提供 selectFiles 方法用于按钮触发，以及 uploadFiles 方法用于拖拽上传。
 */
export const useUppyUpload = () => {
  const uppyRef = useRef<Uppy | null>(null);
  const isUploadingRef = useRef(false);

  const markDone = useCallback(() => {
    isUploadingRef.current = false;
  }, []);

  /**
   * 上传指定的文件（供拖拽上传使用）
   */
  const uploadFiles = useCallback((files: File[], config: MxCadUploadConfig) => {
    if (isUploadingRef.current) {
      console.warn('[useUppyUpload] 已有上传进行中，忽略');
      return;
    }

    // 销毁旧实例
    if (uppyRef.current) {
      uppyRef.current.destroy();
      uppyRef.current = null;
    }

    isUploadingRef.current = true;
    const uppy = createUppy(config, markDone);
    uppyRef.current = uppy;

    // 添加文件
    for (const file of files) {
      try {
        uppy.addFile({
          source: 'local',
          name: file.name,
          type: file.type,
          data: file,
        });
      } catch (error) {
        console.error('[useUppyUpload] 添加文件失败:', error);
      }
    }
  }, [markDone]);

  /**
   * 触发文件选择（按钮使用）
   */
  const selectFiles = useCallback((config: MxCadUploadConfig) => {
    if (isUploadingRef.current) {
      console.warn('[useUppyUpload] 已有上传进行中，忽略');
      return;
    }

    // 销毁旧实例
    if (uppyRef.current) {
      uppyRef.current.destroy();
      uppyRef.current = null;
    }

    // 创建临时文件输入
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,.dxf,.mxweb,.mxwbe';
    input.multiple = false;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    input.onchange = (e) => {
      const selectedFiles = (e.target as HTMLInputElement).files;
      if (selectedFiles && selectedFiles.length > 0) {
        uploadFiles(Array.from(selectedFiles), config);
      }
      cleanup();
    };

    // 处理取消（某些浏览器通过 focus 事件检测）
    input.oncancel = () => {
      cleanup();
    };

    input.click();
  }, [uploadFiles]);

  /**
   * 销毁上传器
   */
  const destroy = useCallback(() => {
    if (uppyRef.current) {
      uppyRef.current.destroy();
      uppyRef.current = null;
    }
    isUploadingRef.current = false;
  }, []);

  return {
    selectFiles,
    uploadFiles,
    destroy,
  };
};
