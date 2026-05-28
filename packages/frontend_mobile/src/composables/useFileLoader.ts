import { ref, readonly } from 'vue';
import { getNodeInfo, buildMxwebUrl } from '../services/fileService';
import { useEditorState } from './useEditorState';
import { loadCADPermissions } from '../services/permissionService';
import { openMxWeb } from '../plugins/mxcad/openMxWeb';
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
} from '../services/publicFileService';
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
      await loadCADPermissions(nodeInfo.parentId || null);

      if (!nodeInfo.path) {
        throw new Error('文件路径不存在');
      }

      const version = getVersionFromUrl();
      const mxwebUrl = buildMxwebUrl(nodeInfo.path, version);
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
      const message = e instanceof Error ? e.message : '未知错误';
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

      editorState.setFileInfo(preloadData as unknown as Record<string, unknown>);
      editorState.setFileName(`${hash.slice(0, 8)}.mxweb`);
      editorState.setProjectId(null);
      editorState.setPermissions({ canSave: false, canExport: true, canManageExternalRef: false });

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
      const message = e instanceof Error ? e.message : '未知错误';
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
  function loadFromUrl(): boolean {
    const fileId = getFileIdFromUrl();
    if (fileId) {
      return true;
    }
    const fileHash = getHashFromUrl();
    if (fileHash) {
      return true;
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

    const missingRefs = await checkExternalReferences(nodeId);
    if (!missingRefs || missingRefs.length === 0) return;

    const fileList = missingRefs.map(f => f.name).join('\n');
    showDialog({
      title: '缺失外部参照文件',
      message: `以下文件需要上传:\n${fileList}`,
      showCancelButton: true,
      confirmButtonText: '上传文件',
      cancelButtonText: '跳过',
    }).then(async () => {
      for (const ref of missingRefs) {
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
    }).catch(() => {
      // User skipped
    });
  } catch {
    // Silently fail - file can still open without refs
  }
}

export async function checkPublicFileExternalRefs(hash: string): Promise<void> {
  const { getPublicPreloadingData, checkPublicExtReference, uploadPublicExtReferenceFile, buildPublicMxwebUrl } = await import('../services/publicFileService');
  try {
    const preloadData = await getPublicPreloadingData(hash);
    if (!preloadData) return;

    const missingRefs: { name: string; type: 'img' | 'ref' }[] = [];
    for (const ref of preloadData.externalReference) {
      const exists = await checkPublicExtReference(hash, ref);
      if (!exists) {
        missingRefs.push({ name: ref, type: 'ref' });
      }
    }
    for (const img of preloadData.images) {
      if (img.startsWith('http://') || img.startsWith('https://')) continue;
      const exists = await checkPublicExtReference(hash, img);
      if (!exists) {
        missingRefs.push({ name: img, type: 'img' });
      }
    }

    if (missingRefs.length === 0) return;

    const fileList = missingRefs.map(f => f.name).join('\n');
    showDialog({
      title: '缺失外部参照文件',
      message: `以下公开文件外部参照需要上传:\n${fileList}`,
      showCancelButton: true,
      confirmButtonText: '上传文件',
      cancelButtonText: '跳过',
    }).then(async () => {
      for (const ref of missingRefs) {
        const file = await pickFile(ref.type === 'img' ? 'image/*' : '.dwg');
        if (file) {
          await uploadPublicExtReferenceFile({
            srcHash: hash,
            file,
            extRefFile: ref.name,
          });
        }
      }
      showToast('外部参照上传完成');
    }).catch(() => {
      // User skipped
    });
  } catch {
    // Silently fail
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
