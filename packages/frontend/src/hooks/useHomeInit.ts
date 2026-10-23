import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { initThemeSync, initMxCADConfig } from '../services/mxcadManager';
import { VIEW_INIT_TIMEOUT_MS } from '../services/mxcadManager/mxcadTypes';
import { t } from '@/languages';
import { withTimeout } from '@/utils/withTimeout';

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

        // 引擎初始化链（静态配置 fetch + token 刷新 + WASM 加载 + View 创建）内部无超时：
        // @hey-api client 不带 AbortController，ensureFreshAuthCookie 的刷新请求悬挂时
        // initializeMxCADView 永不 resolve，骨架屏永久停留且不进入下方错误分支。
        // 外层兜底，超时按初始化失败处理。
        await withTimeout(
          initMxCADConfig().then(() => mxcadManager.initializeMxCADView()),
          VIEW_INIT_TIMEOUT_MS
        );
        mxcadManager.showMxCAD(true);

        await initThemeSync();

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        isInitializedRef.current = true;
        onSetLoading(false);
        onSetStoreLoading(false);
      } catch (error) {
        // 空 catch 会静默吞掉异常对象：初始化失败/悬挂时既无日志也无错误态，
        // 无法区分是 WASM 加载、token 刷新还是静态配置哪一步出了问题
        console.error('[MxCAD] 编辑器初始化失败', error);
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
