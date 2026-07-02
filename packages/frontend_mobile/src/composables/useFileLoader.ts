import { ref, readonly } from 'vue';
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
import {
  fileSystemControllerGetNode,
  fileSystemControllerGetRootNode,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
  shareControllerResolveShareNode,
} from '../api-sdk';
import type { FileSystemNodeDto } from '../api-sdk';
import { t } from '@/languages';

const loading = ref(false);
const error = ref<string | null>(null);
const progress = ref('');

export interface FileOpenOptions {
  libraryKey?: 'drawing' | 'block';
  shareToken?: string;
}

export function useFileLoader() {
  const editorState = useEditorState();

  /**
   * 从 URL 获取 fileId：
   * 1. 优先读取 ?fileId= 查询参数（PC 端重定向时写入）
   * 2. 其次从 URL path 解析 /cad-editor/{fileId}
   * 3. 最后回退 ?nodeId=（旧链接兼容）
   */
  function getFileIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    const fileId = params.get('fileId');
    if (fileId) return fileId;
    const match = window.location.pathname.match(/^\/cad-editor\/([^/]+)$/);
    if (match) return match[1];
    return params.get('nodeId') || null;
  }

  /**
   * 从 URL 获取父目录 nodeId（用于侧边栏上下文）
   */
  function getNodeIdFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get('nodeId') || null;
  }

  /**
   * 从 URL 获取文件 hash（公开文件）
   */
  function getHashFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('hash') || params.get('fileHash') || null;
  }

  /**
   * 从 URL 获取版本号
   */
  function getVersionFromUrl(): number | undefined {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('v');
    if (!v) return undefined;
    const num = parseInt(v, 10);
    return isNaN(num) ? undefined : num;
  }

  /**
   * 根据文件来源获取节点信息
   */
  async function fetchFileNode(fileId: string, options?: FileOpenOptions): Promise<FileSystemNodeDto> {
    if (options?.libraryKey === 'drawing') {
      const { data } = await libraryControllerGetDrawingNode({ path: { nodeId: fileId } });
      return data as unknown as FileSystemNodeDto;
    }
    if (options?.libraryKey === 'block') {
      const { data } = await libraryControllerGetBlockNode({ path: { nodeId: fileId } });
      return data as unknown as FileSystemNodeDto;
    }
    if (options?.shareToken) {
      const { data } = await shareControllerResolveShareNode({ path: { token: options.shareToken } });
      return data as unknown as FileSystemNodeDto;
    }
    const { data } = await fileSystemControllerGetNode({ path: { nodeId: fileId } });
    return data as unknown as FileSystemNodeDto;
  }

  /**
   * 构造 mxweb 文件访问 URL。
   * 与 PC 端 CADEditorDirect.tsx L826-L854 对齐：
   * - 当前版本：使用 updatedAt 时间戳作为 t 参数，用于缓存版本标识
   * - 历史版本：使用 v 参数
   */
  function buildFileUrl(
    file: FileSystemNodeDto,
    version?: number,
    options?: FileOpenOptions,
  ): { url: string; cacheTimestamp: number | undefined } {
    if (!file.path) throw new Error(t('文件路径不存在'));

    if (version !== undefined) {
      // 历史版本 — 使用 v 参数，不设缓存时间戳（PC：setCacheTimestamp(undefined)）
      const url = options?.libraryKey
        ? `/api/v1/library/${options.libraryKey}/filesData/${file.path}?v=${version}`
        : `/api/v1/mxcad/filesData/${file.path}?v=${version}${options?.shareToken ? `&shareToken=${options.shareToken}` : ''}`;
      return { url, cacheTimestamp: undefined };
    }

    // 当前版本 — 使用 updatedAt 时间戳作为缓存版本标识
    if (!file.updatedAt) throw new Error(t('无法构造文件访问URL'));
    const cacheTimestamp = new Date(file.updatedAt).getTime();
    if (isNaN(cacheTimestamp)) throw new Error(t('文件更新时间无效'));

    const url = options?.libraryKey
      ? `/api/v1/library/${options.libraryKey}/filesData/${file.path}?t=${cacheTimestamp}`
      : `/api/v1/mxcad/filesData/${file.path}?t=${cacheTimestamp}${options?.shareToken ? `&shareToken=${options.shareToken}` : ''}`;

    return { url, cacheTimestamp };
  }

  /**
   * 通过 nodeId 加载文件。
   * 与 PC 端 CADEditorDirect.tsx L648-L936 对齐，包含：
   * - 多文件源支持（项目/library/share）
   * - deletedAt/fileHash 校验
   * - 项目根节点解析
   * - updatedAt 缓存时间戳管理
   * - IndexedDB 缓存
   */
  async function loadByNodeId(fileId: string, options?: FileOpenOptions): Promise<boolean> {
    loading.value = true;
    error.value = null;
    progress.value = t('正在获取文件信息...');
    editorState.setLoading(true);

    try {
      // 1. 获取文件信息（根据文件源选择 API）
      progress.value = t('正在获取文件信息...');
      const nodeInfo = await fetchFileNode(fileId, options);

      if (!nodeInfo) {
        throw new Error(t('文件不存在'));
      }

      // 2. 校验（与 PC L730-L745 对齐）
      if (nodeInfo.deletedAt) {
        throw new Error(t('文件已被删除'));
      }
      if (!nodeInfo.fileHash) {
        throw new Error(t('文件尚未转换完成'));
      }

      // 3. 设置文件信息到 store
      editorState.setFileId(fileId);
      editorState.setFileInfo(nodeInfo as unknown as Record<string, unknown>);
      editorState.setFileName(nodeInfo.name || '');
      editorState.setUpdatedAt(nodeInfo.updatedAt || null);

      // 4. 确定项目根节点（与 PC L762-L777 对齐）
      let projectId: string | null = nodeInfo.parentId || null;
      const isShare = !!options?.shareToken;

      if (!isShare && !options?.libraryKey) {
        // 项目文件：尝试解析真正根节点
        if (!nodeInfo.isRoot && nodeInfo.parentId) {
          try {
            const { data: rootNode } = await fileSystemControllerGetRootNode({ path: { nodeId: fileId } });
            if (rootNode?.id) {
              projectId = rootNode.id;
            }
          } catch {
            // 失败时使用 parentId 作为后备（与 PC 一致）
          }
        } else if (nodeInfo.isRoot) {
          projectId = nodeInfo.id || null;
        }
      } else if (isShare) {
        // 分享文件：projectId 置 null，避免侧边栏加载分享者项目文件树（PC L780-L782）
        projectId = null;
      }

      editorState.setProjectId(projectId);

      // 5. 加载权限
      if (projectId && !isShare && !options?.libraryKey) {
        await loadCADPermissions(projectId);
      } else {
        // 分享/public 文件：受限权限
        editorState.setPermissions({
          canSave: false,
          canExport: true,
          canManageExternalRef: false,
        });
      }

      // 6. 构造 mxweb 文件访问 URL
      const version = getVersionFromUrl();
      const { url: mxwebUrl, cacheTimestamp } = buildFileUrl(nodeInfo, version, options);

      // 7. 历史版本或未设置缓存时间戳 → 跳过缓存
      if (cacheTimestamp !== undefined) {
        // 尝试从 IndexedDB 缓存读取
        const cacheKey = buildCacheKey(nodeInfo.path || '', cacheTimestamp);
        const cachedData = await getCachedMxwebData(cacheKey);
        if (cachedData) {
          progress.value = t('正在从缓存加载图纸...');
          const blob = new Blob([cachedData], { type: 'application/octet-stream' });
          const objectUrl = URL.createObjectURL(blob);
          const opened = await openMxWeb(objectUrl);
          URL.revokeObjectURL(objectUrl);
          if (opened) {
            editorState.setIsActive(true);
            editorState.setLoading(false);
            loading.value = false;
            return true;
          }
        }
      }

      // 8. 打开文件
      progress.value = t('正在打开图纸...');
      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;

        // 9. 缓存文件到 IndexedDB（供下次快速打开）
        if (cacheTimestamp !== undefined) {
          try {
            const mxcad = (await import('mxcad')).MxCpp.App.getCurrentMxCAD();
            if (mxcad) {
              const fileName = mxcad.getCurrentFileName() || 'drawing.mxweb';
              mxcad.saveFile(fileName, async (data: { buffer: ArrayBuffer }) => {
                if (data?.buffer) {
                  const cacheKey = buildCacheKey(nodeInfo.path || '', cacheTimestamp);
                  // 先清除旧缓存，再写入新缓存
                  await clearMxwebCache(cacheKey).catch(() => {});
                  await setMxwebCache(cacheKey, data.buffer).catch(() => {});
                }
              }, false, false);
            }
          } catch { /* 缓存失败不影响主流程 */ }
        }
        return true;
      } else {
        throw new Error(t('打开文件失败'));
      }
    } catch (e: unknown) {
      const classified = classifyApiError(e);
      let message = classified.message;

      // 精确错误处理（与 PC L704-L716 对齐）
      const axiosError = e as { response?: { status?: number } };
      if (axiosError.response?.status === 401) {
        message = t('请登录后访问此文件');
      } else if (axiosError.response?.status === 404) {
        message = t('文件不存在或已被删除');
      } else if (message.includes('文件已被删除') || message.includes('文件尚未转换完成')) {
        message = message; // 业务错误，保持原消息
      }

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
    progress.value = t('正在获取公开文件信息...');

    editorState.setFileId(hash);
    editorState.setLoading(true);

    try {
      progress.value = t('正在加载图纸...');
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
      progress.value = t('正在打开图纸...');

      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;
        return true;
      } else {
        throw new Error(t('打开文件失败'));
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
    getNodeIdFromUrl,
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
      title: t('缺失外部参照文件'),
      message: canManageExtRef
        ? t(`以下文件需要上传:\n${fileList}`)
        : t(`以下外部参照文件缺失:\n${fileList}\n\n请联系管理员上传`),
      showCancelButton: true,
      confirmButtonText: canManageExtRef ? t('上传文件') : t('知道了'),
      cancelButtonText: t('跳过'),
    })
      .then(async () => {
        if (!canManageExtRef) return;
        for (const ref of needUpload) {
          const file = await pickFile(ref.type === 'img' ? 'image/*' : '.dwg');
          if (file) {
            if (ref.type === 'img') {
              await uploadExtRefImage({
                nodeId,
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
