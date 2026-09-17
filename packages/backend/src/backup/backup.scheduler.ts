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
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { AppConfig } from '../config/app.config';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { TaskRunService } from '../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../task-run/task-run.constants';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunTrigger } from '../task-run/enums/task-run.enum';
import {
  BackupResult,
  BackupService,
  BackupVerifyError,
} from './backup.service';

/** cron 表达式在类定义期求值，无法注入 ConfigService，直接读 env（默认每日 01:00） */
const BACKUP_CRON = process.env.BACKUP_CRON || '0 1 * * *';

/** 恢复演练 cron（#320，默认每月 1 日 03:00） */
const BACKUP_DRILL_CRON = process.env.BACKUP_DRILL_CRON || '0 3 1 * *';

/** 异地推送告警 source（#319，ADR-0055 §5：推送失败告警 P1） */
const REMOTE_ALERT_SOURCE = 'backup-remote';

/** 审计归档异地同步告警 source（#420，等保 8.1.4.3 异地留存：同步失败告警 P1） */
const AUDIT_ARCHIVE_REMOTE_ALERT_SOURCE = 'audit-archive-remote';

/**
 * 从 cron 表达式推导人类可读描述（任务清单展示）。
 * 仅识别「每天 HH:MM」与「每月 N 日 HH:MM」两种常见形态，其余原样返回表达式。
 * 从实际 env 值推导（而非写死默认值），BACKUP_CRON 被配置覆盖时描述不失真
 */
function describeBackupCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, day, month, weekday] = parts;
  const isTime = hour !== '*' && minute !== '*';
  if (isTime && day === '*' && month === '*' && weekday === '*') {
    return `每天 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  if (isTime && day !== '*' && month === '*' && weekday === '*') {
    return `每月 ${day} 日 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  return cron;
}

/**
 * 数据库备份定时任务（#318）+ 异地推送（#319）+ 恢复演练定时任务（#320）
 *
 * - 每日 01:00（BACKUP_CRON 可配）全量 pg_dump -Fc，成功后按 BACKUP_REMOTE_TYPE 异地推送
 * - 每月 1 日 03:00（BACKUP_DRILL_CRON 可配）恢复演练（BACKUP_DRILL_ENABLED 开关）
 * - 经 TaskRunService.run() 记录成功/失败/耗时（失败自动获得告警）
 * - 双开关：环境级 BACKUP_ENABLED 硬开关 + 运行时 backupEnabled 开关（管理界面可动态禁用）
 */
@Injectable()
export class BackupScheduler {
  private readonly logger = new Logger(BackupScheduler.name);

  constructor(
    private readonly backupService: BackupService,
    private readonly configService: ConfigService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly alertService: AlertService,
    private readonly taskRunService: TaskRunService
  ) {
    // 手动触发注册表（#210 模式）：裸执行函数由 TaskRunService.run 统一包装记录
    this.taskRunService.register(TASK_NAMES.BACKUP.DATABASE, {
      description: '数据库全量备份（pg_dump）',
      // BACKUP_CRON 为 env 可配（默认每日 01:00），与 @Cron 同源
      schedule: BACKUP_CRON,
      scheduleLabel: describeBackupCron(BACKUP_CRON),
      execute: () => this.backupTask(),
    });
    this.taskRunService.register(TASK_NAMES.BACKUP.RESTORE_DRILL, {
      description: '数据库恢复演练（临时库恢复 + 行数校验）',
      // BACKUP_DRILL_CRON 为 env 可配（默认每月 1 日 03:00），与 @Cron 同源
      schedule: BACKUP_DRILL_CRON,
      scheduleLabel: describeBackupCron(BACKUP_DRILL_CRON),
      execute: () => this.backupService.restoreDrill(),
    });
    // #319：异地推送可独立手动触发（重推最新备份），与备份任务分开看成败
    // 无独立 @Cron（随备份成功后执行），schedule 省略 → API 返回 null
    this.taskRunService.register(TASK_NAMES.BACKUP.REMOTE_PUSH, {
      description: '推送最新备份到异地（按当前 BACKUP_REMOTE_* 配置）',
      execute: () => this.backupService.pushRemote(),
    });
  }

