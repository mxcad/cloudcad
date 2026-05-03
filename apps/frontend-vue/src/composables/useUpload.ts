import { ref, computed } from 'vue';
import { useUppyUpload, type LoadFileParam } from './useUppyUpload';
import { useCadEngine } from './useCadEngine';
import { useProgress } from './useProgress';
import { useAuthStore } from '@/stores/auth.store';
import { publicFileApi } from '@/services/publicFileApi';

export type UploadMode = 'authenticated' | 'public';

export interface UploadCallbacks {
  onProgress?: (msg: string, pct: number) => void;
  onSuccess?: (params: { nodeId?: string; name: string; hash: string }) => void;
  onError?: (error: string) => void;
}

/**
 * 上传流程 Composable
 *
 * 封装两个上传路径：
 * - 未登录 → publicFileApi.uploadFile → getFileAccessUrl → openFile
 * - 已登录 → useUppyUpload (Tus) → waitForFileReady → openUploadedFile
 */
export function useUpload() {
  const auth = useAuthStore();
  const cad = useCadEngine();
  const progress = useProgress();
  const { selectFiles: selectUppy } = useUppyUpload();

  const nodeId = ref<string>('');

  /** 判断当前可用的上传模式 */
  const mode = computed<UploadMode>(() => (auth.isAuthenticated ? 'authenticated' : 'public'));

  /**
   * 已登录用户：Uppy + Tus 上传流程
   * 照搬 MxCadUppyUploader.handleSelectFiles 的逻辑
   */
  function uploadAuthenticated(_file: File, callbacks: UploadCallbacks): void {
    selectUppy({
      nodeId: nodeId.value || undefined,
      onFileQueued: (f: File) => {
        progress.start(`正在上传: ${f.name}`);
      },
      onBeginUpload: () => {
        callbacks.onProgress?.('正在上传...', 0);
      },
      onProgress: (pct: number) => {
        callbacks.onProgress?.('正在上传...', pct);
      },
      onSuccess: async (param: LoadFileParam) => {
        try {
          progress.update('文件转换中...', 100);
          const info = await cad.waitForFileReady(param.nodeId || nodeId.value);
          if (!info) throw new Error('文件转换未完成，请稍后在文件列表中查看');

          const infoFile: Parameters<typeof cad.openUploadedFile>[0] = {
            fileId: param.nodeId || '',
            parentId: info.parentId || nodeId.value,
            projectId: null,
            name: info.name,
          };
          progress.update('正在打开文件...', 100);
          const url = buildMxCadFileUrl(info.path);
          await cad.openUploadedFile(infoFile, url);
          callbacks.onSuccess?.({ nodeId: param.nodeId, name: param.name, hash: param.hash });
        } catch (err) {
          callbacks.onError?.((err as Error).message || '文件打开失败');
        } finally {
          progress.finish();
        }
      },
      onError: (error: string) => {
        callbacks.onError?.(error);
        progress.cancel();
      },
    });
  }

  /**
   * 未登录用户：publicFileApi 上传流程
   * 照搬 handlePublicUpload 的逻辑
   */
  async function uploadPublic(file: File, callbacks: UploadCallbacks): Promise<void> {
    try {
      progress.start('正在计算文件哈希...');
      const { calculateFileHash } = await import('@/utils/hashUtils');
      const hash = await calculateFileHash(file);

      progress.update('正在上传文件...', 0);
      const result = await publicFileApi.uploadFile(file, 5 * 1024 * 1024, (pct) => {
        callbacks.onProgress?.('正在上传文件...', pct);
      });

      progress.update('正在打开文件...', 100);
      const fileUrl = publicFileApi.getFileAccessUrl(result.hash || hash);
      await cad.openFile(fileUrl);
      cad.setCurrentFileInfo({
        fileId: '', parentId: null, projectId: null,
        name: file.name, personalSpaceId: null,
      });

      callbacks.onSuccess?.({ name: file.name, hash: result.hash || hash });
    } catch (err) {
      callbacks.onError?.((err as Error).message || '上传失败');
    } finally {
      progress.finish();
    }
  }

  /** 设置上传目标节点 */
  function setNodeId(id: string): void { nodeId.value = id; }

  function buildMxCadFileUrl(path: string): string {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    return `${base}/api/file-system/file/${encodeURIComponent(path)}`;
  }

  return {
    mode,
    nodeId,
    setNodeId,
    uploadAuthenticated,
    uploadPublic,
  };
}
