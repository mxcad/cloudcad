import { getValidToken } from '@/utils/tokenUtils';
import { openEventStream } from '@/services/eventStream';
import {
  useBatchDownloadStore,
  type BatchTask,
} from '@/stores/useBatchDownloadStore';
import { t } from '@/languages';

/**
 * 批量下载进度 SSE 单例管理（唯一出口）
 *
 * useBatchDownload 会被多个组件同时实例化（ConversionPanel 与 DownloadTab 父子
 * 同时挂载、导出弹窗、下载管理器），SSE 连接必须按 taskId 全局唯一并引用计数：
 * - 同一任务多个实例订阅只建一条连接（此前每实例各建一条，同任务多连接）
 * - 终态自动下载去重表全局唯一（此前每实例一份 useRef，跨实例会重复触发浏览器下载）
 * - 实例卸载只减引用，最后一个释放者关闭连接（对齐原「卸载即关」语义）
 */

export type BatchDownloadToastType = 'success' | 'error' | 'info' | 'warning';

interface ProgressSubscription {
  handle: NonNullable<ReturnType<typeof openEventStream>>;
  /** 订阅实例数：>0 保持连接，归零关闭 */
  refs: number;
  onTerminal: Set<(task: BatchTask | undefined) => void>;
  onToast: Set<(message: string, type: BatchDownloadToastType) => void>;
  /** 连接关闭（终态/出错/取消）时的实例侧清理回调：清除实例订阅标记，
   *  retryTask 才能对同一任务重新订阅（基线行为） */
  onClosed: Set<() => void>;
}

const activeSSEs = new Map<string, ProgressSubscription>();

/** 已触发过自动下载的 taskId 集合（SSE 重连可能重复推送终态，防重复触发浏览器下载） */
const autoDownloadedTaskIds = new Set<string>();

/** 全局终态自动下载去重：返回 true 表示首次（应触发下载） */
export function tryMarkAutoDownloaded(taskId: string): boolean {
  if (autoDownloadedTaskIds.has(taskId)) return false;
  autoDownloadedTaskIds.add(taskId);
  return true;
}

/** 关闭并移除任务的进度 SSE（取消/终态时调用，无视引用计数） */
function closeEntry(taskId: string): void {
  const entry = activeSSEs.get(taskId);
  if (!entry) return;
  // 先出表再回调：onClosed 里实例可能触发 release（unmount 竞态），此时应查无此条
  activeSSEs.delete(taskId);
  entry.handle.close();
  entry.onClosed.forEach((fn) => fn());
}

/**
 * 订阅任务进度 SSE。同任务已存在连接时只登记新处理器并递增引用，不重复建连。
 */
export function subscribeBatchTaskProgress(
  taskId: string,
  handlers?: {
    onTerminal?: (task: BatchTask | undefined) => void;
    onToast?: (message: string, type: BatchDownloadToastType) => void;
    onClosed?: () => void;
  }
): void {
  const existing = activeSSEs.get(taskId);
  if (existing) {
    existing.refs++;
    if (handlers?.onTerminal) existing.onTerminal.add(handlers.onTerminal);
    if (handlers?.onToast) existing.onToast.add(handlers.onToast);
    if (handlers?.onClosed) existing.onClosed.add(handlers.onClosed);
    return;
  }

  const token = getValidToken();
  // 连接建立/关流/畸形帧忽略走 eventStream 唯一出口；本模块只管引用计数与终态分发
  const handle = openEventStream({
    path: `/v1/file-system/batch-download/${taskId}/progress`,
    query: token ? { token } : undefined,
    onFrame: (data) => {
      // 终态已 closeEntry 出表后到达的迟到帧直接忽略
      const current = activeSSEs.get(taskId);
      if (!current) return;
      const payload = data as {
        status?: string;
        totalCount?: number;
        completedCount?: number;
        errorCount?: number;
        currentFile?: string;
        errors?: unknown;
        zipPath?: string;
      };
      useBatchDownloadStore.getState().updateTask(taskId, {
        status: payload.status as BatchTask['status'],
        totalCount: payload.totalCount,
        completedCount: payload.completedCount,
        errorCount: payload.errorCount,
        currentFile: payload.currentFile,
        errors: payload.errors as BatchTask['errors'],
        zipPath: payload.zipPath,
      });

      if (payload.status === 'COMPLETED') {
        closeEntry(taskId);
        current.onToast.forEach((fn) => fn(t('批量下载完成'), 'success'));
        const task = useBatchDownloadStore
          .getState()
          .tasks.find((item) => item.taskId === taskId);
        current.onTerminal.forEach((fn) => fn(task));
      } else if (payload.status === 'FAILED') {
        closeEntry(taskId);
        current.onToast.forEach((fn) => fn(t('批量下载失败'), 'error'));
      } else if (payload.status === 'CANCELLED') {
        closeEntry(taskId);
        current.onToast.forEach((fn) => fn(t('批量下载已取消'), 'info'));
      }
    },
    // 出错即关流（清实例订阅标记，retryTask 可重新订阅；轮询/重订阅兜底）
    onClose: () => closeEntry(taskId),
  });
  if (!handle) {
    // 非浏览器环境（无 EventSource）：不建连也不登记，实例侧进度由轮询兜底
    return;
  }

  const entry: ProgressSubscription = {
    handle,
    refs: 1,
    onTerminal: new Set(),
    onToast: new Set(),
    onClosed: new Set(),
  };
  if (handlers?.onTerminal) entry.onTerminal.add(handlers.onTerminal);
  if (handlers?.onToast) entry.onToast.add(handlers.onToast);
  if (handlers?.onClosed) entry.onClosed.add(handlers.onClosed);
  activeSSEs.set(taskId, entry);
}

/**
 * 释放本实例对任务进度 SSE 的引用（实例卸载时调用）；引用归零才关闭连接。
 */
export function releaseBatchTaskProgress(taskId: string): void {
  const entry = activeSSEs.get(taskId);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) closeEntry(taskId);
}

/**
 * 强制关闭任务进度 SSE（取消任务时调用，无视引用计数）。
 */
export function closeBatchTaskProgress(taskId: string): void {
  closeEntry(taskId);
}
