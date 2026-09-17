import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CAD_EVENTS } from '@/constants/events';
import { subscribe, setCacheTimestamp } from '@/services/drawingSession';
import type { FileOpenedDetail } from '@/services/drawingSession';
import {
  nodeControllerGetNode,
  nodeControllerGetRootNode,
  libraryControllerGetDrawingNode,
  libraryControllerGetBlockNode,
  shareControllerResolveShareNode,
} from '@/api-sdk';
import {
  showGlobalLoading,
  hideGlobalLoading,
} from '@/services/loadingService';
import { waitForConversion } from './conversion/useConversionPolling';
import { VIEW_INIT_TIMEOUT_MS } from '@/services/mxcadManager/mxcadTypes';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { globalShowToast, globalShowConfirm } from '@/utils/notificationEvents';

/**
 * 等待 CAD 引擎真正就绪（WASM 加载 + 引擎对象创建，mxcadApplicationCreatedMxCADObject 事件）。
 *
 * initializeMxCADView 仅保证 mxcad-app 视图挂载即 resolve，引擎初始化是异步的；
 * 提前显示容器会露出空白画布，因此骨架屏需保持到引擎就绪（#349）。
 * 超时（VIEW_INIT_TIMEOUT_MS）后按就绪处理兜底，避免永久卡住骨架屏。
 */
