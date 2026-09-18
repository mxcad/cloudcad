import { t } from '@/languages';
import { isQuotaExceededError } from '@/utils/quotaUpgradeGuide';
import { mxcadUploadControllerCheckFileExist } from '@/api-sdk';
import {
  nodeControllerGetNode,
  nodeControllerGetRootNode,
  projectControllerGetPersonalSpace,
} from '@/api-sdk';
import {
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
} from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { calculateFileHash } from '../../utils/hashUtils';
import { uploadMxCadFile } from '../../utils/mxcadUploadUtils';
import { UrlHelper } from '@/utils/mxcadUtils';
import { StoragePathConstants } from '@/constants/storage.constants';
import { globalShowToast } from '@/utils/notificationEvents';
import {
  showGlobalLoading,
  hideGlobalLoading,
  setLoadingMessage,
  setLoadingProgress,
} from '../loadingService';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import {
  broadcastConversionActivity,
  useConversionQueueStore,
} from '../../stores/conversionQueueStore';
import { mxcadManager } from './mxcadManager';
import { emitFileOpened, setCacheTimestamp, emit } from '../drawingSession';
import { DEFAULT_MESSAGES, FILE_UPLOAD_CONFIG } from './mxcadTypes';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from './mxcadCollaboration';
import { CAD_EXTENSIONS } from '../../utils/fileUtils';
import { CAD_EVENTS } from '@/constants/events';
import { getApiBaseUrl } from '@/config/apiConfig';

function isMxwebFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.mxweb');
}

function isCadFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return CAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const getFilePicker = (): HTMLInputElement => {
  let picker = document.getElementById(
    FILE_UPLOAD_CONFIG.FILE_PICKER_ID
  ) as HTMLInputElement;
  if (!picker) {
    picker = document.createElement('input');
    picker.id = FILE_UPLOAD_CONFIG.FILE_PICKER_ID;
    picker.type = 'file';
    picker.accept = FILE_UPLOAD_CONFIG.ALLOWED_EXTENSIONS;
    picker.style.display = 'none';
    document.body.appendChild(picker);
  }
  return picker;
};

async function getPersonalSpaceId(): Promise<string | null> {
  try {
    const response = await projectControllerGetPersonalSpace();
    // SDK 默认不抛错：失败时错误在 result.error，显式抛出让 catch 记录真实原因
    if (response.error) throw response.error;
    return response.data?.id || null;
  } catch (error) {
    handleError(error, 'mxcadManager: getPersonalSpaceId');
    return null;
  }
}

async function getUploadTargetNodeId(): Promise<string> {
  const personalSpaceResponse = await projectControllerGetPersonalSpace();
  // SDK 默认不抛错：失败时错误在 result.error，透传后端真实原因
  // （此前固定显示"无法获取私人空间，请联系管理员"掩盖 401/无权限等原因）
  if (personalSpaceResponse.error) throw personalSpaceResponse.error;
  const personalSpace = personalSpaceResponse.data;
  if (!personalSpace?.id) throw new Error(t('无法获取私人空间，请联系管理员'));
  const currentProjectId =
    useCADEditorStore.getState().currentFileInfo?.projectId;
  if (!currentProjectId) return personalSpace.id;
  if (currentProjectId === personalSpace.id) {
    return (
      useCADEditorStore.getState().currentFileInfo?.parentId || personalSpace.id
    );
  } else {
    return personalSpace.id;
  }
}

async function getProjectId(
  uploadTargetNodeId: string,
  newNodeId: string
): Promise<string> {
  let projectId = uploadTargetNodeId;
  const fileInfoCurrent = useCADEditorStore.getState().currentFileInfo;
  if (fileInfoCurrent?.projectId) {
    projectId = fileInfoCurrent.projectId;
  } else {
    try {
      const rootResponse = await nodeControllerGetRootNode({
        path: { nodeId: newNodeId },
      });
      if (rootResponse.error) throw rootResponse.error;
      if (rootResponse.data?.id) projectId = rootResponse.data.id;
    } catch (error) {
      handleError(error, 'mxcadManager: getProjectId');
    }
  }
  return projectId;
}

/**
 * 替换当前文档前的复查守卫：转换等待期编辑器不再被遮罩锁死，用户可能在此期间
 * 编辑了当前图纸或加入协同，而入口检查只覆盖发起时刻、不覆盖等待窗口。
 * 首开场景（无文档、非协同）两个检查均为 no-op。
 * 返回 false（用户取消）时调用方不得继续打开。
 */
