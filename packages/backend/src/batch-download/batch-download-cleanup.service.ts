import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { BatchJobStatus } from '@cloudcad/db';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BatchDownloadCleanupService {
  private readonly logger = new Logger(BatchDownloadCleanupService.name);
  private readonly exportDir: string;
  private readonly zipRetentionHours: number;
  private readonly dbRetentionDays: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService
  ) {
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    this.exportDir = batchConfig.exportDir;
    this.zipRetentionHours = batchConfig.zipRetentionHours;
    this.dbRetentionDays = batchConfig.dbRetentionDays;

    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP, {
      description: '过期批量下载 ZIP 清理',
      execute: () => this.cleanupExpiredZipsTask(),
    });
    this.taskRunService.register(TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP, {
      description: '过期批量下载 DB 记录清理',
      execute: () => this.cleanupExpiredDbRecordsTask(),
    });
  }

  private async isEnabled(): Promise<boolean> {
    return this.runtimeConfigService.getValue<boolean>(
      TASK_ENABLED_KEYS.BATCH_DOWNLOAD,
      true
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredZips(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('批量下载 ZIP 清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP,
        () => this.cleanupExpiredZipsTask()
      );
    } catch (err) {
      this.logger.error(`ZIP cleanup failed: ${err.message}`);
      await this.raiseTaskFailed('cleanupExpiredZips', err);
    }
  }

  /**
   * 过期 ZIP 清理裸执行（定时 + 手动触发共用）
   */
  private async cleanupExpiredZipsTask(): Promise<void> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.zipRetentionHours);

    const expiredJobs = await this.prisma.batchDownloadJob.findMany({
      where: {
        status: BatchJobStatus.COMPLETED,
        completedAt: { lte: cutoff },
        zipPath: { not: null },
      },
    });

    let deletedCount = 0;
    for (const job of expiredJobs) {
      if (!job.zipPath) continue;
      const zipPath = path.resolve(this.exportDir, job.zipPath);
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
          deletedCount++;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to delete expired ZIP: ${zipPath} - ${err.message}`
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} expired ZIP files older than ${this.zipRetentionHours}h`
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredDbRecords(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('批量下载 DB 清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP,
        () => this.cleanupExpiredDbRecordsTask()
      );
    } catch (err) {
      this.logger.error(`DB cleanup failed: ${err.message}`);
      await this.raiseTaskFailed('cleanupExpiredDbRecords', err);
    }
  }

  /**
   * 过期 DB 记录清理裸执行（定时 + 手动触发共用）
   */
  private async cleanupExpiredDbRecordsTask(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.dbRetentionDays);

    const result = await this.prisma.batchDownloadJob.deleteMany({
      where: {
        createdAt: { lte: cutoff },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleaned up ${result.count} expired DB records older than ${this.dbRetentionDays}d`
      );
    }
  }

  /**
   * 定时任务失败钩子（#245 模式）：task_run_failed 告警，source = scheduler:batch-download
   */
  private async raiseTaskFailed(task: string, error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:batch-download',
        messageKey: 'task_run_failed',
        level: AlertLevel.CRITICAL,
        message: `定时任务 batch-download 失败（${task}）: ${error instanceof Error ? error.message : String(error)}`,
        detail: {
          task,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (alertError) {
      this.logger.error(
        `任务失败告警上报失败: ${alertError.message}`,
        alertError.stack
      );
    }
  }
}
