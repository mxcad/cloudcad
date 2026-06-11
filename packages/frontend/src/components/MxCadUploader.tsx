///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Upload } from 'lucide-react';
import {
  useMxCadUploadNative,
  LoadFileParam,
} from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { useUIStore } from '../stores/uiStore';
import { globalShowToast } from '../contexts/NotificationContext';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';

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
          // 上传完成，进度条满格（100%时隐藏百分比数字，只显示消息）
          setLoadingProgress(100);
          
          // 保存节点ID
          param.nodeId && setCurrentNodeId(param.nodeId);

          try {
            if (openAfterUpload) {
              // 打开模式：上传完成后延迟1秒再显示"正在打开图纸中"
              await new Promise(resolve => setTimeout(resolve, 1000));
              setLoadingMessage('正在打开图纸中...');
              const { openUploadedFile } = await import('../services/mxcadManager');
              await openUploadedFile(param.nodeId!, currentNodeId || '');
            } else {
              // 列表页模式：上传完成直接显示"图纸转换中"
              setLoadingMessage('图纸转换中...');
              const { waitForFileReady } = await import('../services/mxcadManager');
              await waitForFileReady(param.nodeId!);
              // 列表页模式：转换完成后直接隐藏进度条
              setGlobalLoading(false);
            }

            // 通知父组件上传+转换成功（由父组件决定是否 toast 和刷新列表）
            onSuccess?.(param);

            // 根据开关决定是否检查外部参照
            // .mxweb 文件跳过（预转换格式，MxCAD 转换引擎不生成 preloading.json）
            const isSkipXrefCheck = param.name.toLowerCase().endsWith('.mxweb')
            if (enableExternalReferenceCheck && !isSkipXrefCheck) {
              await externalReferenceUpload.checkMissingReferences(param.nodeId!, true, false);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '文件处理失败';
            globalShowToast(errorMessage, 'error');
            onError?.(errorMessage);
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
          if (percentage === 100) {
            setLoadingMessage('图纸转换中...');
          }
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
        <Tooltip content={!isAuthenticated ? '请先登录后再上传文件' : '上传 CAD 文件'}>
          <Button
            onClick={handleSelectFiles}
            disabled={globalLoading || !isAuthenticated}
            variant="ghost"
            size="sm"
            loading={globalLoading}
            icon={globalLoading ? undefined : (isAuthenticated ? Upload : undefined)}
            className={buttonClassName}
          >
            {globalLoading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
          </Button>
        </Tooltip>

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
