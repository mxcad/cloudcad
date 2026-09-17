import 'mxcad-app/style';
import { MxCADView } from 'mxcad-app';
import { thumbnailControllerCheckThumbnail } from '@/api-sdk';
import { MxFun } from 'mxdraw';
import { MxCpp } from 'mxcad';
import type { McObject } from 'mxcad';
import { CAD_EVENTS } from '@/constants/events';
import { t } from '@/languages';
import { useCADEditorStore } from '@/stores/useCADEditorStore';
import { isAuthenticated } from '../../utils/authCheck';
import { handleError } from '@/utils/errorHandler';
import type { CurrentFileInfo, OpenFilePayload } from './mxcadTypes';
import { MxCADOpenFlow } from './mxcadOpenFlow';
import { generateThumbnail, uploadThumbnail } from './mxcadThumbnail';
import {
  openSession,
  emitOpenComplete,
  emit,
  subscribe,
  setModified,
  getCurrentFileUrl,
  getCacheTimestamp,
  setCurrentFileUrl,
} from '../drawingSession';
import {
  getFileInfo,
  setEditorFileName,
  restoreEditorTitle,
  refreshFileName,
} from './mxcadHelpers';
import { MxCADContainerManager } from './mxcadContainerManager';
import { clearOldMxwebCache } from './mxcadCache';
import { applyVipExportIcons } from './applyVipExportIcons';
import { installVipCommandGuard } from './vipCommandGuard';
import { ensureFreshAuthCookie } from '@/config/tokenRefresh';

/**
 * 待打开会话信息：文件打开成功后由 openFileComplete 监听器消费
 */
export interface PendingOpenInfo {
  fileInfo: CurrentFileInfo;
  onSuccess?: () => void;
}

/**
 * 当前共享图纸的 shareToken（模块级变量，供 extReferenceUrlResolver 使用）
 * WASM 层的 HTTP 请求不携带 requestHeaders，只能通过 URL 传递认证信息
 */
let currentShareToken: string | null = null;

/** 设置当前 shareToken（openFile 时调用） */
export function setCurrentShareToken(token: string | null): void {
  currentShareToken = token;
}

/** 引擎的默认空模板文件名：currentFileName 停留在这两个值说明还没有真正打开过图纸 */
const EMPTY_DOCUMENT_NAMES = ['empty_template.mxweb', 'empty.mxweb'];

const DOCUMENT_LOADED_TIMEOUT_MS = 15_000;

const FILE_OPEN_LISTENER_RETRIES = 30;
const FILE_OPEN_LISTENER_RETRY_DELAY_MS = 100;

/**
 * 引擎是否已经打开了真实图纸（区别于默认空模板）
 *
 * isReady() 只表示引擎对象已创建（WASM 加载完），不代表文档已加载：
 * 首次打开时 mxweb 可能还在下载/解析。串行化打开队列用这个判据决定
 * 「上一个打开是否真的结束」，避免并发 openWebFile。
 */
export function hasDocumentLoaded(manager: {
  getCurrentFileName(): string | null;
}): boolean {
  const name = manager.getCurrentFileName();
  return !!name && !EMPTY_DOCUMENT_NAMES.includes(name);
}

/**
 * 等待当前文档的 openFileComplete（引擎 ready 后的首个空模板事件也算），
 * 超时按 false 返回不永久卡住。
 *
 * 引擎的 hideLoading 受 _isStopLoading 单向闩锁保护，重叠的第二次
 * openWebFile 会锁死首次打开的 hideLoading/callOpenFileComplete →
 * loading 永久转圈。所有打开入口都先等这里再发打开命令。
 */
