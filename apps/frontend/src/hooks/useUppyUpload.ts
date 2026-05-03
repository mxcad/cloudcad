///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useRef, useCallback, useMemo } from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { calculateFileHash } from '../utils/hashUtils';

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
    return localStorage.getItem('accessToken');
  }, []);

  /**
   * 初始化 Uppy 实例
   */
  const createUppyInstance = useCallback((config: MxCadUploadConfig): Uppy => {
    const apiBaseUrl = getApiBaseUrl();
    const token = getAuthToken();
    
    const uppy = new Uppy({
      debug: false,
      autoProceed: true,
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
      metadata: (file: any) => {
        const fileMeta = file.meta || {};
        return {
          filename: file.name,
          fileHash: fileMeta.fileHash || '',
          fileSize: String(file.size),
          nodeId: config.nodeId || '',
          fileType: file.type,
        };
      },
    });

    // 文件添加事件：计算文件哈希
    uppy.on('file-added', async (file: any) => {
      try {
        // 计算文件哈希值
        const hash = await calculateFileHash(file.data as File);
        // 更新文件元数据
        uppy.setFileMeta(file.id, {
          fileHash: hash,
        });
        // 触发 onFileQueued 回调
        config.onFileQueued?.(file.data as File);
      } catch (error) {
        console.error('[useUppyUpload] 文件哈希计算失败:', error);
      }
    });

    // 上传开始事件
    uppy.on('upload-started', () => {
      config.onBeginUpload?.();
    });

    // 上传进度事件
    uppy.on('total-progress', (progress: any) => {
      if (progress && typeof progress.bytesTotal === 'number' && progress.bytesTotal > 0) {
        const percentage = Math.round((progress.bytesUploaded / progress.bytesTotal) * 100);
        config.onProgress?.(percentage);
      }
    });

    // 上传完成事件
    uppy.on('complete', (result: any) => {
      if (result.successful && result.successful.length > 0) {
        const file = result.successful[0];
        
        // 构建成功回调参数
        const successParam: LoadFileParam = {
          file: file.data as File,
          id: file.meta?.fileHash || file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          hash: file.meta?.fileHash || '',
          isUseServerExistingFile: false, // Uppy 没有直接支持，需额外处理
          isInstantUpload: false,
          nodeId: config.nodeId,
        };

        config.onSuccess?.(successParam);
      } else if (result.failed && result.failed.length > 0) {
        const error = result.failed[0].error;
        const errorMessage = error instanceof Error 
          ? error.message 
          : typeof error === 'string' 
            ? error 
            : '上传失败';
        
        config.onError?.(errorMessage);
      }

      // 清理 Uppy 实例
      uppy.close();
    });

    // 上传失败事件
    uppy.on('upload-error', (file: any, error: any) => {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : '上传失败';
      
      config.onError?.(`文件 ${file.name} 上传失败: ${errorMessage}`);
    });

    return uppy;
  }, [getApiBaseUrl, getAuthToken]);

  /**
   * 触发文件选择
   */
  const selectFiles = useCallback((config: MxCadUploadConfig) => {
    currentConfigRef.current = config;

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

        // 手动开始上传（因为 autoProceed 可能不立即生效）
        setTimeout(() => {
          uppy.upload();
        }, 100);
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
      uppyRef.current.close();
      uppyRef.current = null;
    }
  }, []);

  return {
    selectFiles,
    destroy,
  };
};
