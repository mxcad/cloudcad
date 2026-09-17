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
 */
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Z_LAYERS } from '@/constants/layers';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe, patchSessionFlags } from '@/services/drawingSession';
import { SystemPermission } from '../constants/permissions';
import { usePermission } from '../hooks/usePermission';
import { usePersonalSpaceQuery } from '@/hooks/usePersonalSpaceQuery';
import { ExportModals } from '@/components/export';
import type { ExportModalsHandle } from '@/components/export';
import { ImagePreviewModal } from '../components/modals/ImagePreviewModal';
import { ShareDialog } from '../components/modals/ShareDialog';
import { Button } from '@/components/ui/Button';
import { ExternalReferencePanel } from '../components/modals/ExternalReferencePanel';
import type { ExternalReferenceFile } from '../types/filesystem';
import { SidebarContainer } from '../components/sidebar/SidebarContainer';
import { LoginPrompt } from '../components/auth/LoginPrompt';
import { useExternalReferenceUpload } from '../hooks/useExternalReferenceUpload';
import {
  showGlobalLoading,
  hideGlobalLoading,
  getLoadingState,
} from '../services/loadingService';
import { useCADEditorStore } from '../stores/useCADEditorStore';
import { globalShowToast } from '../utils/notificationEvents';
import {
  downloadExternalRefFile,
  fetchXrefViewBlobUrl,
  revokeXrefViewBlobUrl,
} from '../utils/download';
import { useFileDropToOpen } from '../hooks/useFileDropToOpen';
import { DropIndicator } from '../components/drop-indicator/DropIndicator';
import { i18nScope, t } from '@/languages';

import { useVoerkaI18n } from '@voerkai18n/react';

declare global {
  interface Window {
    mxcadAppContext?: {
      userId: string;
      projectId: string;
      parentId?: string;
      userRole: string;
    };
    MxCAD?: any;
  }
  // eslint-disable-next-line no-var
  var MxPluginContext: {
    getServerConfig: () => {
      uploadFileConfig?: {
        create?: { formData?: Record<string, string> };
      };
    };
    useFileName: () => { fileName: { value: string } };
    useMessage: () => {
      info: (msg: string) => void;
      success: (msg: string) => void;
      warning: (msg: string) => void;
      error: (msg: string) => void;
    };
  };
}

import {
  useFileRouteParser,
  useHistoryBackFix,
} from '../hooks/useFileRouteParser';
import { useCadFileLoader } from '../hooks/useCadFileLoader';
import { useFileOpenGuard } from '../hooks/useFileOpenGuard';
import { useCadPermissions } from '../hooks/useCadPermissions';
import { useExternalRefCompletion } from '../hooks/useExternalRefCompletion';
import { useCollabShare } from '../hooks/useCollabShare';
import { useFileInsert } from '../hooks/useFileInsert';
import { useHomeInit } from '../hooks/useHomeInit';

