import { useRef, useCallback } from 'react';
import { apiService } from '../services/apiService';

// 全局文件选择器元素
let pickerEl: HTMLInputElement | null = null;

/**
 * 获取全局文件选择器元素
 */
const getPickerEl = (): HTMLInputElement => {
  if (!pickerEl) {
    pickerEl = document.createElement('input');
    pickerEl.type = 'file';
    pickerEl.multiple = true;
    pickerEl.accept = '.dwg,.DWG,.dxf,.DXF';
    pickerEl.style.position = 'absolute';
    pickerEl.style.left = '-9999px';
    pickerEl.style.top = '-9999px';
    pickerEl.style.opacity = '0';
    document.body.appendChild(pickerEl);
  }
  return pickerEl;
};

/**
 * 文件上传参数接口
 */
export interface LoadFileParam {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  hash?: string;
  isUseServerExistingFile?: boolean;
  file_path?: string;
}

/**
 * 上传配置接口
 */
export interface MxCadUploadConfig {
  /** 项目ID */
  projectId?: string;
  /** 父文件夹ID */
  parentId?: string;
  /** 上传成功回调 */
  onSuccess?: (param: LoadFileParam) => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 进度回调 */
  onProgress?: (percentage: number) => void;
  /** 文件排队回调 */
  onFileQueued?: (file: File) => void;
  /** 开始上传回调 */
  onBeginUpload?: () => void;
}

/**
 * 计算文件哈希
 */
const calculateFileHash = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      // 简单的哈希计算（生产环境建议使用 crypto.subtle.digest）
      const hash = await simpleHash(buffer);
      resolve(hash);
    };
    reader.readAsArrayBuffer(file);
  });
};

/**
 * 简单的哈希函数
 */
const simpleHash = async (buffer: ArrayBuffer): Promise<string> => {
  const uint8Array = new Uint8Array(buffer);
  let hash = '';
  for (let i = 0; i < uint8Array.length; i++) {
    hash += uint8Array[i].toString(16).padStart(2, '0');
  }
  return hash.substring(0, 32); // 返回前32位作为哈希值
};

/**
 * 分片上传文件
 */
const uploadInChunks = async (
  file: File,
  hash: string,
  config: MxCadUploadConfig,
  onProgress: (percentage: number) => void
): Promise<void> => {
  const chunkSize = 5 * 1024 * 1024; // 5MB
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  // 检查文件是否已存在
  try {
    const existResponse = await apiService.post('/mxcad/files/fileisExist', {
      fileHash: hash,
      filename: file.name,
      projectId: config.projectId,
      parentId: config.parentId,
    });

    if (existResponse.data.ret === 'fileAlreadyExist') {
      // 文件已存在，秒传
      config.onSuccess?.({
        file,
        id: hash,
        name: file.name,
        size: file.size,
        type: file.type,
        hash,
        isUseServerExistingFile: true,
      });
      return;
    }
  } catch (error) {
    config.onError?.('文件检查失败');
    throw error;
  }

  // 开始分片上传
  config.onBeginUpload?.();
  
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);

    // 检查分片是否存在
    try {
      const chunkResponse = await apiService.post('/mxcad/files/chunkisExist', {
        chunk: chunkIndex,
        chunks: totalChunks,
        fileName: file.name,
        fileHash: hash,
        size: chunk.size,
        projectId: config.projectId,
        parentId: config.parentId,
      });

      if (chunkResponse.data.ret === 'chunkAlreadyExist') {
        // 分片已存在，跳过
        onProgress(((chunkIndex + 1) / totalChunks) * 100);
        continue;
      }
    } catch (error) {
      // 检查失败，继续上传
    }

    // 上传分片
    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('chunk', chunkIndex.toString());
    formData.append('chunks', totalChunks.toString());
    formData.append('name', file.name);
    formData.append('hash', hash);
    formData.append('size', file.size.toString());
    formData.append('projectId', config.projectId || '');
    formData.append('parentId', config.parentId || '');

    try {
      await apiService.post('/mxcad/files/uploadFiles', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      onProgress(((chunkIndex + 1) / totalChunks) * 100);
    } catch (error) {
      config.onError?.(`分片 ${chunkIndex + 1} 上传失败`);
      throw error;
    }
  }

  // 完成上传
  try {
    const completeResponse = await apiService.post('/mxcad/files/uploadFiles', {
      name: file.name,
      hash: hash,
      size: file.size,
      chunks: totalChunks,
      projectId: config.projectId,
      parentId: config.parentId,
    });

    if (completeResponse.data.ret === 'ok') {
      config.onSuccess?.({
        file,
        id: hash,
        name: file.name,
        size: file.size,
        type: file.type,
        hash,
        isUseServerExistingFile: false,
      });
    } else {
      config.onError?.('文件转换失败');
    }
  } catch (error) {
    config.onError?.('文件上传完成确认失败');
    throw error;
  }
};

/**
 * MxCAD 文件上传 Hook（原生实现）
 */
export const useMxCadUploadNative = () => {
  const currentConfigRef = useRef<MxCadUploadConfig>({});

  /**
   * 触发文件选择
   */
  const selectFiles = useCallback((config: MxCadUploadConfig) => {
    currentConfigRef.current = config;

    const inputElement = getPickerEl();
    
    inputElement.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 验证文件类型
        const allowedExtensions = ['.dwg', '.DWG', '.dxf', '.DXF'];
        const fileExtension = '.' + file.name.split('.').pop();
        if (!allowedExtensions.includes(fileExtension)) {
          config.onError?.(`文件类型不支持: ${file.name}`);
          continue;
        }

        // 验证文件大小（100MB）
        if (file.size > 100 * 1024 * 1024) {
          config.onError?.(`文件过大: ${file.name} (最大100MB)`);
          continue;
        }

        try {
          config.onFileQueued?.(file);
          
          // 计算文件哈希
          const hash = await calculateFileHash(file);
          
          // 开始上传
          await uploadInChunks(file, hash, config, (percentage) => {
            config.onProgress?.(percentage);
          });
          
        } catch (error) {
          config.onError?.(`文件 ${file.name} 上传失败`);
        }
      }

      // 重置 input
      inputElement.value = '';
    };

    // 触发文件选择
    inputElement.click();
  }, []);

  /**
   * 销毁上传器
   */
  const destroyUploader = useCallback(() => {
    if (pickerEl) {
      pickerEl.remove();
      pickerEl = null;
    }
  }, []);

  return {
    selectFiles,
    destroyUploader,
  };
};