export async function guardBeforeOpen(): Promise<boolean> {
  const a = await confirmExitCollaborationIfNeeded();
  return a ? checkAndConfirmUnsavedChanges() : false;
}

export async function waitForFileReady(
  nodeId: string,
  maxAttempts: number = 60,
  intervalMs: number = 2000
): Promise<{
  fileHash: string;
  path: string;
  name: string;
  parentId: string;
} | null> {
  setLoadingProgress(0);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fileInfoResponse = await nodeControllerGetNode({ path: { nodeId } });
    // SDK 默认不抛错：API 失败（404/500）与"仍在转换中"必须区分，
    // 否则失败会被误报为"文件转换未完成"（历史 bug）
    if (fileInfoResponse.error) {
      // 上传链路转换/落盘失败后节点被删除（后端不再留存未成功 node 记录）：
      // 404 NOT_FOUND 即失败信号，给出与 FAILED 一致的失败文案，而非裸 404
      // 「节点不存在」。其他错误（网络/500）透传真实原因。
      const code = (fileInfoResponse.error as { code?: string })?.code;
      if (code === 'NOT_FOUND') {
        throw new Error(t('该文件转换失败，请检查文件内容'));
      }
      throw fileInfoResponse.error;
    }
    const fileInfo = fileInfoResponse.data;
    if (!fileInfo) return null;
    // 打开/导出链路失败保留 FAILED 节点（真实文件不删），若继续轮询会空等满
    // maxAttempts（默认 60×2s=120s）才报「文件转换未完成」，用户误以为还在转换。
    // 这里立即失败并给出与 useCadFileLoader 一致的失败文案。
    if (fileInfo.fileStatus === 'FAILED') {
      throw new Error(t('该文件转换失败，请检查文件内容'));
    }
    if (fileInfo.fileHash && fileInfo.path) {
      return {
        fileHash: fileInfo.fileHash,
        path: fileInfo.path,
        name: fileInfo.name,
        parentId: fileInfo.parentId || '',
      };
    }
    // 走到这里 = 节点尚未就绪 = 确有在途转换。统一转换面板（#470/#472）让面板感知
    // 该节点的在途转换（云端列表），面板悬浮按钮据此可见并轮询；同时广播到其他标签页
    // （它们的轮询与 SSE 都门控到 hasActive，不广播就永远看不到本标签页发起的转换）。
    // 仅首轮（刚进入等待）触达一次，后续轮次靠下面的 refreshCloud 刷新状态。
    // 打开已转换完成的文件首轮即返回、不会走到这里，故「打开图纸」本身不拉起面板——
    // 面板只由真实的上传 / 导出下载 / 转换动作拉起。
    // 直接展开、不经过 settled 基线门控：settled 竞态下（refreshCloud #2 先于 #1 完成）
    // 新任务被算进基线，isGrowthAfterSettle 永远 false，面板不展开。
    if (attempt === 1) {
      const queueStore = useConversionQueueStore.getState();
      void queueStore.refreshCloud();
      queueStore.expandByTask();
      broadcastConversionActivity();
    }
    if (attempt < maxAttempts) {
      setLoadingMessage(
        `${t('文件转换中，请稍候...')} (${attempt}/${maxAttempts})`
      );
      // S6-1/S6-6 主上传路径：新上传的云端任务（node.taskId）由后台转换（fire-and-forget）
      // 稍后才写入，首轮探测可能早于其写入而漏掉。每轮等待后重拉云端列表，确保该任务在
      // node.taskId 写入后 ≤ 一个轮询间隔内进入面板（消除竞态）。
      void useConversionQueueStore.getState().refreshCloud();
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}

export async function openUploadedFile(
  newNodeId: string,
  uploadTargetNodeId: string
): Promise<void> {
  const collabOk = await confirmExitCollaborationIfNeeded();
  if (!collabOk) return;
  // 转换等待期不再锁编辑器（转换面板提供进度反馈）；全局 loading 只覆盖引擎打开本身
  const fileInfo = await waitForFileReady(newNodeId);
  if (!fileInfo) {
    throw new Error(t('文件转换未完成，请稍后在文件列表中查看'));
  }
  const projectId = await getProjectId(uploadTargetNodeId, newNodeId);
  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  // 转换等待期编辑器可交互：用户可能在此期间编辑了当前图纸/加入协同，打开前复查
  if (!(await guardBeforeOpen())) return;
  showGlobalLoading(t(DEFAULT_MESSAGES.OPENING_FILE));
  try {
    await mxcadManager.openFile({
      url: mxcadFileUrl,
      fileInfo: {
        fileId: newNodeId,
        parentId: fileInfo.parentId || uploadTargetNodeId,
        projectId,
        name: fileInfo.name,
        personalSpaceId: useFileSystemStore.getState().personalSpaceId,
      },
    });
  } catch (error) {
    // 打开失败（引擎 retCall 非 0 / 超时）：隐藏 loading 并上抛，禁止继续 emitFileOpened
    // 记录当前文件状态（title/currentFileInfo 只允许在打开成功后写入）
    hideGlobalLoading();
    throw error;
  }
  hideGlobalLoading();
  emitFileOpened({
    fileId: newNodeId,
    parentId: fileInfo.parentId || uploadTargetNodeId,
    projectId,
    fileName: fileInfo.name,
  });
}

export async function openLibraryDrawing(
  nodeId: string,
  fileName?: string,
  nodePath?: string,
  updatedAt?: string
): Promise<void> {
  try {
    const collabOk = await confirmExitCollaborationIfNeeded();
    if (!collabOk) return;
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) return;
    showGlobalLoading(t(DEFAULT_MESSAGES.OPENING_FILE));
    let finalFileName = fileName;
    let finalNodePath = nodePath;
    let finalUpdatedAt = updatedAt;
    if (!finalFileName || !finalNodePath) {
      const nodeResponse = await libraryControllerGetDrawingNode({
        path: { nodeId },
      });
      // SDK 默认不抛错：失败时错误在 result.error，透传真实原因，
      // 否则失败被误报为"无法获取图纸库文件信息"
      if (nodeResponse.error) throw nodeResponse.error;
      const node = nodeResponse.data;
      if (!node) throw new Error(t('无法获取图纸库文件信息'));
      finalFileName = finalFileName || node.name;
      finalNodePath = finalNodePath || node.path;
      finalUpdatedAt = finalUpdatedAt || node.updatedAt;
    }
    if (!finalNodePath) throw new Error(t('无法获取文件路径'));
    if (!finalFileName) throw new Error(t('无法获取文件名'));
    let libraryFileUrl = `/api/v1/library/drawing/filesData/${finalNodePath}`;
    let cacheTimestamp: number | undefined;
    if (finalUpdatedAt) {
      cacheTimestamp = new Date(finalUpdatedAt).getTime();
      libraryFileUrl += `?t=${cacheTimestamp}`;
      setCacheTimestamp(cacheTimestamp);
    }
    await mxcadManager.openFile({
      url: libraryFileUrl,
      fileInfo: {
        fileId: nodeId,
        parentId: null,
        projectId: null,
        name: finalFileName,
        personalSpaceId: null,
        libraryKey: 'drawing',
        path: finalNodePath,
      },
    });
    emitFileOpened({
      fileId: nodeId,
      parentId: null,
      projectId: null,
      fileUrl: libraryFileUrl,
      fileName: finalFileName,
      libraryKey: 'drawing',
    });
    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'mxcadManager: openDrawingLibraryFile');
    throw error;
  }
}

