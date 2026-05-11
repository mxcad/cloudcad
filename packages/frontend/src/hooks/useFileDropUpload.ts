///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef } from 'react';
import type { LoadFileParam } from './useMxCadUploadNative';
import { uploadMxCadFile } from '../utils/mxcadUploadUtils';
import { calculateFileHash } from '../utils/hashUtils';
import { openUploadedFile, waitForFileReady } from '../services/mxcadManager';

const ALLOWED_EXTENSIONS = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];

interface UseFileDropUploadOptions {
  /** 当前目录的节点 ID */
  nodeId: string;
  /** 上传成功回调 */
  onSuccess?: () => void;
  /** 上传完成后是否打开图纸，默认true。列表页上传应设置为false */
  openAfterUpload?: boolean;
}

/**
 * 文件拖拽上传 Hook
 *
 * 处理从桌面/文件管理器拖拽文件到文件列表的上传逻辑。
 */
export function useFileDropUpload({ nodeId, onSuccess, openAfterUpload = true }: UseFileDropUploadOptions) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragCounterRef = useRef(0);

  /**
   * 过滤允许的文件类型
   */
  const filterAllowedFiles = useCallback((files: FileList | File[]): File[] => {
    return Array.from(files).filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return ALLOWED_EXTENSIONS.includes(ext);
    });
  }, []);

  /**
   * 处理文件上传 - 使用手动分片上传
   */
  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return;

      setUploading(true);

      for (const file of files) {
        try {
          const hash = await calculateFileHash(file);
          const result = await uploadMxCadFile({
            file,
            hash,
            nodeId,
          });

          if (result.nodeId) {
            if (openAfterUpload) {
              await openUploadedFile(result.nodeId, nodeId);
            } else {
              await waitForFileReady(result.nodeId);
            }
            onSuccess?.();
          }
        } catch (error) {
          console.error('[useFileDropUpload] 上传失败:', error);
        }
      }

      setUploading(false);
    },
    [nodeId, uploading, onSuccess, openAfterUpload]
  );

  /**
   * 拖拽进入
   */
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current++;

      // 只处理从外部拖入的文件
      if (e.dataTransfer.types.includes('Files')) {
        setIsDragOver(true);
      }
    },
    []
  );

  /**
   * 拖拽经过
   */
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

  /**
   * 拖拽离开
   */
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

  /**
   * 放下文件
   */
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
