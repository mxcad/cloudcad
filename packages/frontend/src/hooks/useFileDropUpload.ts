///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { useUploadManager } from './useUploadManager';
import { getUploadManager } from '../utils/uploadManager';
import type { UploadListener } from '../utils/uploadManager';

const ALLOWED_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'];

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
  const { addFiles } = useUploadManager({ maxConcurrent: 3 });

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  const filterAllowedFiles = useCallback((files: FileList | File[]): File[] => {
    return Array.from(files).filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext);
    });
  }, []);

  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return;

      const resolvedNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;
      if (!resolvedNodeId) {
        console.warn('[useFileDropUpload] 无法获取上传目标目录');
        return;
      }

      setUploading(true);

      const manager = getUploadManager();
      if (!manager) {
        setUploading(false);
        return;
      }

      unsubRef.current?.();

      let pendingCount = files.length;

      const listener: UploadListener = async (event) => {
        if (event.type === 'task-completed') {
          pendingCount--;
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
            onSuccess?.();
          } catch (error) {
            console.error('[useFileDropUpload] 后处理失败:', error);
          }

          if (pendingCount <= 0) {
            setUploading(false);
          }
        }

        if (event.type === 'task-failed') {
          pendingCount--;
          if (pendingCount <= 0) {
            setUploading(false);
          }
        }
      };

      unsubRef.current = manager.subscribe(listener);

      addFiles(files, resolvedNodeId);
    },
    [nodeId, uploading, onSuccess, openAfterUpload, addFiles]
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
