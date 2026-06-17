///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, forwardRef, useImperativeHandle, useCallback, useRef, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { useMxCadUploadNative } from '../hooks/useMxCadUploadNative';
import { useAuth } from '../contexts/AuthContext';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import { ExternalReferenceModal } from './modals/ExternalReferenceModal';
import { globalShowToast } from '../contexts/NotificationContext';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { useUploadManager } from '../hooks/useUploadManager';
import type { UploadListener } from '../utils/uploadManager';

interface MxCadUploaderProps {
  nodeId?: string | (() => string);
  onSuccess?: () => void;
  onError?: (error: string) => void;
  showProgress?: boolean;
  buttonText?: string;
  buttonClassName?: string;
  onExternalReferenceSuccess?: () => void;
  onExternalReferenceSkip?: () => void;
  enableExternalReferenceCheck?: boolean;
  openAfterUpload?: boolean;
}

export interface MxCadUploaderRef {
  triggerUpload: () => void;
}

/**
 * MxCAD 文件上传组件（多文件上传版本）
 *
 * 集成 UploadManager 实现多文件并发上传管理。
 * - 文件选择器支持多文件（multiple）
 * - 上传队列管理面板在右下角
 * - openAfterUpload: 上传后是否打开图纸（默认true，列表页设为false）
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
    const [currentNodeId, setCurrentNodeId] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const { selectRawFiles } = useMxCadUploadNative();
    const { addFiles, manager } = useUploadManager({ maxConcurrent: 3 });
    const unsubRef = useRef<(() => void) | null>(null);

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

    useEffect(() => {
      return () => {
        unsubRef.current?.();
        unsubRef.current = null;
      };
    }, []);

    const handleSelectFiles = useCallback(async () => {
      const effectiveNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;
      if (!isAuthenticated) {
        globalShowToast('请先登录后再上传文件', 'warning');
        onError?.('用户未登录');
        return;
      }

      const files = await selectRawFiles();
      if (files.length === 0) return;

      const allowedFiles = files.filter((file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        return ['.dwg', '.dxf', '.mxweb'].includes(ext);
      });

      if (allowedFiles.length === 0) {
        globalShowToast('所选文件类型不支持（支持 .dwg, .dxf, .mxweb）', 'warning');
        return;
      }

      if (allowedFiles.length !== files.length) {
        globalShowToast(`已忽略 ${files.length - allowedFiles.length} 个不支持的文件类型`, 'info');
      }

      setCurrentNodeId(effectiveNodeId || '');

      if (!manager) {
        console.error('[MxCadUploader] UploadManager 未初始化，无法上传');
        globalShowToast('上传管理器未初始化，请刷新页面后重试', 'error');
        return;
      }

      unsubRef.current?.();

      setIsUploading(true);
      let pendingCount = allowedFiles.length;

      const listener: UploadListener = async (event) => {
        if (event.type === 'task-processing') {
          const task = manager.getTask(event.taskId);
          if (!task?.result) return;

          try {
            if (openAfterUpload) {
              const { openUploadedFile } = await import('../services/mxcadManager');
              await openUploadedFile(task.result.nodeId, effectiveNodeId || '');
            } else {
              const { waitForFileReady } = await import('../services/mxcadManager');
              await waitForFileReady(task.result.nodeId);
            }

            manager.finalizeTask(event.taskId);
            onSuccess?.();

            const isSkipXrefCheck = task.fileName.toLowerCase().endsWith('.mxweb');
            if (enableExternalReferenceCheck && !isSkipXrefCheck) {
              await externalReferenceUpload.checkMissingReferences(
                task.result.nodeId,
                true,
                false
              );
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '文件处理失败';
            manager.failTask(event.taskId, errorMessage);
            globalShowToast(errorMessage, 'error');
            onError?.(errorMessage);
          }

          pendingCount--;
          if (pendingCount <= 0) setIsUploading(false);
        }

        if (event.type === 'task-failed') {
          pendingCount--;
          if (pendingCount <= 0) setIsUploading(false);
          const errorMsg = event.error || '上传失败';
          globalShowToast(`文件上传失败: ${errorMsg}`, 'error');
        }
      };

      unsubRef.current = manager.subscribe(listener);

      addFiles(allowedFiles, effectiveNodeId || '');
    }, [
      isAuthenticated,
      nodeId,
      onSuccess,
      onError,
      selectRawFiles,
      addFiles,
      openAfterUpload,
      enableExternalReferenceCheck,
      externalReferenceUpload,
      setIsUploading,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        triggerUpload: handleSelectFiles,
      }),
      [handleSelectFiles]
    );

    return (
      <div className="mxcad-uploader">
        <Tooltip content={!isAuthenticated ? '请先登录后再上传文件' : '上传 CAD 文件'}>
          <Button
            data-tour="upload-btn"
            onClick={handleSelectFiles}
            disabled={isUploading || !isAuthenticated}
            variant="secondary"
            size="sm"
            loading={isUploading}
            icon={isUploading ? undefined : (isAuthenticated ? Upload : undefined)}
            className={buttonClassName}
          >
            {isUploading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
          </Button>
        </Tooltip>

        <ExternalReferenceModal
          isOpen={externalReferenceUpload.isOpen}
          files={externalReferenceUpload.files}
          loading={externalReferenceUpload.loading}
          onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
          onComplete={externalReferenceUpload.complete}
          onSkip={externalReferenceUpload.skip}
          onClose={externalReferenceUpload.close}
          isCADEditor={false}
        />
      </div>
    );
  }
);

MxCadUploader.displayName = 'MxCadUploader';

export default MxCadUploader;
