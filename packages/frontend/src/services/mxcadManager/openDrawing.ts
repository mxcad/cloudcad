import { t } from '@/languages';
import { handleError } from '@/utils/errorHandler';
import { globalShowToast } from '@/utils/notificationEvents';
import {
  nodeControllerGetNode,
  nodeControllerGetRootNode,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
} from '@/api-sdk';
import { UrlHelper } from '@/utils/mxcadUtils';
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
import { emitFileOpened, setCacheTimestamp } from '../drawingSession';
import { DEFAULT_MESSAGES, EXTERNAL_REF_READY_TIMEOUT_MS } from './mxcadTypes';
import type { CurrentFileInfo, OpenFilePayload } from './mxcadTypes';
import {
  confirmExitCollaborationIfNeeded,
  checkAndConfirmUnsavedChanges,
} from './mxcadCollaboration';

/**
 * 打开图纸深模块 —— 「打开一张图纸」序列的唯一编排出口
 *
 * 判别联合按真实入口归纳，公共序列（打开前守卫、全局 loading 配对、URL 构造、
 * mxcadManager.openFile、emitFileOpened、错误收尾）吸收在 openDrawing 一处：
 *  - library：图纸库 / 图块库节点（原 openLibraryDrawing / openLibraryBlock 孪生折叠为 libraryKey 参数）
 *  - node：云端节点（含转换等待，原 openUploadedFile）
 *  - public-hash：游客/公开路径按 fileHash 打开（原 openPublicMxweb，含转换面板本地任务终态回写）
 *  - external-ref：外部参照 fileUrl 打开（原 CADEditorDirect.openExternalRef 内联编排）
 *
 * URL 已由调用方构造完成的首开序列（useCadFileLoader）直接复用 openUnderLoading；
 * 引擎层 mxcadOpenFlow.openFile 仍是打开命令的唯一实现，本模块只做其上的编排。
 */

/** 打开图纸请求（判别联合，成员 = 真实打开入口） */
export type OpenDrawingRequest =
  /** 图纸库 / 图块库节点 */
  | {
      source: 'library';
      libraryKey: 'drawing' | 'block';
      nodeId: string;
      fileName?: string;
      nodePath?: string;
      updatedAt?: string;
    }
  /** 云端节点（未转换完成时先等转换） */
  | { source: 'node'; nodeId: string; uploadTargetNodeId: string }
  /** 游客/公开路径：按 fileHash 打开 mxweb，并回写转换面板本地任务终态 */
  | {
      source: 'public-hash';
      file: File;
      fileHash: string;
      noCache?: boolean;
      localTaskId: string;
    }
  /** 外部参照 fileUrl（URL 参数直开，无节点） */
  | { source: 'external-ref'; url: string };

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

/**
 * 打开序列核心：showGlobalLoading → prepare()（构造最终打开载荷）→
 * mxcadManager.openFile → hideGlobalLoading（成功/失败都摘，否则永久 loading）。
 * 所有「打开一张图纸」的入口共享此实现，禁止在模块外再直接配对 show/hide + openFile。
 */
