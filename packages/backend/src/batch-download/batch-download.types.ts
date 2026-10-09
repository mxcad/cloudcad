import type { BatchJobStatus } from '@cloudcad/db';

export interface BatchProgressEvent {
  taskId: string;
  status: BatchJobStatus;
  /**
   * 下载模式：zip=打包 ZIP；individual=逐个下载（单文件直出）。
   * 仅任务快照事件（getProgress / getUserTasks，源自 DB job）必带；
   * 实时进度 tick（emitProgress）不重复下发——前端在任务创建时已知 mode 并保留，
   * SSE 帧不读此字段（见 frontend/services/batchDownloadProgress.ts）。
   */
  mode?: 'zip' | 'individual';
  totalCount: number;
  completedCount: number;
  errorCount: number;
  currentFile?: string;
  errors?: Array<{ nodeId: string; fileName: string; error: string }>;
  zipPath?: string;
  zipSize?: number;
  /** individual 模式：index → 下载文件名（zip 模式为 undefined） */
  itemNames?: string[];
}

/** 用户下载任务分页结果（下载 tab 分页加载历史） */
export interface BatchDownloadTaskPage {
  tasks: BatchProgressEvent[];
  hasMore: boolean;
}
