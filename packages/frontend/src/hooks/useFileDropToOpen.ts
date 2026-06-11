import { useEffect, useRef, useState, useCallback } from 'react';
import { handlePublicUpload } from '../services/mxcadManager';
import { CSS_CLASSES } from '../services/mxcadManager/mxcadTypes';
import { globalShowToast } from '../contexts/NotificationContext';

const ALLOWED_EXTENSIONS = ['.dwg', '.dxf', '.mxweb'];

/**
 * 过滤允许的文件类型
 */
function filterAllowedFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  });
}

/**
 * 等待容器出现
 */
function waitForContainer(timeoutMs: number = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const container = document.getElementById(CSS_CLASSES.GLOBAL_CONTAINER);
    if (container) {
      resolve(container);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = document.getElementById(CSS_CLASSES.GLOBAL_CONTAINER);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

/**
 * 文件拖拽打开 Hook
 * 
 * 在 mxcad-global-container 上绑定拖拽事件，
 * 当用户拖入 CAD 文件时自动调用公开上传流程并打开图纸。
 */
export function useFileDropToOpen() {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const isUploadingRef = useRef(false);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current++;

    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer?.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current--;

    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current = 0;
    setIsDragOver(false);

    if (isUploadingRef.current) {
      console.warn('[useFileDropToOpen] 正在处理上传，忽略此次拖拽');
      return;
    }

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const allowedFiles = filterAllowedFiles(files);
    if (allowedFiles.length === 0) {
      globalShowToast('不支持的文件格式，仅支持 .dwg, .dxf, .mxweb', 'warning');
      return;
    }

    // 只打开第一个文件，其他忽略
    const file = allowedFiles[0];
    if (!file) {
      console.warn('[useFileDropToOpen] 没有有效的文件');
      return;
    }
    if (allowedFiles.length > 1) {
    }

    isUploadingRef.current = true;
    try {
      await handlePublicUpload(file);
    } catch (error) {
      console.error('[useFileDropToOpen] 打开文件失败:', error);
    } finally {
      isUploadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const setupDragDrop = async () => {
      const container = await waitForContainer();
      if (!container || cancelled) return;

      container.addEventListener('dragenter', handleDragEnter);
      container.addEventListener('dragover', handleDragOver);
      container.addEventListener('dragleave', handleDragLeave);
      container.addEventListener('drop', handleDrop);

      // 存储清理函数需要的引用
      (container as any).__dragDropCleanup = () => {
        container.removeEventListener('dragenter', handleDragEnter);
        container.removeEventListener('dragover', handleDragOver);
        container.removeEventListener('dragleave', handleDragLeave);
        container.removeEventListener('drop', handleDrop);
      };
    };

    setupDragDrop();

    return () => {
      cancelled = true;
      const container = document.getElementById(CSS_CLASSES.GLOBAL_CONTAINER);
      if (container && (container as any).__dragDropCleanup) {
        (container as any).__dragDropCleanup();
        delete (container as any).__dragDropCleanup;
      }
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  return { isDragOver };
}
