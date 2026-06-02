import { ref, readonly } from 'vue';
import { getNodeInfo, buildMxwebUrl } from '../services/fileService';
import { useEditorState } from './useEditorState';
import { loadCADPermissions } from '../services/permissionService';
import { openMxWeb } from '../plugins/mxcad/openMxWeb';
import { getCachedMxwebData, setMxwebCache, buildCacheKey, clearMxwebCache } from '../services/mxwebCacheService';
import { classifyApiError } from '../utils/errorHandler';
import {
  getPreloadingData,
  checkExternalReferences,
  uploadExtRefImage,
  uploadExtRefDwg,
} from '../services/extRefService';
import {
  isHashLike,
  getPublicPreloadingData,
  buildPublicMxwebUrl,
  checkPublicExtReference,
  type PublicPreloadingData,
} from '../services/publicFileService';
import { parseExtRefFileNames } from '../services/extRefService';
import { showExternalReferenceUploadPopup } from '@/plugins/vant/components/popup/showExternalReferenceUploadPopup';
import { showDialog, showToast } from 'vant';

const loading = ref(false);
const error = ref<string | null>(null);
const progress = ref('');

export function useFileLoader() {
  const editorState = useEditorState();

  /**
   * Read fileId or nodeId from URL query params.
   */
  function getFileIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('fileId') || params.get('nodeId') || null;
  }

  /**
   * Read file hash from URL query params (for public files).
   */
  function getHashFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('hash') || params.get('fileHash') || null;
  }

  /**
   * Read version/revision number from URL query params.
   */
  function getVersionFromUrl(): number | undefined {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    if (!v) return undefined;
    const num = parseInt(v, 10);
    return isNaN(num) ? undefined : num;
  }

  /**
   * Load a file by its node ID from the server.
   */
  async function loadByNodeId(nodeId: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    progress.value = '正在获取文件信息...';

    editorState.setFileId(nodeId);
    editorState.setLoading(true);

    try {
      progress.value = '正在加载图纸...';
      const nodeInfo = await getNodeInfo(nodeId);

      editorState.setFileInfo(nodeInfo as unknown as Record<string, unknown>);
      editorState.setFileName(nodeInfo.name);
      editorState.setProjectId(nodeInfo.parentId || null);
      editorState.setUpdatedAt((nodeInfo as unknown as Record<string, unknown>).updatedAt as string || null);
      await loadCADPermissions(nodeInfo.parentId || null);

      if (!nodeInfo.path) {
        throw new Error('文件路径不存在');
      }

      const version = getVersionFromUrl();
      const cacheKey = buildCacheKey(nodeInfo.path, version);

      const cachedData = await getCachedMxwebData(cacheKey);
      if (cachedData) {
        progress.value = '正在从缓存加载图纸...';
        const blob = new Blob([cachedData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const opened = await openMxWeb(url);
        URL.revokeObjectURL(url);
        if (opened) {
          editorState.setIsActive(true);
          editorState.setLoading(false);
          loading.value = false;
          return true;
        }
      }

      const mxwebUrl = buildMxwebUrl(nodeInfo.path, version);
      progress.value = '正在打开图纸...';

      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;
        try {
          const mxcad = (await import('mxcad')).MxCpp.App.getCurrentMxCAD();
          if (mxcad) {
            const fileName = mxcad.getCurrentFileName() || 'drawing.mxweb';
            mxcad.saveFile(fileName, async (data: { buffer: ArrayBuffer }) => {
              if (data?.buffer) {
                await setMxwebCache(cacheKey, data.buffer).catch(() => {});
              }
            }, false, false);
          }
        } catch {}
        return true;
      } else {
        throw new Error('打开文件失败');
      }
    } catch (e: unknown) {
      const classified = classifyApiError(e);
      const message = classified.message;
      error.value = message;
      editorState.setError(message);
      editorState.setLoading(false);
      loading.value = false;
      return false;
    }
  }

  /**
   * Load a public file by its hash.
   * Public files have no project context — permissions are limited.
   */
  async function loadByHash(hash: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    progress.value = '正在获取公开文件信息...';

    editorState.setFileId(hash);
    editorState.setLoading(true);

    try {
      progress.value = '正在加载图纸...';
      const preloadData = await getPublicPreloadingData(hash);

      editorState.setFileInfo(
        preloadData as unknown as Record<string, unknown>
      );
      editorState.setFileName(`${hash.slice(0, 8)}.mxweb`);
      editorState.setProjectId(null);
      editorState.setPermissions({
        canSave: false,
        canExport: true,
        canManageExternalRef: false,
      });

      const mxwebUrl = buildPublicMxwebUrl(hash);
      progress.value = '正在打开图纸...';

      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;
        return true;
      } else {
        throw new Error('打开文件失败');
      }
    } catch (e: unknown) {
      const classified = classifyApiError(e);
      const message = classified.message;
      error.value = message;
      editorState.setError(message);
      editorState.setLoading(false);
      loading.value = false;
      return false;
    }
  }

  /**
   * Try to load file from URL params. Returns true if a fileId or hash was found and loading started.
   */
  async function loadFromUrl(): Promise<boolean> {
    const fileId = getFileIdFromUrl();
    if (fileId) {
      return await loadByNodeId(fileId);
    }
    const fileHash = getHashFromUrl();
    if (fileHash) {
      return await loadByHash(fileHash);
    }
    return false;
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    progress: readonly(progress),
    loadByNodeId,
    loadByHash,
    loadFromUrl,
    getFileIdFromUrl,
    getHashFromUrl,
    getVersionFromUrl,
  };
}

