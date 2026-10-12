/**
 * 告警本地枚举副本
 * 从 schema.prisma 手动同步，保持与 Prisma 枚举值一致
 * Prisma 枚举不可直接 @ApiProperty，DTO 使用本地枚举显式转换
 */

export enum AlertLevel {
  /** 即时告警：服务不可用 / 数据丢失 / 磁盘临界 */
  P0 = 'P0',
  /** 聚合告警：单任务失败 / 磁盘告警 / 缓存容量与命中率 */
  P1 = 'P1',
  /** 静默记录：低频清理失败 */
  P2 = 'P2',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

/**
 * 定时任务「完全失败」（task_run_failed）的统一告警级别 = P1。
 * 单点定义，禁止各调度器各自内联 AlertLevel——历史漂移：backup 曾写 P2（仅进每日日报），
 * 致守护每日 pg_dump 全量备份的失败拿不到 15min 聚合邮件（#325 / ADR-0055 §7 已定为 P1）。
 */
export const TASK_RUN_FAILED_LEVEL: AlertLevel = AlertLevel.P1;

/**
 * 定时任务「完全失败」的统一 messageKey = 'task_run_failed'。
 * 与 TASK_RUN_FAILED_LEVEL 成对单点化：去重 / 15min 同源聚合 / 自动恢复都以
 * (source, messageKey) 为键。级别已单点化，若键仍由各调度器内联字符串，任一处
 * 笔误即令该告警无法去重（重复建单）、无法进入同源聚合邮件、也无法按正确键恢复。
 * 单点定义，禁止各调用点内联 'task_run_failed' 字符串。
 */
export const TASK_RUN_FAILED_KEY = 'task_run_failed';
