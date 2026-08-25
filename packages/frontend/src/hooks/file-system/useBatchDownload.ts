import { useCallback, useRef, useEffect } from 'react';
import {
  useBatchDownloadStore,
  BatchFileItem,
  BatchTask,
} from '@/stores/useBatchDownloadStore';
import {
  batchDownloadControllerCreateTask,
  batchDownloadControllerCancelTask,
} from '@/api-sdk';
import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken } from '@/utils/tokenUtils';
import {
  downloadBatchZip,
  downloadBatchItem,
  getBatchTaskProgress,
} from '@/utils/download';
import { t } from '@/languages';
import { getErrorMessage } from '@/utils/errorHandler';

const API_BASE = getApiBaseUrl();

export function useBatchDownload(
  showToast?: (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning'
  ) => void
) {
  const { tasks, addTask, updateTask, setProgressTaskId } =
    useBatchDownloadStore();
  const activeSSEs = useRef<Map<string, EventSource>>(new Map());

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
        // SDK 默认不抛错：失败时错误在 result.error。不检查会对 undefined
        // 取 .taskId 抛 TypeError，用户看到英文引擎报错而非后端原因
        if (result.error) throw result.error;
        const taskId = (result.data as { taskId: string }).taskId;

        const task: BatchTask = {
          taskId,
          status: 'PENDING',
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
        // SDK error 是普通对象（非 Error 实例），用 getErrorMessage 提取后端消息
        showToast?.(getErrorMessage(err) || t('创建任务失败'), 'error');
        return null;
      }
    },
    [addTask, showToast]
  );

  const subscribeToProgressSSE = useCallback(
    (taskId: string) => {
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
        showToast?.(getErrorMessage(err) || t('创建任务失败'), 'error');
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

  /** 轮询任务直到终态（individual 模式 dialog 内等待转换完成用） */
  const pollTaskUntilDone = useCallback(
    async (
      taskId: string,
      onProgress?: (completed: number, total: number) => void,
      isCancelled?: () => boolean
    ): Promise<{ status: string } | null> => {
      for (;;) {
        if (isCancelled?.()) return null;
        const p = await getBatchTaskProgress(taskId);
        if (!p.ok) return null;
        if (p.status === 'COMPLETED' || p.status === 'FAILED' || p.status === 'CANCELLED') {
          return { status: p.status };
        }
        onProgress?.(p.completedCount ?? 0, p.totalCount ?? 0);
        await new Promise((r) => setTimeout(r, 2000));
      }
    },
    []
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

  const downloadZip = useCallback(
    async (task: BatchTask) => {
      if (task.status !== 'COMPLETED') {
        showToast?.(t('任务尚未完成'), 'warning');
        return;
      }
      try {
        const res = await downloadBatchZip(task.taskId);
        if (!res.ok) {
          if (res.status === 404)
            showToast?.(t('下载已过期，请重新提交'), 'warning');
          else if (res.status === 409)
            showToast?.(t('任务尚未完成'), 'warning');
          else showToast?.(t('下载失败'), 'error');
          return;
        }
      } catch {
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
    downloadAllItems,
    pollTaskUntilDone,
    cancelTask,
    downloadZip,
    subscribeToProgressSSE,
  };
}