  @Cron(BACKUP_CRON)
  async handleScheduledBackup(): Promise<void> {
    const cfg = this.configService.get<AppConfig['backup']>('backup');
    if (cfg && !cfg.enabled) {
      this.logger.log('备份已通过 BACKUP_ENABLED 禁用，跳过');
      return;
    }

    const enabled = await this.runtimeConfigService.getValue<boolean>(
      TASK_ENABLED_KEYS.BACKUP,
      true
    );
    if (!enabled) {
      this.logger.log('备份已通过运行时开关禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(TASK_NAMES.BACKUP.DATABASE, () =>
        this.backupTask()
      );
    } catch (error) {
      this.logger.error(
        `定时备份任务失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      await this.raiseBackupFailed(error);
      return;
    }

    // #319：每日备份成功后异地推送；失败 P1 告警且不影响本地备份结果
    const remoteCfg = cfg?.remote;
    if (!remoteCfg || remoteCfg.type === 'none') {
      return;
    }
    const remoteType = remoteCfg.type;
    try {
      await this.taskRunService.run(
        TASK_NAMES.BACKUP.REMOTE_PUSH,
        () => this.backupService.pushRemote()
      );
      await this.alertService.resolveBySourceKey(
        REMOTE_ALERT_SOURCE,
        `backup_remote_failed_${remoteType}`
      );
    } catch (error) {
      this.logger.error(
        `异地推送任务失败 (${remoteType}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      await this.raiseRemotePushFailed(error, remoteType);
    }

    // #420：审计归档目录异地同步（复用同一异地通道）。与本地归档→删库解耦：
    // 同步失败只 P1 告警，不影响已完成的本地归档与删库；无归档文件时静默跳过
    try {
      const sync = await this.backupService.pushAuditArchiveRemote();
      if (sync) {
        await this.alertService.resolveBySourceKey(
          AUDIT_ARCHIVE_REMOTE_ALERT_SOURCE,
          `audit_archive_remote_failed_${sync.type}`
        );
      }
    } catch (error) {
      this.logger.error(
        `审计归档异地同步失败 (${remoteType}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      await this.raiseAuditArchiveRemoteFailed(error, remoteType);
    }
  }

  /**
   * 手动触发入口（Controller / 任务注册表共用），记录 MANUAL 触发者
   */
  async runManualBackup(operatorId: string): Promise<BackupResult> {
    return this.taskRunService.run(
      TASK_NAMES.BACKUP.DATABASE,
      () => this.backupTask(),
      { trigger: TaskRunTrigger.MANUAL, triggeredBy: operatorId }
    );
  }

  /**
   * 月度恢复演练定时任务（#320）：BACKUP_DRILL_ENABLED 环境开关，
   * 校验失败/演练失败均产生 P1 告警（source: restore-drill / backup-verify）
   */
  @Cron(BACKUP_DRILL_CRON)
  async handleScheduledRestoreDrill(): Promise<void> {
    const cfg = this.configService.get<AppConfig['backup']>('backup');
    if (cfg && !cfg.drillEnabled) {
      this.logger.log('恢复演练已通过 BACKUP_DRILL_ENABLED 禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(TASK_NAMES.BACKUP.RESTORE_DRILL, () =>
        this.backupService.restoreDrill()
      );
    } catch (error) {
      this.logger.error(
        `恢复演练任务失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      await this.raiseDrillFailed(error);
    }
  }

  /**
   * 裸执行（定时 + 手动触发共用）：不做开关检查、不记 TaskRun
   */
  private async backupTask(): Promise<BackupResult> {
    return this.backupService.backup();
  }

  /**
   * 备份失败钩子（#245 模式）：完整性校验失败走 P1 backup-verify 告警，
   * 其余失败 task_run_failed 告警，source = scheduler:backup
   */
  private async raiseBackupFailed(error: unknown): Promise<void> {
    if (error instanceof BackupVerifyError) {
      await this.raiseAlert(
        'backup-verify',
        'backup_verify_failed',
        AlertLevel.P1,
        error.message,
        error
      );
      return;
    }
    await this.raiseAlert(
      'scheduler:backup',
      'task_run_failed',
      AlertLevel.P2,
      `数据库备份失败: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  /**
   * 恢复演练失败钩子（#320）：P1 告警，source = restore-drill
   */
  private async raiseDrillFailed(error: unknown): Promise<void> {
    await this.raiseAlert(
      'restore-drill',
      'task_run_failed',
      AlertLevel.P1,
      `数据库恢复演练失败: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  /**
   * 异地推送失败钩子（#319）：P1 告警，source = backup-remote，
   * messageKey 按通道类型区分（rsync/oss/s3），去重互不覆盖
   */
  private async raiseRemotePushFailed(
    error: unknown,
    type: 'rsync' | 'oss' | 's3'
  ): Promise<void> {
    await this.raiseAlert(
      REMOTE_ALERT_SOURCE,
      `backup_remote_failed_${type}`,
      AlertLevel.P1,
      `备份异地推送失败 (${type}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      error
    );
  }

  /**
   * 审计归档异地同步失败钩子（#420）：P1 告警，source = audit-archive-remote，
   * messageKey 按通道类型区分（rsync/oss/s3），与备份推送告警去重互不覆盖
   */
  private async raiseAuditArchiveRemoteFailed(
    error: unknown,
    type: 'rsync' | 'oss' | 's3'
  ): Promise<void> {
    await this.raiseAlert(
      AUDIT_ARCHIVE_REMOTE_ALERT_SOURCE,
      `audit_archive_remote_failed_${type}`,
      AlertLevel.P1,
      `审计归档异地同步失败 (${type}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      error
    );
  }

  private async raiseAlert(
    source: string,
    messageKey: string,
    level: AlertLevel,
    message: string,
    error: unknown
  ): Promise<void> {
    try {
      const task =
        source === 'restore-drill'
          ? TASK_NAMES.BACKUP.RESTORE_DRILL
          : source === REMOTE_ALERT_SOURCE
            ? TASK_NAMES.BACKUP.REMOTE_PUSH
            : source === AUDIT_ARCHIVE_REMOTE_ALERT_SOURCE
              ? TASK_NAMES.BACKUP.AUDIT_ARCHIVE_SYNC
              : TASK_NAMES.BACKUP.DATABASE;
      await this.alertService.raise({
        source,
        messageKey,
        level,
        message,
        detail: {
          task,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (alertError) {
      this.logger.error(
        `告警上报失败 (${source}/${messageKey}): ${alertError.message}`,
        alertError.stack
      );
    }
  }
}
