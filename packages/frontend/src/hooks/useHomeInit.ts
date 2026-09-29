import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { initThemeSync, initMxCADConfig } from '../services/mxcadManager';
import { t } from '@/languages';

export interface UseHomeInitOptions {
  isHomeMode: boolean;
  /** 协同链接（URL 带合法 collabWorkId）：文件打开被 useCadFileLoader 跳过，仍需初始化引擎供 auto-join 加入协同 */
  isCollabLink: boolean;
  isActive: boolean;
  isInitializedRef: React.MutableRefObject<boolean>;
  onSetError: (msg: string | null) => void;
  onSetStoreError: (msg: string | null) => void;
  onSetLoading: (loading: boolean) => void;
  onSetStoreLoading: (loading: boolean) => void;
}

export function useHomeInit({
  isHomeMode,
  isCollabLink,
  isActive,
  isInitializedRef,
  onSetError,
  onSetStoreError,
  onSetLoading,
  onSetStoreLoading,
}: UseHomeInitOptions) {
  const navigate = useNavigate();
  const homeInitStartedRef = useRef(false);

  useEffect(() => {
    if ((!isHomeMode && !isCollabLink) || !isActive) return;
    if (homeInitStartedRef.current) {
      return;
    }

    homeInitStartedRef.current = true;

    onSetError(null);
    onSetStoreError(null);

    (async () => {
      try {
        const { mxcadManager } = await import('../services/mxcadManager');

        if (mxcadManager.isCreated()) {
          mxcadManager.showMxCAD(true);
          isInitializedRef.current = true;
          onSetLoading(false);
          onSetStoreLoading(false);
          return;
        }

        const { setNavigateFunction } =
          await import('../services/mxcadManager');
        setNavigateFunction(navigate);

        await initMxCADConfig();

        await mxcadManager.initializeMxCADView();
        mxcadManager.showMxCAD(true);

        await initThemeSync();

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        isInitializedRef.current = true;
        onSetLoading(false);
        onSetStoreLoading(false);
      } catch {
        homeInitStartedRef.current = false;
        onSetError(t('CAD 编辑器初始化失败，请刷新页面重试'));
        onSetStoreError(t('CAD 编辑器初始化失败，请刷新页面重试'));
        // 错误时也关闭骨架屏：引擎不可用，留骨架无意义
        onSetLoading(false);
        onSetStoreLoading(false);
      }
    })();

    return () => {
      homeInitStartedRef.current = false;
    };
  }, [isHomeMode, isCollabLink, isActive]);
}
