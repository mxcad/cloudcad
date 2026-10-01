import { ref, readonly } from 'vue';
import { useEditorState } from './useEditorState';
import { loadCADPermissions } from '../services/permissionService';
import { openMxWeb } from '../plugins/mxcad/openMxWeb';
import {
  getCachedMxwebData,
  setMxwebCache,
  buildCacheKey,
  clearMxwebCache,
} from '../services/mxwebCacheService';
import { classifyApiError } from '../utils/errorHandler';
import { errMsg, errorKind, typedError } from '../utils/apiError';
import type { ErrorType } from '../stores/editor';
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
  nodeControllerGetNode,
  nodeControllerGetRootNode,
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
   * 从 URL 获取显示文件名（公开/本地 mxweb 路径）：PC 端转换面板打开时以
   * ?fileName= 携带转换前的原文件名，缺失时由调用方回退内部访问名 <hash>.mxweb
   */
  function getFileNameFromUrl(): string | null {
    return new URLSearchParams(window.location.search).get('fileName') || null;
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
  async function fetchFileNode(
    fileId: string,
    options?: FileOpenOptions
  ): Promise<FileSystemNodeDto> {
    if (options?.libraryKey === 'drawing') {
      const { data } = await libraryControllerGetDrawingNode({
        path: { nodeId: fileId },
      });
      return data as unknown as FileSystemNodeDto;
    }
    if (options?.libraryKey === 'block') {
      const { data } = await libraryControllerGetBlockNode({
        path: { nodeId: fileId },
      });
      return data as unknown as FileSystemNodeDto;
    }
    if (options?.shareToken) {
      const { data } = await shareControllerResolveShareNode({
        path: { token: options.shareToken },
      });
      return data as unknown as FileSystemNodeDto;
    }
    const { data } = await nodeControllerGetNode({
      path: { nodeId: fileId },
    });
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
    options?: FileOpenOptions
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
  async function loadByNodeId(
    fileId: string,
    options?: FileOpenOptions
  ): Promise<boolean> {
    loading.value = true;
    error.value = null;
    progress.value = t('正在获取文件信息...');
    editorState.setLoading(true);
    editorState.setProgressStage('fetching-info');

    try {
      // 1. 获取文件信息（根据文件源选择 API）
      progress.value = t('正在获取文件信息...');
      editorState.setProgressStage('fetching-info');
      const nodeInfo = await fetchFileNode(fileId, options);

      if (!nodeInfo) {
        // 分享源节点解析为空 = 链接失效（对齐被删除的 useShareFileLoad 专属文案）。
        // 三元必须放在 t() 外：voerkai18n extract 扫描器只认 t() 内直接的字符串字面量，
        // t(cond ? 'a' : 'b') 的两个键会被静默删除（PC 1419/1422 同根因）。
        throw typedError(
          'not-found',
          options?.shareToken ? t('分享链接不存在或已失效') : t('文件不存在')
        );
      }

      // 2. 校验（与 PC L730-L745 对齐）
      if (nodeInfo.deletedAt) {
        throw typedError('deleted', t('文件已被删除'));
      }
      if (!nodeInfo.fileHash) {
        throw typedError('converting', t('文件尚未转换完成'));
      }

      // 3. 设置文件信息到 store（文件名留到打开成功后写，见下方 commitOpen）
      editorState.setFileId(fileId);
      editorState.setFileInfo(nodeInfo as unknown as Record<string, unknown>);
      editorState.setUpdatedAt(nodeInfo.updatedAt || null);

      // 只在打开成功后记录文件名并标记活动（对齐 PC：禁止在成功前写，
      // 打开失败时标题不残留目标图纸名，也不误触缩略图上传/保存归属）
      const commitOpen = () => {
        editorState.setFileName(nodeInfo.name || '');
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;
      };

      // 4. 确定项目根节点（与 PC L762-L777 对齐）
      let projectId: string | null = nodeInfo.parentId || null;
      const isShare = !!options?.shareToken;

      if (!isShare && !options?.libraryKey) {
        // 项目文件：尝试解析真正根节点
        if (!nodeInfo.isRoot && nodeInfo.parentId) {
          try {
            const { data: rootNode } = await nodeControllerGetRootNode({
              path: { nodeId: fileId },
            });
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

      // 设置 libraryKey
      editorState.setLibraryKey(options?.libraryKey || null);

      // 获取私人空间 ID 并判断是否为私人空间模式（与 PC CADEditorDirect.tsx L310-L314 对齐）
      let personalSpaceId: string | null = null;
      if (projectId && !isShare && !options?.libraryKey) {
        try {
          const { data: personalSpace } = await import('../api-sdk').then((m) =>
            m.projectControllerGetPersonalSpace()
          );
          personalSpaceId =
            (personalSpace as unknown as { id: string })?.id || null;
        } catch {
          // 获取失败时忽略
        }
      }
      editorState.setPersonalSpaceId(personalSpaceId);

      // 判断是否为私人空间模式
      const isPersonalSpace = !!(
        personalSpaceId &&
        projectId &&
        projectId === personalSpaceId
      );
      editorState.setIsPersonalSpace(isPersonalSpace);

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
      const { url: mxwebUrl, cacheTimestamp } = buildFileUrl(
        nodeInfo,
        version,
        options
      );

      // 7. 历史版本或未设置缓存时间戳 → 跳过缓存
      if (cacheTimestamp !== undefined) {
        // 尝试从 IndexedDB 缓存读取
        const cacheKey = buildCacheKey(nodeInfo.path || '', cacheTimestamp);
        const cachedData = await getCachedMxwebData(cacheKey);
        if (cachedData) {
          progress.value = t('正在从缓存加载图纸...');
          editorState.setProgressStage('loading-cache');
          const blob = new Blob([cachedData], {
            type: 'application/octet-stream',
          });
          const objectUrl = URL.createObjectURL(blob);
          const opened = await openMxWeb(objectUrl);
          URL.revokeObjectURL(objectUrl);
          if (opened) {
            commitOpen();
            return true;
          }
        }
      }

      // 8. 打开文件
      progress.value = t('正在打开图纸...');
      editorState.setProgressStage('opening');
      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        commitOpen();

        // 9. 缓存文件到 IndexedDB（供下次快速打开）
        if (cacheTimestamp !== undefined) {
          try {
            const mxcad = (await import('mxcad')).MxCpp.App.getCurrentMxCAD();
            if (mxcad) {
              const fileName = mxcad.getCurrentFileName() || 'drawing.mxweb';
              mxcad.saveFile(
                fileName,
                async (data: { buffer: ArrayBuffer }) => {
                  if (data?.buffer) {
                    const cacheKey = buildCacheKey(
                      nodeInfo.path || '',
                      cacheTimestamp
                    );
                    // 先清除旧缓存，再写入新缓存
                    await clearMxwebCache(cacheKey).catch(() => {});
                    await setMxwebCache(cacheKey, data.buffer).catch(() => {});
                  }
                },
                false,
                false
              );
            }
          } catch {
            /* 缓存失败不影响主流程 */
          }
        }
        return true;
      } else {
        throw typedError('open-failed', t('打开文件失败'));
      }
    } catch (e: unknown) {
      // 类别判定读 typed error 的 kind（errorKind 单一出口），不再用 message 字符串反推
      const kind = errorKind(e);
      let message: string;
      let errorType: ErrorType;

      if (kind === 'unauthorized') {
        message = t('请登录后访问此文件');
        errorType = 'auth';
      } else if (kind === 'not-found') {
        // 分享源 404 用分享专属文案（对齐被删除的 useShareFileLoad）
        message = t(
          options?.shareToken
            ? '分享链接不存在或已失效'
            : '文件不存在或已被删除'
        );
        errorType = 'not-found';
      } else if (kind === 'deleted') {
        message = errMsg(e, t('文件已被删除'));
        errorType = 'not-found';
      } else if (kind === 'converting') {
        message = errMsg(e, t('文件尚未转换完成'));
        errorType = 'converting';
      } else if (kind === 'open-failed') {
        message = errMsg(e, t('打开文件失败'));
        errorType = 'open-failed';
      } else {
        const classified = classifyApiError(e);
        message = classified.message;
        errorType = classified.type;
      }

      error.value = message;
      editorState.setError(message);
      editorState.setErrorType(errorType);
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
    editorState.setProgressStage('fetching-info');

    editorState.setFileId(hash);
    editorState.setLoading(true);

    try {
      progress.value = t('正在加载图纸...');
      editorState.setProgressStage('fetching-info');
      const preloadData = await getPublicPreloadingData(hash);

      // 显示名用转换前原文件名（URL ?fileName= 携带，对齐 PC 的 shareFileNameParam）；
      // 缺失时回退内部访问名 <hash>.mxweb，不做截断——截断哈希在标题栏不可读
      const hashFileName = getFileNameFromUrl() || `${hash}.mxweb`;

      editorState.setFileInfo(
        preloadData as unknown as Record<string, unknown>
      );
      editorState.setProjectId(null);
      editorState.setPermissions({
        canSave: false,
        canExport: true,
        canManageExternalRef: false,
      });

      const mxwebUrl = buildPublicMxwebUrl(hash);
      progress.value = t('正在打开图纸...');
      editorState.setProgressStage('opening');

      const opened = await openMxWeb(mxwebUrl);

      if (opened) {
        editorState.setFileName(hashFileName);
        editorState.setIsActive(true);
        editorState.setLoading(false);
        loading.value = false;
        return true;
      } else {
        throw typedError('open-failed', t('打开文件失败'));
      }
    } catch (e: unknown) {
      // 类别判定读 typed error 的 kind（errorKind 单一出口），不再用 message 字符串反推
      const kind = errorKind(e);
      let message: string;
      let errorType: ErrorType;

      if (kind === 'unauthorized') {
        message = t('请登录后访问此文件');
        errorType = 'auth';
      } else if (kind === 'not-found' || kind === 'deleted') {
        message = t('文件不存在或已被删除');
        errorType = 'not-found';
      } else if (kind === 'open-failed') {
        message = errMsg(e, t('打开文件失败'));
        errorType = 'open-failed';
      } else {
        const classified = classifyApiError(e);
        message = classified.message;
        errorType = classified.type;
      }

      error.value = message;
      editorState.setError(message);
      editorState.setErrorType(errorType);
      editorState.setLoading(false);
      loading.value = false;
      return false;
    }
  }

  function clearError() {
    error.value = null;
    editorState.setErrorType(null);
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    progress: readonly(progress),
    loadByNodeId,
    loadByHash,
    getFileIdFromUrl,
    getNodeIdFromUrl,
    getHashFromUrl,
    getFileNameFromUrl,
    getVersionFromUrl,
    clearError,
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
        // 上传失败即抛，这里不吞：只要有一个失败就不报成功，
        // 用户重新打开图纸会再次进入缺失参照检查。
        let allOk = true;
        for (const ref of needUpload) {
          const file = await pickFile(ref.type === 'img' ? 'image/*' : '.dwg');
          if (!file) continue;
          try {
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
          } catch {
            allOk = false;
          }
        }
        if (allOk) showToast(t('外部参照上传完成'));
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

export async function checkPublicFileExternalRefs(
  hash: string
): Promise<boolean> {
  try {
    const preloadData = await getPublicPreloadingDataWithRetry(hash);
    if (!preloadData) return true;

    const refs = parseExtRefFileNames([
      ...(preloadData.images || []).filter(
        (img: string) =>
          !img.startsWith('http://') && !img.startsWith('https://')
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
      externalReference: missingRefs
        .filter((r) => r.type === 'ref')
        .map((r) => r.name),
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
