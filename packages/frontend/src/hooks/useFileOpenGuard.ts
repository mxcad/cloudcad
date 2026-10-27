import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { CAD_EVENTS } from '@/constants/events';
import { t } from '@/languages';
import {
  clearIntentChain,
  exitCurrentCollaboration,
  hasDocumentLoaded,
  mxcadManager,
  refreshFileName,
  resumeIntent,
} from '@/services/mxcadManager';
import { subscribe, type SaveRequiredDetail } from '@/services/drawingSession';
import { canExportDownload } from '@/utils/vipFeatureGuide';
import { useMembership } from './useMembership';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';
import { useLoginGate, type LoginGate } from './useLoginGate';

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

export interface UseFileOpenGuardResult {
  isActive: boolean;
  hideEditor: () => void;
  /** 游客登录闸门（A8）：唯一动作入口 requireLogin + 只读查询 + 视图元素 */
  loginGate: LoginGate;
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
}: UseFileOpenGuardOptions): UseFileOpenGuardResult {
  const location = useLocation();

  const [isActive, setIsActiveLocal] = useState(() => !!fileId || isHomeMode);

  const pendingShowActionRef = useRef<boolean | null>(null);

  // 登录闸门归 useLoginGate 唯一 owner（A8）：本 hook 只在登录跳转前
  // 结算编辑器 show 动作（onLoginStart），不再向外泄漏 ref/setter
  const loginGate = useLoginGate({
    isAuthenticated,
    onLoginStart: () => {
      pendingShowActionRef.current = false;
    },
    // 用户放弃该动作 → 清除已挂起的意图链，避免下次登录时自动续跑（ADR-0081 D5）
    onLoginPromptClose: clearIntentChain,
  });

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
      // 登录成功回到首页：解除闸门抑制，后续游客态动作可再次弹提示
      loginGate.resetLoginSuppression();
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
    // 依赖具体稳定成员而非 loginGate 对象（对象每渲染新引用，会令 effect 每渲染重跑）
  }, [isAuthenticated, isHomeMode, loginGate.resetLoginSuppression]);

  useEffect(() => {
    if (!isAuthenticated) return;

    refreshFileName();
    let openCompleteUnsubscribe: (() => void) | null = null;

    // 必须等首个文档真正加载完（openFileComplete）才 reload：引擎同一时刻只能打开
    // 一个文档，初次打开进行中就 reload 会发并发 openWebFile，锁死首次打开的
    // hideLoading/openFileComplete，loading 永久转圈。isReady() 只表示引擎对象已创建
    // （WASM 加载完），此时 mxweb 往往还在下载/解析——这也是原来只防了 401 没防住的原因。
    if (fileId && mxcadManager.isReady() && hasDocumentLoaded(mxcadManager)) {
      // 意图链续跑锚点 = document-loaded（ADR-0081 D4）：排在 reload 之后
      void mxcadManager
        .reloadCurrentFile()
        .catch(() => console.warn('[useFileOpenGuard] reloadCurrentFile 失败'))
        .finally(resumeIntent);
    } else if (fileId && !hasDocumentLoaded(mxcadManager)) {
      // 云图纸仍在下载/解析 → 等 openFileComplete 才续跑（不改变原有 reload 判据）
      openCompleteUnsubscribe = subscribe(
        CAD_EVENTS.OPEN_COMPLETE,
        resumeIntent
      );
    } else {
      // 本地/新建文档无 fileId 可 reload，文档本就是加载态 → 直接续跑
      resumeIntent();
    }

    // 清理必须覆盖所有分支：早退分支若在 return 前 return，订阅会泄漏到卸载之后
    return () => {
      openCompleteUnsubscribe?.();
    };
  }, [isAuthenticated, fileId]);

  // 导出闸门（会员 ∨ 开放免费导出）翻转 → 续跑意图链：充值成功 / 管理员开放
  // 免费导出后，被 VIP 闸门拦下的原始导出动作自动续跑（ADR-0081）。
  // 登录翻转已由上面的 [isAuthenticated, fileId] effect 续跑（document-loaded
  // 锚点）；这里只兜「已登录」翻转，文档未就绪或 reload 进行中时跳过
  // （锚点路径稍后会续跑，resumeIntent 幂等）。
  const membership = useMembership();
  const { config: runtimeConfig } = useRuntimeConfig();
  const exportAllowed = canExportDownload(
    !!membership?.isVip,
    runtimeConfig.freeExportDownloadEnabled
  );

  useEffect(() => {
    if (!exportAllowed) return;
    if (!mxcadManager.isReady() || mxcadManager.hasPendingOpen()) return;
    if (fileId && !hasDocumentLoaded(mxcadManager)) return;
    resumeIntent();
  }, [exportAllowed, fileId]);

  const { showLoginPrompt: gateShowLoginPrompt, handleLoginPromptClose } =
    loginGate;
  useEffect(() => {
    // 路由变化时关闭仍打开的闸门视图（依赖只含路由：若含 showLoginPrompt，
    // 非主页模式下提示一弹出就会被本 effect 立刻关闭，SAVE_REQUIRED 提示不可见）
    if (!isHomeMode && gateShowLoginPrompt) {
      handleLoginPromptClose();
    }
  }, [location.pathname, isHomeMode]);

  useEffect(() => {
    // SAVE_REQUIRED + SAVE_AS_REQUIRED（原 window CustomEvent，T1 迁入类型化 bus）：
    // 未登录且未忽略时弹出登录提示，响应逻辑与迁移前一致（旧实现同一 handler 双事件订阅）
    const handleSaveRequired = (payload: SaveRequiredDetail) => {
      // 按稳定 kind 取展示文案：原 action.includes(t('另存为')) 分派因生产端恒发
      // t('保存文件') 而不可达，且跳过 saveAs 会吞掉登录提示（saveAsToCloud 已
      // cancelLoginRedirect，提示是未登录用户唯一的登录入口），故各 kind 都弹提示
      const label =
        payload?.kind === 'saveAs'
          ? t('另存为')
          : payload?.kind === 'share'
            ? t('保存并分享')
            : payload?.kind === 'export'
              ? t('导出文件')
              : t('保存文件');
      loginGate.requireLogin(label);
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
  }, [loginGate.requireLogin]);

  return { isActive, hideEditor, loginGate };
}
