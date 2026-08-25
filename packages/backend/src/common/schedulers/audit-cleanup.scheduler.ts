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
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../../task-run/task-run.constants';

@Injectable()
export class AuditCleanupScheduler {
  private readonly logger = new Logger(AuditCleanupScheduler.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
    private readonly alertService: AlertService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly taskRunService: TaskRunService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.AUDIT_CLEANUP.LOGS, {
      description: '审计日志清理',
      execute: () => this.cleanupAuditLogsTask(),
    });
    // 后台任务执行记录保留期清理（#271）
    this.taskRunService.register(TASK_NAMES.AUDIT_CLEANUP.RUNS, {
      description: '后台任务执行记录保留期清理',
      execute: () => this.cleanupTaskRunsTask(),
    });
  }

  /**
   * 每天凌晨 2 点执行审计日志清理
   * 可通过 AUDIT_LOG_RETENTION_DAYS 环境变量配置保留天数（默认 180 天，#207）
   * 可通过 AUDIT_ARCHIVE_ENABLED 环境变量启用归档（默认 false）
   * fail-closed（#223 决议）：归档未实现，AUDIT_ARCHIVE_ENABLED=true 时仅告警并跳过删除，日志零丢失
   * 同 cron 顺带清理 TaskRun 保留期记录（#271：TASK_RUN_RETENTION_DAYS 默认 30 天）
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
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

    const retentionDays = this.configService.get<number>(
      'audit.retentionDays',
      180
    );
    const archiveEnabled = this.configService.get<boolean>(
      'AUDIT_ARCHIVE_ENABLED',
      false
    );
    const archivePath = this.configService.get<string>(
      'AUDIT_ARCHIVE_PATH',
      'data/archives/audit-logs'
    );

    this.logger.log(
      `开始执行审计日志清理任务 (保留天数: ${retentionDays}, 归档: ${archiveEnabled})`
    );

    try {
      await this.taskRunService.run(
        TASK_NAMES.AUDIT_CLEANUP.LOGS,
        () => this.cleanupAuditLogsTask(retentionDays, archiveEnabled, archivePath)
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
   * 复用本调度器的 auditCleanupEnabled 开关，保留期由 TASK_RUN_RETENTION_DAYS 配置（默认 30 天）
   */
  private async cleanupTaskRunsTask(): Promise<void> {
    const retentionDays = this.configService.get<number>(
      'taskRun.retentionDays',
      30
    );
    const deletedCount = await this.taskRunService.cleanupOldRuns(retentionDays);
    if (deletedCount > 0) {
      this.logger.log(
        `TaskRun 保留期清理完成: 删除了 ${deletedCount} 条记录 (保留天数: ${retentionDays})`
      );
    }
  }

  /**
   * 审计日志清理裸执行（定时 + 手动触发共用）
   * fail-closed（#223）：归档未实现时跳过删除，日志零丢失
   */
  private async cleanupAuditLogsTask(
    retentionDays?: number,
    archiveEnabled?: boolean,
    archivePath?: string
  ): Promise<void> {
    const days =
      retentionDays ??
      this.configService.get<number>('audit.retentionDays', 180);
    const archive = archiveEnabled ?? false;
    const path =
      archivePath ?? this.configService.get<string>('AUDIT_ARCHIVE_PATH', 'data/archives/audit-logs');

    if (archive) {
      this.logger.warn(
        `归档功能尚未实现（#223 fail-closed 决议）：AUDIT_ARCHIVE_ENABLED=true 时跳过审计日志删除，日志零丢失。` +
          `真归档将复用 #207 阶段 2 导出链路。归档路径配置: ${path}，保留天数: ${days}`
      );
      return;
    }

    const startTime = Date.now();
    const deletedCount = await this.auditLogService.cleanupOldLogs(days);

    const duration = Date.now() - startTime;
    this.logger.log(
      `审计日志清理完成: 删除了 ${deletedCount} 条记录, 耗时 ${duration}ms`
    );
  }

  /**
   * 手动触发清理（用于测试或管理员操作）
   * fail-closed（#223）：归档未实现时同样跳过删除，日志零丢失
   */
  async manualCleanup(retentionDays?: number): Promise<number> {
    const archive = this.configService.get<boolean>(
      'AUDIT_ARCHIVE_ENABLED',
      false
    );
    if (archive) {
      const path = this.configService.get<string>(
        'AUDIT_ARCHIVE_PATH',
        'data/archives/audit-logs'
      );
      this.logger.warn(
        `归档功能尚未实现（#223 fail-closed 决议）：手动清理跳过删除，日志零丢失。归档路径配置: ${path}`
      );
      return 0;
    }

    const days =
      retentionDays ||
      this.configService.get<number>('audit.retentionDays', 180);
    this.logger.log(`手动触发审计日志清理 (保留天数: ${days})`);
    return this.auditLogService.cleanupOldLogs(days);
  }

  /**
   * 最小定时任务失败钩子（#245）：task_run_failed 告警，source = scheduler:audit-cleanup
   */
  private async raiseTaskFailed(error: unknown): Promise<void> {
    try {
    await this.alertService.raise({
      source: 'scheduler:audit-cleanup',
      messageKey: 'task_run_failed',
      // P2：低频清理失败（静默记录，人工排查）
      level: AlertLevel.P2,
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
