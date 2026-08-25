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
  /** 多格式下载转换产物缓存目录与 TTL（与 FileDownloadExportService 共用同一配置） */
  private readonly conversionCacheDir: string;
  private readonly conversionCacheTtlHours: number;

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
    this.conversionCacheDir = batchConfig.conversionCacheDir || '';
    this.conversionCacheTtlHours = batchConfig.conversionCacheTtlHours || 0;

    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP, {
      description: '过期批量下载 ZIP 清理',
      execute: () => this.cleanupExpiredZipsTask(),
    });
    this.taskRunService.register(TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP, {
      description: '过期批量下载 DB 记录清理',
      execute: () => this.cleanupExpiredDbRecordsTask(),
    });
    this.taskRunService.register(
      TASK_NAMES.BATCH_DOWNLOAD.CONVERSION_CACHE_CLEANUP,
      {
        description: '过期转换产物缓存清理',
        execute: () => this.cleanupExpiredConversionCacheTask(),
      }
    );
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
  async cleanupExpiredConversionCache(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('转换产物缓存清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.BATCH_DOWNLOAD.CONVERSION_CACHE_CLEANUP,
        () => this.cleanupExpiredConversionCacheTask()
      );
    } catch (err) {
      this.logger.error(`Conversion cache cleanup failed: ${err.message}`);
      await this.raiseTaskFailed('cleanupExpiredConversionCache', err);
    }
  }

  /**
   * 过期转换产物缓存清理裸执行（定时 + 手动触发共用）。
   * 缓存 key 含 fileHash：文件变动后旧 key 永不再命中，惰性 TTL 触不到，
   * 必须定时按 mtime 清扫，否则孤儿缓存无限累积。
   */
  private async cleanupExpiredConversionCacheTask(): Promise<void> {
    if (!this.conversionCacheDir || !this.conversionCacheTtlHours) return;

    const cutoffMs = Date.now() - this.conversionCacheTtlHours * 60 * 60 * 1000;
    let deletedCount = 0;
    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(this.conversionCacheDir);
    } catch {
      return; // 目录不存在 = 无缓存
    }

    for (const entry of entries) {
      const fullPath = path.join(this.conversionCacheDir, entry);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.isFile() && stat.mtimeMs < cutoffMs) {
          await fs.promises.unlink(fullPath);
          deletedCount++;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to delete expired conversion cache: ${fullPath} - ${err.message}`
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} expired conversion cache files older than ${this.conversionCacheTtlHours}h`
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
   * 过期 DB 记录清理裸执行（定时 + 手动触发共用）。
   * individual 模式任务的残留产物（未下载完的转换临时文件）随记录一并清理。
   */
  private async cleanupExpiredDbRecordsTask(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.dbRetentionDays);

    // 先清理 individual 模式的残留产物（temp=true 的转换临时文件；源文件绝不删除）
    const expiredIndividualJobs = await this.prisma.batchDownloadJob.findMany({
      where: {
        mode: 'individual',
        createdAt: { lte: cutoff },
        itemsManifest: { not: null },
      },
      select: { id: true, itemsManifest: true },
    });
    let cleanedFiles = 0;
    for (const job of expiredIndividualJobs) {
      const manifest = (job.itemsManifest as any[]) || [];
      for (const item of manifest) {
        if (!item?.temp || !item.sourcePath) continue;
        try {
          if (fs.existsSync(item.sourcePath)) {
            await fs.promises.unlink(item.sourcePath);
            cleanedFiles++;
          }
        } catch (err) {
          this.logger.warn(
            `Failed to delete individual item: ${item.sourcePath} - ${err.message}`
          );
        }
      }
    }
    if (cleanedFiles > 0) {
      this.logger.log(
        `Cleaned up ${cleanedFiles} individual download temp files from ${expiredIndividualJobs.length} expired jobs`
      );
    }

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
        // P2：低频清理失败（静默记录，人工排查）
        level: AlertLevel.P2,
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