export async function waitForDocumentLoaded(
  manager: { getCurrentFileName(): string | null },
  timeoutMs: number = DOCUMENT_LOADED_TIMEOUT_MS
): Promise<boolean> {
  if (hasDocumentLoaded(manager)) return true;
  let settled = false;
  let timedOut = false;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      timedOut = true;
      resolve();
    }, timeoutMs);
    const unsubscribe = subscribe(CAD_EVENTS.OPEN_COMPLETE, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
  if (timedOut) {
    console.warn(
      '[waitForDocumentLoaded] 等待文档加载完成超时，继续打开目标图纸'
    );
    return false;
  }
  return true;
}

/**
 * 构建 MxCADView 初始化配置（从 MxCADInstanceManager 拆出的模块级函数）
 */
function buildViewOptions(openFile?: string) {
  const containerManager = MxCADContainerManager.getInstance();
  const token = localStorage.getItem('accessToken');
  // 从 openFile URL 提取 shareToken（共享图纸场景）
  if (openFile) {
    try {
      const urlObj = new URL(openFile, window.location.origin);
      currentShareToken = urlObj.searchParams.get('shareToken');
    } catch {
      /* ignore */
    }
  }
  const baseHeaders: Record<string, string> = {};
  if (token) baseHeaders.Authorization = `Bearer ${token}`;
  if (currentShareToken) baseHeaders['x-share-token'] = currentShareToken;
  const hasHeaders = Object.keys(baseHeaders).length > 0;

  const resolveExtReferenceUrl = (fileName: string) => {
    // 优先从运行时获取当前文件 URL，提取路径部分构造外部参照 URL
    const currentUrl = getCurrentFileUrl();
    const activeUrl = currentUrl || openFile;
    if (!activeUrl) return fileName;

    // 使用模块级 currentShareToken（在 openFile 时已设置）
    // WASM 层的 HTTP 请求不携带 requestHeaders，只能通过 URL 传递认证信息

    if (activeUrl.includes('/public-file/access/')) {
      const parts = activeUrl.split('/');
      const hashIndex = parts.indexOf('access') + 1;
      if (hashIndex < parts.length) {
        const hash = parts[hashIndex];
        if (hash) {
          const rawHash = hash.replace(/(?:\.[^.]+)?\.mxweb$/i, '');
          let url = `/api/v1/public-file/access/${rawHash}/${fileName}`;
          if (currentShareToken)
            url += `?shareToken=${encodeURIComponent(currentShareToken)}`;
          return url;
        }
      }
    }
    // activeUrl 格式: /api/v1/mxcad/filesData/YYYYMM/{nodeId}/{file}.mxweb?t=...
    // 提取 YYYYMM/{nodeId} 作为基底目录
    const mxcadMatch = activeUrl.match(
      /\/api\/v1\/mxcad\/filesData\/([^/]+\/[^/]+)\//
    );
    if (mxcadMatch) {
      const baseDir = mxcadMatch[1];
      let url = `/api/v1/mxcad/filesData/${baseDir}/${fileName}`;
      if (currentShareToken)
        url += `?shareToken=${encodeURIComponent(currentShareToken)}`;
      return url;
    }
    return fileName;
  };
  return {
    rootContainer: containerManager.getContainer(),
    ...(openFile && { openFile }),
    ...(hasHeaders && { requestHeaders: baseHeaders }),
    extReferenceUrlResolver: resolveExtReferenceUrl,
  };
}

/**
 * 文件打开完成后的联动副作用（从 MxCADInstanceManager 拆出的模块级函数）：
 * 发布打开完成信号、同步编辑器文件名、缩略图兜底生成、旧缓存清理
 */
