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
    pickerEl.accept = '.dwg,.dxf,.DWG,.DXF,.Dwg,.dWg,.Dxf,.dXF';
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
  /** 是否为秒传（文件已存在） */
  isInstantUpload?: boolean;
  /** 文件上传的目标父目录ID */
  parentId?: string;
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
  /** 上传进度回调 */
  onProgress?: (percentage: number) => void;
  /** 文件加入队列回调 */
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
      const existRequest: any = {
        fileHash: hash,
        filename: file.name,
      };
      
      if (config.projectId) {
        existRequest.projectId = config.projectId;
      }
      if (config.parentId) {
        existRequest.parentId = config.parentId;
      }
      
      // 检查 projectId 是否已传递
      if (!config.projectId) {
        throw new Error('缺少项目ID，请确保已选择项目或文件夹');
      }
      
      const existResponse = await apiService.post('/mxcad/files/fileisExist', existRequest);
      if (existResponse.data.ret === 'fileAlreadyExist') {
        // 文件已存在，秒传
        // 等待更长时间，确保后端已完成文件系统节点的创建和数据库事务提交
        // 秒传时需要更长的等待时间，因为后端可能需要创建引用节点
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        config.onSuccess?.({
          file,
          id: hash,
          name: file.name,
          size: file.size,
          type: file.type,
          hash,
          isUseServerExistingFile: true,
          // 标记为秒传，前端可以据此调整刷新策略
          isInstantUpload: true,
          // 传递上传目标目录信息
          parentId: config.parentId,
        });
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件检查失败，请确保已选择项目';
      config.onError?.(errorMessage);
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
          const chunkRequest: any = {
            chunk: chunkIndex,
            chunks: totalChunks,
            fileName: file.name,
            fileHash: hash,
            size: chunk.size,
          };
          
          if (config.projectId) {
            chunkRequest.projectId = config.projectId;
          }
          if (config.parentId) {
            chunkRequest.parentId = config.parentId;
          }
          
          const chunkResponse = await apiService.post('/mxcad/files/chunkisExist', chunkRequest);
          if (chunkResponse.data.ret === 'chunkAlreadyExist') {
                  // 分片已存在，跳过
                  onProgress(((chunkIndex + 1) / totalChunks) * 100);
                  continue;
                }
        } catch (error) {
          // 检查失败，继续上传，但记录日志
          console.warn(`分片 ${chunkIndex} 检查失败，继续上传`);
        }
    // 上传分片
const formData = new FormData();
    
    formData.append('file', chunk);
    formData.append('chunk', chunkIndex.toString());
    formData.append('chunks', totalChunks.toString());
    formData.append('name', file.name);
    formData.append('hash', hash);
    formData.append('size', file.size.toString());
    
    if (config.projectId) {
      formData.append('projectId', config.projectId);
    }
    
    if (config.parentId) {
      formData.append('parentId', config.parentId);
    }
    
    try {
const response = await apiService.post('/mxcad/files/uploadFiles', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      if (response.data.ret === 'errorparam') {
        console.warn(`分片 ${chunkIndex} 参数错误`);
      }
      
      onProgress(((chunkIndex + 1) / totalChunks) * 100);
    } catch (error) {
      // 分片上传失败，记录错误并继续上传下一个分片
      console.error(`分片 ${chunkIndex} 上传失败:`, error);
      // 不抛出错误，继续上传下一个分片
    }
  }
  // 所有分片上传完成，发送合并请求
  try {
    const mergeRequest: any = {
      hash: hash,
      name: file.name,
      size: file.size,
      chunks: totalChunks,
    };
    
    if (config.projectId) {
      mergeRequest.projectId = config.projectId;
    }
    if (config.parentId) {
      mergeRequest.parentId = config.parentId;
    }
    
    const mergeResponse = await apiService.post('/mxcad/files/uploadFiles', mergeRequest);
    if (mergeResponse.data.ret !== 'ok' && mergeResponse.data.ret !== 'errorparam') {
      console.warn(`合并请求返回非预期结果: ${mergeResponse.data.ret}`);
    }
  } catch (error) {
    console.error('合并请求失败，继续执行验证:', error);
  }
  // 完成上传 - 等待一段时间让后端处理转换
  try {
    // 静默：所有分片上传完成，等待后端处理转换
    
    // 等待后端处理转换 - 增加初始等待时间
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 验证文件是否真正上传成功 - 检查文件是否存在
    let verifyAttempts = 0;
    const maxAttempts = 10; // 增加重试次数
    let uploadSuccess = false;
    
    while (verifyAttempts < maxAttempts && !uploadSuccess) {
      try {
        const verifyRequest: any = {
          fileHash: hash,
          filename: file.name,
        };
        
        if (config.projectId) {
          verifyRequest.projectId = config.projectId;
        }
        if (config.parentId) {
          verifyRequest.parentId = config.parentId;
        }
        
        const verifyResponse = await apiService.post('/mxcad/files/fileisExist', verifyRequest);
if (verifyResponse.data.ret === 'fileAlreadyExist') {
          // 静默：文件验证成功，上传完成
uploadSuccess = true;
          
          config.onSuccess?.({
            file,
            id: hash,
            name: file.name,
            size: file.size,
            type: file.type,
            hash,
            isUseServerExistingFile: false,
          });
          break;
                } else {
                  console.log(`文件验证中 (尝试 ${verifyAttempts}/${maxAttempts})`);
                }
              } catch (error) {
                console.error(`验证请求失败 (尝试 ${verifyAttempts}/${maxAttempts}):`, error);
              }      
      verifyAttempts++;
      if (verifyAttempts < maxAttempts) {
        // 递增等待时间，给后端更多处理时间
        const waitTime = Math.min(1000 + (verifyAttempts * 500), 3000);
await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

        if (!uploadSuccess) {
          // 文件验证失败，但后端可能仍在处理转换
          // 给用户友好的提示
          console.warn(`文件 ${file.name} 验证超时，后端可能仍在处理`);
          config.onError?.('文件上传完成，正在后台处理转换，请稍后在文件列表中查看');
        }
      } catch (error) {
        console.error('最终验证异常:', error);
        config.onError?.('文件上传完成，但验证过程异常，请稍后检查文件列表');
      }};

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
        const allowedExtensions = ['dwg', 'dxf'];
        const normalizedExtension = fileExtension.toLowerCase().substring(1);
        
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
                  await uploadInChunks(file, hash, config, (percentage) => {
                    config.onProgress?.(percentage);
                  });
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  config.onError?.(`文件 ${file.name} 上传失败: ${errorMessage}`);
                }      }

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