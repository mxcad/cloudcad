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
/////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserCleanupService } from '../services/user-cleanup.service';

@Injectable()
export class UserCleanupScheduler {
  private readonly logger = new Logger(UserCleanupScheduler.name);

  constructor(private readonly userCleanupService: UserCleanupService) {}

  /**
   * 每天凌晨 4 点执行用户数据清理任务
   * 在 StorageCleanupScheduler 之后执行，避免竞争
   */
  @Cron('0 4 * * *')
  async handleCleanup() {
    this.logger.log('Starting scheduled user cleanup task');

    try {
      const result = await this.userCleanupService.cleanupExpiredUsers();

      if (result.success) {
        this.logger.log(
          `Scheduled user cleanup completed: Processed ${result.processedUsers} users, ` +
            `deleted ${result.deletedMembers} members, ${result.deletedProjects} projects, ` +
            `${result.deletedAuditLogs} audit logs, marked ${result.markedForStorageCleanup} storage`
        );
      } else {
        this.logger.warn(
          `Scheduled user cleanup completed with errors: Processed ${result.processedUsers} users, ` +
            `${result.errors.length} errors`
        );
        result.errors.forEach((error, index) => {
          this.logger.warn(
            `Error ${index + 1} [${error.userId}]: ${error.message}`
          );
        });
      }
    } catch (error) {
      this.logger.error('Scheduled user cleanup task failed', error.stack);
    }
  }
}
