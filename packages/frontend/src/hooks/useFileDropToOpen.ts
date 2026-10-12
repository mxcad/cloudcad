import { useEffect, useRef, useState, useCallback } from 'react';
import {
  openLocalFile,
  CSS_CLASSES,
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from '../services/mxcadManager';
import { globalShowToast } from '../utils/notificationEvents';
import { t } from '@/languages';
import { filterAllowedFiles } from '../utils/fileDrop';

/**
 * 等待容器出现
 */
function waitForContainer(
  timeoutMs: number = 5000
): Promise<HTMLElement | null> {
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
 * 当用户拖入 CAD 文件时经 openLocalFile 打开图纸（.mxweb 本地虚拟盘就地打开，
 * 其余走公开上传 + 转换），与文件选择器入口共用同一分派。
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
      globalShowToast(
        t('不支持的文件格式，仅支持 .dwg, .dxf, .mxweb'),
        'warning'
      );
      return;
    }

    // 只打开第一个文件，其他忽略
    const file = allowedFiles[0];
    if (!file) {
      console.warn('[useFileDropToOpen] 没有有效的文件');
      return;
    }
    if (allowedFiles.length > 1) {
      // 仅打开第一个文件，其余忽略
    }

    const collabOk = await confirmExitCollaborationIfNeeded();
    if (!collabOk) return;

    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) return;

    isUploadingRef.current = true;
    try {
      // 与文件选择器同一分派：.mxweb 走本地虚拟盘就地打开（不上传/不转换），
      // 其余 CAD 文件走公开上传 + 转换
      await openLocalFile(file);
    } catch (error) {
      console.error('[useFileDropToOpen] 打开文件失败:', error);
    } finally {
      isUploadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 容器引用提升到 effect 作用域：cleanup 直接解绑，无需在 DOM 元素上挂 __dragDropCleanup
    let container: HTMLElement | null = null;

    const setupDragDrop = async () => {
      const el = await waitForContainer();
      if (!el || cancelled) return;
      container = el;

      el.addEventListener('dragenter', handleDragEnter);
      el.addEventListener('dragover', handleDragOver);
      el.addEventListener('dragleave', handleDragLeave);
      el.addEventListener('drop', handleDrop);
    };

    setupDragDrop();

    return () => {
      cancelled = true;
      if (container) {
        container.removeEventListener('dragenter', handleDragEnter);
        container.removeEventListener('dragover', handleDragOver);
        container.removeEventListener('dragleave', handleDragLeave);
        container.removeEventListener('drop', handleDrop);
      }
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  return { isDragOver };
}
