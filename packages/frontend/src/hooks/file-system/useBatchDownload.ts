import { useCallback, useRef, useEffect } from 'react';
import {
  useBatchDownloadStore,
  BatchFileItem,
  BatchTask,
} from '@/stores/useBatchDownloadStore';
import {
  batchDownloadControllerCreateTask,
  batchDownloadControllerCreateSingleFileTask,
  batchDownloadControllerCancelTask,
  batchDownloadControllerGetUserTasks,
  batchDownloadControllerRetryTask,
  batchDownloadControllerRetryFailedItems,
  type CreateSingleFormatDownloadDto,
} from '@/api-sdk';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken } from '@/utils/tokenUtils';
import {
  downloadBatchZip,
  downloadBatchItem,
  downloadMergedBatchZip,
  getBatchTaskProgress,
} from '@/utils/download';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';
import { isVipFeatureRequiredError } from '@/utils/vipFeatureGuide';

const API_BASE = getApiBaseUrl();

export function useBatchDownload(
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void
) {
  const { tasks, addTask, updateTask, removeTask, setProgressTaskId } =
    useBatchDownloadStore();
  const activeSSEs = useRef<Map<string, EventSource>>(new Map());
  /** 已触发过自动下载的 taskId 集合（SSE 重连可能重复推送终态，防重复触发浏览器下载） */
  const autoDownloadedRef = useRef<Set<string>>(new Set());

  const apiUrl = (path: string) => `${API_BASE}/v1${path}`;

  const createZipTask = useCallback(
    async (
      fileList: BatchFileItem[],
      projectId?: string,
      libraryType?: string
    ) => {
      try {
        const result = await batchDownloadControllerCreateTask({
          body: { fileList, projectId, mode: 'zip', libraryType },
        });
        // SDK 默认不抛错：失败时错误 in result.error。不检查会对 undefined
        // 取 .taskId 抛 TypeError，用户看到英文引擎报错而非后端原因
        if (result.error) throw result.error;
        const taskId = (result.data as { taskId: string }).taskId;

        // ZIP 模式：生成 itemNames 用于下载列表显示
        const itemNames = fileList.map((f) => {
          const nameWithoutExt = f.fileName.replace(/\.[^.]+$/, '');
          const format = f.formats[0] || 'mxweb';
          return `${nameWithoutExt}.${format}`;
        });

        const task: BatchTask = {
          taskId,
          status: 'PENDING',
          mode: 'zip',
          itemNames,
          totalCount: fileList.reduce((sum, f) => sum + f.formats.length, 0),
          completedCount: 0,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        };

        addTask(task);
        setProgressTaskId(taskId);
        subscribeToProgressSSE(taskId);

        showToast?.(t('批量下载任务已创建'), 'success');
        return taskId;
      } catch (err) {
        // SDK error 是普通对象（非 Error 实例），用 getErrorMessage 提取后端消息。
        // VIP_FEATURE_REQUIRED 已由全局 error 拦截器弹购买弹窗（含后端消息），此处不再重复 toast
        if (!isVipFeatureRequiredError(err)) {
          showToast?.(getErrorMessage(err) || t('创建任务失败'), 'error');
        }
        return null;
      }
    },
    [addTask, showToast]
  );

  const subscribeToProgressSSE = useCallback(
    (taskId: string, onTerminal?: (task: BatchTask | undefined) => void) => {
      if (activeSSEs.current.has(taskId)) return;

      const token = getValidToken();
      const params = token ? `?token=${encodeURIComponent(token)}` : '';
      const url = apiUrl(
        `/file-system/batch-download/${taskId}/progress${params}`
      );

      // eslint-disable-next-line no-restricted-syntax -- 豁免：batch-download 任务进度 SSE（SDK 无 SSE 形态，token 走 query，ADR-0034 豁免清单）
      const es = new EventSource(url);
      activeSSEs.current.set(taskId, es);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          updateTask(taskId, {
            status: data.status,
            totalCount: data.totalCount,
            completedCount: data.completedCount,
            errorCount: data.errorCount,
            currentFile: data.currentFile,
            errors: data.errors,
            zipPath: data.zipPath,
          });

          if (data.status === 'COMPLETED') {
            es.close();
            activeSSEs.current.delete(taskId);
            showToast?.(t('批量下载完成'), 'success');
            onTerminal?.(
              useBatchDownloadStore
                .getState()
                .tasks.find((t) => t.taskId === taskId)
            );
          } else if (data.status === 'FAILED') {
            es.close();
            activeSSEs.current.delete(taskId);
            showToast?.(t('批量下载失败'), 'error');
          } else if (data.status === 'CANCELLED') {
            es.close();
            activeSSEs.current.delete(taskId);
            showToast?.(t('批量下载已取消'), 'info');
          }
        } catch {
          // ignore: 忽略单个 SSE 消息解析失败（重连由 EventSource 自动处理）
        }
      };

      es.onerror = () => {
        es.close();
        activeSSEs.current.delete(taskId);
      };
    },
    [updateTask, showToast]
  );

  const createIndividualTask = useCallback(
    async (
      fileList: BatchFileItem[],
      projectId?: string,
      libraryType?: string
    ): Promise<{ taskId: string; itemNames: string[] } | null> => {
      try {
        // 每项单格式，index 与 itemNames 顺序严格对齐（下载端点按 index 取产物）
        const itemNames: string[] = [];
        const singleFormatItems = fileList.map((item) => {
          const nameWithoutExt = item.fileName.replace(/\.[^.]+$/, '');
          const format = item.formats[0] || 'mxweb';
          itemNames.push(`${nameWithoutExt}.${format}`);
          return { ...item, formats: [format] };
        });

        const result = await batchDownloadControllerCreateTask({
          body: {
            fileList: singleFormatItems,
            projectId,
            mode: 'individual',
            libraryType,
          },
        });
        if (result.error) throw result.error;
        const taskId = (result.data as { taskId: string }).taskId;

        const task: BatchTask = {
          taskId,
          status: 'PENDING',
          mode: 'individual',
          itemNames,
          totalCount: singleFormatItems.length,
          completedCount: 0,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        };
        addTask(task);

        showToast?.(t('逐个下载任务已创建'), 'success');
        return { taskId, itemNames };
      } catch (err) {
        // VIP_FEATURE_REQUIRED 已由全局 error 拦截器弹购买弹窗（含后端消息），此处不再重复 toast
        if (!isVipFeatureRequiredError(err)) {
          showToast?.(getErrorMessage(err) || t('创建任务失败'), 'error');
        }
        return null;
      }
    },
    [addTask, showToast]
  );

  /**
   * individual 任务逐个下载：按 index 顺序触发浏览器下载（404 = 该项失败，跳过）。
   * 供 dialog 转换完成后与下载管理器手动重下共用。
   */
  const downloadAllItems = useCallback(
    async (task: BatchTask): Promise<void> => {
      const names = task.itemNames || [];
      let failed = 0;
      for (let i = 0; i < Math.max(names.length, task.totalCount); i++) {
        const res = await downloadBatchItem(task.taskId, i, names[i] || '');
        if (!res.ok) failed++;
      }
      if (failed > 0) {
        showToast?.(
          t('{count} 个文件下载失败，其余已下载', {
            count: String(failed),
          }),
          'warning'
        );
      } else {
        showToast?.(t('逐个下载完成'), 'success');
      }
    },
    [showToast]
  );

  /**
   * 单文件格式下载（dwg/dxf/pdf）异步入口：走独立的 single-file 路由（不受
   * batchDownloadEnabled 门控——单个文件下载不是批量下载），后端内核复用批量
   * 任务表（mode='individual' 单项）+ 同一套 SSE/进度/清理/取消，HTTP 立即返回。
   */
  /**
   * 创建单文件格式转换下载任务并跟踪（addTask(autoDownload) + SSE + 终态自动下载 + toast）。
   * 走 /single-file 路由：nodeId（已保存节点）与 fileHash（内存导出上传的临时文件）二选一，
   * 属「单个文件下载」，不受 batchDownloadEnabled 门控。
   */
  const enqueueIndividualTask = useCallback(
    async (body: CreateSingleFormatDownloadDto): Promise<string | null> => {
      try {
        const nameWithoutExt = body.fileName.replace(/\.[^.]+$/, '');
        const itemNames = [`${nameWithoutExt}.${body.format}`];
        const result =
          await batchDownloadControllerCreateSingleFileTask({ body });
        if (result.error) throw result.error;
        const taskId = (result.data as { taskId: string }).taskId;

        const task: BatchTask = {
          taskId,
          status: 'PENDING',
          mode: 'individual',
          itemNames,
          totalCount: 1,
          completedCount: 0,
          errorCount: 0,
          createdAt: new Date().toISOString(),
          autoDownload: true,
        };
        addTask(task);
        setProgressTaskId(taskId);
        subscribeToProgressSSE(taskId, (completedTask) => {
          if (
            completedTask &&
            completedTask.status === 'COMPLETED' &&
            completedTask.autoDownload &&
            !autoDownloadedRef.current.has(taskId)
          ) {
            autoDownloadedRef.current.add(taskId);
            void downloadAllItems(completedTask);
          }
        });

        showToast?.(t('已加入下载队列'), 'info');
        return taskId;
      } catch (err) {
        // VIP_FEATURE_REQUIRED 已由全局 error 拦截器弹购买弹窗（含后端消息），此处不再重复 toast
        if (!isVipFeatureRequiredError(err)) {
          showToast?.(getErrorMessage(err) || t('创建任务失败'), 'error');
        }
        return null;
      }
    },
    [
      addTask,
      setProgressTaskId,
      subscribeToProgressSSE,
      downloadAllItems,
      showToast,
    ]
  );

  /** 按已保存节点（nodeId）创建单文件格式转换下载任务。 */
  const createSingleFormatTask = useCallback(
    (
      nodeId: string,
      fileName: string,
      format: string,
      opts?: {
        dwgVersion?: number;
        width?: string;
        height?: string;
        colorPolicy?: string;
        projectId?: string;
        libraryType?: string;
      }
    ): Promise<string | null> =>
      enqueueIndividualTask({
        nodeId,
        fileName,
        format,
        dwgVersion: opts?.dwgVersion,
        width: opts?.width,
        height: opts?.height,
        colorPolicy: opts?.colorPolicy,
        projectId: opts?.projectId,
        libraryType: opts?.libraryType,
      }),
    [enqueueIndividualTask]
  );

  /**
   * 按内存导出上传的临时文件（fileHash）创建单文件格式转换下载任务。
   * CAD 编辑器导出命令（Mx_ExportDWG/DXF/PDF）走此通道：先上传当前内存 mxweb blob，
   * 再按 hash 转换。云图与本地图行为一致，点导出即关闭弹框，SSE 终态自动下载。
   */
  const createFileHashTask = useCallback(
    (
      fileHash: string,
      fileName: string,
      format: string,
      opts?: {
        dwgVersion?: number;
        width?: string;
        height?: string;
        colorPolicy?: string;
        projectId?: string;
        libraryType?: string;
      }
    ): Promise<string | null> =>
      enqueueIndividualTask({
        fileHash,
        fileName,
        format,
        dwgVersion: opts?.dwgVersion,
        width: opts?.width,
        height: opts?.height,
        colorPolicy: opts?.colorPolicy,
        projectId: opts?.projectId,
        libraryType: opts?.libraryType,
      }),
    [enqueueIndividualTask]
  );

  /**
   * 从服务端同步下载任务列表（刷新/重开后 hydrate 本地 store）。
   * 本地已有任务以本地为准（保 itemNames / autoDownload），服务端新增任务补入。
   *
   * 反向同步（修复"删除了刷新还有"）：后端记录由 cron 自动过期删除，本地残留的
   * 已过期任务应一并清除。但 getUserTasks 是**分页**接口（默认 page 1 / 20 条），
   * 响应只是"最近 N 条"——本地任务不在响应中 ≠ 已过期（可能只是排在第 2 页）。
   * 故仅当 hasMore=false（后端返回完整列表）时才判定"不在响应中 = 已过期"并 prune；
   * 且活跃任务（PENDING/PROCESSING）恒保留，避免与在途任务竞态。
   */
  const syncTasksFromServer = useCallback(async () => {
    try {
      const result = await batchDownloadControllerGetUserTasks();
      if (result.error) return;
      const serverTasks = result.data?.tasks || [];
      const hasMore = result.data?.hasMore === true;
      const currentTasks = useBatchDownloadStore.getState().tasks;
      const existingIds = new Set(currentTasks.map((t) => t.taskId));
      const newTasks: BatchTask[] = [];
      for (const st of serverTasks) {
        if (existingIds.has(st.taskId)) continue;
        newTasks.push({
          taskId: st.taskId,
          status: st.status as BatchTask['status'],
          mode: st.mode as BatchTask['mode'],
          itemNames: st.itemNames,
          totalCount: st.totalCount,
          completedCount: st.completedCount,
          errorCount: st.errorCount,
          zipPath: st.zipPath,
          createdAt: new Date().toISOString(),
        });
      }
      if (newTasks.length > 0) {
        // addTask 是前置插入：服务端已按 createdAt 倒序返回，须反序逐个插入，
        // 否则同步组内顺序被翻转（最旧排到最前）
        newTasks.slice().reverse().forEach((task) => addTask(task));
      }
      if (!hasMore) {
        const serverIds = new Set(serverTasks.map((st) => st.taskId));
        for (const t of currentTasks) {
          if (serverIds.has(t.taskId)) continue;
          if (t.status === 'PENDING' || t.status === 'PROCESSING') continue;
          removeTask(t.taskId);
        }
      }
    } catch {
      // 同步失败静默处理（离线/未登录），本地 store 不受影响
    }
  }, [addTask, removeTask]);

  /** 轮询任务直到终态（individual 模式 dialog 内等待转换完成用）
   *  individual 任务不订阅 SSE，须在此把进度/终态回写本地 store——否则任务永远停在
   *  PENDING（"等待中"进度条 + 取消按钮 + 完成后残留），与 zip 任务的 SSE 回写对齐。
   *  仅计数变化时回写，避免每 2s 无意义重渲染。
   *  removeOnTerminal：终态后从列表移除（individual 一次性下载，完成即结束，不残留）。 */
  const pollTaskUntilDone = useCallback(
    async (
      taskId: string,
      onProgress?: (completed: number, total: number) => void,
      isCancelled?: () => boolean,
      removeOnTerminal = false
    ): Promise<{ status: string } | null> => {
      for (;;) {
        if (isCancelled?.()) return null;
        const p = await getBatchTaskProgress(taskId);
        if (!p.ok) return null;
        const completedCount = p.completedCount ?? 0;
        const errorCount = p.errorCount ?? 0;
        if (
          p.status === 'COMPLETED' ||
          p.status === 'FAILED' ||
          p.status === 'CANCELLED'
        ) {
          updateTask(taskId, {
            status: p.status,
            completedCount,
            errorCount,
          });
          if (removeOnTerminal) removeTask(taskId);
          return { status: p.status };
        }
        // 非终态：仅计数变化时回写进度（individual 无 SSE，靠轮询推进 completedCount 进度条）
        const current = useBatchDownloadStore
          .getState()
          .tasks.find((t) => t.taskId === taskId);
        if (
          current &&
          (current.completedCount !== completedCount ||
            current.errorCount !== errorCount)
        ) {
          updateTask(taskId, { completedCount, errorCount });
        }
        onProgress?.(completedCount, p.totalCount ?? 0);
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    [updateTask, removeTask]
  );

  /** 一次性终态兜底：individual 任务无 SSE，dialog 中途关闭后 store 停中间态，
   *  关闭时查一次进度，若已终态则回写并移除，避免"等待中"残留（症状 2/3 复发）。 */
  const syncIndividualTerminal = useCallback(
    async (taskId: string): Promise<void> => {
      const p = await getBatchTaskProgress(taskId);
      if (!p.ok) return;
      if (
        p.status === 'COMPLETED' ||
        p.status === 'FAILED' ||
        p.status === 'CANCELLED'
      ) {
        updateTask(taskId, {
          status: p.status,
          completedCount: p.completedCount ?? 0,
          errorCount: p.errorCount ?? 0,
        });
        removeTask(taskId);
      }
    },
    [updateTask, removeTask]
  );

  const cancelTask = useCallback(
    async (taskId: string) => {
      try {
        const result = await batchDownloadControllerCancelTask({
          path: { taskId },
        });
        // SDK 默认不抛错：失败时错误在 result.error。不检查会把任务标记为
        // 已取消并弹"批量下载已取消"，实际后端取消失败仍在后台执行
        if (result.error) throw result.error;
        const es = activeSSEs.current.get(taskId);
        if (es) {
          es.close();
          activeSSEs.current.delete(taskId);
        }
        updateTask(taskId, { status: 'CANCELLED' });
        showToast?.(t('批量下载已取消'), 'info');
      } catch (err) {
        // SDK error 是普通对象（非 Error 实例），用 getErrorMessage 提取后端消息
        showToast?.(getErrorMessage(err) || t('取消失败'), 'error');
      }
    },
    [updateTask, showToast]
  );

  /** 重试失败的批量下载任务：后端重置为 PENDING 重跑，前端置回 PROCESSING 并重新订阅进度 */
  const retryTask = useCallback(
    async (taskId: string) => {
      try {
        const result = await batchDownloadControllerRetryTask({
          path: { taskId },
        });
        if (result.error) throw result.error;
        updateTask(taskId, { status: 'PROCESSING' });
        // 失败时进度 SSE 已关闭并从 activeSSEs 移除，重试后须重新订阅才能收到新进度
        subscribeToProgressSSE(taskId);
        showToast?.(t('已重新加入下载队列'), 'info');
      } catch (err) {
        // VIP_FEATURE_REQUIRED 已由全局 error 拦截器弹购买弹窗（含后端消息），此处不再重复 toast
        if (!isVipFeatureRequiredError(err)) {
          showToast?.(getErrorMessage(err) || t('重试失败'), 'error');
        }
      }
    },
    [updateTask, showToast, subscribeToProgressSSE]
  );

  /** 重试 FAILED 任务中失败的文件项：后端创建新任务（仅重跑失败项，成功项不重跑），
   *  前端把新任务加入列表并订阅进度；原任务保持 FAILED（其成功产物仍可下载）。 */
  const retryFailedItems = useCallback(
    async (taskId: string) => {
      try {
        const result = await batchDownloadControllerRetryFailedItems({
          path: { taskId },
        });
        if (result.error) throw result.error;
        const newTaskId = (result.data as { newTaskId: string }).newTaskId;
        // 新任务显示名继承原任务失败项文件名（errors 字段）
        const original = useBatchDownloadStore
          .getState()
          .tasks.find((t) => t.taskId === taskId);
        const failedNames = (original?.errors ?? []).map((e) => e.fileName);
        addTask({
          taskId: newTaskId,
          status: 'PROCESSING',
          mode: original?.mode ?? 'individual',
          itemNames: failedNames.length > 0 ? failedNames : undefined,
          totalCount: failedNames.length,
          completedCount: 0,
          errorCount: 0,
          createdAt: new Date().toISOString(),
        });
        setProgressTaskId(newTaskId);
        subscribeToProgressSSE(newTaskId);
        showToast?.(t('已重新加入下载队列（仅失败项）'), 'info');
      } catch (err) {
        // VIP_FEATURE_REQUIRED 已由全局 error 拦截器弹购买弹窗（含后端消息），此处不再重复 toast
        if (!isVipFeatureRequiredError(err)) {
          showToast?.(getErrorMessage(err) || t('重试失败'), 'error');
        }
      }
    },
    [addTask, setProgressTaskId, subscribeToProgressSSE, showToast]
  );

  const downloadZip = useCallback(
    async (task: BatchTask) => {
      if (task.status !== 'COMPLETED') {
        showToast?.(t('任务尚未完成'), 'warning');
        return;
      }
      try {
        const res = await downloadBatchZip(task.taskId);
        if (!res.ok) {
          if (res.status === 404) {
            showToast?.(t('ZIP文件已过期，已从列表移除'), 'warning');
            removeTask(task.taskId);
          } else if (res.status === 409)
            showToast?.(t('任务尚未完成'), 'warning');
          else showToast?.(t('下载失败'), 'error');
          return;
        }
      } catch {
        showToast?.(t('下载失败'), 'error');
      }
    },
    [showToast, removeTask]
  );

  /** 多任务合并下载：合并为单个 ZIP 一次下载（区别于逐任务分别触发浏览器下载） */
  const downloadMergedZip = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return;
      const res = await downloadMergedBatchZip(taskIds);
      if (!res.ok) {
        showToast?.(t('下载失败'), 'error');
      }
    },
    [showToast]
  );

  useEffect(() => {
    return () => {
      activeSSEs.current.forEach((es) => es.close());
      activeSSEs.current.clear();
    };
  }, []);

  return {
    tasks,
    createZipTask,
    createIndividualTask,
    createSingleFormatTask,
    createFileHashTask,
    downloadAllItems,
    pollTaskUntilDone,
    syncIndividualTerminal,
    syncTasksFromServer,
    cancelTask,
    retryTask,
    retryFailedItems,
    removeTask,
    downloadZip,
    downloadMergedZip,
    subscribeToProgressSSE,
  };
}
