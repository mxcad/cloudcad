///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * GlobalCADEditor - 全局 CAD 编辑器覆盖层
 *
 * 此组件作为全局覆盖层挂载在 App 根层级，始终存在于 DOM 中。
 * 通过监听路由变化来控制显示/隐藏：
 * - 路由匹配 / 时显示空白编辑器（无需登录）
 * - 路由匹配 /cad-editor/:fileId 时显示编辑器并加载文件
 * - 路由不匹配时隐藏编辑器
 *
 * 使用 visibility: hidden + z-index 方案控制显示，保护 WebGL 上下文不被销毁。
 *
 * 拆分后结构（≤800 lines per file）:
 * ├── index.tsx                    ← 组装层（本文件）
 * ├── cadEditorUtils.ts            ← 路由解析工具函数
 * ├── CADErrorOverlay.tsx          ← 错误状态显示
 * ├── CADLoadingOverlay.tsx        ← 加载状态显示
 * └── hooks/
 *     ├── useThemeSync.ts          ← 主题同步
 *     ├── useCadPermissions.ts     ← CAD 权限加载
 *     ├── usePersonalSpace.ts      ← 私人空间 ID 获取
 *     ├── useCadEventListeners.ts  ← 自定义事件监听
 *     ├── useFileLoader.ts         ← 文件加载逻辑
 *     └── useHomeInitializer.ts    ← 主页空白编辑器初始化
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useNotification } from '@/contexts/NotificationContext';
import { usePermission } from '@/hooks/usePermission';
import { handleError } from '@/utils/errorHandler';
import type { DownloadFormat, PdfOptions } from '@/components/modals/DownloadFormatModal';

import { parseCADEditorRoute, isHomeRoute } from './cadEditorUtils';
import { CADErrorOverlay } from './CADErrorOverlay';
import { CADLoadingOverlay } from './CADLoadingOverlay';
import { useThemeSync } from './hooks/useThemeSync';
import { useCadPermissions } from './hooks/useCadPermissions';
import { usePersonalSpace } from './hooks/usePersonalSpace';
import { useCadEventListeners } from './hooks/useCadEventListeners';
import { useFileLoader } from './hooks/useFileLoader';
import { useHomeInitializer } from './hooks/useHomeInitializer';

import { DownloadFormatModal } from '@/components/modals/DownloadFormatModal';
import { SaveAsModal } from '@/components/modals/SaveAsModal';
import { ExternalReferenceModal } from '@/components/modals/ExternalReferenceModal';
import { SidebarContainer } from '@/components/sidebar/SidebarContainer';
import { LoginPrompt } from '@/components/auth/LoginPrompt';
import { useExternalReferenceUpload } from '@/hooks/useExternalReferenceUpload';
import { fileSystemControllerDownloadNodeWithFormat, fileSystemControllerGetNode } from '@/api-sdk';

