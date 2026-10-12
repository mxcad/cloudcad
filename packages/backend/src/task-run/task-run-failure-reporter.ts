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
import { AlertService } from '../alert/alert.service';
import { TASK_RUN_FAILED_KEY, TASK_RUN_FAILED_LEVEL } from '../alert/enums/alert.enum';

export interface TaskRunFailureReport {
  /** 告警 source（消费者身份，如 'scheduler:billing' / 'task-run:manual' / 'restore-drill'） */
  source: string;
  /** 任务名（进 detail.task；必须与实际执行的任务名一致——1 参硬编码变体漂移即在此） */
  task: string;
  error: unknown;
  /**
   * 自定义消息前缀（真 adapter 措辞：手动触发/备份/演练）。
   * 省略时默认 `定时任务 {source 去 scheduler: 前缀} 失败（{task}）`
   */
  messagePrefix?: string;
  /** 附加 detail 字段（如手动触发的 triggeredBy） */
  extraDetail?: Record<string, string | number | boolean | null>;
}

/**
 * TaskRun 失败告警上报器 —— #245 模式的唯一出口。
 *
 * 各消费者的私有 raiseTaskFailed 副本曾是同一协议的 8 份拷贝：
 * alertService.raise({ source, messageKey: 'task_run_failed',
 * level: TASK_RUN_FAILED_LEVEL, message: 前缀 + 错误文本,
 * detail: { task, error } }) + 告警失败仅记日志不抛出。
 * 漂移已出现：storage-cleanup 用字面量 AlertLevel.P1 而非 TASK_RUN_FAILED_LEVEL；
 * audit/user-cleanup 的 1 参签名把任务名硬编码进消息（重命名任务会静默写错
 * detail.task）。协议（级别单点 / messageKey / detail 形状 / 错误文本提取 /
 * 上报失败兜底）收敛于此，消费者只提供 source + task + error。
 */
@Injectable()
export class TaskRunFailureReporter {
  private readonly logger = new Logger(TaskRunFailureReporter.name);

  constructor(private readonly alertService: AlertService) {}

  async reportTaskFailed(report: TaskRunFailureReport): Promise<void> {
    const errorText =
      report.error instanceof Error
        ? report.error.message
        : String(report.error);
    try {
      await this.alertService.raise({
        source: report.source,
        messageKey: TASK_RUN_FAILED_KEY,
        // 级别取 TASK_RUN_FAILED_LEVEL 单点（当前 P1）：单任务完全失败（15min 同源聚合）
        level: TASK_RUN_FAILED_LEVEL,
        message: `${
          report.messagePrefix ??
          defaultTaskFailedPrefix(report.source, report.task)
        }: ${errorText}`,
        detail: {
          task: report.task,
          error: errorText,
          ...report.extraDetail,
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

/**
 * 默认消息前缀：`定时任务 {name} 失败（{task}）`。
 * name = source 去 'scheduler:' 前缀（既有 scheduler 消费者的措辞均用短名）；
 * 无前缀的 source（cache-monitor）原样使用。
 */
function defaultTaskFailedPrefix(source: string, task: string): string {
  const name = source.startsWith('scheduler:')
    ? source.slice('scheduler:'.length)
    : source;
  return `定时任务 ${name} 失败（${task}）`;
}
