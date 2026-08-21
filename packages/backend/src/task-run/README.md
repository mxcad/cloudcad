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

执行记录默认保留 **30 天**（`TASK_RUN_RETENTION_DAYS`，configuration.ts / .env.example），`cleanupOldRuns(retentionDays)` 由调度器定时清理（#271）。
