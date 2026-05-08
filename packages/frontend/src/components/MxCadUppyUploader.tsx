///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { forwardRef, useImperativeHandle, useCallback } from 'react';
import { useUppyUpload, LoadFileParam } from '../hooks/useUppyUpload';
import { useAuth } from '../contexts/AuthContext';

interface MxCadUppyUploaderProps {
  /** 节点ID（项目根目录或文件夹的 FileSystemNode ID） */
  nodeId?: string | (() => string);
  /** 上传成功回调 */
  onSuccess?: (param: LoadFileParam) => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 按钮文字 */
  buttonText?: string;
  /** 按钮样式类 */
  buttonClassName?: string;
  /** 外部参照上传成功回调（保留兼容，上传后由外部处理） */
  onExternalReferenceSuccess?: () => void;
  /** 外部参照跳过上传回调（保留兼容） */
  onExternalReferenceSkip?: () => void;
  /** 是否启用外部参照检查（保留兼容） */
  enableExternalReferenceCheck?: boolean;
  /** 是否显示进度条（保留兼容，当前由全局 loading 处理） */
  showProgress?: boolean;
}

export interface MxCadUppyUploaderRef {
  triggerUpload: () => void;
}

/**
 * MxCAD 文件上传组件（按钮触发，隐藏 input）
 *
 * 纯触发器，不包含 UI。拖拽上传由 useFileDropUpload 处理。
 */
export const MxCadUppyUploader = forwardRef<MxCadUppyUploaderRef, MxCadUppyUploaderProps>(
  (
    {
      nodeId,
      onSuccess,
      onError,
      buttonText = '上传 CAD 文件',
      buttonClassName = '',
      onExternalReferenceSuccess: _onExternalReferenceSuccess,
      onExternalReferenceSkip: _onExternalReferenceSkip,
      enableExternalReferenceCheck: _enableExternalReferenceCheck,
      showProgress: _showProgress,
    },
    ref
  ) => {
    const { isAuthenticated } = useAuth();
    const { selectFiles } = useUppyUpload();

    const handleSelectFiles = useCallback(() => {
      if (!isAuthenticated) {
        onError?.('用户未登录');
        return;
      }

      const currentNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;

      selectFiles({
        nodeId: currentNodeId || undefined,
        onSuccess,
        onError,
      });
    }, [isAuthenticated, nodeId, selectFiles, onSuccess, onError]);

    useImperativeHandle(
      ref,
      () => ({
        triggerUpload: handleSelectFiles,
      }),
      [handleSelectFiles]
    );

    return (
      <button
        onClick={handleSelectFiles}
        disabled={!isAuthenticated}
        className={`px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 ${buttonClassName}`}
        title={!isAuthenticated ? '请先登录后再上传文件' : ''}
      >
        {!isAuthenticated ? '请先登录' : buttonText}
      </button>
    );
  }
);

MxCadUppyUploader.displayName = 'MxCadUppyUploader';

export default MxCadUppyUploader;
