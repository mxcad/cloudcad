///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { uploadSingleFile, type MxCadUploadResult } from './mxcadUploadUtils';

// ==================== 上传历史持久化 ====================

/** 上传历史 localStorage key（与 cloudcad.conversion.local-tasks 同款命名） */
const UPLOAD_HISTORY_KEY = 'cloudcad.upload.history';
/** 上传历史上限：按 updatedAt 倒序保留最近 N 条，避免 localStorage 无限增长 */
const UPLOAD_HISTORY_LIMIT = 50;

/** 可序列化的上传历史记录（File 对象不可序列化，恢复后无法重试） */
interface UploadHistoryRecord {
  id: string;
  fileName: string;
  fileSize: number;
  nodeId: string;
  status: 'done' | 'failed';
  progress: number;
  error?: string;
  updatedAt: number;
}

// ==================== Types ====================

export type TaskStatus =
  | 'waiting'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'failed'
  | 'paused'
  | 'cancelled';

export interface UploadTask {
  id: string;
  /** 可选：从 localStorage 恢复的历史任务无 File 对象（不可重试，只能移除） */
  file?: File;
  fileName: string;
  fileSize: number;
  nodeId: string;
  progress: number;
  status: TaskStatus;
  result?: MxCadUploadResult;
  error?: string;
  /** 创建时刻 + 终态更新时间戳（列表倒序排列 + 历史持久化排序用） */
  updatedAt?: number;
}

export interface UploadManagerConfig {
  maxConcurrent: number;
  onTaskDone?: (task: UploadTask) => void;
  onTaskFailed?: (task: UploadTask) => void;
  onAllComplete?: () => void;
}

export type UploadManagerEvent =
  | { type: 'task-added'; taskId: string }
  | { type: 'task-started'; taskId: string }
  | { type: 'task-progress'; taskId: string; progress: number }
  | { type: 'task-processing'; taskId: string; result: MxCadUploadResult }
  | { type: 'task-completed'; taskId: string; result: MxCadUploadResult }
  | { type: 'task-failed'; taskId: string; error: string }
  | { type: 'task-paused'; taskId: string }
  | { type: 'task-resumed'; taskId: string }
  | { type: 'task-removed'; taskId: string }
  | { type: 'queue-changed' };

export type UploadListener = (event: UploadManagerEvent) => void;

// ==================== UploadManager ====================

let _taskIdCounter = 0;