export const CADEditorDirect: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { hasPermission } = usePermission();
  const {
    setIsActive,
    setLoading: setStoreLoading,
    setError: setStoreError,
    setPermissions,
    setIsPersonalSpaceMode,
  } = useCADEditorStore();
  const isCurrentFileDeleted = useCADEditorStore((s) => s.isCurrentFileDeleted);

  const {
    fileId,
    isHomeMode,
    libraryKey: libraryKeyParam,
    shareToken: shareTokenParam,
    collabWorkId: collabWorkIdParam,
    collabDrawingId: collabDrawingIdParam,
    collabProjectId: collabProjectIdParam,
    shareFileName: shareFileNameParam,
    versionParam,
    nodeIdParam,
    urlProjectId,
  } = useFileRouteParser();

  // 始终以 loading 状态初始化，确保 CAD 引擎异步初始化期间
  // 编辑器区域显示 loading 遮罩，避免侧边栏先渲染但编辑器白屏
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 标记是否已初始化 MxCAD，避免重复初始化
  const isInitializedRef = useRef(false);

  const {
    isActive,
    showLoginPrompt,
    loginPromptAction,
    handleLoginClick,
    handleLoginPromptClose,
    loginPromptDismissedRef,
    setShowLoginPrompt,
    setLoginPromptAction,
  } = useFileOpenGuard({
    fileId,
    isHomeMode,
    isAuthenticated,
    isInitializedRef,
    onSetIsActive: setIsActive,
    onSetStoreLoading: setStoreLoading,
    onSetLoading: setLoading,
    onSetError: setError,
    onSetStoreError: setStoreError,
    onSetIsPersonalSpaceMode: setIsPersonalSpaceMode,
  });

  // 存储当前文件的 hash（用于未登录用户的外部参照上传）
  const [currentFileHash, setCurrentFileHash] = useState('');

  // 存储文件打开回调函数
  const openFileCallbackRef = useRef<(() => Promise<void>) | null>(null);

  // 存储外部参照上传 hook 的配置
  const externalReferenceConfig = useMemo(
    () => ({
      nodeId: fileId || undefined,
      fileHash: currentFileHash || undefined,
      onSuccess: async () => {
        // 外部参照上传成功后，调用回调函数打开文件
        if (openFileCallbackRef.current) {
          await openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        } else {
          // 如果没有回调函数，重新加载当前文件
          import('../services/mxcadManager').then(({ mxcadManager }) => {
            mxcadManager.reloadCurrentFile().catch((err) => {
              console.error('重新加载文件失败:', err);
            });
          });
        }
      },
      onError: (error: unknown) => {
        console.error('外部参照检查失败:', error);
        // 即使外部参照检查失败，也调用回调函数打开文件
        if (openFileCallbackRef.current) {
          openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        }
      },
      onSkip: async () => {
        // 跳过外部参照上传，调用回调函数打开文件
        if (openFileCallbackRef.current) {
          await openFileCallbackRef.current();
          openFileCallbackRef.current = null;
        }
      },
    }),
    [fileId, currentFileHash]
  );

  // 外部参照上传 hook
  const externalReferenceUpload = useExternalReferenceUpload(
    externalReferenceConfig
  );

  // 用 ref 包装避免 effect 依赖不稳定对象导致重复执行
  const externalReferenceUploadRef = useRef(externalReferenceUpload);
  externalReferenceUploadRef.current = externalReferenceUpload;

  // 文件拖拽打开
  const { isDragOver } = useFileDropToOpen();

  // 当前文件 ID
  const currentFileIdRef = useRef<string | null>(null);

  // 记录已加载的文件 URL（包含版本参数），用于检测 URL 变化
  const loadedFileUrlRef = useRef<string | null>(null);

  const {
    canSave,
    canExport,
    canManageExternalRef,
    loading: permissionsLoading,
  } = useCadPermissions(
    urlProjectId,
    useCallback(
      (perms: {
        canSave?: boolean;
        canExport?: boolean;
        canManageExternalRef?: boolean;
      }) => setPermissions(perms),
      [setPermissions]
    )
  );

  // 导出/另存为子系统：ExportModals 自包含组件（ADR-0040），
  // 仅经 ref 命令触发外部参照格式弹窗
  const exportModalsRef = useRef<ExportModalsHandle | null>(null);

  // 分享对话框状态
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [shareFileName, setShareFileName] = useState('');

  useHistoryBackFix(fileId);

  // 私人空间 ID（使用共享 hook）
  const personalSpaceQuery = usePersonalSpaceQuery({
    enabled: isAuthenticated,
  });
  const personalSpaceId = personalSpaceQuery.data?.id || null;

  // 同步到 mxcadManager 缓存
  useEffect(() => {
    if (personalSpaceId) {
      import('../services/mxcadManager').then(
        ({ setPersonalSpaceId: setCachedPersonalSpaceId }) => {
          setCachedPersonalSpaceId(personalSpaceId);
        }
      );
    }
  }, [personalSpaceId]);

  // 当前文件所属项目 ID
  const [currentProjectId, setCurrentProjectId] = React.useState<string | null>(
    null
  );

  // 判断是否为私人空间模式（根据当前文件所属项目）
  const isPersonalSpaceMode = React.useMemo(() => {
    if (!personalSpaceId || !currentProjectId) return false;
    return currentProjectId === personalSpaceId;
  }, [personalSpaceId, currentProjectId]);

  // 同步 isPersonalSpaceMode 到 store
  useEffect(() => {
    setIsPersonalSpaceMode(isPersonalSpaceMode);
  }, [isPersonalSpaceMode]);

  useCollabShare({
    collabWorkId: collabWorkIdParam,
    collabDrawingId: collabDrawingIdParam,
    collabProjectId: collabProjectIdParam,
    libraryKey: libraryKeyParam,
  });

  // 有效协同链接：URL 带合法 collabWorkId（与 useCollabShare 同一校验口径）。
  // 协同链接跳过文件打开（useCadFileLoader），由 auto-join（joinWork）直接加载协同文件；
  // 引擎初始化由 useHomeInit（isCollabLink）兜底，避免混合 URL（fileId + collabWorkId）下引擎未初始化。
  const isCollabLink = useMemo(() => {
    if (!collabWorkIdParam) return false;
    const workId = parseInt(collabWorkIdParam, 10);
    return !isNaN(workId) && workId > 0;
  }, [collabWorkIdParam]);

  // 协同链接 + 未登录（游客）：未登录不能加入协同，弹出登录提示。
  // 登录后 redirect 回原 URL（handleLoginClick 保留 ?collabWorkId=9），
  // isAuthenticated 变 true，auto-join（依赖 user）自动执行加入协同。
  useEffect(() => {
    if (isCollabLink && !isAuthenticated && !loginPromptDismissedRef.current) {
      setLoginPromptAction(t('加入协同'));
      setShowLoginPrompt(true);
    }
  }, [
    isCollabLink,
    isAuthenticated,
    loginPromptDismissedRef,
    setLoginPromptAction,
    setShowLoginPrompt,
  ]);

  // 文件加载逻辑提取到独立 hook
  useCadFileLoader(
    {
      fileId,
      collabWorkId: isCollabLink ? collabWorkIdParam : null,
      isAuthenticated,
      personalSpaceId,
      libraryKeyParam,
      shareTokenParam,
      versionParam,
      nodeIdParam,
      shareFileNameParam,
      hasLibraryDrawingManage: hasPermission(
        SystemPermission.LIBRARY_DRAWING_MANAGE
      ),
      hasLibraryBlockManage: hasPermission(
        SystemPermission.LIBRARY_BLOCK_MANAGE
      ),
      isInitializedRef,
      loadedFileUrlRef,
      currentFileIdRef,
      isActive,
    },
    {
      onError: setError,
      onStoreError: setStoreError,
      onLoading: setLoading,
      onStoreLoading: setStoreLoading,
      setStoreFileId: (id) => patchSessionFlags({ fileId: id }),
      setStoreFileName: (name) => patchSessionFlags({ fileName: name }),
      setFromShare: (v) => patchSessionFlags({ fromShare: v }),
      setStoreProjectId: (id) => patchSessionFlags({ projectId: id }),
      onFileOpened: ({
        fileId: openedFileId,
        parentId,
        projectId,
        libraryKey,
        fileName,
      }) => {
        if (!libraryKey) {
          setCurrentProjectId(projectId);
          patchSessionFlags({ projectId });
        } else {
          setCurrentProjectId(null);
          patchSessionFlags({ projectId: null });
        }
        const url =
          libraryKey === 'drawing'
            ? `/cad-editor/${openedFileId}?library=drawing`
            : libraryKey === 'block'
              ? `/cad-editor/${openedFileId}?library=block`
              : `/cad-editor/${openedFileId}?nodeId=${parentId}`;
        window.history.replaceState(null, '', url);
        currentFileIdRef.current = openedFileId;
        patchSessionFlags({ fileId: openedFileId, fileName: fileName || null });
      },
      onNewFile: () => {
        setCurrentProjectId(null);
        patchSessionFlags({ projectId: null, fileId: null, fileName: null });
        currentFileIdRef.current = null;
      },
    }
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const { mxcadApp } = await import('mxcad-app');
      const handler = (language: string) => {
        i18nScope.change(language);
        console.log('[CADEditorDirect] mxcadApp i18nScope changed:', language);
      };
      if ((mxcadApp as any).i18nScope) {
        const scope = (mxcadApp as any).i18nScope;
        scope.on('change', handler);
        cleanup = () => scope.off('change', handler);
      } else {
        console.warn(
          '[CADEditorDirect] mxcadApp.i18nScope 未定义，跳过 i18n 同步'
        );
        cleanup = undefined;
      }
    })();
    return () => {
      cleanup?.();
    };
  }, []);

  // 监听文件上传完成事件，检查外部参照
  useExternalRefCompletion(
    externalReferenceUpload,
    (cb) => {
      openFileCallbackRef.current = cb;
    },
    setCurrentFileHash
  );

  const { handleInsertFile } = useFileInsert({
    isHomeMode,
    isAuthenticated,
    personalSpaceId,
    loginPromptDismissedRef,
    currentFileIdRef,
    setLoginPromptAction,
    setShowLoginPrompt,
  });

  // 外部参照查看预览状态
  const [previewXref, setPreviewXref] = useState<{
    file: ExternalReferenceFile;
    url: string;
  } | null>(null);

  const xrefId = fileId || currentFileHash;

  // 外部参照查看
  const handleViewXref = useCallback(
    async (file: ExternalReferenceFile) => {
      if (file.type === 'img') {
        if (!xrefId) return;
        if (currentFileHash) {
          // 未登录场景：public-file/access 无鉴权，可直接加载。
          // 该接口返回 Cache-Control: max-age=3600，外部参照替换后 URL 不变会命中缓存显示旧图，
          // 故追加时间戳参数绕过浏览器 HTTP 缓存
          const url = `/api/v1/public-file/access/${encodeURIComponent(currentFileHash)}/${encodeURIComponent(file.name)}?t=${Date.now()}`;
          setPreviewXref((prev) => {
            if (prev && prev.url !== url) revokeXrefViewBlobUrl(prev.url);
            return { file, url };
          });
          return;
        }
        if (!fileId) return;
        try {
          // 登录场景：external-ref-view 需要 Bearer token，<img> 无法携带，走 SDK 取 blob
          const url = await fetchXrefViewBlobUrl(fileId, file.name);
          setPreviewXref((prev) => {
            if (prev && prev.url !== url) revokeXrefViewBlobUrl(prev.url);
            return { file, url };
          });
        } catch (error) {
          globalShowToast(t('打开外部参照失败'), 'error');
        }
      } else {
        if (!xrefId) return;
        // 同图片：public-file/access 有 1 小时浏览器缓存，追加时间戳确保替换后打开的是最新 mxweb
        const fileUrl = currentFileHash
          ? `/api/v1/public-file/access/${encodeURIComponent(currentFileHash!)}/${encodeURIComponent(file.name)}.mxweb?t=${Date.now()}`
          : `/api/v1/mxcad/external-ref-view/${encodeURIComponent(fileId!)}/${encodeURIComponent(file.name)}`;
        window.open(
          `/cad-editor?fileUrl=${encodeURIComponent(fileUrl)}`,
          '_blank'
        );
      }
    },
    [xrefId, currentFileHash, fileId]
  );

  // 外部参照下载（图片直接下载，图纸走格式转换）
  const handleDownloadXref = useCallback(
    async (file: ExternalReferenceFile) => {
      if (!xrefId || !file.name) return;

      if (file.type === 'img') {
        if (currentFileHash) {
          // 未登录场景：public-file/access 无鉴权，可直接下载。
          // 追加时间戳绕过浏览器缓存，确保下载的是替换后的最新图片
          const downloadUrl = `/api/v1/public-file/access/${encodeURIComponent(currentFileHash)}/${encodeURIComponent(file.name)}?t=${Date.now()}`;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
        if (!fileId) return;
        try {
          // 登录场景：走 SDK（自动带 token），避免 <a> 下载 401
          await downloadExternalRefFile(fileId, file.name, {}, file.name);
        } catch (error) {
          globalShowToast(t('外部参照下载失败'), 'error');
        }
      } else {
        exportModalsRef.current?.openExtRefDownload(file);
      }
    },
    [xrefId, currentFileHash, fileId]
  );

  useHomeInit({
    isHomeMode,
    isCollabLink,
    isActive,
    isInitializedRef,
    onSetError: setError,
    onSetStoreError: setStoreError,
    onSetLoading: setLoading,
    onSetStoreLoading: setStoreLoading,
  });

  // 协同链接：auto-join 结束（成功/超时/失败/引擎挂起）都会把 fromCollabShare 置 false，
  // 以此作为骨架屏关闭的兜底信号——即使 onFileLoaded 回调链未覆盖到，页面也不会卡在加载态。
  // wasCollabShareActiveRef 确保只在「从 true 变 false」时触发（首帧初始值即 false，不能误关）。
  // 注意：协同链接的路径是 /cad-editor，isHomeRoute 返回 true（isHomeMode=true），
  // 因此本兜底只看 isCollabLink 不看 isHomeMode。
  const fromCollabShareState = useCADEditorStore((s) => s.fromCollabShare);
  const wasCollabShareActiveRef = useRef(false);
  useEffect(() => {
    if (!isCollabLink) return;
    if (fromCollabShareState) {
      wasCollabShareActiveRef.current = true;
      return;
    }
    if (wasCollabShareActiveRef.current) {
      setLoading(false);
    }
  }, [isCollabLink, fromCollabShareState]);

  // 文件打开/新建事件监听已提取到 useCadFileLoader

  // 监听分享文件事件（Mx_Share 命令触发）
  useEffect(() => {
    return subscribe(CAD_EVENTS.SHARE_FILE, (detail) => {
      setShareFileId(detail.fileId);
      setShareFileName(detail.fileName);
      setShareDialogOpen(true);
    });
  }, []);

  // 处理外部参照查看请求（fileUrl URL 参数）
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const fileUrl = searchParams.get('fileUrl');
    if (!fileUrl) return;

    const decodedUrl = decodeURIComponent(fileUrl);

    // 等待初始文件打开完成的订阅与超时计时器（评审修复：超时/卸载均需清理，避免订阅泄漏）
    let unsubscribeOpenComplete: (() => void) | null = null;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;
    const clearWait = () => {
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      unsubscribeOpenComplete?.();
      unsubscribeOpenComplete = null;
    };

    const openExternalRef = async () => {
      try {
        showGlobalLoading(t('正在打开外部参照...'));
        const { mxcadManager } = await import('../services/mxcadManager');
        const maxWait = 20000;
        const startTime = Date.now();

        // 等待 CAD 引擎完全初始化（包括 isInitialized）
        while (!mxcadManager.isReady() && Date.now() - startTime < maxWait) {
          await new Promise((r) => setTimeout(r, 300));
        }
        if (!mxcadManager.isReady()) {
          hideGlobalLoading();
          throw new Error('CAD 引擎未初始化');
        }

        // 额外等待初始文件打开完成，避免 CAD 引擎报 "cannot start a new open"
        const currentFile = mxcadManager.getCurrentFileName();
        if (currentFile === 'empty_template.mxweb' || !currentFile) {
          await new Promise<void>((resolve) => {
            waitTimer = setTimeout(() => {
              clearWait();
              resolve();
            }, 3000);
            unsubscribeOpenComplete = subscribe(
              CAD_EVENTS.OPEN_COMPLETE,
              () => {
                clearWait();
                resolve();
              }
            );
          });
        }

        await mxcadManager.openFile({
          url: decodedUrl,
          fileInfo: {
            fileId: '',
            parentId: null,
            projectId: null,
            name:
              decodedUrl
                .split('/')
                .pop()
                ?.replace(/\.mxweb$/, '') || '',
            personalSpaceId: null,
          },
        });
        hideGlobalLoading();
      } catch {
        globalShowToast(t('打开外部参照失败'), 'error');
        hideGlobalLoading();
      } finally {
        clearWait();
      }
    };

    openExternalRef();
    return clearWait;
  }, []);

  // 监听文件打开完成事件，隐藏底部加载状态
  useEffect(() => {
    const handleFileOpenComplete = () => {
      const { source, refCount } = getLoadingState();
      // Auto-join/handleJoin manage their own loading — don't interfere
      if (source === 'autoJoin' || source === 'handleJoin') return;
      // 仅在有实际 loading 计数时兜底隐藏；调用方（openLibraryDrawing/useCadFileLoader 等）
      // 在 await openFile() 返回后也会显式 hide，避免此处与调用方重复递减导致 refCount 告警
      if (refCount > 0) hideGlobalLoading();
    };

    return subscribe(CAD_EVENTS.OPEN_COMPLETE, handleFileOpenComplete);
  }, []);

  // 错误处理：返回项目列表或刷新页面
  const handleGoBack = () => {
    if (isHomeMode) {
      window.location.reload();
    } else if (isPersonalSpaceMode) {
      navigate('/personal-space');
    } else {
      navigate('/projects');
    }
  };

  const { activeLanguage } = useVoerkaI18n();
  return (
    <div
      className="fixed inset-0"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        zIndex: isActive ? Z_LAYERS.CAD_EDITOR : -1,
        pointerEvents: isActive ? 'auto' : 'none',
        background: 'transparent',
      }}
    >
      {error && (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <Button onClick={handleGoBack} variant="primary">
            {isHomeMode ? t('刷新页面') : t('返回项目列表')}
          </Button>
        </div>
      )}

      {/* 当前文件已被删除警告横幅 */}
      {isCurrentFileDeleted && !error && (
        <div
          className="absolute top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-sm"
          style={{
            backgroundColor: 'var(--bg-warning)',
            color: 'var(--warning)',
            borderBottom: '1px solid var(--border-warning)',
          }}
        >
          <span>{t('当前图纸已被删除，保存将另存为新文件')}</span>
        </div>
      )}

      {!error && (
        <div className="flex w-full h-screen relative">
          <SidebarContainer
            key={activeLanguage}
            projectId={
              isHomeMode ? personalSpaceId || '' : currentProjectId || ''
            }
            onInsertFile={handleInsertFile}
            loading={loading}
            onCollabFileLoaded={
              isCollabLink && isAuthenticated ? () => setLoading(false) : undefined
            }
          />

          {/* CAD编辑器内容区域 */}
          <div
            className="flex-1 relative"
            style={{ background: 'transparent' }}
          >
            {loading && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  zIndex: Z_LAYERS.OVERLAY,
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="animate-pulse rounded-lg"
                    style={{
                      width: 120,
                      height: 120,
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  />
                  <div
                    className="animate-pulse rounded"
                    style={{
                      width: 200,
                      height: 14,
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  />
                  <div
                    className="animate-pulse rounded"
                    style={{
                      width: 140,
                      height: 12,
                      backgroundColor: 'var(--bg-tertiary)',
                    }}
                  />
                  {/* 加载状态文字 + spinner：明确告知引擎初始化/图纸加载中（#349） */}
                  <div
                    className="flex items-center gap-2 mt-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span
                      className="animate-spin rounded-full"
                      style={{
                        width: 16,
                        height: 16,
                        borderWidth: 2,
                        borderStyle: 'solid',
                        borderColor: 'var(--border-strong)',
                        borderTopColor: 'var(--accent-600)',
                      }}
                    />
                    <span className="text-sm">{t('正在加载图纸...')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 导出/另存为子系统（ADR-0040）：5 组导出/另存为弹窗全部收进 ExportModals */}
            <ExportModals
              ref={exportModalsRef}
              fileId={fileId}
              // loading 门控：权限加载完成前禁用导出（canExport 悲观默认已为 false）
              canExport={canExport && !permissionsLoading}
              isAuthenticated={isAuthenticated}
              loginPromptDismissedRef={loginPromptDismissedRef}
              currentFileHash={currentFileHash}
            />
          </div>
        </div>
      )}

      {/* 登录提示弹窗 - 主页模式 */}
      <LoginPrompt
        isOpen={showLoginPrompt}
        action={loginPromptAction}
        onLogin={handleLoginClick}
        onClose={handleLoginPromptClose}
      />

      {/* 外部参照管理面板 */}
      <ExternalReferencePanel
        isOpen={externalReferenceUpload.isOpen}
        files={externalReferenceUpload.files}
        loading={externalReferenceUpload.loading}
        mode="blocking"
        onSelectAndUpload={externalReferenceUpload.selectAndUploadFiles}
        onReplace={externalReferenceUpload.replaceFile}
        onDownload={handleDownloadXref}
        onView={handleViewXref}
        onRefresh={externalReferenceUpload.refresh}
        onComplete={externalReferenceUpload.complete}
        onClose={externalReferenceUpload.skip}
      />

      {/* 外部参照图片预览 */}
      <ImagePreviewModal
        isOpen={!!previewXref}
        src={previewXref?.url || ''}
        alt={previewXref?.file.name || ''}
        onClose={() => {
          revokeXrefViewBlobUrl(previewXref?.url || '');
          setPreviewXref(null);
        }}
      />

      {/* 分享对话框 */}
      <ShareDialog
        isOpen={shareDialogOpen}
        onClose={() => {
          setShareDialogOpen(false);
          setShareFileId(null);
          setShareFileName('');
        }}
        fileId={shareFileId ?? undefined}
        fileName={shareFileName}
      />

      {/* 拖拽文件提示层 */}
      <DropIndicator visible={isDragOver} />
    </div>
  );
};

export default CADEditorDirect;
