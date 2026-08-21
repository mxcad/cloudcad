import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import type { BatchJobStatus } from '@cloudcad/db';
import type { BatchProgressEvent } from './batch-download.types';

@Injectable()
export class ProgressTrackerService {
  private readonly logger = new Logger(ProgressTrackerService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async syncCounts(
    jobId: string,
    completedCount: number,
    errorCount: number
  ): Promise<void> {
    try {
      await this.prisma.batchDownloadJob.update({
        where: { id: jobId },
        data: { completedCount, errorCount },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to sync counts for job ${jobId}: ${(err as Error).message}`
      );
    }
  }

  emitProgress(
    taskId: string,
    status: BatchJobStatus,
    completedCount: number,
    totalCount: number,
    errorCount: number,
    currentFile?: string,
    errors?: Array<{ nodeId: string; fileName: string; error: string }>
  ): void {
    this.eventEmitter.emit(`batch-download.progress.${taskId}`, {
      taskId,
      status,
      totalCount,
      completedCount,
      errorCount,
      currentFile,
      errors,
    } as BatchProgressEvent);
  }
}