export class UploadManager {
  private tasks: Map<string, UploadTask> = new Map();
  private queue: string[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private onTaskDone?: (task: UploadTask) => void;
  private onTaskFailed?: (task: UploadTask) => void;
  private onAllComplete?: () => void;
  private listeners: Set<UploadListener> = new Set();

  constructor(config: UploadManagerConfig) {
    this.maxConcurrent = Math.max(1, config.maxConcurrent);
    this.onTaskDone = config.onTaskDone;
    this.onTaskFailed = config.onTaskFailed;
    this.onAllComplete = config.onAllComplete;
    this.loadHistory();
  }

  // ==================== Public API ====================

  addFiles(files: File[], nodeId: string): void {
    for (const file of files) {
      // id 带时间戳前缀：避免与 localStorage 恢复的历史任务 id 冲突
      const id = `upload_${Date.now()}_${++_taskIdCounter}`;
      const task: UploadTask = {
        id,
        file,
        fileName: file.name,
        fileSize: file.size,
        nodeId,
        progress: 0,
        status: 'waiting',
        // 创建时刻即时间戳：getTasks 按 updatedAt 倒序，新上传恒排在列表最前
        updatedAt: Date.now(),
      };
      this.tasks.set(id, task);
      this.queue.push(id);
      this.emit({ type: 'task-added', taskId: id });
    }
    this.emit({ type: 'queue-changed' });
    this.processQueue();
  }

  pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'waiting') {
      task.status = 'paused';
      this.emit({ type: 'task-paused', taskId });
      this.emit({ type: 'queue-changed' });
      this.queue = this.queue.filter((id) => id !== taskId);
    }
  }

  resumeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'paused') {
      task.status = 'waiting';
      this.queue.unshift(taskId);
      this.emit({ type: 'task-resumed', taskId });
      this.emit({ type: 'queue-changed' });
      this.processQueue();
    }
  }

  removeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (task.status === 'waiting' || task.status === 'paused') {
      task.status = 'cancelled';
      this.queue = this.queue.filter((id) => id !== taskId);
      this.emit({ type: 'task-removed', taskId });
      this.emit({ type: 'queue-changed' });
      return;
    }

    task.status = 'cancelled';
    this.emit({ type: 'task-removed', taskId });
    this.emit({ type: 'queue-changed' });
    this.persistHistory();
  }

  pauseAll(): void {
    const paused: string[] = [];
    this.queue = this.queue.filter((id) => {
      const task = this.tasks.get(id);
      if (task && task.status === 'waiting') {
        task.status = 'paused';
        this.emit({ type: 'task-paused', taskId: id });
        paused.push(id);
        return false;
      }
      return true;
    });
    if (paused.length > 0) {
      this.emit({ type: 'queue-changed' });
    }
  }

  resumeAll(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'paused') {
        task.status = 'waiting';
        this.queue.unshift(task.id);
        this.emit({ type: 'task-resumed', taskId: task.id });
      }
    }
    if (this.queue.length > 0) {
      this.emit({ type: 'queue-changed' });
      this.processQueue();
    }
  }

  clearCompleted(): void {
    const toRemove: string[] = [];
    for (const [id, task] of this.tasks) {
      if (
        task.status === 'done' ||
        task.status === 'failed' ||
        task.status === 'cancelled'
      ) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.tasks.delete(id);
      this.emit({ type: 'task-removed', taskId: id });
    }
    if (toRemove.length > 0) {
      this.emit({ type: 'queue-changed' });
      this.persistHistory();
    }
  }

  finalizeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'processing') return;

    task.status = 'done';
    task.updatedAt = Date.now();
    this.emit({ type: 'task-completed', taskId, result: task.result! });
    this.onTaskDone?.(task);
    this.persistHistory();
    this.maybeAutoClear();
  }

  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'processing') return;

    task.status = 'failed';
    task.error = error;
    task.updatedAt = Date.now();
    this.emit({ type: 'task-failed', taskId, error });
    this.onTaskFailed?.(task);
    this.persistHistory();
    this.maybeAutoClear();
  }

  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    // 从 localStorage 恢复的历史任务无 File 对象，无法重新上传
    if (!task.file) return;
    if (task.status === 'failed' || task.status === 'cancelled') {
      task.status = 'waiting';
      task.progress = 0;
      task.error = undefined;
      task.result = undefined;
      this.queue.unshift(taskId);
      this.emit({ type: 'task-resumed', taskId });
      this.emit({ type: 'queue-changed' });
      this.processQueue();
    }
  }

  /** 任务列表（按时间戳倒序，最新在前） */
  getTasks(): UploadTask[] {
    // Map 保留插入序：历史任务先入、新上传后入，直接遍历会把刚上传的任务排到
    // 最旧记录之后。此处统一按 updatedAt 倒序，缺时间戳（历史损坏）时垫底。
    return Array.from(this.tasks.values()).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    );
  }

  getTask(taskId: string): UploadTask | undefined {
    return this.tasks.get(taskId);
  }

  isActive(): boolean {
    if (this.activeCount > 0) return true;
    if (this.queue.length > 0) return true;
    for (const task of this.tasks.values()) {
      if (task.status === 'uploading' || task.status === 'processing')
        return true;
    }
    return false;
  }

  getStats(): {
    total: number;
    done: number;
    failed: number;
    uploading: number;
    waiting: number;
    paused: number;
  } {
    let done = 0,
      failed = 0,
      uploading = 0,
      waiting = 0,
      paused = 0;
    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'done':
          done++;
          break;
        case 'failed':
          failed++;
          break;
        case 'uploading':
        case 'processing':
          uploading++;
          break;
        case 'waiting':
          waiting++;
          break;
        case 'paused':
          paused++;
          break;
      }
    }
    return {
      total: this.tasks.size,
      done,
      failed,
      uploading,
      waiting,
      paused,
    };
  }

  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setMaxConcurrent(value: number): void {
    this.maxConcurrent = Math.max(1, value);
    this.processQueue();
  }

  // ==================== Private ====================

  private emit(event: UploadManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // swallow listener errors
      }
    }
  }

  private processQueue(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const taskId = this.queue.shift();
      if (!taskId) break;
      const task = this.tasks.get(taskId);
      if (!task) continue;
      if (task.status === 'paused' || task.status === 'cancelled') continue;

      this.activeCount++;
      this.executeTask(taskId);
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.activeCount--;
      this.processQueue();
      return;
    }

    if (task.status === 'cancelled' || task.status === 'paused') {
      this.activeCount--;
      this.processQueue();
      return;
    }

    task.status = 'uploading';
    this.emit({ type: 'task-started', taskId });

    try {
      // 从历史恢复的任务无 File 对象（retryTask 已拦截入队），此处防御兜底
      if (!task.file) {
        throw new Error('文件对象不可用，请重新选择文件后重试');
      }
      const result = await uploadSingleFile(
        task.file,
        task.nodeId,
        (progress: number) => {
          task.progress = progress;
          this.emit({ type: 'task-progress', taskId, progress });
        }
      );

      task.progress = 100;
      task.result = result;
      task.status = 'processing';
      this.emit({ type: 'task-processing', taskId, result });
    } catch (error) {
      if ((task as UploadTask).status === 'cancelled') {
        this.activeCount--;
        this.processQueue();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      task.status = 'failed';
      task.error = message;
      task.updatedAt = Date.now();
      this.emit({ type: 'task-failed', taskId, error: message });
      this.onTaskFailed?.(task);
      this.persistHistory();
      this.maybeAutoClear();
    } finally {
      const currentStatus = (task as UploadTask).status;
      if (currentStatus !== 'cancelled') {
        this.activeCount--;
        this.emit({ type: 'queue-changed' });
      }
      this.processQueue();
    }
  }

  private maybeAutoClear(): void {
    const stats = this.getStats();
    const active = stats.uploading + stats.waiting;
    if (active === 0 && stats.total > 0) {
      this.onAllComplete?.();
    }
  }

  // ==================== 上传历史持久化 ====================

  /** 从 localStorage 恢复终态（done/failed）任务作为历史记录 */
  private loadHistory(): void {
    try {
      const raw = localStorage.getItem(UPLOAD_HISTORY_KEY);
      if (!raw) return;
      const records = JSON.parse(raw) as UploadHistoryRecord[];
      if (!Array.isArray(records)) return;
      for (const record of records) {
        if (!record.id || !record.fileName) continue;
        this.tasks.set(record.id, {
          id: record.id,
          fileName: record.fileName,
          fileSize: record.fileSize,
          nodeId: record.nodeId,
          progress: record.status === 'done' ? 100 : record.progress,
          status: record.status,
          error: record.error,
          updatedAt: record.updatedAt,
        });
      }
    } catch {
      // 历史数据损坏/不可用：忽略，从空历史开始
    }
  }

  /** 把终态任务同步到 localStorage（按 updatedAt 倒序，保留最近 N 条） */
  private persistHistory(): void {
    try {
      const records: UploadHistoryRecord[] = [];
      for (const task of this.tasks.values()) {
        if (task.status === 'done' || task.status === 'failed') {
          records.push({
            id: task.id,
            fileName: task.fileName,
            fileSize: task.fileSize,
            nodeId: task.nodeId,
            status: task.status,
            progress: task.progress,
            error: task.error,
            updatedAt: task.updatedAt ?? 0,
          });
        }
      }
      records.sort((a, b) => b.updatedAt - a.updatedAt);
      localStorage.setItem(
        UPLOAD_HISTORY_KEY,
        JSON.stringify(records.slice(0, UPLOAD_HISTORY_LIMIT))
      );
    } catch {
      // localStorage 不可用（隐私模式等）：静默降级为仅内存历史
    }
  }
}

// ==================== Singleton ====================

let _manager: UploadManager | null = null;

export function getUploadManager(): UploadManager | null {
  return _manager;
}

export function createUploadManager(
  config: UploadManagerConfig
): UploadManager {
  _manager = new UploadManager(config);
  return _manager;
}