export async function openUnderLoading(plan: {
  loadingMessage: string;
  /** 在 loading 遮罩内构造最终打开载荷（引擎就绪等待、节点信息补全、URL 构造等） */
  prepare: () => Promise<OpenFilePayload>;
}): Promise<OpenFilePayload> {
  showGlobalLoading(plan.loadingMessage);
  try {
    const payload = await plan.prepare();
    await mxcadManager.openFile(payload);
    // 返回最终载荷供调用方做打开完成记录（emitFileOpened 等），避免闭包变量偷传
    return payload;
  } finally {
    hideGlobalLoading();
  }
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

/** 图纸库 / 图块库打开（原 openLibraryDrawing / openLibraryBlock 孪生折叠） */
async function openFromLibrary(req: {
  libraryKey: 'drawing' | 'block';
  nodeId: string;
  fileName?: string;
  nodePath?: string;
  updatedAt?: string;
}): Promise<void> {
  try {
    if (!(await guardBeforeOpen())) return;
    const payload = await openUnderLoading({
      loadingMessage: t(DEFAULT_MESSAGES.OPENING_FILE),
      prepare: async () => {
        let fileName = req.fileName;
        let nodePath = req.nodePath;
        let updatedAt = req.updatedAt;
        if (!fileName || !nodePath) {
          const nodeResponse =
            req.libraryKey === 'drawing'
              ? await libraryControllerGetDrawingNode({
                  path: { nodeId: req.nodeId },
                })
              : await libraryControllerGetBlockNode({
                  path: { nodeId: req.nodeId },
                });
          // SDK 默认不抛错：失败时错误在 result.error，透传真实原因，
          // 否则失败被误报为"无法获取图纸库/图块库文件信息"
          if (nodeResponse.error) throw nodeResponse.error;
          const node = nodeResponse.data;
          if (!node) {
            throw new Error(
              t(
                req.libraryKey === 'drawing'
                  ? '无法获取图纸库文件信息'
                  : '无法获取图块库文件信息'
              )
            );
          }
          fileName = fileName || node.name;
          nodePath = nodePath || node.path;
          updatedAt = updatedAt || node.updatedAt;
        }
        if (!nodePath) throw new Error(t('无法获取文件路径'));
        if (!fileName) throw new Error(t('无法获取文件名'));
        let libraryFileUrl = `/api/v1/library/${req.libraryKey}/filesData/${nodePath}`;
        if (updatedAt) {
          const cacheTimestamp = new Date(updatedAt).getTime();
          libraryFileUrl += `?t=${cacheTimestamp}`;
          setCacheTimestamp(cacheTimestamp);
        }
        return {
          url: libraryFileUrl,
          fileInfo: {
            fileId: req.nodeId,
            parentId: null,
            projectId: null,
            name: fileName,
            personalSpaceId: null,
            libraryKey: req.libraryKey,
            path: nodePath,
          } satisfies CurrentFileInfo,
        };
      },
    });
    emitFileOpened({
      fileId: req.nodeId,
      parentId: null,
      projectId: null,
      fileUrl: payload.url,
      fileName: payload.fileInfo?.name ?? '',
      libraryKey: req.libraryKey,
    });
  } catch (error) {
    handleError(error, `mxcadManager: openLibraryFile(${req.libraryKey})`);
    throw error;
  }
}

/** 云端节点打开（原 openUploadedFile：转换等待 + 项目解析 + 打开） */
async function openFromNode(req: {
  nodeId: string;
  uploadTargetNodeId: string;
}): Promise<void> {
  const collabOk = await confirmExitCollaborationIfNeeded();
  if (!collabOk) return;
  // 转换等待期不再锁编辑器（转换面板提供进度反馈）；全局 loading 只覆盖引擎打开本身
  const fileInfo = await waitForFileReady(req.nodeId);
  if (!fileInfo) {
    throw new Error(t('文件转换未完成，请稍后在文件列表中查看'));
  }
  const projectId = await getProjectId(req.uploadTargetNodeId, req.nodeId);
  const mxcadFileUrl = UrlHelper.buildMxCadFileUrl(fileInfo.path);
  // 转换等待期编辑器可交互：用户可能在此期间编辑了当前图纸/加入协同，打开前复查
  if (!(await guardBeforeOpen())) return;
  const parentId = fileInfo.parentId || req.uploadTargetNodeId;
  await openUnderLoading({
    loadingMessage: t(DEFAULT_MESSAGES.OPENING_FILE),
    prepare: async () => ({
      url: mxcadFileUrl,
      fileInfo: {
        fileId: req.nodeId,
        parentId,
        projectId,
        name: fileInfo.name,
        personalSpaceId: useFileSystemStore.getState().personalSpaceId,
      },
    }),
  });
  // 打开失败（引擎 retCall 非 0 / 超时）时 openUnderLoading 已摘遮罩并上抛，
  // 禁止继续 emitFileOpened 记录当前文件状态（title/currentFileInfo 只允许在打开成功后写入）
  emitFileOpened({
    fileId: req.nodeId,
    parentId,
    projectId,
    fileName: fileInfo.name,
  });
}

/** 游客/公开路径按 fileHash 打开（原 openPublicMxweb：含转换面板本地任务终态回写） */
async function openFromPublicHash(req: {
  file: File;
  fileHash: string;
  noCache?: boolean;
  localTaskId: string;
}): Promise<void> {
  const { updateTaskStatus } = useConversionQueueStore.getState();
  // 转换等待期编辑器可交互：打开前复查；用户取消则不打开，任务置 cancelled（终态，
  // 避免面板卡在 processing；文件已转换完成，可稍后从面板重新打开）
  if (!(await guardBeforeOpen())) {
    updateTaskStatus(req.localTaskId, 'cancelled');
    return;
  }
  try {
    await openUnderLoading({
      loadingMessage: t('正在打开文件...'),
      prepare: async () => {
        const ext = req.file.name.includes('.')
          ? req.file.name.substring(req.file.name.lastIndexOf('.'))
          : '';
        const mxwebFilename = `${req.fileHash}${ext}.mxweb`;
        return {
          url: `/api/v1/public-file/access/${mxwebFilename}`,
          noCache: req.noCache,
          fileInfo: {
            fileId: '',
            parentId: null,
            projectId: null,
            name: req.file.name,
            personalSpaceId: null,
            fileHash: req.fileHash,
          },
        };
      },
    });
    updateTaskStatus(req.localTaskId, 'completed');
    // 打开成功后更新浏览器 URL（?hash= + ?fileName=），对齐节点打开的 onFileOpened 行为
    emitFileOpened({
      fileId: '',
      parentId: null,
      projectId: null,
      fileName: req.file.name,
      fileHash: req.fileHash,
    });
  } catch (error) {
    updateTaskStatus(req.localTaskId, 'failed', {
      error: error instanceof Error ? error.message : undefined,
    });
    globalShowToast(
      error instanceof Error ? error.message : t('文件打开失败'),
      'error'
    );
  }
}

/** 外部参照 fileUrl 打开（原 CADEditorDirect.openExternalRef 内联编排） */
async function openFromExternalRef(req: { url: string }): Promise<void> {
  try {
    await openUnderLoading({
      loadingMessage: t('正在打开外部参照...'),
      prepare: async () => {
        // 等待 CAD 引擎完全初始化（包括 isInitialized）；超时按失败处理
        const ready = await mxcadManager.ensureEngineReady({
          timeoutMs: EXTERNAL_REF_READY_TIMEOUT_MS,
        });
        if (!ready) {
          throw new Error('CAD 引擎未初始化');
        }
        // 无需额外等初始文件打开完成：openFile 经 enqueueOpen 排队，会在真正发起
        // __openWebFile__ 之前等当前文档加载完成（避免引擎报 "cannot start a new open"）。
        return {
          url: req.url,
          fileInfo: {
            fileId: '',
            parentId: null,
            projectId: null,
            name:
              req.url
                .split('/')
                .pop()
                ?.replace(/\.mxweb$/, '') || '',
            personalSpaceId: null,
          },
        };
      },
    });
  } catch {
    globalShowToast(t('打开外部参照失败'), 'error');
  }
}

/**
 * 打开图纸唯一编排出口：按请求来源分发到对应打开序列。
 * 调用方（侧边栏/图库面板/上传后打开/外部参照/转换面板回调）只描述「打开什么」，
 * 不再各自编排守卫、loading、openFile 与打开完成记录。
 */
export async function openDrawing(req: OpenDrawingRequest): Promise<void> {
  switch (req.source) {
    case 'library':
      return openFromLibrary(req);
    case 'node':
      return openFromNode(req);
    case 'public-hash':
      return openFromPublicHash(req);
    case 'external-ref':
      return openFromExternalRef(req);
  }
}

/**
 * 云端节点打开入口（保留原入口名：上传完成自动打开等 5 处调用方语义清晰）。
 * 内部即 openDrawing({ source: 'node' })。
 */
export async function openUploadedFile(
  newNodeId: string,
  uploadTargetNodeId: string
): Promise<void> {
  return openDrawing({ source: 'node', nodeId: newNodeId, uploadTargetNodeId });
}
