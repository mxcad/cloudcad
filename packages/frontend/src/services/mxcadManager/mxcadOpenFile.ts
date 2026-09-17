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
import { useConversionQueueStore } from '../../stores/conversionQueueStore';
import { mxcadManager } from './mxcadManager';
import { emitFileOpened, setCacheTimestamp, emit } from '../drawingSession';
import { DEFAULT_MESSAGES, FILE_UPLOAD_CONFIG } from './mxcadTypes';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from './mxcadCollaboration';
import { CAD_EXTENSIONS } from '../../utils/fileUtils';
import { CAD_EVENTS } from '@/constants/events';

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
  // 统一转换面板（#470/#472）：让面板感知该节点的在途转换（云端列表），
  // 面板悬浮按钮据此可见并轮询；waitForFileReady 继续等待就绪后打开文件。
  void useConversionQueueStore.getState().refreshCloud();
  setLoadingProgress(0);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const fileInfoResponse = await nodeControllerGetNode({ path: { nodeId } });
    // SDK 默认不抛错：API 失败（404/500）与"仍在转换中"必须区分，
    // 否则失败会被误报为"文件转换未完成"（历史 bug）
    if (fileInfoResponse.error) throw fileInfoResponse.error;
    const fileInfo = fileInfoResponse.data;
    if (!fileInfo) return null;
    // 后端转换失败保留 FAILED 节点（不再硬删），若继续轮询会空等满 maxAttempts
    // （默认 60×2s=120s）才报「文件转换未完成」，用户误以为还在转换。
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
    if (attempt < maxAttempts) {
      setLoadingMessage(
        `${t('文件转换中，请稍候...')} (${attempt}/${maxAttempts})`
      );
      // S6-1/S6-6 主上传路径：新上传的云端任务（node.taskId）由后台转换（fire-and-forget）
      // 稍后才写入，入口的 refreshCloud（函数顶部）可能早于其写入而漏掉。每轮等待后重拉
      // 云端列表，确保该任务在 node.taskId 写入后 ≤ 一个轮询间隔内进入面板（消除竞态）。
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
  showGlobalLoading(t(DEFAULT_MESSAGES.OPENING_FILE));
  const fileInfo = await waitForFileReady(newNodeId);
  if (!fileInfo) {
    hideGlobalLoading();
    throw new Error(t('文件转换未完成，请稍后在文件列表中查看'));
  }
  const projectId = await getProjectId(uploadTargetNodeId, newNodeId);
  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
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
        hideGlobalLoading();
        emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
          fileHash: hash,
          fileName: file.name,
          noCache: noCache ?? false,
          callback: async () => {
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
          },
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
    hideGlobalLoading();
    emit(CAD_EVENTS.PUBLIC_FILE_UPLOADED, {
      fileHash: hash,
      fileName: file.name,
      noCache: noCache ?? false,
      callback: async () => {
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
      },
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
