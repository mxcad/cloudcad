import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { initThemeSync, initMxCADConfig } from '../services/mxcadManager';
import { t } from '@/languages';

/**
 * 等待 CAD 引擎真正就绪（WASM 加载 + 引擎对象创建，mxcadApplicationCreatedMxCADObject 事件）。
 * initializeMxCADView 仅保证 mxcad-app 视图挂载即 resolve，引擎初始化是异步的；
 * 协同链接的 auto-join 依赖 isReady()，引擎未就绪时 joinWork 无法执行。
 * 超时（ENGINE_READY_TIMEOUT_MS，15s）后按未就绪处理返回 false，调用方兜底
 * （关闭骨架屏 + 提示错误，避免页面永久卡加载态）。
 */
const ENGINE_READY_TIMEOUT_MS = 15_000;

async function waitForEngineReady(
  mxcadManager: { isReady(): boolean },
  shouldCancel: () => boolean
): Promise<boolean> {
  const startedAt = Date.now();
  while (
    !mxcadManager.isReady() &&
    Date.now() - startedAt < ENGINE_READY_TIMEOUT_MS
  ) {
    if (shouldCancel()) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return mxcadManager.isReady();
}

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