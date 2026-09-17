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
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../audit/audit-log.service';
import { AuditArchiveService } from '../../audit/audit-archive.service';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../../task-run/task-run.constants';
import { CleanupMetricsService } from '../../metrics/cleanup-metrics.service';

/**
 * 定时 cron 表达式：@Cron 装饰器与手动触发注册表（任务清单展示）共用同一来源，防止漂移
 * 时区 Asia/Shanghai 在 @Cron 装饰器处声明
 */
const AUDIT_CLEANUP_CRON = CronExpression.EVERY_DAY_AT_2AM;

@Injectable()
export class AuditCleanupScheduler {
  private readonly logger = new Logger(AuditCleanupScheduler.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly auditArchiveService: AuditArchiveService,
    private readonly configService: ConfigService,
    private readonly alertService: AlertService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly taskRunService: TaskRunService,
    private readonly cleanupMetrics: CleanupMetricsService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.AUDIT_CLEANUP.LOGS, {
      description: '审计日志清理',
      schedule: AUDIT_CLEANUP_CRON,
      scheduleLabel: '每天 02:00（北京时间）',
      execute: () => this.cleanupAuditLogsTask(),
    });
    // 后台任务执行记录保留期清理（#271）
    this.taskRunService.register(TASK_NAMES.AUDIT_CLEANUP.RUNS, {
      description: '后台任务执行记录保留期清理',
      // 无独立 @Cron，随审计日志清理同 cron 顺带执行（#271）
      schedule: AUDIT_CLEANUP_CRON,
      scheduleLabel: '每天 02:00（北京时间）',
      execute: () => this.cleanupTaskRunsTask(),
    });
  }

  /**
   * 每天凌晨 2 点执行审计日志清理
   * 可通过 AUDIT_LOG_RETENTION_DAYS 环境变量配置保留天数（#322：默认 183 天，>6 个月整）
   * 可通过 AUDIT_ARCHIVE_ENABLED 环境变量启用归档（#322：默认 false，等保验收需开启）：
   * true 时超期记录先按月归档 CSV + SHA-256 清单，全部成功才删库（fail-closed）；
   * false 时直接按保留天数删除。
   * 同 cron 顺带清理 TaskRun 保留期记录（#271/#326：TASK_RUN_RETENTION_DAYS 默认 180 天）
   */
  @Cron(AUDIT_CLEANUP_CRON, {
    name: 'audit-cleanup',
    timeZone: 'Asia/Shanghai',
  })
  async cleanupOldAuditLogs(): Promise<void> {
    const enabled = await this.runtimeConfigService.getValue<boolean>(
      TASK_ENABLED_KEYS.AUDIT_CLEANUP,
      true
    );
    if (!enabled) {
      this.logger.log('审计日志清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.AUDIT_CLEANUP.LOGS,
        () => this.cleanupAuditLogsTask()
      );
      await this.cleanupTaskRunsTask();
    } catch (error) {
      this.logger.error(`审计日志清理失败: ${error.message}`, error.stack);
      await this.raiseTaskFailed(error);
      throw error;
    }
  }

  /**
   * TaskRun 保留期清理裸执行（#271，定时 + 手动触发共用）
   * 复用本调度器的 auditCleanupEnabled 开关，保留期由 TASK_RUN_RETENTION_DAYS 配置（默认 180 天，#326）
   */
  private async cleanupTaskRunsTask(): Promise<void> {
    const startedAt = Date.now();
    const retentionDays = this.configService.get<number>(
      'taskRun.retentionDays',
      180
    );
    const deletedCount = await this.taskRunService.cleanupOldRuns(retentionDays);
    const durationSeconds = (Date.now() - startedAt) / 1000;

    // 指标 + 结构化日志双写（#325）
    this.cleanupMetrics.observe({
      task: TASK_NAMES.AUDIT_CLEANUP.RUNS,
      recordsDeleted: deletedCount,
      durationSeconds,
    });

    if (deletedCount > 0) {
      this.logger.log(
        `TaskRun 保留期清理完成: 删除了 ${deletedCount} 条记录 (保留天数: ${retentionDays})`
      );
    }
  }

  /**
   * 审计日志清理裸执行（定时 + 手动触发共用，#322）
   * archiveEnabled=true：先按月归档 CSV + SHA-256 清单（fail-closed，归档失败抛出→记录保留+P1 告警）；
   * false：直接按保留天数删除
   */
  private async cleanupAuditLogsTask(): Promise<void> {
    await this.runAuditCleanup();
  }

  /**
   * 清理流程单一实现（#322 code-review 收敛）：days 解析 → 归档/直删分支 → 指标埋点。
   * @returns 本次删除的记录数
   */
  private async runAuditCleanup(retentionDays?: number): Promise<number> {
    const days =
      retentionDays ??
      this.configService.get<number>('audit.retentionDays', 183);
    const archiveEnabled = this.configService.get<boolean>(
      'audit.archiveEnabled',
      false
    );
    this.logger.log(
      `开始执行审计日志清理任务 (保留天数: ${days}, 归档: ${archiveEnabled})`
    );

    const startTime = Date.now();
    const deletedCount = archiveEnabled
      ? (await this.auditArchiveService.archiveExpiredLogs(days)).deletedCount
      : await this.auditLogService.cleanupOldLogs(days);

    const durationSeconds = (Date.now() - startTime) / 1000;
    this.logger.log(
      `审计日志清理完成: 删除了 ${deletedCount} 条记录, 耗时 ${durationSeconds}s`
    );

    this.cleanupMetrics.observe({
      task: TASK_NAMES.AUDIT_CLEANUP.LOGS,
      recordsDeleted: deletedCount,
      durationSeconds,
    });

    return deletedCount;
  }

  /**
   * 手动触发清理（用于测试或管理员操作，#322 与定时同语义）
   */
  async manualCleanup(retentionDays?: number): Promise<number> {
    return this.runAuditCleanup(retentionDays);
  }

  /**
   * 定时任务完全失败钩子：task_run_failed 告警。
   * #245 首建时为 P2，#325 / ADR-0055 §7 升级为 P1（完全失败需聚合邮件提醒）。
   */
  private async raiseTaskFailed(error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:audit-cleanup',
        messageKey: 'task_run_failed',
        // P1：单任务完全失败（15min 同源聚合）
        level: AlertLevel.P1,
        message: `定时任务 audit-cleanup 失败（cleanupOldAuditLogs）: ${error instanceof Error ? error.message : String(error)}`,
        detail: {
          task: 'cleanupOldAuditLogs',
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
