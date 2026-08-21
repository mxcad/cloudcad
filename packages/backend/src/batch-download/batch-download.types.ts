import type { BatchJobStatus } from '@cloudcad/db';

export interface BatchProgressEvent {
  taskId: string;
  status: BatchJobStatus;
  totalCount: number;
  completedCount: number;
  errorCount: number;
  currentFile?: string;
  errors?: Array<{ nodeId: string; fileName: string; error: string }>;
  zipPath?: string;
  zipSize?: number;
}