export async function checkFileExternalRefs(nodeId: string): Promise<void> {
  try {
    const preloadData = await getPreloadingData(nodeId);
    if (!preloadData) return;

    const refNames = parseExtRefFileNames([
      ...(preloadData.images || []),
      ...(preloadData.externalReference || []),
    ]);
    if (refNames.length === 0) return;

    const missingRefs = await checkExternalReferences(nodeId);
    const missingMap = new Map(missingRefs.map((r) => [r.name, r]));

    const needUpload = refNames.filter(
      (r) =>
        !r.name.startsWith('http://') &&
        !r.name.startsWith('https://') &&
        missingMap.has(r.name)
    );
    if (needUpload.length === 0) return;

    const fileList = needUpload.map((f) => f.name).join('\n');
    const { state } = useEditorState();
    const canManageExtRef = state.permissions.canManageExternalRef;

    showDialog({
      title: '缺失外部参照文件',
      message: canManageExtRef
        ? `以下文件需要上传:\n${fileList}`
        : `以下外部参照文件缺失:\n${fileList}\n\n请联系管理员上传`,
      showCancelButton: true,
      confirmButtonText: canManageExtRef ? '上传文件' : '知道了',
      cancelButtonText: '跳过',
    })
      .then(async () => {
        if (!canManageExtRef) return;
        for (const ref of needUpload) {
          const file = await pickFile(ref.type === 'img' ? 'image/*' : '.dwg');
          if (file) {
            if (ref.type === 'img') {
              await uploadExtRefImage({
                file,
                srcDwgfileHash: preloadData.hash,
                extRefFile: ref.name,
              });
            } else {
              await uploadExtRefDwg({ nodeId, file });
            }
          }
        }
        showToast('外部参照上传完成');
      })
      .catch(() => {});
  } catch {
    // Silently fail - file can still open without refs
  }
}

async function getPublicPreloadingDataWithRetry(
  hash: string,
  maxRetries = 10,
  delayMs = 2000
): Promise<PublicPreloadingData | null> {
  for (let i = 0; i < maxRetries; i++) {
    const data = await getPublicPreloadingData(hash);
    if (data) return data;
    if (i < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

export async function checkPublicFileExternalRefs(hash: string): Promise<boolean> {
  try {
    const preloadData = await getPublicPreloadingDataWithRetry(hash);
    if (!preloadData) return true;

    const refs = parseExtRefFileNames([
      ...(preloadData.images || []).filter(
        (img: string) => !img.startsWith('http://') && !img.startsWith('https://')
      ),
      ...(preloadData.externalReference || []),
    ]);
    if (refs.length === 0) return true;

    const missingRefs: { name: string; type: 'img' | 'ref' }[] = [];
    for (const ref of refs) {
      const exists = await checkPublicExtReference(hash, ref.name);
      if (!exists) {
        missingRefs.push(ref);
      }
    }
    if (missingRefs.length === 0) return true;

    // 只传真正缺失的文件给弹窗
    await showExternalReferenceUploadPopup({
      images: missingRefs.filter((r) => r.type === 'img').map((r) => r.name),
      externalReference: missingRefs.filter((r) => r.type === 'ref').map((r) => r.name),
      hash,
    });

    return true;
  } catch {
    return true;
  }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = accept;
    el.style.display = 'none';
    document.body.appendChild(el);
    el.onchange = () => {
      document.body.removeChild(el);
      resolve(el.files?.[0] || null);
    };
    el.click();
  });
}
