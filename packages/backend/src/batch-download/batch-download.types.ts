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
}