async function waitForEngineReady(
  mxcadManager: { isReady(): boolean },
  shouldCancel: () => boolean
): Promise<void> {
  const startedAt = Date.now();
  while (
    !mxcadManager.isReady() &&
    Date.now() - startedAt < VIEW_INIT_TIMEOUT_MS
  ) {
    if (shouldCancel()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export interface CadFileLoaderState {
  fileId: string | null;
  /** 协同链接参数（合法 collabWorkId 时非 null）：显式跳过文件打开，图纸由 auto-join（joinWork）在引擎侧加载 */
  collabWorkId: string | null;
  isAuthenticated: boolean;
  personalSpaceId: string | null;
  libraryKeyParam: string | null;
  shareTokenParam: string | null;
  versionParam: string | null;
  nodeIdParam: string | null;
  shareFileNameParam: string | null;
  hasLibraryDrawingManage: boolean;
  hasLibraryBlockManage: boolean;
  isInitializedRef: React.MutableRefObject<boolean>;
  loadedFileUrlRef: React.MutableRefObject<string | null>;
  currentFileIdRef: React.MutableRefObject<string | null>;
  isActive: boolean;
}

export interface CadFileLoaderCallbacks {
  onError: (err: string | null) => void;
  onStoreError: (err: string | null) => void;
  onLoading: (loading: boolean) => void;
  onStoreLoading: (loading: boolean) => void;
  setStoreFileId: (id: string | null) => void;
  setStoreFileName: (name: string | null) => void;
  setFromShare: (fromShare: boolean) => void;
  setStoreProjectId: (id: string | null) => void;
  onFileOpened?: (detail: FileOpenedDetail) => void;
  onNewFile?: () => void;
}

export function useCadFileLoader(
  deps: CadFileLoaderState,
  fns: CadFileLoaderCallbacks
): void {
  const navigate = useNavigate();
  const {
    fileId,
    collabWorkId,
    isAuthenticated,
    personalSpaceId,
    libraryKeyParam,
    shareTokenParam,
    versionParam,
    nodeIdParam,
    shareFileNameParam,
    hasLibraryDrawingManage,
    hasLibraryBlockManage,
    isInitializedRef,
    loadedFileUrlRef,
    currentFileIdRef,
    isActive,
  } = deps;
  const {
    onError,
    onStoreError,
    onLoading,
    onStoreLoading,
    setStoreFileId,
    setStoreFileName,
    setFromShare,
    setStoreProjectId,
    onFileOpened,
    onNewFile,
  } = fns;
  const onFileOpenedRef = useRef(onFileOpened);
  onFileOpenedRef.current = onFileOpened;
  const onNewFileRef = useRef(onNewFile);
  onNewFileRef.current = onNewFile;

  useEffect(() => {
    // 协同链接（URL 带合法 collabWorkId）：跳过文件打开，由 useCollabActions 的
    // auto-join（joinWork）直接加入协同并加载协同文件；引擎初始化由 useHomeInit 兜底。
    // 不再依赖「恰好没有 fileId」的 URL 形态（隐式跳过）。
    if (!fileId || collabWorkId) return;
    if (isAuthenticated && !personalSpaceId) return;

    let cancelled = false;

    const loadFile = async () => {
      onError(null);
      onStoreError(null);

      try {
        const { mxcadManager, setNavigateFunction } =
          await import('../services/mxcadManager');
        if (cancelled) return;

        let file: {
          fileHash?: string;
          path?: string;
          parentId?: string | null;
          id?: string;
          isRoot?: string | boolean;
          name?: string;
          deletedAt?: string | null;
          updatedAt?: string;
          libraryKey?: string | null;
          fileStatus?: string | null;
        };

        if (libraryKeyParam === 'drawing') {
          const res = await libraryControllerGetDrawingNode({
            path: { nodeId: fileId },
          });
          // SDK 默认不抛错：失败时错误在 result.error，必须显式抛出，
          // 否则 nodeData 为 undefined 会被误报为"文件不存在"
          if (res.error) throw res.error;
          file = res.data!;
        } else if (libraryKeyParam === 'block') {
          const res = await libraryControllerGetBlockNode({
            path: { nodeId: fileId },
          });
          if (res.error) throw res.error;
          file = res.data!;
        } else if (shareTokenParam) {
          try {
            const res = await shareControllerResolveShareNode({
              path: { token: shareTokenParam },
            });
            if (res.error) throw res.error;
            file = res.data!;
          } catch (err) {
            // catch 仅兜底：SDK 不抛错时真实错误已在上面显式抛出，
            // 这里透传后端消息（"分享已过期"等），不再固定"分享文件不存在或已失效"
            const msg = getErrorMessage(err) || t('分享文件不存在或已失效');
            onError(msg);
            onStoreError(msg);
            onLoading(false);
            onStoreLoading(false);
            return;
          }
        } else {
          try {
            const res = await nodeControllerGetNode({
              path: { nodeId: fileId },
            });
            if (res.error) throw res.error;
            file = res.data!;
          } catch (error) {
            // 后端错误体带 code 字段（UNAUTHORIZED/NOT_FOUND/...），
            // 不再依赖永不生效的 axiosError.response.status
            const code = (error as { code?: string })?.code;
            let msg: string;
            if (code === 'UNAUTHORIZED') msg = t('请登录后访问此文件');
            else if (code === 'NOT_FOUND') msg = t('文件不存在或已被删除');
            else
              msg =
                getErrorMessage(error) || t('获取文件信息失败，请检查网络连接');
            onError(msg);
            onStoreError(msg);
            onLoading(false);
            onStoreLoading(false);
            return;
          }
        }

        if (!file) {
          const msg = t('文件不存在');
          onError(msg);
          onStoreError(msg);
          onLoading(false);
          onStoreLoading(false);
          return;
        }

        if (file.deletedAt) {
          const msg = t('文件已被删除');
          onError(msg);
          onStoreError(msg);
          onLoading(false);
          onStoreLoading(false);
          return;
        }

        const fileStatus = file.fileStatus || '';

        // 异步转换场景：文件未完成转换时，先触发/轮询等待转换完成再打开
        if (
          !libraryKeyParam &&
          !shareTokenParam &&
          (!file.fileHash ||
            fileStatus === 'UPLOADING' ||
            fileStatus === 'PROCESSING')
        ) {
          showGlobalLoading(t('文件转换中，请稍候...'));
          const conversion = await waitForConversion(fileId, {
            autoTrigger: fileStatus !== 'PROCESSING',
            shouldContinue: () => !cancelled,
          });
          hideGlobalLoading();
          if (cancelled) return;
          if (!conversion.completed) {
            const isTerminalFailure =
              conversion.status === 'FAILED' ||
              conversion.status === 'DELETED';
            if (isTerminalFailure) {
              // #477：永久失败弹窗提示（区别于「尚未转换完成」）
              void globalShowConfirm({
                title: t('转换失败'),
                message: t('该文件转换失败，请检查文件内容'),
                confirmText: t('知道了'),
                type: 'danger',
              });
            }
            const msg = isTerminalFailure
              ? t('文件转换失败，无法打开文件')
              : t('文件尚未转换完成');
            onError(msg);
            onStoreError(msg);
            onLoading(false);
            onStoreLoading(false);
            return;
          }
          // 转换完成，重新获取节点信息（fileHash/path/updatedAt 可能已更新）
          try {
            const { data: refreshed } = await nodeControllerGetNode({
              path: { nodeId: fileId },
            });
            if (refreshed) file = refreshed;
          } catch {
            // 保留原节点信息，后续校验会给出明确错误
          }
        }

        if (!file.fileHash) {
          const msg = t('文件尚未转换完成');
          onError(msg);
          onStoreError(msg);
          onLoading(false);
          onStoreLoading(false);
          return;
        }

        let projectId: string | null | undefined = file.parentId || null;

        const shouldGetRoot =
          (!libraryKeyParam && !shareTokenParam) ||
          (libraryKeyParam === 'drawing' && hasLibraryDrawingManage) ||
          (libraryKeyParam === 'block' && hasLibraryBlockManage);

        if (shouldGetRoot) {
          if (!file.isRoot && file.parentId) {
            try {
              if (!file.id) throw new Error(t('节点ID缺失'));
              const { data: rootNode } = await nodeControllerGetRootNode({
                path: { nodeId: file.id },
              });
              if (rootNode?.id) projectId = rootNode.id;
            } catch {
              // fallback to parentId
            }
          } else if (file.isRoot) {
            projectId = file.id;
          }
        }

        if (shareTokenParam) projectId = null;
        const fromPlatform = !!nodeIdParam;

        setFromShare(!!shareTokenParam);
        setNavigateFunction(navigate);

        const fileInfoForOpen = {
          fileId: file.id || '',
          parentId: shareTokenParam ? null : file.parentId || null,
          projectId: shareTokenParam ? null : projectId,
          name: file.name || '',
          personalSpaceId,
          libraryKey: (libraryKeyParam === 'drawing' ||
          libraryKeyParam === 'block'
            ? libraryKeyParam
            : file.libraryKey === 'drawing' || file.libraryKey === 'block'
              ? file.libraryKey
              : undefined) as 'drawing' | 'block' | undefined,
          fromPlatform,
          fromShare: !!shareTokenParam,
        };

        const onOpenSuccess = () => {
          if (projectId && !libraryKeyParam && !shareTokenParam) {
            setStoreProjectId(projectId);
          } else if (!libraryKeyParam) {
            setStoreProjectId(null);
          }
        };

        let mxcadFileUrl!: string;
        let cacheTimestamp: number | undefined;

        if (versionParam) {
          if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
            mxcadFileUrl = `/api/v1/library/${libraryKeyParam}/filesData/${file.path}?v=${versionParam}`;
          } else {
            mxcadFileUrl = `/api/v1/mxcad/filesData/${file.path}?v=${versionParam}${shareTokenParam ? `&shareToken=${shareTokenParam}` : ''}`;
          }
          setCacheTimestamp(undefined);
        } else {
          if (file.updatedAt) {
            cacheTimestamp = new Date(file.updatedAt).getTime();
            if (libraryKeyParam === 'drawing' || libraryKeyParam === 'block') {
              mxcadFileUrl = `/api/v1/library/${libraryKeyParam}/filesData/${file.path}?t=${cacheTimestamp}`;
            } else {
              mxcadFileUrl = `/api/v1/mxcad/filesData/${file.path}?t=${cacheTimestamp}${shareTokenParam ? `&shareToken=${shareTokenParam}` : ''}`;
            }
            setCacheTimestamp(cacheTimestamp);
          } else {
            const msg = t('无法构造文件访问URL');
            onError(msg);
            onStoreError(msg);
            onLoading(false);
            onStoreLoading(false);
            return;
          }
        }

        if (isInitializedRef.current && mxcadManager.isCreated()) {
          if (loadedFileUrlRef.current === mxcadFileUrl) {
            mxcadManager.showMxCAD(true);
            onLoading(false);
            return;
          }
        }

        const doOpenMxFile = async (skipFileOpen = false) => {
          if (isInitializedRef.current && mxcadManager.isCreated()) {
            mxcadManager.showMxCAD(true);
            showGlobalLoading(t('正在加载图纸...'));
            await mxcadManager.openFile({
              url: mxcadFileUrl,
              fileInfo: fileInfoForOpen,
              onSuccess: onOpenSuccess,
            });
            hideGlobalLoading();
            loadedFileUrlRef.current = mxcadFileUrl;
            currentFileIdRef.current = fileId;
            onLoading(false);
            return;
          }

          if (mxcadManager.isCreated()) {
            isInitializedRef.current = true;
            loadedFileUrlRef.current = mxcadFileUrl;
            currentFileIdRef.current = fileId;
            // 视图已创建但引擎可能仍在初始化（WASM 加载中），等待就绪再显示容器，
            // 期间由骨架屏覆盖，避免露出空白画布（#349）
            await waitForEngineReady(mxcadManager, () => cancelled);
            mxcadManager.showMxCAD(true);
            onLoading(false);
            return;
          }

          const { initThemeSync, initMxCADConfig, restoreEditorTitle } =
            await import('../services/mxcadManager');
          if (cancelled) return;

          await initMxCADConfig(file);
          if (cancelled) return;

          // 引擎挂载前不显示容器：提前 showMxCAD(true) 会露出尚未渲染 mxcad-app 的空白容器
          // （白屏闪烁），且与编辑器骨架屏遮罩同时存在造成"两重 loading"。
          // 加载期间由骨架屏（loading 遮罩）覆盖，容器显示延后到引擎就绪（2 RAF）之后。
          await mxcadManager.initializeMxCADView(
            skipFileOpen ? undefined : mxcadFileUrl,
            fileInfoForOpen,
            onOpenSuccess
          );
          if (cancelled) return;

          await initThemeSync();
          if (cancelled) return;

          isInitializedRef.current = true;
          loadedFileUrlRef.current = mxcadFileUrl;
          currentFileIdRef.current = fileId;

          // 等待引擎真正就绪（WASM 加载 + 引擎对象创建，mxcadApplicationCreatedMxCADObject 事件）：
          // initializeMxCADView 仅保证 mxcad-app 视图挂载即 resolve，此时引擎仍在初始化
          // （首次加载 WASM / 大图纸场景可能数秒）。提前 showMxCAD(true) 并关闭骨架屏会露出
          // 空白画布，期间无任何 loading 反馈（#349）。
          await waitForEngineReady(mxcadManager, () => cancelled);

          // 首次进入：引擎通过 config.openFile 初始打开图纸，该通道无失败回调
          // （失败是静默的），mxcad-app 会把标题显示成 mxweb 内部访问文件名
          // （引擎 currentFileName = URL 尾部，如 <md5>.dwg.mxweb?t=...）。
          // 打开成功时 openSession 已写入 currentFileInfo 并由 handleOpenCompleteSideEffects
          // 设置图纸名标题；restoreEditorTitle 统一修正：无当前文件→目标图纸名，
          // 有当前文件→恢复原标题（成功后写入同一格式，无冲突）。
          if (!skipFileOpen) {
            restoreEditorTitle(file.name);
          }

          // 引擎已挂载（再等 2 RAF 保证 canvas 渲染）再显示容器，避免空白区透出背景
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );

          if (!cancelled) {
            // 引擎已就绪再显示容器，避免空白区透出背景
            mxcadManager.showMxCAD(true);
            onLoading(false);
            onStoreLoading(false);
          }
        };

        await doOpenMxFile(false);
      } catch (error) {
        if (!cancelled) {
          hideGlobalLoading();
          // 透传真实失败原因（如 openFile 的「文件打开失败/超时」），
          // 避免统一兜底为「CAD编辑器初始化失败」误导用户；失败时不得记录当前文件状态
          const msg =
            error instanceof Error && error.message
              ? error.message
              : t('CAD编辑器初始化失败');
          // 失败必须显式 toast：会话仍停留在上一张图纸（currentFileInfo 未更新），
          // 用户若未察觉失败会继续对旧图纸操作（保存命中旧项目权限判定）
          globalShowToast(t('图纸打开失败：{msg}', { msg }), 'error');
          onError(msg);
          onStoreError(msg);
          onLoading(false);
          onStoreLoading(false);
        }
      }
    };

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [
    fileId,
    collabWorkId,
    isActive,
    versionParam,
    navigate,
    isAuthenticated,
    personalSpaceId,
  ]);

  useEffect(() => {
    const handleFileOpened = (detail: FileOpenedDetail) => {
      onFileOpenedRef.current?.(detail);
    };
    return subscribe(CAD_EVENTS.FILE_OPENED, handleFileOpened);
  }, []);

  useEffect(() => {
    const handleNewFile = () => {
      onNewFileRef.current?.();
    };
    return subscribe(CAD_EVENTS.NEW_FILE, handleNewFile);
  }, []);
}
