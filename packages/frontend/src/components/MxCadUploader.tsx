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
import { useUIStore } from '../stores/uiStore';
import { globalShowToast } from '../contexts/NotificationContext';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { useUploadManager } from '../hooks/useUploadManager';
import { getUploadManager } from '../utils/uploadManager';
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
    const { setGlobalLoading, setLoadingMessage, setLoadingProgress } = useUIStore();
    const [currentNodeId, setCurrentNodeId] = useState('');
    const { selectRawFiles } = useMxCadUploadNative();
    const { addFiles } = useUploadManager({ maxConcurrent: 3 });
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

      if (openAfterUpload) {
        setGlobalLoading(true, `正在上传 ${allowedFiles.length} 个文件...`);
      }

      const manager = getUploadManager();
      if (!manager) return;

      unsubRef.current?.();

      let pendingCount = allowedFiles.length;

      const listener: UploadListener = async (event) => {
        if (event.type === 'task-completed') {
          pendingCount--;
          const task = manager.getTask(event.taskId);
          if (!task?.result) return;

          try {
            if (openAfterUpload) {
              setLoadingMessage('正在打开图纸中...');
              const { openUploadedFile } = await import('../services/mxcadManager');
              await openUploadedFile(task.result.nodeId, effectiveNodeId || '');
            } else {
              setLoadingMessage('图纸转换中...');
              const { waitForFileReady } = await import('../services/mxcadManager');
              await waitForFileReady(task.result.nodeId);
            }

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
            globalShowToast(errorMessage, 'error');
            onError?.(errorMessage);
          }

          if (pendingCount <= 0) {
            setGlobalLoading(false);
          }
        }

        if (event.type === 'task-failed') {
          pendingCount--;
          if (pendingCount <= 0) {
            setGlobalLoading(false);
          }
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
      setGlobalLoading,
      setLoadingMessage,
    ]);

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
            data-tour="upload-btn"
            onClick={handleSelectFiles}
            disabled={globalLoading || !isAuthenticated}
            variant="secondary"
            size="sm"
            loading={globalLoading}
            icon={globalLoading ? undefined : (isAuthenticated ? Upload : undefined)}
            className={buttonClassName}
          >
            {globalLoading ? '上传中...' : !isAuthenticated ? '请先登录' : buttonText}
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
