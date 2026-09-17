import type { BatchJobStatus } from '@cloudcad/db';

export interface BatchProgressEvent {
  taskId: string;
  status: BatchJobStatus;
  /** 下载模式：zip=打包 ZIP；individual=逐个下载（单文件直出） */
  mode: 'zip' | 'individual';
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
