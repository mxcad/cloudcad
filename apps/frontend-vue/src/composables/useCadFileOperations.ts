import { MxFun } from 'mxdraw';
import { useCadStore } from '@/stores/cad.store';

const FetchAttributes = {
  EMSCRIPTEN_FETCH_LOAD_TO_MEMORY: 1,
  EMSCRIPTEN_FETCH_PERSIST_FILE: 2,
  EMSCRIPTEN_FETCH_REPLACE: 4,
} as const;
import { useCadEngineInit } from './useCadEngineInit';

const RETRY = { MAX: 3, DELAY_MS: 1000 } as const;
const OPEN_TIMEOUT_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useCadFileOperations() {
  const store = useCadStore();
  const { getMxCADView, syncFileName } = useCadEngineInit();

  function setupFileOpenListener(): void {
    const mxcadView = getMxCADView();
    mxcadView?.mxcad.on('openFileComplete', () => {
      store.setDocumentModified(false);
      try {
        const mxcad = (globalThis as any).MxCpp?.getCurrentMxCAD?.();
        const name = mxcad?.getCurrentFileName?.();
        if (name) {
          const fileNameRef = (store as any).currentFileName;
          if (fileNameRef) fileNameRef.value = name;
        }
      } catch { /* 静默 */ }
    });
  }

  function isMxwebFile(name: string): boolean {
    const n = name.toLowerCase();
    return n.endsWith('.mxweb') || n.endsWith('.mxwbe');
  }

  function isCadFile(name: string): boolean {
    const n = name.toLowerCase();
    return n.endsWith('.dwg') || n.endsWith('.dxf') || isMxwebFile(name);
  }

  function alreadyOpen(fileUrl: string): boolean {
    const mxcadView = getMxCADView();
    if (!mxcadView?.mxcad) return false;
    try {
      return (
        (mxcadView.mxcad.getCurrentFileName?.() || '') ===
        (fileUrl.split('/').pop() || '')
      );
    } catch {
      return false;
    }
  }

  function openWithRetry(
    mxcad: any,
    fileUrl: string,
    noCache: boolean | undefined,
    done: (err: Error | null) => void,
  ): void {
    const token = localStorage.getItem('accessToken');
    const headers = token
      ? { requestHeaders: { Authorization: `Bearer ${token}` } }
      : undefined;
    const fetchAttrs = noCache
      ? FetchAttributes.EMSCRIPTEN_FETCH_LOAD_TO_MEMORY |
        FetchAttributes.EMSCRIPTEN_FETCH_PERSIST_FILE |
        FetchAttributes.EMSCRIPTEN_FETCH_REPLACE
      : 0;

    for (let i = 0; i < RETRY.MAX; i++) {
      try {
        mxcad.openWebFile(fileUrl, undefined, true, headers, fetchAttrs);
        return;
      } catch (err) {
        if ((err as Error).message?.includes('mxdrawObject') && i < RETRY.MAX - 1) {
          sleep(RETRY.DELAY_MS).then(() => {});
          continue;
        }
        done(err as Error);
        return;
      }
    }
    done(new Error('文件打开重试耗尽'));
  }

  async function openFile(fileUrl: string, noCache?: boolean): Promise<void> {
    const mxcadView = getMxCADView();
    if (!mxcadView || !store.isReady)
      throw new Error('[useCadEngine] MxCADView 未就绪');
    store.setCurrentMxwebUrl(fileUrl);
    if (alreadyOpen(fileUrl)) return;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(
        () => done(new Error('文件打开超时')),
        OPEN_TIMEOUT_MS,
      );
      const onOk = () => done(null);
      const done = (err: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        mxcadView?.mxcad?.off('openFileComplete', onOk);
        err ? reject(err) : resolve();
      };
      mxcadView!.mxcad!.on('openFileComplete', onOk);
      openWithRetry(mxcadView!.mxcad, fileUrl, noCache, done);
    });
  }

  function saveFile(): void {
    MxFun.sendStringToExecute('Mx_Save');
  }

  function exportFile(): void {
    MxFun.sendStringToExecute('Mx_SaveAs');
  }

  async function openUploadedFile(
    info: any,
    url: string,
  ): Promise<void> {
    store.setCurrentFileInfo(info);
    await openFile(url);
    syncFileName();
  }

  async function generateThumbnail(): Promise<string | null> {
    try {
      const mxcad = (globalThis as any).MxCpp?.getCurrentMxCAD?.();
      return (await mxcad?.mxdraw?.createCanvasImageData?.(256, 256)) || null;
    } catch {
      return null;
    }
  }

  async function saveToBlob(): Promise<Blob> {
    const name = store.currentFileInfo?.name || 'untitled';
    return new Promise<Blob>((resolve, reject) => {
      try {
        const mxcad = (globalThis as any).MxCpp?.App?.getCurrentMxCAD?.();
        if (!mxcad) {
          reject(new Error('MxCAD not available'));
          return;
        }
        mxcad.saveFile(
          name,
          (data: ArrayBuffer | Uint8Array) => {
            try {
              const isSafari = /^((?!chrome|android).)*safari/i.test(
                navigator.userAgent,
              );
              const blob = new Blob([(data as Uint8Array).buffer], {
                type: isSafari
                  ? 'application/octet-stream'
                  : 'application/octet-binary',
              });
              resolve(blob);
            } catch (e) {
              reject(e);
            }
          },
          false,
          false,
          undefined,
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  return {
    setupFileOpenListener,
    openFile,
    saveFile,
    exportFile,
    openUploadedFile,
    isMxwebFile,
    isCadFile,
    generateThumbnail,
    saveToBlob,
  };
}