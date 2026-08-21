///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { StorageCleanupService } from '../../storage-management/services/storage-cleanup.service';
import { DiskMonitorService } from '../../storage-management/services/disk-monitor.service';
import { FileLockService } from '../../storage-management/services/file-lock.service';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { TaskRunService } from '../../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../../task-run/task-run.constants';

/**
 * 磁盘告警消息键（#242 定案）
 */
const DISK_ALERT_KEYS = {
  LOW: 'disk_space_low',
  CRITICAL: 'disk_space_critical',
} as const;

@Injectable()
export class StorageCleanupScheduler {
  private readonly logger = new Logger(StorageCleanupScheduler.name);

  constructor(
    private readonly storageCleanupService: StorageCleanupService,
    private readonly diskMonitorService: DiskMonitorService,
    private readonly fileLockService: FileLockService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService
  ) {
    // 手动触发注册表（#210）：裸执行函数由 TaskRunService.run 统一包装记录
    this.taskRunService.register(TASK_NAMES.STORAGE_CLEANUP.EXPIRED_STORAGE, {
      description: '过期存储文件清理',
      execute: () => this.cleanupExpiredStorageTask(),
    });
    this.taskRunService.register(TASK_NAMES.STORAGE_CLEANUP.TRASH, {
      description: '回收站文件清理',
      execute: () => this.cleanupTrashTask(),
    });
    this.taskRunService.register(TASK_NAMES.STORAGE_CLEANUP.LOCKS, {
      description: '过期文件锁清理',
      execute: () => this.cleanupLocksTask(),
    });
    this.taskRunService.register(TASK_NAMES.STORAGE_CLEANUP.DISK_MONITOR, {
      description: '磁盘状态监控',
      execute: () => this.diskMonitorTask(),
    });
    this.taskRunService.register(TASK_NAMES.STORAGE_CLEANUP.ORPHANS, {
      description: '孤儿文件清理',
      execute: () => this.cleanupOrphansTask(),
    });
  }

  private async isEnabled(key: string): Promise<boolean> {
    return this.runtimeConfigService.getValue<boolean>(key, true);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.STORAGE);
    if (!enabled) {
      this.logger.log('存储清理已禁用，跳过');
      return;
    }

    this.logger.log('Starting scheduled cleanup task');