export const CADEditorDirect: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { showToast } = useNotification();
  const { hasPermission } = usePermission();

  // ── Route parsing ──
  const isHomeMode = isHomeRoute(location.pathname);
  const fileId = parseCADEditorRoute(location.pathname);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const libraryKeyParam = useMemo(
    () => (searchParams.get('library') as 'drawing' | 'block' | null) || null,
    [searchParams],
  );
  const urlProjectId = useMemo(
    () => searchParams.get('nodeId') || '',
    [searchParams],
  );
  const versionParam = useMemo(
    () => searchParams.get('v'),
    [searchParams],
  );

  // ── Editor state ──
  const [isActive, setIsActive] = useState(() => !!fileId || isHomeMode);
  const [loading, setLoading] = useState(() => !!fileId);
  const [error, setError] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentFileHash, setCurrentFileHash] = useState('');

  // ── Download modal state ──
  const [showDownloadFormatModal, setShowDownloadFormatModal] = useState(false);
  const [downloadingNodeId, setDownloadingNodeId] = useState('');
  const [downloadingFileName, setDownloadingFileName] = useState('');
  const [downloading, setDownloading] = useState(false);

  // ── Save-as modal state ──
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsFileName, setSaveAsFileName] = useState('');
  const [saveAsBlob, setSaveAsBlob] = useState<Blob | null>(null);
  const [saveAsPersonalSpaceId, setSaveAsPersonalSpaceId] = useState<string | null>(null);

  // ── Login prompt state ──
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState('');
  const loginPromptDismissedRef = useRef(false);
  const loginPromptActionRef = useRef('');
  const saveTriggeredRef = useRef(false);

  // ── External reference upload ──
  const openFileCallbackRef = useRef<(() => Promise<void>) | null>(null);
  const externalReferenceConfig = useMemo(
    () => ({
      nodeId: fileId || undefined,
      fileHash: currentFileHash || undefined,
      onSuccess: async () => {
        if (openFileCallbackRef.current) {
          await openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        } else {
          import('@/services/mxcadManager').then(({ mxcadManager }) => {
            mxcadManager.reloadCurrentFile().catch((err) => {
              handleError(err, 'CADEditorDirect:reloadAfterExtRef');
            });
          });
        }
      },
      onError: (error: unknown) => {
        handleError(error, 'CADEditorDirect:extRefCheck');
        if (openFileCallbackRef.current) {
          openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        }
      },
      onSkip: async () => {
        if (openFileCallbackRef.current) {
          await openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        }
      },
    }),
    [fileId, currentFileHash],
  );
  const externalReferenceUpload = useExternalReferenceUpload(externalReferenceConfig);

  // ── Hooks ──
  const personalSpaceId = usePersonalSpace(isAuthenticated);
  const { canSave, canExport, canManageExternalRef } = useCadPermissions(urlProjectId);
  const { initThemeSync } = useThemeSync();

  const isPersonalSpaceMode = useMemo(() => {
    if (!personalSpaceId || !currentProjectId) return false;
    return currentProjectId === personalSpaceId;
  }, [personalSpaceId, currentProjectId]);

  // ── File loading hook ──
  const { isInitializedRef, currentFileIdRef } = useFileLoader({
    fileId,
    isActive,
    isAuthenticated,
    isHomeMode,
    libraryKeyParam,
    versionParam,
    personalSpaceId,
    searchParams,
    hasPermission,
    onLoadingChange: setLoading,
    onErrorChange: setError,
    onCurrentProjectIdChange: setCurrentProjectId,
    onCurrentFileHashChange: setCurrentFileHash,
    onCheckMissingReferences: externalReferenceUpload.checkMissingReferences,
  });

  // ── Home initializer hook ──
  useHomeInitializer({
    isHomeMode,
    isActive,
    onLoadingChange: setLoading,
    onErrorChange: setError,
    onInitComplete: () => {
      isInitializedRef.current = true;
    },
    onInitThemeSync: initThemeSync,
  });

  // ── Editor visibility lifecycle ──
  const pendingShowActionRef = useRef<boolean | null>(null);

  const hideEditor = useCallback(() => {
    setIsActive(false);
    setLoading(false);
    setError(null);
    pendingShowActionRef.current = false;

    import('@/services/mxcadManager')
      .then(({ mxcadManager }) => {
        if (pendingShowActionRef.current === false) {
          mxcadManager.showMxCAD(false);
        }
      })
      .catch((err) => {
        handleError(err, 'CADEditorDirect:hideEditor');
      });
  }, []);

  useEffect(() => {
    const shouldShowEditor = !!fileId || isHomeMode;

    if (shouldShowEditor) {
      setIsActive(true);
      pendingShowActionRef.current = true;

      if (isInitializedRef.current) {
        import('@/services/mxcadManager').then(({ mxcadManager }) => {
          if (pendingShowActionRef.current === true && mxcadManager.isCreated()) {
            mxcadManager.showMxCAD(true);
          }
        });
      }
    } else {
      hideEditor();
    }
  }, [fileId, isHomeMode, hideEditor, isInitializedRef]);

  // ── Auth recovery after login ──
  useEffect(() => {
    if (isAuthenticated && isHomeMode) {
      loginPromptDismissedRef.current = false;
      pendingShowActionRef.current = true;

      (async () => {
        try {
          const { mxcadManager } = await import('@/services/mxcadManager');
          if (pendingShowActionRef.current === true && mxcadManager.isCreated()) {
            mxcadManager.showMxCAD(true);
          }
        } catch (err) {
          handleError(err, 'CADEditorDirect:authRecovery');
        }
      })();
    }
  }, [isAuthenticated, isHomeMode]);

  useEffect(() => {
    if (isAuthenticated) {
      import('@/services/mxcadManager')
        .then(({ refreshFileName, mxcadManager }) => {
          refreshFileName();
          if (fileId) {
            mxcadManager.reloadCurrentFile().catch((err) => {
              handleError(err, 'CADEditorDirect:reloadAfterLogin');
            });
          }
        })
        .catch((err) => {
          handleError(err, 'CADEditorDirect:refreshFileName');
        });
    }
  }, [isAuthenticated, fileId]);

  // ── Login prompt auto-dismiss ──
  useEffect(() => {
    if (!isHomeMode && showLoginPrompt) {
      setShowLoginPrompt(false);
    }
  }, [location.pathname, isHomeMode, showLoginPrompt]);

  // ── Download modal callbacks ──
  const handleShowDownloadModal = useCallback((nodeId: string, fileName: string) => {
    setDownloadingNodeId(nodeId);
    setDownloadingFileName(fileName);
    setShowDownloadFormatModal(true);
  }, []);

  const handleShowSaveAsModal = useCallback(
    (fileName: string, blob: Blob, pSpaceId: string | null) => {
      setSaveAsFileName(fileName);
      setSaveAsBlob(blob);
      setSaveAsPersonalSpaceId(pSpaceId);
      setShowSaveAsModal(true);
    },
    [],
  );

  // ── File-opened / new-file callbacks ──
  const handleFileOpened = useCallback(
    (openedFileId: string, parentId: string, projectId: string, libraryKey?: string) => {
      if (!libraryKey) {
        setCurrentProjectId(projectId);
      } else {
        setCurrentProjectId(null);
      }

      if (libraryKey === 'drawing') {
        window.history.replaceState(null, '', `/cad-editor/${openedFileId}?library=drawing`);
      } else if (libraryKey === 'block') {
        window.history.replaceState(null, '', `/cad-editor/${openedFileId}?library=block`);
      } else {
        window.history.replaceState(null, '', `/cad-editor/${openedFileId}?nodeId=${parentId}`);
      }

      currentFileIdRef.current = openedFileId;
    },
    [currentFileIdRef],
  );

  const handleNewFile = useCallback(() => {
    setCurrentProjectId(null);
    currentFileIdRef.current = null;
  }, [currentFileIdRef]);

  // ── Event listeners hook ──
  const {
    dismissLoginPrompt,
    getLoginPromptActionRef,
  } = useCadEventListeners({
    isAuthenticated,
    isHomeMode,
    canExport,
    showToast,
    onShowDownloadModal: handleShowDownloadModal,
    onShowLoginPrompt: setLoginPromptAction,
    onShowSaveAsModal: handleShowSaveAsModal,
    onFileOpened: handleFileOpened,
    onNewFile: handleNewFile,
    onPublicFileUploaded: (fileHash, callback) => {
      setCurrentFileHash(fileHash);
      openFileCallbackRef.current = callback || null;

      setTimeout(async () => {
        try {
          const hasMissing = await externalReferenceUpload.checkMissingReferences(
            fileHash,
            true,
            false,
          );
          if (!hasMissing && openFileCallbackRef.current) {
            await openFileCallbackRef.current();
            openFileCallbackRef.current = null;
          }
        } catch (error: unknown) {
          handleError(error, 'CADEditorDirect:publicFileUploaded');
          if (openFileCallbackRef.current) {
            await openFileCallbackRef.current();
            openFileCallbackRef.current = null;
          }
        }
      }, 1000);
    },
  });

  // ── Login prompt handlers ──
  const handleLoginClick = useCallback(async () => {
    loginPromptDismissedRef.current = true;
    dismissLoginPrompt();
    saveTriggeredRef.current = true;
    setShowLoginPrompt(false);

    if (!loginPromptActionRef.current) {
      loginPromptActionRef.current = loginPromptAction || '保存文件';
    }

    pendingShowActionRef.current = false;

    const { mxcadManager } = await import('@/services/mxcadManager');
    mxcadManager.showMxCAD(false);
    navigate('/login', {
      state: { from: location.pathname + location.search },
    });
  }, [navigate, location, loginPromptAction, dismissLoginPrompt]);

  const handleLoginPromptClose = useCallback(() => {
    setShowLoginPrompt(false);
  }, []);

  // ── Download handler ──
  const handleDownloadWithFormat = useCallback(
    async (format: DownloadFormat, pdfOptions?: PdfOptions) => {
      try {
        setDownloading(true);
        const { data: blobData } = (await fileSystemControllerDownloadNodeWithFormat({
          path: { nodeId: downloadingNodeId },
          query: { format, ...((pdfOptions as Record<string, unknown>) || {}) },
          responseStyle: 'blob',
        } as any)) as { data: Blob };

        const blob = blobData instanceof Blob ? blobData : new Blob([blobData]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const nameWithoutExt = downloadingFileName.replace(/\.[^.]+$/, '');
        a.download = `${nameWithoutExt}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setShowDownloadFormatModal(false);
      } catch (error: unknown) {
        handleError(error, 'CADEditorDirect:download');
        showToast('下载失败，请重试', 'error');
      } finally {
        setDownloading(false);
      }
    },
    [downloadingNodeId, downloadingFileName, showToast],
  );

  // ── Save-as success handler ──
  const handleSaveAsSuccess = useCallback(
    async (result: { nodeId: string; fileName: string; path: string; projectId?: string; parentId: string }) => {
      setShowSaveAsModal(false);
      setSaveAsBlob(null);
      showToast('文件保存成功', 'success');

      const { openUploadedFile, processPendingImages } = await import(
        '@/services/mxcadManager'
      );
      await openUploadedFile(result.nodeId, result.parentId);
      await processPendingImages();

      currentFileIdRef.current = result.nodeId;
    },
    [showToast, currentFileIdRef],
  );

  // ── Insert file handler ──
  const handleInsertFile = useCallback(
    async (file: { nodeId: string; filename: string }) => {
      if (isHomeMode) {
        if (isAuthenticated) {
          try {
            const { openUploadedFile } = await import('@/services/mxcadManager');
            await openUploadedFile(file.nodeId, personalSpaceId || '');
            window.history.replaceState(
              null,
              '',
              `/cad-editor/${file.nodeId}?nodeId=${personalSpaceId || ''}`,
            );
          } catch (error: unknown) {
            handleError(error, 'CADEditorDirect:insertFile');
            showToast('打开文件失败', 'error');
          }
        } else {
          if (loginPromptDismissedRef.current) return;
          setLoginPromptAction('打开文件');
          setShowLoginPrompt(true);
        }
        return;
      }

      try {
        const { data: targetFile } = (await fileSystemControllerGetNode({
          path: { nodeId: file.nodeId },
        })) as unknown as { data: { deletedAt?: string | null } };

        if (targetFile.deletedAt) return;

        const currentId = currentFileIdRef.current;
        if (!currentId) return;

        const { data: currentFile } = (await fileSystemControllerGetNode({
          path: { nodeId: currentId },
        })) as unknown as { data: { parentId?: string | null; id?: string; isRoot?: boolean } };

        let uploadTargetNodeId = currentFile.parentId || '';
        if (currentFile.isRoot && currentFile.id) {
          uploadTargetNodeId = currentFile.id;
        }

        const { openUploadedFile } = await import('@/services/mxcadManager');
        window.history.replaceState(
          null,
          '',
          `/cad-editor/${file.nodeId}?nodeId=${uploadTargetNodeId}`,
        );
        await openUploadedFile(file.nodeId, uploadTargetNodeId);
        currentFileIdRef.current = file.nodeId;
      } catch (error: unknown) {
        handleError(error, 'CADEditorDirect:insertFileInEditor');
        showToast(error instanceof Error ? error.message : '打开文件失败', 'error');
      }
    },
    [isHomeMode, isAuthenticated, personalSpaceId, currentFileIdRef, showToast],
  );

  // ── Go-back handler ──
  const handleGoBack = useCallback(() => {
    if (isHomeMode) {
      window.location.reload();
    } else if (isPersonalSpaceMode) {
      navigate('/personal-space');
    } else {
      navigate('/projects');
    }
  }, [isHomeMode, isPersonalSpaceMode, navigate]);

  // ── Render: WebGL overlay pattern (CRITICAL - do NOT change) ──
  return (
    <div
      className="fixed inset-0"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        zIndex: isActive ? 9999 : -1,
        pointerEvents: isActive ? 'auto' : 'none',
        background: 'transparent',
      }}
    >
      {error && (
        <CADErrorOverlay error={error} isHomeMode={isHomeMode} onGoBack={handleGoBack} />
      )}

      {loading && !error && <CADLoadingOverlay />}

      {!loading && !error && isActive && (
        <div
          className="flex w-full h-screen relative"
          style={{
            background: 'var(--sidebar-bg, var(--bg-secondary))',
          }}
        >
          <SidebarContainer
            projectId={isHomeMode ? personalSpaceId || '' : currentProjectId || ''}
            onInsertFile={handleInsertFile}
          />

          <div className="flex-1 relative">
            <DownloadFormatModal
              isOpen={showDownloadFormatModal}
              fileName={downloadingFileName}
              onClose={() => setShowDownloadFormatModal(false)}
              onDownload={handleDownloadWithFormat}
              loading={downloading}
            />
          </div>
        </div>
      )}

      <LoginPrompt
        isOpen={showLoginPrompt}
        action={loginPromptAction}
        onLogin={handleLoginClick}
        onClose={handleLoginPromptClose}
      />

      {showSaveAsModal && saveAsBlob && (
        <SaveAsModal
          isOpen={showSaveAsModal}
          currentFileName={saveAsFileName}
          mxwebBlob={saveAsBlob}
          personalSpaceId={saveAsPersonalSpaceId}
          onClose={() => {
            setShowSaveAsModal(false);
            setSaveAsBlob(null);
          }}
          onSuccess={handleSaveAsSuccess}
        />
      )}

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
};

export default CADEditorDirect;
