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
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { CacheMonitorService } from '../../cache-architecture/services/cache-monitor.service';
import { CACHE_ALERT_KEYS } from '../../cache-architecture/services/cache-monitor.service';
import type { CacheWarningItem } from '../../cache-architecture/services/cache-monitor.service';
import { AlertService } from '../../alert/alert.service';
import { AlertLevel } from '../../alert/enums/alert.enum';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { TaskRunService } from '../../task-run/task-run.service';
import { TASK_ENABLED_KEYS, TASK_NAMES } from '../../task-run/task-run.constants';

@Injectable()
export class CacheCleanupScheduler {
  private readonly logger = new Logger(CacheCleanupScheduler.name);

  constructor(
    private readonly cacheService: PermissionCacheService,
    private readonly cacheMonitorService: CacheMonitorService,
    private readonly alertService: AlertService,
    private readonly runtimeConfigService: RuntimeConfigService,
    private readonly taskRunService: TaskRunService
  ) {
    // 手动触发注册表（#210）
    this.taskRunService.register(TASK_NAMES.CACHE_CLEANUP.WARNING_CHECK, {
      description: '缓存监控告警检查',
      execute: () => this.cacheWarningCheckTask(),
    });
    this.taskRunService.register(TASK_NAMES.CACHE_CLEANUP.STATS_LOG, {
      description: '权限缓存统计记录',
      execute: () => this.logCacheStatsTask(),
    });
    this.taskRunService.register(TASK_NAMES.CACHE_CLEANUP.HEALTH_CHECK, {
      description: '缓存健康状态记录',
      execute: () => this.logHealthStatusTask(),
    });
  }

  private async isEnabled(key: string): Promise<boolean> {
    return this.runtimeConfigService.getValue<boolean>(key, true);
  }

  /**
   * 每 10 分钟执行一次缓存清理
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCacheCleanup() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.CACHE_CLEANUP);
    if (!enabled) {
      this.logger.log('缓存清理已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.CACHE_CLEANUP.WARNING_CHECK,
        () => this.cacheWarningCheckTask()
      );
    } catch (error) {
      this.logger.error(`缓存清理失败: ${error.message}`, error.stack);
      await this.raiseTaskFailed('handleCacheCleanup', error);
    }
  }

  /**
   * 缓存监控告警检查裸执行（定时 + 手动触发共用）
   */
  private async cacheWarningCheckTask(): Promise<void> {
    // 检查缓存警告并上报告警（#242 定案：cache-monitor 触发源）
    const warnings = await this.cacheMonitorService.checkWarningItems();
    await this.raiseCacheWarnings(warnings);
    if (warnings.length > 0) {
      this.logger.warn(
        `缓存警告: ${warnings.map((w) => w.message).join('; ')}`
      );
    }
  }

  /**
   * 缓存告警上报与自动恢复（#242 定案）
   * 有告警 → raise；无告警 → resolveBySourceKey 自动恢复
   */
  private async raiseCacheWarnings(
    warnings: CacheWarningItem[]
  ): Promise<void> {
    const activeKeys = new Set(warnings.map((w) => w.key));

    for (const warning of warnings) {
      try {
        await this.alertService.raise({
          source: 'cache-monitor',
          messageKey: warning.key,
          level: warning.level,
          message: warning.message,
          detail: warning.detail,
        });
      } catch (alertError) {
        this.logger.error(
          `缓存告警上报失败: ${alertError.message}`,
          alertError.stack
        );
      }
    }

    for (const key of Object.values(CACHE_ALERT_KEYS)) {
      if (activeKeys.has(key)) continue;
      try {
        await this.alertService.resolveBySourceKey('cache-monitor', key);
      } catch (alertError) {
        this.logger.error(
          `缓存告警恢复失败: ${alertError.message}`,
          alertError.stack
        );
      }
    }
  }

  /**
   * 每小时记录缓存统计信息
   */
  @Cron(CronExpression.EVERY_HOUR)
  async logCacheStats() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.CACHE_CLEANUP);
    if (!enabled) {
      this.logger.log('缓存统计记录已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(TASK_NAMES.CACHE_CLEANUP.STATS_LOG, () =>
        this.logCacheStatsTask()
      );
    } catch (error) {
      this.logger.error(`记录缓存统计失败: ${error.message}`, error.stack);
      await this.raiseTaskFailed('logCacheStats', error);
    }
  }

  /**
   * 权限缓存统计记录裸执行（定时 + 手动触发共用）
   */
  private async logCacheStatsTask(): Promise<void> {
    const stats = await this.cacheService.getStats();
    this.logger.log(
      `权限缓存统计 - 缓存条目: ${stats.totalEntries}, 容量: ${stats.capacity}, 内存使用: ${stats.memoryUsage}, 命中率: ${stats.hitRate.toFixed(2)}%`
    );
  }

  /**
   * 每天记录健康状态
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async logHealthStatus() {
    const enabled = await this.isEnabled(TASK_ENABLED_KEYS.CACHE_CLEANUP);
    if (!enabled) {
      this.logger.log('缓存健康状态记录已禁用，跳过');
      return;
    }

    try {
      await this.taskRunService.run(
        TASK_NAMES.CACHE_CLEANUP.HEALTH_CHECK,
        () => this.logHealthStatusTask()
      );
    } catch (error) {
      this.logger.error(`记录健康状态失败: ${error.message}`, error.stack);
      await this.raiseTaskFailed('logHealthStatus', error);
    }
  }

  /**
   * 缓存健康状态记录裸执行（定时 + 手动触发共用）
   */
  private async logHealthStatusTask(): Promise<void> {
    const healthStatus = await this.cacheMonitorService.getHealthStatus();
    this.logger.log(
      `缓存健康状态 - L1: ${healthStatus.L1.status}, L2: ${healthStatus.L2.status}, 整体: ${healthStatus.overall}`
    );
  }

  /**
   * 最小定时任务失败钩子（#245）：task_run_failed 告警，source = scheduler:cache-cleanup
   */
  private async raiseTaskFailed(task: string, error: unknown): Promise<void> {
    try {
      await this.alertService.raise({
        source: 'scheduler:cache-cleanup',
        messageKey: 'task_run_failed',
        // P1：单任务失败（下一轮定时重试）
        level: AlertLevel.P1,
        message: `定时任务 cache-cleanup 失败（${task}）: ${error instanceof Error ? error.message : String(error)}`,
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
