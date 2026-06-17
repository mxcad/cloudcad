///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { useSyncExternalStore, useCallback, useRef, useMemo } from 'react';
import {
  getUploadManager,
  createUploadManager,
  type UploadManager,
  type UploadTask,
  type UploadManagerConfig,
} from '../utils/uploadManager';

interface UseUploadManagerOptions {
  maxConcurrent?: number;
  onTaskDone?: (task: UploadTask) => void;
  onTaskFailed?: (task: UploadTask) => void;
  onAllComplete?: () => void;
}

export function useUploadManager(options: UseUploadManagerOptions = {}) {
  const { maxConcurrent = 3, onTaskDone, onTaskFailed, onAllComplete } = options;
  const managerRef = useRef<UploadManager | null>(null);
  const versionRef = useRef(0);

  if (!managerRef.current) {
    const existing = getUploadManager();
    if (existing) {
      managerRef.current = existing;
    } else {
      managerRef.current = createUploadManager({
        maxConcurrent,
        onTaskDone,
        onTaskFailed,
        onAllComplete,
      });
    }
  }

  const subscribe = useCallback(
    (callback: () => void) => {
      const manager = managerRef.current;
      if (!manager) return () => {};
      return manager.subscribe(() => {
        versionRef.current++;
        callback();
      });
    },
    []
  );

  const getSnapshot = useCallback(() => {
    return versionRef.current;
  }, []);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const manager = managerRef.current;

  const addFiles = useCallback(
    (files: File[], nodeId: string) => {
      const mgr = getUploadManager() || managerRef.current;
      mgr?.addFiles(files, nodeId);
    },
    []
  );

  const pauseTask = useCallback((taskId: string) => {
    managerRef.current?.pauseTask(taskId);
  }, []);

  const resumeTask = useCallback((taskId: string) => {
    managerRef.current?.resumeTask(taskId);
  }, []);

  const removeTask = useCallback((taskId: string) => {
    managerRef.current?.removeTask(taskId);
  }, []);

  const retryTask = useCallback((taskId: string) => {
    managerRef.current?.retryTask(taskId);
  }, []);

  const pauseAll = useCallback(() => {
    managerRef.current?.pauseAll();
  }, []);

  const resumeAll = useCallback(() => {
    managerRef.current?.resumeAll();
  }, []);

  const clearCompleted = useCallback(() => {
    managerRef.current?.clearCompleted();
  }, []);

  const activeTasks =
    manager?.getTasks().filter((t) => t.status !== 'cancelled') ?? [];
  const stats = manager?.getStats() ?? {
    total: 0,
    done: 0,
    failed: 0,
    uploading: 0,
    waiting: 0,
    paused: 0,
  };

  return {
    addFiles,
    pauseTask,
    resumeTask,
    removeTask,
    retryTask,
    pauseAll,
    resumeAll,
    clearCompleted,
    tasks: activeTasks,
    stats,
    manager,
  };
}

export type { UploadTask };
