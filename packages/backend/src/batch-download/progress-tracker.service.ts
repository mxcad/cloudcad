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
    // 实时进度 tick：不下发 mode（前端在任务创建时已知并保留，SSE 帧不读此字段），
    // 故无需 as 断言——对象本身就是合法的 BatchProgressEvent（mode 可选）
    this.eventEmitter.emit(`batch-download.progress.${taskId}`, {
      taskId,
      status,
      totalCount,
      completedCount,
      errorCount,
      currentFile,
      errors,
    } satisfies BatchProgressEvent);
  }
}