async function handleOpenCompleteSideEffects(): Promise<void> {
  emitOpenComplete({
    fileId: getFileInfo()?.fileId ?? null,
    fileName: getFileInfo()?.name ?? null,
  });
  setModified(false);

  const info = getFileInfo();
  // 标题写入收敛到 mxcadHelpers.setEditorFileName（唯一出口，失败路径 restoreEditorTitle 复用）。
  // 协同链接（auto-join）不经过 openSession，currentFileInfo 为 null；引擎在协同文件
  // 加载完成触发 openFileComplete 时会把标题重置为引擎当前文件名（如 empty_template.mxweb），
  // 这里用 refreshFileName（currentFileName 兜底）修正，保持 [协同中]-xxx 不被覆盖。
  if (info) {
    setEditorFileName(info.name);
  } else if (useCADEditorStore.getState().isInCollaboration) {
    refreshFileName();
    // openFileComplete 之后引擎可能异步再把标题改回当前文件名，延迟重设一次确保稳定
    setTimeout(refreshFileName, 500);
  }

  if (info) {
    try {
      if (!isAuthenticated()) return;
      let fileId = getFileInfo()!.fileId;
      const currentMxwebUrl = getCurrentFileUrl();
      if (!fileId && currentMxwebUrl) {
        if (
          /\/external-ref-view\/|\/public-file\/access\//.test(currentMxwebUrl)
        )
          return;
        const match = currentMxwebUrl.match(/\/([a-z0-9]+)\.[^.]+\.mxweb/i);
        if (match) fileId = match[1] ?? '';
      }
      if (!fileId) return;
      const runThumbnailTask = async () => {
        const thumbnailResult = await thumbnailControllerCheckThumbnail({
          path: { nodeId: fileId },
        });
        if (!thumbnailResult?.data?.exists) {
          const imageData = await generateThumbnail();
          if (imageData) await uploadThumbnail(fileId, imageData);
        }
      };
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(
          () => {
            runThumbnailTask();
          },
          { timeout: 5000 }
        );
      } else {
        setTimeout(runThumbnailTask, 3000);
      }
    } catch (error) {
      handleError(
        error,
        'mxcadManager: handleOpenCompleteSideEffects thumbnail'
      );
    }
    const cacheTimestamp = getCacheTimestamp();
    const currentMxwebUrl = getCurrentFileUrl();
    if (cacheTimestamp && getFileInfo() && currentMxwebUrl) {
      try {
        const urlWithoutTimestamp = currentMxwebUrl.replace(/\?t=\d+$/, '');
        const mxcadPathMatch = urlWithoutTimestamp.match(
          /\/api\/mxcad\/filesData\/(.*)/
        );
        const libraryPathMatch = urlWithoutTimestamp.match(
          /\/api\/library\/drawing\/filesData\/(.*)/
        );
        const filePath = mxcadPathMatch?.[1] || libraryPathMatch?.[1];
        if (filePath) await clearOldMxwebCache(filePath, cacheTimestamp);
      } catch (error) {
        handleError(error, 'mxcadManager: clearOldCache');
      }
    }
  }
}

/**
 * MxCADView 实例管理（从 mxcadManagerCore.ts 拆分）
 *
 * 负责引擎实例的创建/初始化、打开完成联动（pendingOpenInfo 会话激活 +
 * openFileComplete 副作用）；文件打开流程（openFile / reloadCurrentFile）见 MxCADOpenFlow。
 */
export class MxCADInstanceManager {
  private mxcadView: MxCADView | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingOpenInfo: PendingOpenInfo | null = null;
  /** 打开串行队列尾：上一个打开未结束前不发起下一个 __openWebFile__ */
  private openTail: Promise<void> = Promise.resolve();
  /** 引擎全局监听（MxFun.on）只注册一次：MxCADView 必须单实例 */
  private engineListenersInstalled = false;
  /** openFileComplete 监听只挂一次，避免重复消费 pendingOpenInfo */
  private fileOpenListenerAttached = false;
  private readonly openFlow: MxCADOpenFlow;

  constructor() {
    this.openFlow = new MxCADOpenFlow(this);
  }

  async initialize(): Promise<MxCADView> {
    if (this.mxcadView && this.isInitialized) return this.mxcadView;
    if (this.initPromise) {
      await this.initPromise;
      if (!this.mxcadView) throw new Error(t('MxCADView 初始化失败，实例为空'));
      return this.mxcadView;
    }
    this.initPromise = this.createInstance();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
    if (!this.mxcadView) throw new Error(t('MxCADView 初始化失败，实例为空'));
    return this.mxcadView;
  }