export async function openLibraryBlock(
  nodeId: string,
  fileName?: string,
  nodePath?: string,
  updatedAt?: string
): Promise<void> {
  try {
    const collabOk = await confirmExitCollaborationIfNeeded();
    if (!collabOk) return;
    const canProceed = await checkAndConfirmUnsavedChanges();
    if (!canProceed) return;
    showGlobalLoading(t(DEFAULT_MESSAGES.OPENING_FILE));
    let finalFileName = fileName;
    let finalNodePath = nodePath;
    let finalUpdatedAt = updatedAt;
    if (!finalFileName || !finalNodePath) {
      const nodeResponse = await libraryControllerGetBlockNode({
        path: { nodeId },
      });
      // SDK 默认不抛错：失败时错误在 result.error，透传真实原因，
      // 否则失败被误报为"无法获取图块库文件信息"
      if (nodeResponse.error) throw nodeResponse.error;
      const node = nodeResponse.data;
      if (!node) throw new Error(t('无法获取图块库文件信息'));
      finalFileName = finalFileName || node.name;
      finalNodePath = finalNodePath || node.path;
      finalUpdatedAt = finalUpdatedAt || node.updatedAt;
    }
    if (!finalNodePath) throw new Error(t('无法获取文件路径'));
    if (!finalFileName) throw new Error(t('无法获取文件名'));
    let libraryFileUrl = `/api/v1/library/block/filesData/${finalNodePath}`;
    let cacheTimestamp: number | undefined;
    if (finalUpdatedAt) {
      cacheTimestamp = new Date(finalUpdatedAt).getTime();
      libraryFileUrl += `?t=${cacheTimestamp}`;
      setCacheTimestamp(cacheTimestamp);
    }
    await mxcadManager.openFile({
      url: libraryFileUrl,
      fileInfo: {
        fileId: nodeId,
        parentId: null,
        projectId: null,
        name: finalFileName,
        personalSpaceId: null,
        libraryKey: 'block',
        path: finalNodePath,
      },
    });
    emitFileOpened({
      fileId: nodeId,
      parentId: null,
      projectId: null,
      fileUrl: libraryFileUrl,
      fileName: finalFileName,
      libraryKey: 'block',
    });
    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    handleError(error, 'mxcadManager: openBlockLibraryFile');
    throw error;
  }
}

