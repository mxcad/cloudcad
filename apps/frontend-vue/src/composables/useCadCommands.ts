import { onMounted, onUnmounted } from 'vue';
import { MxFun } from 'mxdraw';
import { useRouter } from 'vue-router';
import { useCadEngine } from './useCadEngine';
import { useCadEvents } from './useCadEvents';
import { useProgress } from './useProgress';
import { useAuthStore } from '@/stores/auth.store';
import { libraryApi } from '@/services/libraryApi';
import { filesApi } from '@/services/filesApi';
import type { CadFileInfo } from '@/stores/cad.store';

export function useCadCommands() {
  const router = useRouter();
  const cad = useCadEngine();
  const events = useCadEvents();
  const progress = useProgress();
  const auth = useAuthStore();

  let ctrlSHandler: ((e: KeyboardEvent) => void) | null = null;

  function registerReturnCommand(): void {
    MxFun.addCommand('return-to-cloud-map-management', () => {
      cad.showMxCAD(false);

      const info = cad.currentFileInfo;

      if (info?.fromPlatform && window.opener) {
        window.close();
        return;
      }

      if (!info) {
        router.push('/');
        return;
      }

      router.push(buildReturnPath(info));
    });
  }

  function buildReturnPath(info: CadFileInfo): string {
    if (info.libraryKey === 'drawing') return '/library/drawing';
    if (info.libraryKey === 'block') return '/library/block';
    if (info.personalSpaceId) return `/personal-space/${info.personalSpaceId}`;
    if (info.projectId) return `/projects/${info.projectId}`;
    return '/projects';
  }

  function registerSaveCommand(): void {
    MxFun.addCommand('Mx_Save', async () => {
      if (!auth.isAuthenticated) {
        router.push('/login');
        return;
      }

      const info = cad.currentFileInfo;
      if (!info) return;

      const hasPermission = info.libraryKey || info.projectId || info.personalSpaceId;
      if (!hasPermission) {
        events.emit('save-failed', { error: '当前文件不支持保存到云端' });
        return;
      }

      const msgKey = 'mx-save';
      progress.show({ key: msgKey, msg: '正在处理待提交图像...', block: true });

      try {
        await processPendingImages();

        progress.updateLoading({ key: msgKey, msg: '正在保存图纸...' });

        if (info.libraryKey === 'drawing') {
          const blob = await cad.saveToBlob();
          progress.updateLoading({ key: msgKey, msg: '正在上传图纸...' });
          await libraryApi.saveDrawing(info.fileId, blob, (pct) => {
            progress.updateLoading({ key: msgKey, msg: `正在上传图纸... ${Math.round(pct)}%` });
          });
        } else if (info.libraryKey === 'block') {
          const blob = await cad.saveToBlob();
          progress.updateLoading({ key: msgKey, msg: '正在上传图块...' });
          await libraryApi.saveBlock(info.fileId, blob, (pct) => {
            progress.updateLoading({ key: msgKey, msg: `正在上传图块... ${Math.round(pct)}%` });
          });
        } else {
          await filesApi.saveFile({
            fileHash: info.fileId || '',
            name: info.name,
            nodeId: info.fileId || undefined,
            parentId: info.parentId || undefined,
            projectId: info.projectId || undefined,
          });
        }

        progress.hide(msgKey);
        events.emit('file-saved', { fileId: info.fileId });
      } catch (err) {
        progress.hide(msgKey);
        console.error('[useCadCommands] 保存失败:', err);
        events.emit('save-failed', { error: (err as Error).message });
      }
    });
  }

  async function processPendingImages(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const mxcad = (window as any).MxCpp?.getCurrentMxCAD?.();
        if (mxcad?.processPendingImages) {
          mxcad.processPendingImages();
        }
      } catch { /* ignore */ }
      resolve();
    });
  }

  function registerExportCommand(): void {
    MxFun.addCommand('exportFile', async () => {
      const msgKey = 'mx-export';
      try {
        progress.show({ key: msgKey, msg: '正在导出文件...', block: true });

        await cad.exportFile();

        progress.hide(msgKey);
      } catch (err) {
        progress.hide(msgKey);
        console.error('[useCadCommands] 导出失败:', err);
        events.emit('export-failed', { error: (err as Error).message });
      }
    });
  }

  function registerCtrlSOverride(): void {
    ctrlSHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        MxFun.sendStringToExecute('Mx_Save');
      }
    };
    window.addEventListener('keydown', ctrlSHandler, true);
  }

  function unregisterCtrlSOverride(): void {
    if (ctrlSHandler) {
      window.removeEventListener('keydown', ctrlSHandler, true);
      ctrlSHandler = null;
    }
  }

  onMounted(() => {
    registerReturnCommand();
    registerSaveCommand();
    registerExportCommand();
    registerCtrlSOverride();
  });

  onUnmounted(unregisterCtrlSOverride);
}