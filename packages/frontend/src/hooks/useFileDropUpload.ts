///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadManager } from './useUploadManager';
import { queryKeys } from '@/lib/queryKeys';
import { globalShowToast } from '../contexts/NotificationContext';
import { t } from '@/languages';
import type { UploadListener } from '../utils/uploadManager';

const ALLOWED_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'];
const UPLOAD_TIMEOUT_MS = 120000;

interface UseFileDropUploadOptions {
  nodeId: string | (() => string);
  onSuccess?: () => void;
  openAfterUpload?: boolean;
}

export function useFileDropUpload({
  nodeId,
  onSuccess,
  openAfterUpload = true,
}: UseFileDropUploadOptions) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragCounterRef = useRef(0);
  const unsubRef = useRef<(() => void) | null>(null);
  const uploadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { addFiles, manager } = useUploadManager({ maxConcurrent: 3 });

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
      if (uploadingTimeoutRef.current) {
        clearTimeout(uploadingTimeoutRef.current);
        uploadingTimeoutRef.current = null;
      }
    };
  }, []);

  const clearUploadingTimeout = useCallback(() => {
    if (uploadingTimeoutRef.current) {
      clearTimeout(uploadingTimeoutRef.current);
      uploadingTimeoutRef.current = null;
    }
  }, []);

  const resetUploading = useCallback(() => {
    clearUploadingTimeout();
    setUploading(false);
  }, [clearUploadingTimeout]);

  const filterAllowedFiles = useCallback((files: FileList | File[]): File[] => {
    return Array.from(files).filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext);
    });
  }, []);

  useEffect(() => {
    if (uploading) {
      uploadingTimeoutRef.current = setTimeout(() => {
        console.warn('[useFileDropUpload] 上传超时，已自动重置上传状态');
        resetUploading();
      }, UPLOAD_TIMEOUT_MS);
    }
    return () => {
      if (uploadingTimeoutRef.current) {
        clearTimeout(uploadingTimeoutRef.current);
        uploadingTimeoutRef.current = null;
      }
    };
  }, [uploading, resetUploading]);

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      if (uploading) {
        console.warn('[useFileDropUpload] 上次上传未完成，忽略此次操作');
        return;
      }

      const resolvedNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;
      if (!resolvedNodeId) {
        console.warn('[useFileDropUpload] 无法获取上传目标目录');
        globalShowToast(t('无法获取上传目标目录，请刷新后重试'), 'warning');
        return;
      }

      setUploading(true);

      if (!manager) {
        console.error('[useFileDropUpload] UploadManager 未初始化');
        resetUploading();
        return;
      }

      unsubRef.current?.();

      let pendingCount = files.length;

      const listener: UploadListener = async (event) => {
        if (event.type === 'task-processing') {
          const task = manager.getTask(event.taskId);
          if (!task?.result) return;

          try {
            if (openAfterUpload) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              const { openUploadedFile } = await import('../services/mxcadManager');
              await openUploadedFile(task.result.nodeId, resolvedNodeId);
            } else {
              const { waitForFileReady } = await import('../services/mxcadManager');
              await waitForFileReady(task.result.nodeId);
            }

            manager.finalizeTask(event.taskId);
            onSuccess?.();
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('文件处理失败');
            manager.failTask(event.taskId, errorMessage);
            console.error('[useFileDropUpload] 后处理失败:', error);
          }

          pendingCount--;
          if (pendingCount <= 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.storageQuota });
            queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.all });
            resetUploading();
          }
        }

        if (event.type === 'task-failed') {
          pendingCount--;
          if (pendingCount <= 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.storageQuota });
            queryClient.invalidateQueries({ queryKey: queryKeys.fileSystem.all });
            resetUploading();
          }
        }
      };

      unsubRef.current = manager.subscribe(listener);

      addFiles(files, resolvedNodeId);
    },
    [nodeId, uploading, onSuccess, openAfterUpload, addFiles, resetUploading]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      if (e.dataTransfer.types.includes('Files')) {
        setIsDragOver(true);
      }
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) {
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragOver(false);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      const allowedFiles = filterAllowedFiles(files);
      if (allowedFiles.length === 0) {
        console.warn('[useFileDropUpload] 没有支持的文件类型');
        return;
      }

      handleFilesUpload(allowedFiles);
    },
    [filterAllowedFiles, handleFilesUpload]
  );

  return {
    isDragOver,
    uploading,
    dropHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
