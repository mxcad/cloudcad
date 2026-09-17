import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CAD_EVENTS } from '@/constants/events';
import { t } from '@/languages';
import { exitCurrentCollaboration } from '@/services/mxcadManager';
import {
  subscribe,
  type SaveRequiredDetail,
} from '@/services/drawingSession';

export interface UseFileOpenGuardOptions {
  fileId: string | null;
  isHomeMode: boolean;
  isAuthenticated: boolean;
  isInitializedRef: React.MutableRefObject<boolean>;
  onSetIsActive: (active: boolean) => void;
  onSetStoreLoading?: (loading: boolean) => void;
  onSetLoading: (loading: boolean) => void;
  onSetError: (err: string | null) => void;
  onSetStoreError?: (err: string | null) => void;
  onSetIsPersonalSpaceMode: (mode: boolean) => void;
}

export function useFileOpenGuard({
  fileId,
  isHomeMode,
  isAuthenticated,
  isInitializedRef,
  onSetIsActive,
  onSetStoreLoading,
  onSetLoading,
  onSetError,
  onSetStoreError,
  onSetIsPersonalSpaceMode,
}: UseFileOpenGuardOptions) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isActive, setIsActiveLocal] = useState(() => !!fileId || isHomeMode);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [loginPromptAction, setLoginPromptAction] = useState<string>('');

  const pendingShowActionRef = useRef<boolean | null>(null);
  const loginPromptDismissedRef = useRef(false);
  const loginPromptActionRef = useRef<string>('');
  const saveTriggeredRef = useRef(false);
  const isProcessingSaveRef = useRef(false);

  const hideEditor = useCallback(() => {
    exitCurrentCollaboration();
    setIsActiveLocal(false);
    onSetIsActive(false);
    onSetLoading(false);
    onSetStoreLoading?.(false);
    onSetError(null);
    onSetStoreError?.(null);

    pendingShowActionRef.current = false;

    import('../services/mxcadManager')
      .then(({ mxcadManager }) => {
        if (pendingShowActionRef.current === false) {
          mxcadManager.showMxCAD(false);
        }
      })
      .catch(() =>
        console.warn('[useFileOpenGuard] hideEditor: showMxCAD(false) 失败')
      );
  }, [
    onSetIsActive,
    onSetLoading,
    onSetStoreLoading,
    onSetError,
    onSetStoreError,
  ]);

  useEffect(() => {
    const shouldShowEditor = !!fileId || isHomeMode;

    if (shouldShowEditor) {
      setIsActiveLocal(true);
      onSetIsActive(true);
      pendingShowActionRef.current = true;

      import('../services/mxcadManager').then(({ mxcadManager }) => {
        if (pendingShowActionRef.current === true && mxcadManager.isCreated()) {
          mxcadManager.showMxCAD(true);
        } else if (!isInitializedRef.current) {
          onSetLoading(true);
          onSetStoreLoading?.(true);
        }
      });
    } else {
      hideEditor();
    }
  }, [fileId, isHomeMode, hideEditor, onSetIsActive]);

  useEffect(() => {
    if (isAuthenticated && isHomeMode) {
      loginPromptDismissedRef.current = false;
      pendingShowActionRef.current = true;

      (async () => {
        try {
          const { mxcadManager } = await import('../services/mxcadManager');
          if (
            pendingShowActionRef.current === true &&
            mxcadManager.isCreated()
          ) {
            mxcadManager.showMxCAD(true);
          }
        } catch {
          console.warn(
            '[useFileOpenGuard] 已认证首页模式: showMxCAD(true) 失败'
          );
        }
      })();
    }
  }, [isAuthenticated, isHomeMode]);

  useEffect(() => {
    if (isAuthenticated) {
      import('../services/mxcadManager')
        .then(({ refreshFileName, mxcadManager }) => {
          refreshFileName();
          // 仅在引擎已完全就绪时 reload，避免与 config.openFile 的首次加载竞态：
          // 引擎未就绪时 reloadCurrentFile 会发起并发 openWebFile 请求，
          // 若此时 config.openFile 正在进行中，可能导致 401（token 被刷新失效）
          if (fileId && mxcadManager.isReady()) {
            mxcadManager
              .reloadCurrentFile()
              .catch(() =>
                console.warn('[useFileOpenGuard] reloadCurrentFile 失败')
              );
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, fileId]);

  useEffect(() => {
    if (!isHomeMode && showLoginPrompt) {
      setShowLoginPrompt(false);
    }
  }, [location.pathname, isHomeMode]);

  useEffect(() => {
    // SAVE_REQUIRED + SAVE_AS_REQUIRED（原 window CustomEvent，T1 迁入类型化 bus）：
    // 未登录且未忽略时弹出登录提示，响应逻辑与迁移前一致（旧实现同一 handler 双事件订阅）
    const handleSaveRequired = (payload: SaveRequiredDetail) => {
      if (loginPromptDismissedRef.current) return;

      const action = payload?.action || '';
      if (action.includes(t('另存为'))) return;

      if (!isAuthenticated) {
        setLoginPromptAction(action || t('保存文件'));
        setShowLoginPrompt(true);
      }
    };

    const unsubscribeSave = subscribe(
      CAD_EVENTS.SAVE_REQUIRED,
      handleSaveRequired
    );
    // SAVE_AS_REQUIRED：代码库内无发出点，但引擎黑盒可能派发（保留监听，防御性）
    const unsubscribeSaveAs = subscribe(
      CAD_EVENTS.SAVE_AS_REQUIRED,
      handleSaveRequired
    );
    return () => {
      unsubscribeSave();
      unsubscribeSaveAs();
    };
  }, [isAuthenticated]);

  const handleLoginClick = async () => {
    loginPromptDismissedRef.current = true;
    saveTriggeredRef.current = true;
    setShowLoginPrompt(false);

    if (!loginPromptActionRef.current) {
      loginPromptActionRef.current = loginPromptAction || t('保存文件');
    }

    pendingShowActionRef.current = false;

    const { mxcadManager } = await import('../services/mxcadManager');
    mxcadManager.showMxCAD(false);

    const currentUrl = location.pathname + location.search;
    const loginUrl = `/login?redirect=${encodeURIComponent(currentUrl)}`;
    navigate(loginUrl, { replace: true });
  };

  const handleLoginPromptClose = () => {
    setShowLoginPrompt(false);
  };

  return {
    isActive,
    showLoginPrompt,
    loginPromptAction,
    hideEditor,
    handleLoginClick,
    handleLoginPromptClose,
    pendingShowActionRef,
    loginPromptDismissedRef,
    loginPromptActionRef,
    saveTriggeredRef,
    setShowLoginPrompt,
    setLoginPromptAction,
  };
}
