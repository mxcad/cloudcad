import { useRef, useCallback } from 'react';
import { apiService } from '../services/apiService';

/**
 * 简单的哈希函数
 */
const simpleHash = (buffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(buffer);
  let hash = '';
  for (let i = 0; i < uint8Array.length; i++) {
    hash += uint8Array[i].toString(16).padStart(2, '0');
  }
  return hash.substring(0, 32);
};

/**
 * 计算文件哈希
 */
const calculateFileHash = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const hash = simpleHash(buffer);
      resolve(hash);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export interface MxCadUploadConfig {
  nodeId?: string;
  onBeginUpload?: () => void;
  onProgress?: (percentage: number) => void;
  onSuccess?: (param: LoadFileParam) => void;
  onError?: (error: string) => void;
  onFileQueued?: (file: File) => void;
}

/**
 * 上传成功回调参数类型
 */
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

interface PickerElement extends HTMLInputElement {
  onchange: ((this: GlobalEventHandlers, ev: Event) => any) | null;
}

/**
 * 获取或创建文件选择器
 */
const getPickerEl = (): PickerElement => {
  const pickerId = 'mxcad-file-picker';
  let picker = document.getElementById(pickerId) as PickerElement;
  if (!picker) {
    picker = document.createElement('input');
    picker.id = pickerId;
    picker.type = 'file';
    picker.accept = '.dwg,.dxf';
    picker.style.display = 'none';
    document.body.appendChild(picker);
  }
  return picker;
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
        
        // 验证文件类型 - 支持各种大小写组合
        const fileExtension = '.' + file.name.split('.').pop();
        const allowedExtensions = ['.dwg', '.dxf'];
        const normalizedExtension = fileExtension.toLowerCase();
        
        if (!allowedExtensions.includes(normalizedExtension)) {
          config.onError?.(`文件类型不支持: ${file.name} (支持 .dwg, .dxf)`);
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
          await uploadInChunks(file, hash, config);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.onError?.(`文件 ${file.name} 上传失败: ${errorMessage}`);
        }
      }

      // 重置 input
      inputElement.value = '';
    };

    // 触发文件选择
    inputElement.click();
  }, []);

  /**
   * 分片上传文件
   * 参考原始 upload.ts 设计：
   * 1. 先调用 chunkisExist 检查分片是否存在
   * 2. 如果分片不存在，上传分片
   * 3. 分片上传后自动触发合并（在 chunkisExist 返回 chunkAlreadyExist 时）
   * 4. 最后调用 fileisExist 验证文件
   */
  const uploadInChunks = async (
    file: File,
    hash: string,
    config: MxCadUploadConfig
  ): Promise<void> => {
    const chunkSize = 5 * 1024 * 1024; // 5MB
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    // 检查 nodeId 是否已传递
    if (!config.nodeId) {
      throw new Error('缺少节点ID，请确保已选择目标文件夹');
    }
    
    // 构建请求参数
    const buildRequest = (extra?: Record<string, any>) => ({
      fileHash: hash,
      filename: file.name,
      nodeId: config.nodeId,
      ...extra,
    });
    
    // 1. 先检查文件是否已存在（秒传）
    const existRequest = buildRequest();
    console.log('[fileisExist] 请求:', existRequest);
    const existResponse = await apiService.post('/mxcad/files/fileisExist', existRequest);
    console.log('[fileisExist] 响应:', existResponse.data);
    
    if (existResponse.data.ret === 'fileAlreadyExist') {
      // 秒传成功，但需要确保文件节点已在目标目录创建
      console.log('[fileisExist] 秒传成功，文件节点应在目标目录创建');
      
      config.onSuccess?.({
        file,
        id: hash,
        name: file.name,
        size: file.size,
        type: file.type,
        hash,
        isUseServerExistingFile: true,
        isInstantUpload: true,
        nodeId: config.nodeId,
      });
      return;
    }
    
    // 2. 开始分片上传
    config.onBeginUpload?.();
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      // 检查分片是否存在
      const chunkRequest = buildRequest({
        chunk: chunkIndex,
        chunks: totalChunks,
        size: chunk.size,
      });
      console.log('[chunkisExist] 请求:', chunkRequest);
      const chunkResponse = await apiService.post('/mxcad/files/chunkisExist', chunkRequest);
      console.log('[chunkisExist] 响应:', chunkResponse.data);
      
      if (chunkResponse.data.ret === 'chunkAlreadyExist') {
        // 分片已存在，跳过
        console.log(`[分片 ${chunkIndex}] 已存在，跳过上传`);
        config.onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
        continue;
      }
      
      // 上传分片
      console.log(`[分片 ${chunkIndex}] 开始上传`);
      const formData = new FormData();
      formData.append('file', chunk);
      formData.append('chunk', chunkIndex.toString());
      formData.append('chunks', totalChunks.toString());
      formData.append('name', file.name);
      formData.append('hash', hash);
      formData.append('size', file.size.toString());
      formData.append('nodeId', config.nodeId!);
      
      await apiService.post('/mxcad/files/uploadFiles', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      console.log(`[分片 ${chunkIndex}] 上传完成`);
      config.onProgress?.(((chunkIndex + 1) / totalChunks) * 100);
    }
    
    // 3. 所有分片上传完成，等待后端处理转换
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. 验证文件是否真正上传成功
    let verifyAttempts = 0;
    const maxAttempts = 10;
    let uploadSuccess = false;
    
    while (verifyAttempts < maxAttempts && !uploadSuccess) {
      const verifyRequest = buildRequest();
      console.log(`[验证 ${verifyAttempts + 1}/${maxAttempts}] 请求:`, verifyRequest);
      const verifyResponse = await apiService.post('/mxcad/files/fileisExist', verifyRequest);
      console.log(`[验证 ${verifyAttempts + 1}/${maxAttempts}] 响应:`, verifyResponse.data);
      
      if (verifyResponse.data.ret === 'fileAlreadyExist') {
        uploadSuccess = true;
        config.onSuccess?.({
          file,
          id: hash,
          name: file.name,
          size: file.size,
          type: file.type,
          hash,
          isUseServerExistingFile: false,
          nodeId: config.nodeId,
        });
        break;
      }
      
      verifyAttempts++;
      if (verifyAttempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!uploadSuccess) {
      config.onError?.('文件上传完成，正在后台处理转换，请稍后在文件列表中查看');
    }
  };

  /**
   * 销毁上传器
   */
  const destroy = useCallback(() => {
    const picker = document.getElementById('mxcad-file-picker');
    if (picker) {
      picker.remove();
    }
  }, []);

  return {
    selectFiles,
    destroy,
  };
};