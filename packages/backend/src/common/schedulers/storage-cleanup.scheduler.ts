///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageCleanupService } from '../services/storage-cleanup.service';
import { DiskMonitorService } from '../services/disk-monitor.service';
import { FileLockService } from '../services/file-lock.service';

@Injectable()
export class StorageCleanupScheduler {
  private readonly logger = new Logger(StorageCleanupScheduler.name);

  constructor(
    private readonly storageCleanupService: StorageCleanupService,
    private readonly diskMonitorService: DiskMonitorService,
    private readonly fileLockService: FileLockService
  ) {}

  /**
   * 每天凌晨 3 点执行清理任务
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    this.logger.log('Starting scheduled cleanup task');

    try {
      // 执行存储清理
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

      // 检查磁盘状态
      const healthReport = this.diskMonitorService.getHealthReport();

      if (!healthReport.healthy) {
        this.logger.warn(
          `Disk status abnormal: ${healthReport.status.message}`
        );
        this.logger.warn(`Recommendation: ${healthReport.recommendation}`);
      } else {
        this.logger.log(`Disk status normal: ${healthReport.status.message}`);
      }
    } catch (error) {
      this.logger.error('Scheduled cleanup task failed', error.stack);
    }
  }

  /**
   * 每周清理一次过期锁文件
   */
  @Cron(CronExpression.EVERY_WEEK)
  async handleLockCleanup() {
    this.logger.log('Starting expired lock file cleanup');

    try {
      const cleanedCount = await this.fileLockService.cleanupExpiredLocks();

      this.logger.log(
        `Expired lock file cleanup completed: Cleaned ${cleanedCount} lock files`
      );
    } catch (error) {
      this.logger.error('Expired lock file cleanup failed', error.stack);
    }
  }

  /**
   * 每小时检查一次磁盘状态（仅在警告状态下记录）
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleDiskMonitor() {
    try {
      const healthReport = this.diskMonitorService.getHealthReport();

      if (healthReport.status.warning || healthReport.status.critical) {
        this.logger.warn(`Disk status check: ${healthReport.status.message}`);
        this.logger.warn(`Recommendation: ${healthReport.recommendation}`);
      }
    } catch (error) {
      this.logger.error('Disk status check failed', error.stack);
    }
  }
}