async function openLocalMxwebFile(
  file: File,
  noCache?: boolean
): Promise<void> {
  try {
    showGlobalLoading(t('正在计算文件哈希...'));
    const hash = await calculateFileHash(file);
    const virtualUrl = `${StoragePathConstants.LOCAL_MXWEB_CACHE_PREFIX}/${hash}${StoragePathConstants.MXWEB_EXTENSION}`;
    setLoadingMessage(t('正在检查本地缓存...'));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('emscripten_filesystem', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    let needsWrite = true;
    if (!noCache) {
      const existingData = await new Promise<unknown>((resolve, reject) => {
        const getRequest = db
          .transaction(['FILES'], 'readonly')
          .objectStore('FILES')
          .get(virtualUrl);
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve(getRequest.result);
      });
      if (existingData) needsWrite = false;
    }
    if (needsWrite) {
      setLoadingMessage(t('正在缓存文件...'));
      const arrayBuffer = await file.arrayBuffer();
      const transaction = db.transaction(['FILES'], 'readwrite');
      const objectStore = transaction.objectStore('FILES');
      await new Promise<void>((resolve, reject) => {
        const putRequest = objectStore.put(arrayBuffer, virtualUrl);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      });
    }
    db.close();
    setLoadingMessage(t('正在打开文件...'));
    // 打开前复查（入口从未查过未保存，这是唯一检查点）：算哈希/写缓存期间
    // 用户可能编辑了当前图纸
    if (!(await guardBeforeOpen())) {
      hideGlobalLoading();
      return;
    }
    await mxcadManager.openFile({
      url: virtualUrl,
      noCache,
      fileInfo: {
        fileId: '',
        parentId: null,
        projectId: null,
        name: file.name,
        personalSpaceId: null,
        fileHash: hash,
      },
    });
    hideGlobalLoading();
  } catch (error) {
    hideGlobalLoading();
    const errorMessage =
      error instanceof Error ? error.message : t('打开文件失败');
    globalShowToast(errorMessage, 'error');
  }
}

/**
 * latest-wins 标记：最近一次打开的公开图纸 hash。
 * 连续打开多个文件时（A 还在转换、B 又打开），只有 hash 等于当前标记的文件
 * 转换完成后才会被打开；被取代文件的完成只更新任务状态、不打开。
 * 服务模块内的协调状态（非组件状态），每次打开新文件时覆盖。
 */
let currentPublicOpenHash: string | null = null;

/** 无节点转换等待超时：SSE 终态事件迟迟不到（服务端任务丢失，如服务重启）视为失败 */
const PUBLIC_CONVERSION_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 打开公开图纸的 mxweb（public-file/access/<hash><ext>.mxweb）并更新本地任务状态。
 * 成功置 completed、失败置 failed + toast（打开入口统一收敛在此，避免多处重复）。
 */
async function openPublicMxweb(
  file: File,
  hash: string,
  noCache: boolean | undefined,
  localTaskId: string
): Promise<void> {
  const { updateTaskStatus } = useConversionQueueStore.getState();
  // 转换等待期编辑器可交互：打开前复查；用户取消则不打开，任务置 cancelled（终态，
  // 避免面板卡在 processing；文件已转换完成，可稍后从面板重新打开）
  if (!(await guardBeforeOpen())) {
    updateTaskStatus(localTaskId, 'cancelled');
    return;
  }
  try {
    showGlobalLoading(t('正在打开文件...'));
    const ext = file.name.includes('.')
      ? file.name.substring(file.name.lastIndexOf('.'))
      : '';
    const mxwebFilename = `${hash}${ext}.mxweb`;
    const fileUrl = `/api/v1/public-file/access/${mxwebFilename}`;
    await mxcadManager.openFile({
      url: fileUrl,
      noCache,
      fileInfo: {
        fileId: '',
        parentId: null,
        projectId: null,
        name: file.name,
        personalSpaceId: null,
        fileHash: hash,
      },
    });
    hideGlobalLoading();
    updateTaskStatus(localTaskId, 'completed');
    // 打开成功后更新浏览器 URL（?hash= + ?fileName=），对齐节点打开的 onFileOpened 行为
    emitFileOpened({
      fileId: '',
      parentId: null,
      projectId: null,
      fileName: file.name,
      fileHash: hash,
    });
  } catch (error) {
    hideGlobalLoading();
    updateTaskStatus(localTaskId, 'failed', {
      error: error instanceof Error ? error.message : undefined,
    });
    globalShowToast(
      error instanceof Error ? error.message : t('文件打开失败'),
      'error'
    );
  }
}

/**
 * 等待某文件的无节点转换终态（按文件公开 SSE，无需 token）。
 *
 * 后端 `GET /api/v1/mxcad/conversion/file-stream?hash=<hash>`：建连先推当前状态
 * （PROCESSING/COMPLETED/FAILED，处理「订阅前已转完」竞态），再推完成事件即断流。
 * 终态（COMPLETED/FAILED）时 resolve；EventSource 不可用或超时（服务端转换任务
 * 丢失）按失败处理。断连时 EventSource 自动重连，重连后后端重推当前状态。
 */
function waitPublicFileConverted(
  hash: string
): Promise<{ status: 'COMPLETED' | 'FAILED' }> {
  return new Promise((resolve) => {
    if (typeof EventSource === 'undefined') {
      resolve({ status: 'FAILED' });
      return;
    }
    let settled = false;
    // eslint-disable-next-line no-restricted-syntax -- 豁免：无节点转换完成 SSE（SDK 无 SSE 形态，公开端点无 token，ADR-0034 豁免清单，参照 ConversionPanel 转换任务 SSE）
    const es = new EventSource(
      `${getApiBaseUrl()}/v1/mxcad/conversion/file-stream?hash=${encodeURIComponent(hash)}`
    );
    const finish = (status: 'COMPLETED' | 'FAILED'): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      es.close();
      resolve({ status });
    };
    const timer = setTimeout(
      () => finish('FAILED'),
      PUBLIC_CONVERSION_WAIT_TIMEOUT_MS
    );
    es.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as {
          hash?: string;
          status?: string;
        };
        if (payload.status === 'COMPLETED' || payload.status === 'FAILED') {
          finish(payload.status);
        }
        // PROCESSING（建连当前状态）→ 继续等待完成事件
      } catch {
        // 忽略畸形帧
      }
    };
    // 断连由 EventSource 自动重连（重连后后端重推当前状态），无需手动处理
  });
}

