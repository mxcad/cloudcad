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
import type { UserCleanupResult } from './user-cleanup.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';
import {
  CLEANUP_PARTIAL_MESSAGE_KEY,
  CleanupMetricsService,
} from '../metrics/cleanup-metrics.service';

/** errorSummary 明细截断条数：detail 为 Json 字段，防止错误风暴撑爆告警记录 */
const ERROR_SUMMARY_LIMIT = 10;

/**
 * 定时 cron 表达式：@Cron 装饰器与手动触发注册表（任务清单展示）共用同一来源，防止漂移
 */
const USER_CLEANUP_CRON = '0 4 * * *';

@Injectable()
export class UserCleanupScheduler {
  private readonly logger = new Logger(UserCleanupScheduler.name);

  constructor(
    private readonly userCleanupService: UserCleanupService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService,
    private readonly cleanupMetrics: CleanupMetricsService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.USER_CLEANUP.USERS, {
      description: '过期用户数据清理',
      schedule: USER_CLEANUP_CRON,
      scheduleLabel: '每天 04:00',
      execute: () => this.userCleanupTask(),
    });
  }

  /**
   * 每天凌晨 4 点执行用户数据清理任务
   * 在 StorageCleanupScheduler 之后执行，避免竞争
   */
  @Cron(USER_CLEANUP_CRON)
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
    const startedAt = Date.now();
    const result = await this.userCleanupService.cleanupExpiredUsers();
    const durationSeconds = (Date.now() - startedAt) / 1000;

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

    // 指标 + 结构化日志双写（#325）：全部 deleted* 记录数求和（标记存储清理的不计）
    this.cleanupMetrics.observe({
      task: TASK_NAMES.USER_CLEANUP.USERS,
      recordsDeleted: sumDeletedRecords(result),
      durationSeconds,
    });

    if (result.errors.length > 0) {
      await this.raiseCleanupPartial(result);
    }
  }

  /**
   * 部分成功告警（#325 / ADR-0055 §7）：清理已执行且删了部分，但存在按用户失败。
   */
  private async raiseCleanupPartial(result: UserCleanupResult): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:user-cleanup',
        messageKey: CLEANUP_PARTIAL_MESSAGE_KEY,
        // P2：部分成功（每日日报汇总，人工排查）
        level: AlertLevel.P2,
        message: `清理任务部分成功（${TASK_NAMES.USER_CLEANUP.USERS}）: 处理 ${result.processedUsers} 个用户，${result.errors.length} 项失败`,
        detail: {
          task: TASK_NAMES.USER_CLEANUP.USERS,
          errorCount: result.errors.length,
          errorSummary: result.errors
            .slice(0, ERROR_SUMMARY_LIMIT)
            .map((e) => `[${e.userId}] ${e.message}`),
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
   * f17f0a3 曾降级为 P2，#325 / ADR-0055 §7 统一升级为 P1（完全失败需聚合邮件提醒）。
   */
  private async raiseTaskFailed(error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:user-cleanup',
        messageKey: 'task_run_failed',
        // P1：单任务完全失败（15min 同源聚合）
        level: AlertLevel.P1,
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

/** 汇总 UserCleanupResult 中所有 deleted* 计数（markedForStorageCleanup 属标记非删除，不计） */
function sumDeletedRecords(result: UserCleanupResult): number {
  return (
    result.deletedMembers +
    result.deletedProjects +
    result.deletedAuditLogs +
    result.deletedRefreshTokens +
    result.deletedUploadSessions +
    result.deletedConfigLogs +
    result.deletedPaymentOrders +
    result.deletedMemberships +
    result.deletedFileShares +
    result.deletedBatchJobs
  );
}
