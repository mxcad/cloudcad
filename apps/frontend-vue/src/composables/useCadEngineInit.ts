import { MxCADView } from 'mxcad-app';
import { MxFun } from 'mxdraw';
import { useCadStore } from '@/stores/cad.store';

export function useCadEngineInit() {
  const store = useCadStore();
  let mxcadView: MxCADView | null = null;
  let container: HTMLElement | null = null;

  function buildViewOptions(openFile?: string) {
    const token = localStorage.getItem('accessToken');
    const resolveExtReferenceUrl = (fileName: string) => {
      if (openFile && openFile.includes('/public-file/access/')) {
        const parts = openFile.split('/');
        const hashIndex = parts.indexOf('access') + 1;
        if (hashIndex < parts.length) {
          const hash = parts[hashIndex];
          const base = import.meta.env.VITE_API_BASE_URL || '';
          return `${base}/public-file/access/${hash}/${fileName}`;
        }
      }
      return fileName;
    };
    return {
      rootContainer: container,
      ...(openFile && { openFile }),
      ...(token && { requestHeaders: { Authorization: `Bearer ${token}` } }),
      extReferenceUrlResolver: resolveExtReferenceUrl,
    };
  }

  function setupReadyListener(): void {
    MxFun.on('mxcadApplicationCreatedMxCADObject', () => {
      store.setReady(true);
      watchDocModify();
    });
  }

  function watchDocModify(): void {
    try {
      const mxcad = (globalThis as any).MxCpp?.getCurrentMxCAD?.();
      mxcad?.on('databaseModify', () => store.setDocumentModified(true));
    } catch { /* 引擎未就绪 */ }
  }

  async function initialize(containerEl: HTMLElement): Promise<void> {
    if (mxcadView && store.isReady) return;
    if (store.isInitializing) return;
    store.setInitializing(true);
    container = containerEl;
    try {
      const opts = buildViewOptions();
      mxcadView = new MxCADView(opts);
      setupReadyListener();
      mxcadView.create();
    } catch (err) {
      console.error('[useCadEngine] 初始化失败:', err);
      mxcadView = null;
      store.setReady(false);
      throw err;
    } finally {
      store.setInitializing(false);
    }
  }

  function getMxCADView(): MxCADView | null {
    return mxcadView;
  }

  function showMxCAD(show: boolean): void {
    if (!container) return;
    container.style.visibility = show ? 'visible' : 'hidden';
    container.style.pointerEvents = show ? 'auto' : 'none';
  }

  function syncFileName(): void {
    const name = store.currentFileInfo?.name || '';
    try {
      const ctx = (globalThis as any).MxPluginContext;
      if (ctx?.useFileName) ctx.useFileName().fileName.value = name;
    } catch { /* 静默 */ }
  }

  return {
    mxcadView,
    initialize,
    buildViewOptions,
    getMxCADView,
    showMxCAD,
    syncFileName,
  };
}