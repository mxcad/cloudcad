import { getApiBaseUrl } from '@/config/apiConfig';
import { getValidToken } from '@/utils/tokenUtils';
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
 * - 同一任务多个实例订阅只建一条 EventSource（此前每实例各建一条，同任务多连接）
 * - 终态自动下载去重表全局唯一（此前每实例一份 useRef，跨实例会重复触发浏览器下载）
 * - 实例卸载只减引用，最后一个释放者关闭连接（对齐原「卸载即关」语义）
 */

const API_BASE = getApiBaseUrl();

export type BatchDownloadToastType = 'success' | 'error' | 'info' | 'warning';

interface ProgressSubscription {
  es: EventSource;
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
  entry.es.close();
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
  const params = token ? `?token=${encodeURIComponent(token)}` : '';
  const url = `${API_BASE}/v1/file-system/batch-download/${taskId}/progress${params}`;

  // eslint-disable-next-line no-restricted-syntax -- 豁免：batch-download 任务进度 SSE（SDK 无 SSE 形态，token 走 query，ADR-0034 豁免清单）
  const es = new EventSource(url);
  const entry: ProgressSubscription = {
    es,
    refs: 1,
    onTerminal: new Set(),
    onToast: new Set(),
    onClosed: new Set(),
  };
  if (handlers?.onTerminal) entry.onTerminal.add(handlers.onTerminal);
  if (handlers?.onToast) entry.onToast.add(handlers.onToast);
  if (handlers?.onClosed) entry.onClosed.add(handlers.onClosed);
  activeSSEs.set(taskId, entry);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      useBatchDownloadStore.getState().updateTask(taskId, {
        status: data.status,
        totalCount: data.totalCount,
        completedCount: data.completedCount,
        errorCount: data.errorCount,
        currentFile: data.currentFile,
        errors: data.errors,
        zipPath: data.zipPath,
      });

      if (data.status === 'COMPLETED') {
        closeEntry(taskId);
        entry.onToast.forEach((fn) => fn(t('批量下载完成'), 'success'));
        const task = useBatchDownloadStore
          .getState()
          .tasks.find((item) => item.taskId === taskId);
        entry.onTerminal.forEach((fn) => fn(task));
      } else if (data.status === 'FAILED') {
        closeEntry(taskId);
        entry.onToast.forEach((fn) => fn(t('批量下载失败'), 'error'));
      } else if (data.status === 'CANCELLED') {
        closeEntry(taskId);
        entry.onToast.forEach((fn) => fn(t('批量下载已取消'), 'info'));
      }
    } catch {
      // ignore: 忽略单个 SSE 消息解析失败（重连由 EventSource 自动处理）
    }
  };

  es.onerror = () => {
    closeEntry(taskId);
  };
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
