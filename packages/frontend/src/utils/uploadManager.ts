///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import {
  uploadSingleFile,
  type MxCadUploadResult,
} from './mxcadUploadUtils';

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
  file: File;
  fileName: string;
  fileSize: number;
  nodeId: string;
  progress: number;
  status: TaskStatus;
  result?: MxCadUploadResult;
  error?: string;
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
  | { type: 'task-processing'; taskId: string }
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
  }

  // ==================== Public API ====================

  addFiles(files: File[], nodeId: string): void {
    for (const file of files) {
      const id = `upload_${++_taskIdCounter}`;
      const task: UploadTask = {
        id,
        file,
        fileName: file.name,
        fileSize: file.size,
        nodeId,
        progress: 0,
        status: 'waiting',
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
    }
  }

  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
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

  getTasks(): UploadTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(taskId: string): UploadTask | undefined {
    return this.tasks.get(taskId);
  }

  isActive(): boolean {
    if (this.activeCount > 0) return true;
    if (this.queue.length > 0) return true;
    for (const task of this.tasks.values()) {
      if (task.status === 'uploading' || task.status === 'processing') return true;
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
    let done = 0, failed = 0, uploading = 0, waiting = 0, paused = 0;
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
      const result = await uploadSingleFile(
        task.file,
        task.nodeId,
        (progress: number) => {
          task.progress = progress;
          this.emit({ type: 'task-progress', taskId, progress });
        }
      );

      task.status = 'processing';
      task.progress = 100;
      this.emit({ type: 'task-processing', taskId });
      task.result = result;

      task.status = 'done';
      this.emit({ type: 'task-completed', taskId, result });
      this.onTaskDone?.(task);
    } catch (error) {
      if ((task as UploadTask).status === 'cancelled') {
        this.activeCount--;
        this.processQueue();
        return;
      }
      const message =
        error instanceof Error ? error.message : String(error);
      task.status = 'failed';
      task.error = message;
      this.emit({ type: 'task-failed', taskId, error: message });
      this.onTaskFailed?.(task);
    } finally {
      const currentStatus = (task as UploadTask).status;
      if (currentStatus !== 'cancelled') {
        this.activeCount--;
        this.emit({ type: 'queue-changed' });
      }
      this.checkAllComplete();
      this.processQueue();
    }
  }

  private checkAllComplete(): void {
    const stats = this.getStats();
    const active = stats.uploading + stats.waiting;
    if (active === 0 && stats.total > 0) {
      this.onAllComplete?.();
    }
  }
}

// ==================== Singleton ====================

let _manager: UploadManager | null = null;

export function getUploadManager(): UploadManager | null {
  return _manager;
}

export function createUploadManager(config: UploadManagerConfig): UploadManager {
  _manager = new UploadManager(config);
  return _manager;
}

export function destroyUploadManager(): void {
  _manager = null;
}
