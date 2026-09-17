# 后台任务执行记录模块（task-run）

## 概述

记录后台任务（调度器/cron 触发的任务）的每次执行结果，供监控页展示与人工重试（#210）。由 `TaskRunService.run()` 统一包装任务执行：成功记 `SUCCESS`、异常记 `FAILED` 并上报 `task_run_failed` 告警（AlertService）。

## 数据模型（schema 单一源）

`TaskRun`：`taskName`、`status`（`TaskRunStatus`：SUCCESS / FAILED）、`trigger`（`TaskRunTrigger`：SCHEDULED / MANUAL）、`startedAt`/`finishedAt`/`durationMs`、`message`/`error`、`meta Json?`。

## API 端点（TaskRunController，前缀 `admin/tasks`）

类级 `SYSTEM_MONITOR`；`POST run` 额外要求 `SYSTEM_ADMIN`。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/admin/tasks/runs` | SYSTEM_MONITOR | 执行记录分页（filters: taskName/status/trigger，page/limit 默认 20） |
| POST | `/api/v1/admin/tasks/run` | SYSTEM_ADMIN | 手动触发指定后台任务（记录 MANUAL 触发） |

## 保留与清理

执行记录默认保留 **180 天**（`TASK_RUN_RETENTION_DAYS`，configuration.ts / .env.example），`cleanupOldRuns(retentionDays)` 由调度器随审计清理 cron 每日执行（#271）。

### 保留期演进（#326）

- 初始默认 30 天（#271），后延长至 **180 天**：为运维排查保留更长执行历史窗口，并与审计日志保留策略（#207/ADR-0045，同量级）及等保要求对齐。
- 清理执行细节归应用日志长期留存，不单独建清理记录表。

### DB 增长可控性

单行 TaskRun 记录体量很小（十几个短字段 + 可空 `meta Json?`，通常 < 1KB）。按每日数十次任务执行估算，180 天窗口内总量在万行级、MB 级以内，增长可控；删除按 `startedAt < cutoff` 走 `@@index([startedAt])` 索引，不会全表扫描。

### 存量数据

切换默认值后无需迁移脚本：首轮定时清理自然以新保留期为 cutoff，只删除 `startedAt` 早于 180 天前的旧记录。已显式配置旧值（如 `TASK_RUN_RETENTION_DAYS=30`）的部署不受影响，可按需调整。
