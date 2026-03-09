import { useRef, useCallback } from 'react';
import { calculateFileHash } from '../utils/hashUtils';
import {
  uploadMxCadFile,
  MxCadUploadOptions,
  MxCadUploadResult,
  MxCadUploadError,
} from '../utils/mxcadUploadUtils';

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
  onchange: ((this: GlobalEventHandlers, ev: Event) => void) | null;
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
        if (!file) continue;
        try {
          // 计算文件哈希
          const hash = await calculateFileHash(file);

          // 使用统一的上传工具函数
          const uploadOptions: MxCadUploadOptions = {
            file,
            hash,
            nodeId: config.nodeId || '',
            onFileQueued: config.onFileQueued,
            onBeginUpload: config.onBeginUpload,
            onProgress: config.onProgress,
          };

          const result: MxCadUploadResult =
            await uploadMxCadFile(uploadOptions);

          // 调用成功回调
          config.onSuccess?.({
            file: result.file,
            id: result.hash,
            name: result.name,
            size: result.size,
            type: result.type,
            hash: result.hash,
            isUseServerExistingFile: result.isUseServerExistingFile,
            isInstantUpload: result.isInstantUpload,
            nodeId: result.nodeId,
          });
        } catch (error) {
          const errorMessage =
            error instanceof MxCadUploadError
              ? error.message
              : error instanceof Error
                ? error.message
                : String(error);
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
