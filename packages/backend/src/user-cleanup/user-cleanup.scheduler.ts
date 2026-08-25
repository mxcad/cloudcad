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
import { UserCleanupService } from './user-cleanup.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';

@Injectable()
export class UserCleanupScheduler {
  private readonly logger = new Logger(UserCleanupScheduler.name);

  constructor(
    private readonly userCleanupService: UserCleanupService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.USER_CLEANUP.USERS, {
      description: '过期用户数据清理',
      execute: () => this.userCleanupTask(),
    });
  }

  /**
   * 每天凌晨 4 点执行用户数据清理任务
   * 在 StorageCleanupScheduler 之后执行，避免竞争
   */
  @Cron('0 4 * * *')
  async handleCleanup() {
    const enabled = await this.runtimeConfigService.getValue<boolean>(
      TASK_ENABLED_KEYS.USER_CLEANUP,
      true
    );
    if (!enabled) {
      this.logger.log('用户清理已禁用，跳过');
      return;
    }

    this.logger.log('Starting scheduled user cleanup task');

    try {
      await this.taskRunService.run(TASK_NAMES.USER_CLEANUP.USERS, () =>
        this.userCleanupTask()
      );
    } catch (error) {
      this.logger.error('Scheduled user cleanup task failed', error.stack);
      await this.raiseTaskFailed(error);
    }
  }

  /**
   * 用户数据清理裸执行（定时 + 手动触发共用）
   */
  private async userCleanupTask(): Promise<void> {
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
  }

  /**
   * 定时任务失败钩子（#245 模式）：task_run_failed 告警，source = scheduler:user-cleanup
   */
  private async raiseTaskFailed(error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:user-cleanup',
        messageKey: 'task_run_failed',
        // P2：低频清理失败（静默记录，人工排查）
        level: AlertLevel.P2,
        message: `定时任务 user-cleanup 失败（handleCleanup）: ${error instanceof Error ? error.message : String(error)}`,
        detail: {
          task: 'handleCleanup',
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
