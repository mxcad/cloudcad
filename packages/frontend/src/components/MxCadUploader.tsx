///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  useMxCadUploadNative,
  LoadFileParam,
} from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { useUIStore } from '../stores/uiStore';
import { openUploadedFile, waitForFileReady } from '../services/mxcadManager';
import { globalShowToast } from '../contexts/NotificationContext';

interface MxCadUploaderProps {
  /** 节点ID（项目根目录或文件夹的 FileSystemNode ID） */
  nodeId?: string | (() => string);
  /** 上传成功回调 */
  onSuccess?: (param: LoadFileParam) => void;
  /** 上传失败回调 */
  onError?: (error: string) => void;
  /** 是否显示进度条 */
  showProgress?: boolean;
  /** 按钮文本 */
  buttonText?: string;
  /** 按钮样式类名 */
  buttonClassName?: string;
  /** 外部参照上传成功回调 */
  onExternalReferenceSuccess?: () => void;
  /** 外部参照跳过上传回调 */
  onExternalReferenceSkip?: () => void;
  /** 是否启用外部参照检查，默认true。批量导入时应设置为false */
  enableExternalReferenceCheck?: boolean;
  /** 上传完成后是否打开图纸，默认true。列表页上传应设置为false */
  openAfterUpload?: boolean;
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;
}

/**
 * MxCAD 文件上传组件（增强版本）
 *
 * 新增功能：
 * - 自动检测外部参照
 * - 支持外部参照上传
 * - 支持跳过外部参照上传（可选）
 * - openAfterUpload: 上传后是否打开图纸（默认true，列表页设为false）
 * - 使用全局通知系统 globalShowToast，与项目其他页面保持一致
 */
export const MxCadUploader = forwardRef<MxCadUploaderRef, MxCadUploaderProps>(
  (
    {
      nodeId,
      onSuccess,
      onError,
      showProgress = true,
      buttonText = '上传 CAD 文件',
      buttonClassName = '',
      onExternalReferenceSuccess,
      onExternalReferenceSkip,
      enableExternalReferenceCheck = true,
      openAfterUpload = true,
    },
    ref
  ) => {
    const { isAuthenticated } = useAuth();
    const { setGlobalLoading, setLoadingMessage, setLoadingProgress } = useUIStore();
    const [currentNodeId, setCurrentNodeId] = useState('');

    const { selectFiles } = useMxCadUploadNative();

    // 外部参照上传 Hook
    const externalReferenceUpload = useExternalReferenceUpload({
      nodeId: currentNodeId,
      onSuccess: () => {
        onExternalReferenceSuccess?.();
      },
      onError: (error) => {
        globalShowToast(`外部参照上传失败: ${error}`, 'error');
      },
      onSkip: () => {
        onExternalReferenceSkip?.();
      },
    });

    const handleSelectFiles = useCallback(() => {
      // 每次上传前都获取最新的 nodeId
      const currentNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;

      // 检查用户是否已登录
      if (!isAuthenticated) {
        globalShowToast('请先登录后再上传文件', 'warning');
        onError?.('用户未登录');
        return;
      }

      selectFiles({
        nodeId: currentNodeId || undefined,
        onSuccess: async (param: LoadFileParam) => {
          // 保存节点ID
          param.nodeId && setCurrentNodeId(param.nodeId);

          try {
            if (openAfterUpload) {
              // 打开模式：上传 → 转换 → 打开 CAD 编辑器
              await openUploadedFile(param.nodeId!, currentNodeId || '');
            } else {
              // 列表页模式：上传 → 转换（等待完成即可，不打开图纸）
              setLoadingMessage('文件转换中，请稍候...');
              await waitForFileReady(param.nodeId!);
            }

            // 通知父组件上传+转换成功（由父组件决定是否 toast 和刷新列表）
            onSuccess?.(param);

            // 根据开关决定是否检查外部参照
            if (enableExternalReferenceCheck) {
              await externalReferenceUpload.checkMissingReferences(param.nodeId!, true, false);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '文件处理失败';
            globalShowToast(errorMessage, 'error');
            onError?.(errorMessage);
          } finally {
            setGlobalLoading(false);
          }
        },
        onError: (error: string) => {
          setGlobalLoading(false);
          globalShowToast(error, 'error');
          onError?.(error);
        },
        onProgress: (percentage: number) => {
          setLoadingProgress(percentage);
        },
        onFileQueued: (file: File) => {
          setGlobalLoading(true, `正在上传: ${file.name}`);
        },
        onBeginUpload: () => {
          setLoadingMessage('正在上传...');
        },
      });
    }, [
      isAuthenticated,
      nodeId,
      onSuccess,
      onError,
      selectFiles,
      externalReferenceUpload,
      enableExternalReferenceCheck,
      openAfterUpload,
      setGlobalLoading,
      setLoadingMessage,
      setLoadingProgress,
    ]);

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        triggerUpload: handleSelectFiles,
      }),
      [handleSelectFiles]
    );

    const { globalLoading } = useUIStore();

    return (
      <div className="mxcad-uploader">
        <button
          onClick={handleSelectFiles}
          disabled={globalLoading || !isAuthenticated}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 ${buttonClassName}`}
          title={!isAuthenticated ? '请先登录后再上传文件' : ''}
        >
          {globalLoading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
        </button>

        {/* 外部参照上传模态框 */}
        <ExternalReferenceModal
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onComplete={externalReferenceUpload.complete}
          onSkip={externalReferenceUpload.skip}
          onClose={externalReferenceUpload.close}
        />
      </div>
    );
  }
);

MxCadUploader.displayName = 'MxCadUploader';

export default MxCadUploader;
