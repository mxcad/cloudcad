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

/**
 * 待打开会话信息：文件打开成功后由 openFileComplete 监听器消费
 */
export interface PendingOpenInfo {
  fileInfo: CurrentFileInfo;
  onSuccess?: () => void;
}

/**
 * 构建 MxCADView 初始化配置（从 MxCADInstanceManager 拆出的模块级函数）
 */
function buildViewOptions(openFile?: string) {
  const containerManager = MxCADContainerManager.getInstance();
  const token = localStorage.getItem('accessToken');
  const resolveExtReferenceUrl = (fileName: string) => {
    if (!openFile) return fileName;
    if (openFile.includes('/public-file/access/')) {
      const parts = openFile.split('/');
      const hashIndex = parts.indexOf('access') + 1;
      if (hashIndex < parts.length) {
        const hash = parts[hashIndex];
        if (hash) {
          const rawHash = hash.replace(/(?:\.[^.]+)?\.mxweb$/i, '');
          return `/api/v1/public-file/access/${rawHash}/${fileName}`;
        }
      }
    }
    // openFile 格式: /api/v1/mxcad/filesData/YYYYMM/{nodeId}/{file}.mxweb?t=...
    // 提取 YYYYMM/{nodeId} 作为基底目录
    const mxcadMatch = openFile.match(
      /\/api\/v1\/mxcad\/filesData\/([^/]+\/[^/]+)\//
    );
    if (mxcadMatch) {
      const baseDir = mxcadMatch[1];
      return `/api/v1/mxcad/filesData/${baseDir}/${fileName}`;
    }
    return fileName;
  };
  return {
    rootContainer: containerManager.getContainer(),
    ...(openFile && { openFile }),
    ...(token && { requestHeaders: { Authorization: `Bearer ${token}` } }),
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
      handleError(error, 'mxcadManager: setupFileOpenListener thumbnail');
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
  private readonly openFlow: MxCADOpenFlow;

  constructor() {
    this.openFlow = new MxCADOpenFlow(this);
  }

  async initialize(
    initialFileUrl?: string,
    initialFileInfo?: CurrentFileInfo,
    onSuccess?: () => void
  ): Promise<MxCADView> {
    if (initialFileInfo) {
      this.pendingOpenInfo = { fileInfo: initialFileInfo, onSuccess };
    }
    if (this.mxcadView && this.isInitialized) {
      if (initialFileUrl) await this.openFile({ url: initialFileUrl });
      return this.mxcadView;
    }
    if (this.initPromise) {
      await this.initPromise;
      if (initialFileUrl) await this.openFile({ url: initialFileUrl });
      if (!this.mxcadView) throw new Error(t('MxCADView 初始化失败，实例为空'));
      return this.mxcadView;
    }
    this.initPromise = this.createInstance(initialFileUrl);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
    if (!this.mxcadView) throw new Error(t('MxCADView 初始化失败，实例为空'));
    return this.mxcadView;
  }

  private setupFileOpenListener(): void {
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
        const pendingName = this.pendingOpenInfo?.fileInfo?.name;
        if (pendingName) restoreEditorTitle(pendingName);
        return;
      }
      if (this.pendingOpenInfo) {
        openSession(this.pendingOpenInfo.fileInfo);
        this.pendingOpenInfo.onSuccess?.();
        this.pendingOpenInfo = null;
      }
      await handleOpenCompleteSideEffects();
    };
    try {
      const mxdraw = this.mxcadView?.mxcad?.getMxDrawObject?.();
      if (mxdraw) {
        mxdraw.addEvent('openFileComplete', onOpen);
        return;
      }
    } catch (error) {
      handleError(error, 'mxcadManager: setupFileOpenListener');
    }
    // 兜底：拿不到 MxDrawObject（不应发生）时退回 McObject 层事件（无结果码，按成功消费）
    this.mxcadView?.mxcad?.on('openFileComplete', () => {
      void onOpen(0);
    });
  }

  private setupInitializationListener(): void {
    MxFun.on('mxcadApplicationCreatedMxCADObject', async () => {
      this.isInitialized = true;
      this.setupFileOpenListener();
      this.setupDocumentModifyListener();
      applyVipExportIcons();
      // VIP 命令前置门控：Mx_ExportPDF/DWG/DXF、Mx_PrintDialog、showDWGCutDialog
      // 在命令触发时先校验会员再放行（与 VIP 图标替换同源，见 vipCommandGuard）
      installVipCommandGuard();
      // QSave 后 Ctrl+S 落回引擎内置保存（绕过自定义 Mx_QSave 流程） 通过addCommand 直接覆盖为空的实现
      setTimeout(() => {
        MxFun.addCommand('Mx_QSave', () => { });
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

  private async createInstance(openFile?: string): Promise<void> {
    try {
      if (openFile) setCurrentFileUrl(openFile);
      const viewOptions = buildViewOptions(openFile);
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

  async reopenWithUrl(fileUrl: string): Promise<void> {
    this.reset();
    await this.initialize(fileUrl);
  }

  /** 打开文件（委托 MxCADOpenFlow；facade 与 initialize 内部共用此入口） */
  async openFile(payload: OpenFilePayload): Promise<void> {
    return this.openFlow.openFile(payload);
  }

  /** 重载当前文件（委托 MxCADOpenFlow） */
  async reloadCurrentFile(): Promise<boolean> {
    return this.openFlow.reloadCurrentFile();
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

  reset(): void {
    this.mxcadView = null;
    this.isInitialized = false;
    this.initPromise = null;
    this.pendingOpenInfo = null;
    MxCADContainerManager.getInstance().clearContainer();
  }
}