    try {
      await this.taskRunService.run(
        TASK_NAMES.STORAGE_CLEANUP.EXPIRED_STORAGE,
        () => this.cleanupExpiredStorageTask()
      );
    } catch (error) {
      this.logger.error('Scheduled cleanup task failed', error.stack);
      await this.raiseTaskFailed('handleCleanup', error);
    }
  }

  /**
   * 过期存储清理裸执行（定时 + 手动触发共用）
   */
  private async cleanupExpiredStorageTask(): Promise<void> {
    const result = await this.storageCleanupService.cleanupExpiredStorage();

    this.logger.log(
      `Scheduled cleanup completed: Deleted ${result.deletedNodes} nodes, cleaned ${result.deletedDirectories} empty directories`
    );

    if (result.errors.length > 0) {
      this.logger.warn(
        `Cleanup task encountered ${result.errors.length} errors`
      );
      result.errors.forEach((error, index) => {
        this.logger.warn(`Error ${index + 1}: ${error}`);
      });
    }

    const healthReport = this.diskMonitorService.getHealthReport();

    if (!healthReport.healthy) {
      this.logger.warn(
        `Disk status abnormal: ${healthReport.status.message}`
      );
      this.logger.warn(`Recommendation: ${healthReport.recommendation}`);
    } else {
      this.logger.log(`Disk status normal: ${healthReport.status.message}`);
    }
  }

  @Cron('0 4 * * *')
  async handleTrashCleanup() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.TRASH);
    if (!enabled) {
      this.logger.log('回收站清理已禁用，跳过');
      return;
    }

    this.logger.log('Starting scheduled trash cleanup task');

    try {
      await this.taskRunService.run(TASK_NAMES.STORAGE_CLEANUP.TRASH, () =>
        this.cleanupTrashTask()
      );
    } catch (error) {
      this.logger.error('Scheduled trash cleanup task failed', error.stack);
      await this.raiseTaskFailed('handleTrashCleanup', error);
    }
  }

  /**
   * 回收站清理裸执行（定时 + 手动触发共用）
   */
  private async cleanupTrashTask(): Promise<void> {
    const result = await this.storageCleanupService.cleanupExpiredTrash();

    this.logger.log(
      `Scheduled trash cleanup completed: Deleted ${result.deletedNodes} items, cleaned ${result.deletedDirectories} empty directories`
    );

    if (result.errors.length > 0) {
      this.logger.warn(
        `Trash cleanup task encountered ${result.errors.length} errors`
      );
      result.errors.forEach((error, index) => {
        this.logger.warn(`Error ${index + 1}: ${error}`);
      });
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleLockCleanup() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.LOCKS);
    if (!enabled) {
      this.logger.log('文件锁清理已禁用，跳过');
      return;
    }

    this.logger.log('Starting expired lock file cleanup');

    try {
      await this.taskRunService.run(TASK_NAMES.STORAGE_CLEANUP.LOCKS, () =>
        this.cleanupLocksTask()
      );
    } catch (error) {
      this.logger.error('Expired lock file cleanup failed', error.stack);
      await this.raiseTaskFailed('handleLockCleanup', error);
    }
  }

  /**
   * 过期文件锁清理裸执行（定时 + 手动触发共用）
   */
  private async cleanupLocksTask(): Promise<void> {
    const cleanedCount = await this.fileLockService.cleanupExpiredLocks();

    this.logger.log(
      `Expired lock file cleanup completed: Cleaned ${cleanedCount} lock files`
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleDiskMonitor() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.DISK_MONITOR);
    if (!enabled) {
      this.logger.log('磁盘监控已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.STORAGE_CLEANUP.DISK_MONITOR,
        () => this.diskMonitorTask()
      );
    } catch (error) {
      this.logger.error('Disk status check failed', error.stack);
      await this.raiseTaskFailed('handleDiskMonitor', error);
    }
  }

  /**
   * 磁盘状态监控裸执行（定时 + 手动触发共用）
   */
  private async diskMonitorTask(): Promise<void> {
    const healthReport = this.diskMonitorService.getHealthReport();
    await this.raiseDiskAlerts(healthReport);

    if (healthReport.status.warning || healthReport.status.critical) {
      this.logger.warn(`Disk status check: ${healthReport.status.message}`);
      this.logger.warn(`Recommendation: ${healthReport.recommendation}`);
    }
  }

  /**
   * 磁盘告警上报与自动恢复（#242 定案：disk_space_low / disk_space_critical，source = disk-monitor）
   */
  private async raiseDiskAlerts(
    healthReport: ReturnType<DiskMonitorService['getHealthReport']>
  ): Promise<void> {
    const { status } = healthReport;
    const stats = status.stats;
    const detail = {
      free: stats.free,
      total: stats.total,
      used: stats.used,
      usagePercentage: Number(stats.usagePercentage.toFixed(2)),
      path: stats.path,
    };

    if (status.critical) {
      try {
        await this.alertService.raise({
          source: 'disk-monitor',
          messageKey: DISK_ALERT_KEYS.CRITICAL,
          level: AlertLevel.CRITICAL,
          message: status.message,
          detail,
        });
      } catch (alertError) {
        this.logger.error(
          `磁盘告警上报失败: ${alertError.message}`,
          alertError.stack
        );
      }
      await this.safeResolveDiskKey(DISK_ALERT_KEYS.LOW);
    } else if (status.warning) {
      try {
        await this.alertService.raise({
          source: 'disk-monitor',
          messageKey: DISK_ALERT_KEYS.LOW,
          level: AlertLevel.WARNING,
          message: status.message,
          detail,
        });
      } catch (alertError) {
        this.logger.error(
          `磁盘告警上报失败: ${alertError.message}`,
          alertError.stack
        );
      }
      await this.safeResolveDiskKey(DISK_ALERT_KEYS.CRITICAL);
    } else {
      // 磁盘恢复正常 → 自动恢复（resolve）两个 key
      await this.safeResolveDiskKey(DISK_ALERT_KEYS.LOW);
      await this.safeResolveDiskKey(DISK_ALERT_KEYS.CRITICAL);
    }
  }

  private async safeResolveDiskKey(messageKey: string): Promise<void> {
    try {
      await this.alertService.resolveBySourceKey('disk-monitor', messageKey);
    } catch (alertError) {
      this.logger.error(
        `磁盘告警恢复失败: ${alertError.message}`,
        alertError.stack
      );
    }
  }

  @Cron('0 2 * * * 0')
  async handleOrphanCleanup() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.ORPHANS);
    if (!enabled) {
      this.logger.log('孤儿文件清理已禁用，跳过');
      return;
    }

    this.logger.log('Starting scheduled orphan cleanup task');

    try {
      await this.taskRunService.run(TASK_NAMES.STORAGE_CLEANUP.ORPHANS, () =>
        this.cleanupOrphansTask()
      );
    } catch (error) {
      this.logger.error('Scheduled orphan cleanup task failed', error.stack);
      await this.raiseTaskFailed('handleOrphanCleanup', error);
    }
  }

  /**
   * 孤儿文件清理裸执行（定时 + 手动触发共用）
   */
  private async cleanupOrphansTask(): Promise<void> {
    const result = await this.storageCleanupService.cleanupOrphans();

    this.logger.log(
      `Orphan cleanup completed: Deleted ${result.deletedNodes} nodes, cleaned ${result.deletedDirectories} empty directories`
    );

    if (result.errors.length > 0) {
      this.logger.warn(
        `Orphan cleanup task encountered ${result.errors.length} errors`
      );
    }
  }

  /**
   * 最小定时任务失败钩子（#245）：task_run_failed 告警，source = scheduler:storage-cleanup
   */
  private async raiseTaskFailed(task: string, error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:storage-cleanup',
        messageKey: 'task_run_failed',
        level: AlertLevel.CRITICAL,
        message: `定时任务 storage-cleanup 失败（${task}）: ${error instanceof Error ? error.message : String(error)}`,
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
