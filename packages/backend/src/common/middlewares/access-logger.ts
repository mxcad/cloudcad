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

import { mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { pino } from 'pino';
import type { Logger as PinoLogger } from 'pino';
import { PROJECT_ROOT } from '../../config/configuration';

/**
 * 访问日志独立落盘流（ADR-0055 §1）：
 * 输出到 data/logs/backend/access-YYYY-MM-DD.log，按天轮转，保留 LOG_RETENTION_DAYS 天，
 * 与应用日志 app-*.log 同一 pino-roll 机制但独立文件。
 *
 * 与主日志（nestjs-pino 多流 stdout + app.log）解耦，避免访问日志混入业务日志，
 * 便于 Promtail 按 access.log 独立采集（标签 log_type=access）。
 */

/** 访问日志默认级别（不受 NODE_ENV 影响，始终记录 info 以覆盖审计需求） */
const ACCESS_LOG_LEVEL = 'info';

export interface AccessLoggerOptions {
  /** 日志根目录（绝对路径，默认 data/logs 解析到项目根） */
  dir?: string;
  /** 保留天数（默认 180，与 LOG_RETENTION_DAYS 对齐） */
  retentionDays?: number;
  /** 是否启用（LOG_ACCESS_ENABLED，默认 true） */
  enabled?: boolean;
}

let cachedLogger: PinoLogger | null = null;

/**
 * 解析访问日志根目录为绝对路径（相对路径基于项目根解析，与 app.module 的 LOG_DIR 语义一致）。
 */
function resolveAccessLogDir(rawDir: string): string {
  const resolved = resolve(rawDir);
  // 相对路径（不以盘符/斜杠开头）基于项目根解析
  // （统一使用 configuration 导出的 PROJECT_ROOT，避免 __dirname 层级导致解析到错误位置）
  if (/^([a-zA-Z]:)?[\\/]/.test(rawDir)) {
    return resolved;
  }
  return resolve(PROJECT_ROOT, rawDir);
}

/**
 * 创建（或复用）访问日志 pino 实例。
 * 测试环境通过传入 enabled:false 或覆盖 logger 避免真实轮转子进程。
 */
export function getAccessLogger(options: AccessLoggerOptions = {}): PinoLogger {
  // LOG_ACCESS_ENABLED（默认开启）全局开关：关闭时返回 no-op logger，不产生文件/子进程
  const enabled = options.enabled ?? process.env.LOG_ACCESS_ENABLED !== 'false';
  if (!enabled) {
    return pino({ level: 'silent' });
  }
  if (cachedLogger) return cachedLogger;

  const dir = options.dir ?? process.env.LOG_DIR ?? 'data/logs';
  const retentionDays =
    options.retentionDays ??
    (parseInt(process.env.LOG_RETENTION_DAYS || '180', 10) || 180);

  const logDirAbs = resolveAccessLogDir(dir);
  // 幂等创建 backend 日志目录（权限 0750，等保 8.4.3.3 防篡改）
  mkdirSync(join(logDirAbs, 'backend'), { recursive: true, mode: 0o750 });

  const logger = pino({
    level: ACCESS_LOG_LEVEL,
    // 访问日志为受控单行 JSON，关闭时间自动注入（我们在构建条目时已显式带 time）
    base: undefined,
    timestamp: false,
    transport: {
      target: 'pino-roll',
      options: {
        file: join(logDirAbs, 'backend', 'access.log'),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        mkdir: true,
        // 保留 N 个已轮转文件 + 当前文件（pino-roll@4 用 limit.count）
        limit: { count: retentionDays },
      },
    },
  });

  cachedLogger = logger;
  return logger;
}

/** 供测试重置缓存（避免跨用例复用真实子进程） */
export function resetAccessLoggerCache(): void {
  cachedLogger = null;
}
