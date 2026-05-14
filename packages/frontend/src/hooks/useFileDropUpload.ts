///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef } from 'react';
import { openUploadedFile, waitForFileReady } from '../services/mxcadManager';
import { uploadSingleFile } from '../utils/mxcadUploadUtils';
import { useUIStore } from '../stores/uiStore';

const ALLOWED_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'];

interface UseFileDropUploadOptions {
  /** 当前目录的节点 ID，或返回节点 ID 的 getter 函数（drop 时动态获取） */
  nodeId: string | (() => string);
  /** 上传成功回调 */
  onSuccess?: () => void;
  /** 上传完成后是否打开图纸，默认true。列表页上传应设置为false */
  openAfterUpload?: boolean;
}

/**
 * 文件拖拽上传 Hook
 *
 * 处理从桌面/文件管理器拖拽文件到文件列表的上传逻辑。
 * 核心上传管线复用 uploadSingleFile（与 MxCadUploader 共用）。
 */
export function useFileDropUpload({ nodeId, onSuccess, openAfterUpload = true }: UseFileDropUploadOptions) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragCounterRef = useRef(0);
  const { setGlobalLoading, setLoadingMessage, setLoadingProgress } = useUIStore();

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
   * 处理文件上传 - 复用 uploadSingleFile（与正常上传共用管线）
   */
  const handleFilesUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return;

      // Drop 时动态获取 nodeId（支持 getter 函数）
      const resolvedNodeId = typeof nodeId === 'function' ? nodeId() : nodeId;
      if (!resolvedNodeId) {
        console.warn('[useFileDropUpload] 无法获取上传目标目录');
        return;
      }

      setUploading(true);
      setGlobalLoading(true, `正在上传: ${files[0]!.name}`);

      for (const file of files) {
        try {
          setLoadingMessage(`正在上传: ${file.name}`);
          const result = await uploadSingleFile(file, resolvedNodeId, setLoadingProgress);

          if (result.nodeId) {
            if (openAfterUpload) {
              await openUploadedFile(result.nodeId, resolvedNodeId);
            } else {
              setLoadingMessage('文件转换中，请稍候...');
              await waitForFileReady(result.nodeId);
            }
            onSuccess?.();
          }
        } catch (error) {
          console.error('[useFileDropUpload] 上传失败:', error);
        }
      }

      setUploading(false);
      setGlobalLoading(false);
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
