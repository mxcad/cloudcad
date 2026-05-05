import { useEffect, useRef, useCallback } from 'react';
import { handleError } from '@/utils/errorHandler';

interface UseCadEventListenersOptions {
  isAuthenticated: boolean;
  isHomeMode: boolean;
  canExport: boolean;
  showToast: (message: string, type: 'success' | 'error' | 'warning') => void;
  onShowDownloadModal: (nodeId: string, fileName: string) => void;
  onShowLoginPrompt: (action: string) => void;
  onShowSaveAsModal: (fileName: string, blob: Blob, personalSpaceId: string | null) => void;
  onFileOpened: (fileId: string, parentId: string, projectId: string, libraryKey?: string) => void;
  onNewFile: () => void;
  onPublicFileUploaded: (fileHash: string, callback?: () => Promise<void>) => void;
}

/**
 * 注册 CAD 编辑器相关的所有自定义事件监听器
 *
 * 从 CADEditorDirect.tsx 提取的事件管理 hook，统管以下事件：
 * - mxcad-save-required / mxcad-saveas-required：未登录时的保存/另存为提示
 * - mxcad-export-file：导出文件
 * - mxcad-save-as：另存为
 * - mxcad-file-opened：文件在编辑器中被打开
 * - mxcad-new-file：新建文件
 * - public-file-uploaded：公开文件上传完成
 */
export function useCadEventListeners(options: UseCadEventListenersOptions) {
  const {
    isAuthenticated,
    isHomeMode,
    canExport,
    showToast,
    onShowDownloadModal,
    onShowLoginPrompt,
    onShowSaveAsModal,
    onFileOpened,
    onNewFile,
    onPublicFileUploaded,
  } = options;

  const loginPromptDismissedRef = useRef(false);
  const saveRequiredHandlerRef = useRef<((event: CustomEvent<{ action: string }>) => void) | null>(null);
  const loginPromptActionRef = useRef<string>('');

  // Reset dismiss flag when isHomeMode changes
  useEffect(() => {
    loginPromptDismissedRef.current = false;
  }, [isHomeMode]);

  // ── Save / SaveAs required (unauthenticated) ──
  useEffect(() => {
    const handleSaveRequired = (event: CustomEvent<{ action: string }>) => {
      if (loginPromptDismissedRef.current) return;

      if (!isAuthenticated) {
        loginPromptActionRef.current = event.detail?.action || '保存文件';
        onShowLoginPrompt(event.detail?.action || '保存文件');
        event.preventDefault();
      }
    };

    saveRequiredHandlerRef.current = handleSaveRequired;

    window.addEventListener('mxcad-save-required', handleSaveRequired as EventListener);
    window.addEventListener('mxcad-saveas-required', handleSaveRequired as EventListener);

    return () => {
      window.removeEventListener('mxcad-save-required', handleSaveRequired as EventListener);
      window.removeEventListener('mxcad-saveas-required', handleSaveRequired as EventListener);
      saveRequiredHandlerRef.current = null;
    };
  }, [isAuthenticated, onShowLoginPrompt]);

  // ── Export ──
  useEffect(() => {
    const handleExportEvent = (event: Event) => {
      if (!canExport) {
        showToast('您没有导出图纸的权限', 'warning');
        return;
      }
      const customEvent = event as CustomEvent<{ fileId: string; fileName: string }>;
      onShowDownloadModal(customEvent.detail.fileId, customEvent.detail.fileName);
    };

    window.addEventListener('mxcad-export-file', handleExportEvent);
    return () => {
      window.removeEventListener('mxcad-export-file', handleExportEvent);
    };
  }, [canExport, showToast, onShowDownloadModal]);

  // ── Save As ──
  useEffect(() => {
    const handleSaveAsEvent = (event: CustomEvent<{
      currentFileName: string;
      mxwebBlob: Blob;
      personalSpaceId: string | null;
    }>) => {
      if (loginPromptDismissedRef.current) return;

      if (!isAuthenticated) {
        loginPromptActionRef.current = '另存为';
        onShowLoginPrompt('另存为');
        return;
      }

      const { currentFileName, mxwebBlob, personalSpaceId } = event.detail;
      onShowSaveAsModal(currentFileName, mxwebBlob, personalSpaceId);
    };

    window.addEventListener('mxcad-save-as', handleSaveAsEvent as EventListener);
    return () => {
      window.removeEventListener('mxcad-save-as', handleSaveAsEvent as EventListener);
    };
  }, [isAuthenticated, onShowLoginPrompt, onShowSaveAsModal]);

  // ── File Opened ──
  useEffect(() => {
    const handleFileOpened = (event: CustomEvent<{
      fileId: string;
      parentId: string;
      projectId: string;
      fileUrl?: string;
      fileName?: string;
      libraryKey?: string;
    }>) => {
      const { fileId, parentId, projectId, libraryKey } = event.detail;
      onFileOpened(fileId, parentId, projectId, libraryKey);
    };

    window.addEventListener('mxcad-file-opened', handleFileOpened as EventListener);
    return () => {
      window.removeEventListener('mxcad-file-opened', handleFileOpened as EventListener);
    };
  }, [onFileOpened]);

  // ── New File ──
  useEffect(() => {
    const handleNewFile = () => {
      onNewFile();
    };

    window.addEventListener('mxcad-new-file', handleNewFile as EventListener);
    return () => {
      window.removeEventListener('mxcad-new-file', handleNewFile as EventListener);
    };
  }, [onNewFile]);

  // ── Public File Uploaded ──
  useEffect(() => {
    const handlePublicFileUploaded = (event: CustomEvent<{
      fileHash: string;
      fileName?: string;
      noCache?: boolean;
      callback?: () => Promise<void>;
    }>) => {
      const { fileHash, callback } = event.detail;
      onPublicFileUploaded(fileHash, callback);
    };

    window.addEventListener('public-file-uploaded', handlePublicFileUploaded as EventListener);
    return () => {
      window.removeEventListener('public-file-uploaded', handlePublicFileUploaded as EventListener);
    };
  }, [onPublicFileUploaded]);

  // ── Login prompt dismiss ──
  // Auto-dismiss when navigated away (handled by parent via isHomeMode dependency)

  const dismissLoginPrompt = useCallback(() => {
    loginPromptDismissedRef.current = true;
  }, []);

  const getLoginPromptActionRef = useCallback(() => {
    return loginPromptActionRef.current;
  }, []);

  return {
    loginPromptDismissedRef,
    loginPromptActionRef,
    saveRequiredHandlerRef,
    dismissLoginPrompt,
    getLoginPromptActionRef,
  };
}
