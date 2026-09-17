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
import { DatabaseService } from '../database/database.service';
import { TaskRunStatus, TaskRunTrigger } from './enums/task-run.enum';

/**
 * 可手动触发任务注册项（由各调度器在构造时注册裸执行函数）
 */
export interface TaskRunner {
  /** 任务描述（用于手动触发 API 展示） */
  description: string;
  /**
   * 定时 cron 表达式（与 @Cron 装饰器同源，用于任务清单展示）。
   * 省略 = 无独立定时（随宿主任务执行或仅手动触发），API 返回 null
   */
  schedule?: string;
  /**
   * 定时的人类可读描述（任务清单主展示，如「每天 02:00」）。
   * 省略 = 无独立定时，API 返回 null
   */
  scheduleLabel?: string;
  /** 裸执行函数：不做开关检查、不做 TaskRun 记录，由 TaskRunService.run 统一包装 */
  execute: () => Promise<unknown>;
}

export interface RunTaskMeta {
  trigger?: TaskRunTrigger;
  triggeredBy?: string;
}

/**
 * 后台任务执行记录服务（#210）
 *
 * 职责：
 * 1. run()：统一包装任务执行，记录成功/失败 + 耗时 + 错误摘要（成功也记录，用于监控"任务是否按计划运行"）
 * 2. 手动触发注册表：各调度器注册裸执行函数，admin 手动触发 API 通过注册表分发
 * 3. findRecent()：查询最近任务状态列表（SYSTEM_MONITOR）
 *
 * 记录失败不阻塞业务：DB 写入异常仅记日志，不影响任务本身执行与报错
 */
@Injectable()
export class TaskRunService {
  private readonly logger = new Logger(TaskRunService.name);
  private readonly runners = new Map<string, TaskRunner>();

  constructor(private readonly prisma: DatabaseService) {}

  register(taskName: string, runner: TaskRunner): void {
    if (this.runners.has(taskName)) {
      this.logger.warn(`任务 ${taskName} 重复注册，覆盖旧 runner`);
    }
    this.runners.set(taskName, runner);
  }

  getRunner(taskName: string): TaskRunner | undefined {
    return this.runners.get(taskName);
  }

  listRunners(): {
    taskName: string;
    description: string;
    schedule: string | null;
    scheduleLabel: string | null;
  }[] {
    return [...this.runners.entries()].map(([taskName, runner]) => ({
      taskName,
      description: runner.description,
      schedule: runner.schedule ?? null,
      scheduleLabel: runner.scheduleLabel ?? null,
    }));
  }

  /**
   * 执行任务并记录 TaskRun（成功 + 失败 + 耗时 + 错误摘要）
   * 失败时记录后重新抛出，由调用方（调度器）负责上报告警（#245 模式）
   */
  async run<T>(
    taskName: string,
    taskFn: () => Promise<T>,
    meta: RunTaskMeta = {}
  ): Promise<T> {
    const startedAt = new Date();
    const startMs = Date.now();
    const trigger = meta.trigger ?? TaskRunTrigger.SCHEDULED;
    const triggeredBy = meta.triggeredBy;

    try {
      const result = await taskFn();
      await this.record({
        taskName,
        status: TaskRunStatus.SUCCESS,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startMs,
        trigger,
        triggeredBy,
      });
      return result;
    } catch (error) {
      await this.record({
        taskName,
        status: TaskRunStatus.FAILED,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startMs,
        trigger,
        triggeredBy,
        errorSummary: this.summarizeError(error),
      });
      throw error;
    }
  }

  /**
   * 分页查询任务最近执行记录，按开始时间倒序
   */
  async findRecent(
    filters: {
      taskName?: string;
      status?: TaskRunStatus;
      trigger?: TaskRunTrigger;
    },
    pagination: { page: number; limit: number }
  ) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    const where: {
      taskName?: string;
      status?: TaskRunStatus;
      trigger?: TaskRunTrigger;
    } = {};
    if (filters.taskName) where.taskName = filters.taskName;
    if (filters.status) where.status = filters.status;
    if (filters.trigger) where.trigger = filters.trigger;

    const [data, total] = await Promise.all([
      this.prisma.taskRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.taskRun.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 清理超过保留期的 TaskRun 记录（#271 无界增长治理；#326 默认保留 180 天）。
   * 按 startedAt 删除（已具备 [taskName, startedAt] / [status, startedAt] 索引前缀；
   * 保留期删除以 startedAt 单列为径，schema 已补 @@index([startedAt])）。
   * 失败不抛出：清理属后台运维，不影响主流程（记录失败仅记日志，与 record() 一致）。
   */
  async cleanupOldRuns(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.taskRun.deleteMany({
        where: { startedAt: { lt: cutoff } },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `清理 TaskRun 保留期失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      return 0;
    }
  }

  private async record(input: {
    taskName: string;
    status: TaskRunStatus;
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    trigger: TaskRunTrigger;
    triggeredBy?: string;
    errorSummary?: string;
  }): Promise<void> {
    try {
      await this.prisma.taskRun.create({
        data: {
          taskName: input.taskName,
          status: input.status,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          durationMs: input.durationMs,
          trigger: input.trigger,
          triggeredBy: input.triggeredBy,
          errorSummary: input.errorSummary,
        },
      });
    } catch (error) {
      this.logger.error(
        `记录 TaskRun 失败 (${input.taskName}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  private summarizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.length > 500 ? message.slice(0, 500) : message;
  }
}
