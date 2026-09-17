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
import {
  CLEANUP_PARTIAL_MESSAGE_KEY,
  CleanupMetricsService,
} from '../metrics/cleanup-metrics.service';
import { isInUploadsCache } from './upload-cache.util';
import * as fs from 'fs';
import * as path from 'path';

/** errorSummary 明细截断条数：detail 为 Json 字段，防止错误风暴撑爆告警记录 */
const ERROR_SUMMARY_LIMIT = 10;

/**
 * 定时 cron 表达式：@Cron 装饰器与手动触发注册表（任务清单展示）共用同一来源，防止漂移
 */
const ZIP_CLEANUP_CRON = CronExpression.EVERY_HOUR;
const DB_CLEANUP_CRON = CronExpression.EVERY_DAY_AT_MIDNIGHT;
const CONVERSION_CACHE_CLEANUP_CRON = CronExpression.EVERY_DAY_AT_MIDNIGHT;

@Injectable()
export class BatchDownloadCleanupService {
  private readonly logger = new Logger(BatchDownloadCleanupService.name);
  private readonly exportDir: string;
  private readonly zipRetentionHours: number;
  private readonly dbRetentionDays: number;
  /** 多格式下载转换产物缓存目录与 TTL（与 FileDownloadExportService 共用同一配置） */
  private readonly conversionCacheDir: string;
  private readonly conversionCacheTtlHours: number;
  /** uploads 根（内容寻址共享缓存），用于豁免 individual 任务残留清理 */
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly configService: ConfigService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService,
    private readonly cleanupMetrics: CleanupMetricsService
  ) {
    const batchConfig = this.configService.get('batchDownload', {
      infer: true,
    });
    this.exportDir = batchConfig.exportDir;
    this.zipRetentionHours = batchConfig.zipRetentionHours;
    this.dbRetentionDays = batchConfig.dbRetentionDays;
    this.conversionCacheDir = batchConfig.conversionCacheDir || '';
    this.conversionCacheTtlHours = batchConfig.conversionCacheTtlHours || 0;
    this.mxcadUploadPath =
      this.configService.get<string>('mxcadUploadPath') || '';

    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP, {
      description: '过期批量下载 ZIP 清理',
      schedule: ZIP_CLEANUP_CRON,
      scheduleLabel: '每小时',
      execute: () => this.cleanupExpiredZipsTask(),
    });
    this.taskRunService.register(TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP, {
      description: '过期批量下载 DB 记录清理',
      schedule: DB_CLEANUP_CRON,
      scheduleLabel: '每天 00:00',
      execute: () => this.cleanupExpiredDbRecordsTask(),
    });
    this.taskRunService.register(
      TASK_NAMES.BATCH_DOWNLOAD.CONVERSION_CACHE_CLEANUP,
      {
        description: '过期转换产物缓存清理',
        schedule: CONVERSION_CACHE_CLEANUP_CRON,
        scheduleLabel: '每天 00:00',
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

  @Cron(ZIP_CLEANUP_CRON)
  async cleanupExpiredZips(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('批量下载 ZIP 清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP, () =>
        this.cleanupExpiredZipsTask()
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
    const startedAt = Date.now();
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
    let failedCount = 0;
    let freedBytes = 0;
    for (const job of expiredJobs) {
      if (!job.zipPath) continue;
      const zipPath = path.resolve(this.exportDir, job.zipPath);
      try {
        if (fs.existsSync(zipPath)) {
          let size = 0;
          try {
            size = fs.statSync(zipPath).size;
          } catch {
            // stat 与 unlink 之间的竞态：文件消失按 0 字节计
          }
          fs.unlinkSync(zipPath);
          deletedCount++;
          freedBytes += size;
        }
      } catch (err) {
        failedCount++;
        this.logger.warn(
          `Failed to delete expired ZIP: ${zipPath} - ${err.message}`
        );
      }
    }

    // 指标 + 结构化日志双写（#325）
    this.cleanupMetrics.observe({
      task: TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP,
      recordsDeleted: deletedCount,
      spaceFreedBytes: freedBytes,
      durationSeconds: (Date.now() - startedAt) / 1000,
    });

    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} expired ZIP files older than ${this.zipRetentionHours}h`
      );
    }
    if (failedCount > 0) {
      await this.raiseCleanupPartial(
        TASK_NAMES.BATCH_DOWNLOAD.ZIP_CLEANUP,
        deletedCount,
        failedCount
      );
    }
  }

  @Cron(CONVERSION_CACHE_CLEANUP_CRON)
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

    const startedAt = Date.now();
    const cutoffMs = Date.now() - this.conversionCacheTtlHours * 60 * 60 * 1000;
    let deletedCount = 0;
    let failedCount = 0;
    let freedBytes = 0;
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
          freedBytes += stat.size;
        }
      } catch (err) {
        failedCount++;
        this.logger.warn(
          `Failed to delete expired conversion cache: ${fullPath} - ${err.message}`
        );
      }
    }

    this.cleanupMetrics.observe({
      task: TASK_NAMES.BATCH_DOWNLOAD.CONVERSION_CACHE_CLEANUP,
      recordsDeleted: deletedCount,
      spaceFreedBytes: freedBytes,
      durationSeconds: (Date.now() - startedAt) / 1000,
    });

    if (deletedCount > 0) {
      this.logger.log(
        `Cleaned up ${deletedCount} expired conversion cache files older than ${this.conversionCacheTtlHours}h`
      );
    }
    if (failedCount > 0) {
      await this.raiseCleanupPartial(
        TASK_NAMES.BATCH_DOWNLOAD.CONVERSION_CACHE_CLEANUP,
        deletedCount,
        failedCount
      );
    }
  }

  @Cron(DB_CLEANUP_CRON)
  async cleanupExpiredDbRecords(): Promise<void> {
    const enabled = await this.isEnabled();
    if (!enabled) {
      this.logger.log('批量下载 DB 清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP, () =>
        this.cleanupExpiredDbRecordsTask()
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
    const startedAt = Date.now();
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
    let failedCount = 0;
    for (const job of expiredIndividualJobs) {
      const manifest = (job.itemsManifest as any[]) || [];
      for (const item of manifest) {
        // uploads/ 下产物是内容寻址共享缓存，由 mtime 缓存清理统一回收；
        // 任务级 unlink 会把共享缓存条目提前删除（历史行可能仍存 temp:true）
        if (
          !item?.temp ||
          !item.sourcePath ||
          isInUploadsCache(item.sourcePath, this.mxcadUploadPath)
        ) {
          continue;
        }
        try {
          if (fs.existsSync(item.sourcePath)) {
            await fs.promises.unlink(item.sourcePath);
            cleanedFiles++;
          }
        } catch (err) {
          failedCount++;
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

    // 口径说明（#325）：rows = DB 记录数 + 已清理的 individual 临时文件个数，
    // 两者同为"本次任务移除的对象"，合并计入同一 task 序列
    this.cleanupMetrics.observe({
      task: TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP,
      recordsDeleted: cleanedFiles + result.count,
      durationSeconds: (Date.now() - startedAt) / 1000,
    });

    if (failedCount > 0) {
      await this.raiseCleanupPartial(
        TASK_NAMES.BATCH_DOWNLOAD.DB_CLEANUP,
        cleanedFiles + result.count,
        failedCount
      );
    }
  }

  /**
   * 部分成功告警（#325 / ADR-0055 §7）：文件循环删除存在单项失败时上报 P2。
   */
  private async raiseCleanupPartial(
    task: string,
    deletedCount: number,
    failedCount: number
  ): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:batch-download',
        messageKey: CLEANUP_PARTIAL_MESSAGE_KEY,
        // P2：部分成功（每日日报汇总，人工排查）
        level: AlertLevel.P2,
        message: `清理任务部分成功（${task}）: 已删除 ${deletedCount} 项，${failedCount} 项失败`,
        detail: {
          task,
          deletedCount,
          errorCount: failedCount,
          errorSummary: [
            `${failedCount} 个文件删除失败，详见应用日志 warn 记录`,
          ],
        },
      });
    } catch (alertError) {
      this.logger.error(
        `部分成功告警上报失败: ${alertError.message}`,
        alertError.stack
      );
    }
  }

  /**
   * 定时任务完全失败钩子：task_run_failed 告警。
   * #245 首建时为 P2，#325 / ADR-0055 §7 升级为 P1（完全失败需聚合邮件提醒）。
   */
  private async raiseTaskFailed(task: string, error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:batch-download',
        messageKey: 'task_run_failed',
        // P1：单任务完全失败（15min 同源聚合）
        level: AlertLevel.P1,
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