  /**
   * 打开串行队列：上一个打开（含其 openFileComplete 回调链）结束前不发起下一个。
   *
   * 引擎同一时刻只能打开一个文档：openFile 入口无条件 stopAllLoading()，
   * _isStopLoading 单向闩锁只置位不复位，重叠的第二次打开会锁死首次打开的
   * hideLoading/callOpenFileComplete → loading 永久转圈。
   * 排队期间先等当前文档加载完成（空模板也算），再执行本次打开。
   */
  private enqueueOpen<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.openTail;
    let release!: () => void;
    this.openTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous
      .catch(() => undefined)
      .then(() =>
        this.isReady() ? waitForDocumentLoaded(this) : Promise.resolve(true)
      )
      .then(run)
      .then(
        (result) => {
          release();
          return result;
        },
        (error) => {
          release();
          throw error;
        }
      );
  }

  private attachFileOpenListener(
    retries: number = FILE_OPEN_LISTENER_RETRIES
  ): void {
    if (this.fileOpenListenerAttached) return;
    // MxDrawObject 层 openFileComplete 携带打开结果码（0=成功，非 0=失败）；
    // McObject 层同名事件转发时丢失该参数（callEvent 只传实例），无法区分成败。
    // 失败不得消费待打开会话/记录当前文件状态（currentFileInfo/currentFileName/title），
    // 仅成功才 openSession + 联动副作用；失败路径由 MxCADOpenFlow 的 retCall（iRet!==0）
    // 统一收尾（回滚引擎 URL + 清理待生效会话）。
    const onOpen = async (iResult: number) => {
      if (iResult !== 0) {
        // 打开失败（含首次进入的 config.openFile 初始加载失败）：不记录当前文件状态
        // （不 openSession），但引擎会把标题置为 URL 尾部的 mxweb 内部访问文件名
        // （如 <md5>.mxweb?t=...），这里用待打开的图纸名修正标题，避免显示 id.mxweb。
        // 与 MxCADOpenFlow.openFile 的 fail 路径（restoreEditorTitle）保持一致。
        // pendingOpenInfo 保留：由 MxCADOpenFlow 的 retCall（openFile 路径）统一清理回滚
        const pendingName = this.pendingOpenInfo?.fileInfo?.name;
        if (pendingName) restoreEditorTitle(pendingName);
        return;
      }
      if (this.pendingOpenInfo) {
        const { fileInfo, onSuccess } = this.pendingOpenInfo;
        openSession(fileInfo);
        this.pendingOpenInfo = null;
        onSuccess?.();
      }
      await handleOpenCompleteSideEffects();
    };
    let attachError: unknown;
    try {
      const mxdraw = this.mxcadView?.mxcad?.getMxDrawObject?.();
      if (mxdraw) {
        mxdraw.addEvent('openFileComplete', onOpen);
        this.fileOpenListenerAttached = true;
        return;
      }
    } catch (error) {
      attachError = error;
    }
    // mxcadApplicationCreatedMxCADObject 早于内部 mxdrawObject 就绪，
    // 此刻 getMxDrawObject() 会抛 'reading mxdrawObject'。立即退回 McObject 层
    // 会丢掉打开结果码（失败被当成功），故先重试若干次。
    if (retries > 0) {
      setTimeout(() => {
        this.attachFileOpenListener(retries - 1);
      }, FILE_OPEN_LISTENER_RETRY_DELAY_MS);
      return;
    }
    handleError(
      attachError,
      'mxcadManager: attachFileOpenListener（退回 McObject 层，丢失打开结果码）'
    );
    // 兜底：拿不到 MxDrawObject（不应发生）时退回 McObject 层事件（无结果码，按成功消费）
    this.mxcadView?.mxcad?.on('openFileComplete', () => {
      void onOpen(0);
    });
    this.fileOpenListenerAttached = true;
  }

  private setupInitializationListener(): void {
    // MxFun.on 是引擎全局监听：重复注册会在同一事件上跑多份回调，
    // 而 MxCADView 必须严格单实例（见 createInstance 守卫）
    if (this.engineListenersInstalled) return;
    this.engineListenersInstalled = true;
    MxFun.on('mxcadApplicationCreatedMxCADObject', async () => {
      this.isInitialized = true;
      this.attachFileOpenListener();
      this.setupDocumentModifyListener();
      applyVipExportIcons();
      // VIP 命令前置门控：Mx_ExportPDF/DWG/DXF、Mx_PrintDialog、showDWGCutDialog
      // 在命令触发时先校验会员再放行（与 VIP 图标替换同源，见 vipCommandGuard）
      installVipCommandGuard();
      // QSave 后 Ctrl+S 落回引擎内置保存（绕过自定义 Mx_QSave 流程） 通过addCommand 直接覆盖为空的实现
      setTimeout(() => {
        MxFun.addCommand('Mx_QSave', () => {});
      }, 2000);
    });
  }

  private setupDocumentModifyListener(): void {
    try {
      const mxcad = MxCpp.getCurrentMxCAD();
      if (mxcad) {
        mxcad.on('databaseModify', () => emit(CAD_EVENTS.DATABASE_MODIFIED));
      }
    } catch (error) {
      handleError(error, 'mxcadManager: setupDocumentModifyListener');
    }
  }

  private async createInstance(): Promise<void> {
    try {
      // MxCADView 严格单实例：引擎只支持一个视图，重复 new 会创建第二份
      // 全局监听并丢失共享状态
      if (this.mxcadView) return;
      // 确保 auth_token cookie 新鲜：config.openFile 的引擎内部请求只携带 cookie，
      // 若 token 临近过期，WASM 加载期间可能过期导致 401
      await ensureFreshAuthCookie();
      const viewOptions = buildViewOptions();
      this.mxcadView = new MxCADView(viewOptions);
      this.setupInitializationListener();
      this.mxcadView.create();
    } catch (error) {
      console.error('MxCADView 实例创建失败', error);
      this.mxcadView = null;
      this.isInitialized = false;
      throw error;
    }
  }

  /** 打开文件（委托 MxCADOpenFlow；所有打开入口经串行队列，不重叠） */
  async openFile(payload: OpenFilePayload): Promise<void> {
    return this.enqueueOpen(() => this.openFlow.openFile(payload));
  }

  /** 重载当前文件（委托 MxCADOpenFlow；同一串行队列） */
  async reloadCurrentFile(): Promise<boolean> {
    return this.enqueueOpen(() => this.openFlow.reloadCurrentFile());
  }

  getCurrentView(): MxCADView | null {
    return this.mxcadView;
  }

  getMxcadObject(): McObject | null {
    return this.mxcadView?.mxcad ?? null;
  }

  getInitPromise(): Promise<void> | null {
    return this.initPromise;
  }

  getPendingOpenInfo(): PendingOpenInfo | null {
    return this.pendingOpenInfo;
  }

  setPendingOpenInfo(info: PendingOpenInfo | null): void {
    this.pendingOpenInfo = info;
  }

  setPendingFileInfo(fileInfo: CurrentFileInfo | null): void {
    this.pendingOpenInfo = fileInfo ? { fileInfo } : null;
  }

  getCurrentFileName(): string | null {
    if (!this.mxcadView?.mxcad) return null;
    try {
      return this.mxcadView.mxcad.getCurrentFileName?.() || null;
    } catch {
      return null;
    }
  }

  isFileOpen(targetFileName: string): boolean {
    const currentFileName = this.getCurrentFileName();
    if (!currentFileName || !targetFileName) return false;
    return currentFileName.includes(targetFileName);
  }

  isCreated(): boolean {
    return this.mxcadView !== null;
  }
  isReady(): boolean {
    return this.isInitialized && this.mxcadView !== null;
  }
}