export async function handlePublicUpload(
  file: File,
  noCache?: boolean
): Promise<void> {
  // S6-1/S6-6：游客/公开路径登记本地转换任务（无 nodeId → 本地任务，面板据此可见）。
  // 云端路径（登录用户）已由 node.taskId + refreshCloud 覆盖；此处补齐游客/公开路径。
  // 任务在打开文件成功时置 completed、失败时置 failed（callback 是异步打开入口）。
  const localTaskId = `local_public_${Date.now()}`;
  const { addLocalTask, updateTaskStatus } =
    useConversionQueueStore.getState();
  addLocalTask({ id: localTaskId, name: file.name, status: 'processing' });
  try {
    showGlobalLoading(t('正在计算文件哈希...'));
    const hash = await calculateFileHash(file);
    // 补 fileHash：面板「打开」按钮用此构造公开路径 URL
    updateTaskStatus(localTaskId, 'processing', { fileHash: hash });
    // latest-wins：最近打开的文件优先（每次打开新文件覆盖）
    currentPublicOpenHash = hash;
    if (!noCache) {
      setLoadingMessage(t('正在检查缓存...'));
      const existData = await mxcadUploadControllerCheckFileExist({
        body: {
          fileSize: file.size,
          fileHash: hash,
          filename: file.name,
          nodeId: '',
        },
      });
      if (existData.data?.exists) {
        // mxweb 已就位（秒传）：直接打开
        hideGlobalLoading();
        emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
          fileHash: hash,
          fileName: file.name,
          noCache: noCache ?? false,
          callback: () => openPublicMxweb(file, hash, noCache, localTaskId),
        });
        return;
      }
    }
    setLoadingMessage(t('正在上传文件...'));
    await uploadMxCadFile({
      file,
      hash,
      nodeId: '',
      forceUpload: true,
      onProgress: (percentage: number) => {
        if (percentage === 100) setLoadingMessage(t('图纸转换中...'));
        else
          setLoadingMessage(
            `${t('正在上传文件...')} ${percentage.toFixed(1)}%`
          );
      },
    });
    // 上传/合并请求立即返回（转换后台跑）：等按文件 SSE 终态事件（latest-wins）。
    // 转换等待期不再锁编辑器（转换面板提供进度反馈）：全局 loading 只覆盖
    // 哈希计算与上传，打开时由 openPublicMxweb 重新 show
    hideGlobalLoading();
    const { status } = await waitPublicFileConverted(hash);
    if (status === 'FAILED') {
      if (hash === currentPublicOpenHash) {
        // 用户正在等的文件失败：提示（loading 已在上传完成后清除）
        globalShowToast(t('该文件转换失败，请检查文件内容'), 'error');
      }
      updateTaskStatus(localTaskId, 'failed', {
        error: t('该文件转换失败，请检查文件内容'),
      });
      return;
    }
    if (hash !== currentPublicOpenHash) {
      // 被后续打开的文件取代：只记任务完成，不打开（loading 归最近一次打开所有，勿动）
      updateTaskStatus(localTaskId, 'completed');
      return;
    }
    // 转换完成且是最近打开的文件：打开 mxweb（loading 归 openPublicMxweb 管）
    emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
      fileHash: hash,
      fileName: file.name,
      noCache: noCache ?? false,
      callback: () => openPublicMxweb(file, hash, noCache, localTaskId),
    });
  } catch (error) {
    hideGlobalLoading();
    updateTaskStatus(localTaskId, 'failed', {
      error: error instanceof Error ? error.message : undefined,
    });
    // QUOTA_EXCEEDED（转换频率限制）的提示由全局 error interceptor 独占负责
    // （clientSetup.ts → handleQuotaExceededError：游客 toast / 登录用户确认购买弹窗），
    // 此处静默 return 仅为避免双重提示。
    // 依赖链路（已验证，issue #216）：@hey-api 非 2xx 也执行 error interceptor，
    // 先于 throwOnSdkError 抛出 MxCadUploadError 执行；提示为 fire-and-forget，不阻塞本 catch。
    // ⚠️ 若全局处理行为变更，请保持本分支同步，勿在无提示时静默吞错。
    if (isQuotaExceededError(error)) return;
    globalShowToast(
      error instanceof Error ? error.message : t('文件上传失败'),
      'error'
    );
  }
}

export async function handleOpenFileCommand(noCache?: boolean) {
  try {
    const collabOk = await confirmExitCollaborationIfNeeded();
    if (!collabOk) return;
    const picker = getFilePicker();
    picker.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        picker.value = '';
        return;
      }
      const selectedFile = files[0];
      if (selectedFile) {
        if (isMxwebFile(selectedFile.name)) {
          await openLocalMxwebFile(selectedFile);
          picker.value = '';
          return;
        }
        if (!isCadFile(selectedFile.name)) {
          globalShowToast(
            t('不支持的文件格式，请选择 .dwg、.dxf、.mxweb'),
            'error'
          );
          picker.value = '';
          return;
        }
        await handlePublicUpload(selectedFile, noCache);
        picker.value = '';
        return;
      }
      picker.value = '';
    };
    picker.click();
  } catch (error) {
    handleError(error, 'mxcadManager: openFile');
    globalShowToast(
      error instanceof Error ? error.message : t('命令执行失败'),
      'error'
    );
  }
}
