import { t } from '@/languages';
import { isQuotaExceededError } from '@/utils/quotaUpgradeGuide';
import { mxcadUploadControllerCheckFileExist } from '@/api-sdk';
import { projectControllerGetPersonalSpace } from '@/api-sdk';
import { handleError } from '@/utils/errorHandler';
import { calculateFileHash } from '../../utils/hashUtils';
import { uploadMxCadFile } from '../../utils/mxcadUploadUtils';
import { StoragePathConstants } from '@/constants/storage.constants';
import { globalShowToast } from '@/utils/notificationEvents';
import {
  showGlobalLoading,
  hideGlobalLoading,
  setLoadingMessage,
} from '../loadingService';
import { useCADEditorStore } from '../../stores/useCADEditorStore';
import {
  broadcastConversionActivity,
  useConversionQueueStore,
} from '../../stores/conversionQueueStore';
import { mxcadManager } from './mxcadManager';
import { emit } from '../drawingSession';
import { FILE_UPLOAD_CONFIG } from './mxcadTypes';
import { confirmExitCollaborationIfNeeded } from './mxcadCollaboration';
import { guardBeforeOpen, openDrawing, openUnderLoading } from './openDrawing';
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

/** openUnderLoading prepare 内的「守卫取消」信号：静默返回，不走失败 toast */
class OpenGuardCancelled extends Error {}

async function openLocalMxwebFile(
  file: File,
  noCache?: boolean
): Promise<void> {
  try {
    // loading 配对（show/finally hide）统一交给 openUnderLoading，本模块不再自配对
    await openUnderLoading({
      loadingMessage: t('正在计算文件哈希...'),
      prepare: async () => {
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
        // 用户可能编辑了当前图纸。取消不是失败，用哨兵静默退出
        if (!(await guardBeforeOpen())) throw new OpenGuardCancelled();
        return {
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
        } as Parameters<typeof mxcadManager.openFile>[0];
      },
    });
  } catch (error) {
    if (error instanceof OpenGuardCancelled) return;
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
          callback: () =>
            openDrawing({
              source: 'public-hash',
              file,
              fileHash: hash,
              noCache,
              localTaskId,
            }),
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
    // 哈希计算与上传，打开时由 openDrawing(public-hash) 重新 show
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
    // 转换完成且是最近打开的文件：打开 mxweb（loading 归 openDrawing(public-hash) 管）
    emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
      fileHash: hash,
      fileName: file.name,
      noCache: noCache ?? false,
      callback: () =>
        openDrawing({
          source: 'public-hash',
          file,
          fileHash: hash,
          noCache,
          localTaskId,
        }),
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
