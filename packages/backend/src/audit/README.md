# 审计模块（audit）

## 概述

审计日志（AuditLog）是"管理员全局合规视图 + 项目成员操作历史视图"的**单表双投影**（ADR-0045）：业务代码只调一次 `audit()`，查询端按视图过滤（全局 vs `projectId`）。动作清单收窄到"改变了系统状态且难以察觉或不可逆"的操作（权限/角色变更、项目生命周期、成员变更、文件危险操作、账号安全）；高频读操作（上传/下载/登录成功）不记。

## 目录结构

```
src/audit/
├── audit-log.controller.ts     # 审计管理员视图（AUDIT_ADMIN/SYSTEM_ADMIN，#321 三权分立）
├── project-audit-log.controller.ts  # 项目操作历史视图（项目成员）
├── project-audit.guard.ts      # 项目归属校验（owner 或项目成员）
├── audit-log.service.ts        # 查询/统计/导出/清理（buildAuditCsv 为导出与归档共享的 CSV 构建）
├── audit-archive.service.ts    # 超期日志按月归档 CSV + SHA-256 清单（#322 fail-closed 删除联动）+ 归档状态校验（#323 删除前置门禁）
├── audit-logger.service.ts     # 审计写入入口（fail-open + 失败打点）
└── dto/                        # 查询/导出/清理（#323）DTO
```

`@Audit` 装饰器位于 `common/decorators/audit.decorator.ts`（#232），供各业务模块声明式埋点；写入统一收敛到 `AuditLogService.log()`。

## 数据模型（schema 单一源）

`AuditLog`：`action`（AuditAction 枚举，35 项）、`resourceType`/`resourceId`、`projectId`（系统级操作可空）、`resourceName`（名称快照，资源删除后记录仍可读）、`params`（结构化 JSON，替代旧 `details` blob）、`ipAddress`/`userAgent`、`success`。索引：`userId`、`projectId`、`[resourceType, resourceId]`、`createdAt`、`action`。

## API 端点

### 管理员视图（AuditLogController，前缀 `audit`，权限按端点声明）

| 方法 | 路径                       | 权限                                   | 说明                                                                                                                 |
| ---- | -------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/v1/audit/logs`       | `AUDIT_ADMIN` 或 `SYSTEM_ADMIN`（ANY） | 分页查询（filters: action/projectId/userId/startDate/endDate/success，page/limit 默认 20）                           |
| GET  | `/api/v1/audit/logs/:id`   | `AUDIT_ADMIN` 或 `SYSTEM_ADMIN`（ANY） | 日志详情                                                                                                             |
| GET  | `/api/v1/audit/statistics` | `AUDIT_ADMIN` 或 `SYSTEM_ADMIN`（ANY） | 统计（startDate/endDate/userId）                                                                                     |
| POST | `/api/v1/audit/export`     | `AUDIT_ADMIN` 或 `SYSTEM_ADMIN`（ANY） | 导出 CSV/Excel（AuditExportDto：filters + `format: csv\|excel`；文件流下载；导出动作本身记一条 `AUDIT_EXPORT` 审计） |
| POST | `/api/v1/audit/cleanup`    | 仅 `AUDIT_ADMIN`                       | 手动触发清理。#321 三权分立：仅审计管理员（等保 8.5.2）；#323 受限删除：`AuditCleanupDto`（`confirm: true` 必填二次确认；`daysToKeep` 可选、缺省取保留期配置且不得低于保留期下限）+ **已归档前置门禁**——目标时间段每个月度分片的 CSV/清单必须存在且哈希一致，否则 `409 AUDIT_NOT_ARCHIVED` 拒删（等保 8.4.3.3）；清理动作本身记一条 `AUDIT_CLEANUP` 审计（含操作者/confirm/范围 cutoff/deletedCount，被拒尝试也留痕） |

### 项目操作历史（ProjectAuditLogController，前缀 `audit`）

| 方法 | 路径                               | 说明                                                                   |
| ---- | ---------------------------------- | ---------------------------------------------------------------------- |
| GET  | `/api/v1/audit/project/:projectId` | 项目操作历史（ProjectAuditGuard 校验：owner 或项目成员；普通成员只读） |

## 保留与清理

- 默认保留 **183 天**（#322，严格大于 6 个月整），环境变量 `AUDIT_LOG_RETENTION_DAYS`（旧名 `AUDIT_RETENTION_DAYS` 兼容回退），`common/schedulers/audit-cleanup.scheduler.ts` 每日 02:00 清理。
- 按月归档（#322 已实现）：`AUDIT_ARCHIVE_ENABLED=true` 时超期记录先按月分片导出 CSV（UTF-8 BOM，字段与导出端点一致，复用 `buildAuditCsv` 单一事实源）+ 生成 SHA-256 校验清单（`YYYY-MM.sha256`，`<hash>  <file>` 两空格格式，兼容 `sha256sum -c`），**全部归档成功才从数据库删除**；任一分片失败则整体失败——记录保留、任务告警（P1 `task_run_failed`）。归档目录默认 `data/archives/audit-logs`（`AUDIT_ARCHIVE_PATH` 可配，目录 0750/文件 0640）。等保 8.4.3.3/8.4.7.2 验收需开启。
- `AUDIT_ARCHIVE_ENABLED=false` 时直接按保留天数删除（不产生归档产物）。
- 手动清理与归档联动（#323）：`POST /audit/cleanup` 不再直删——先经 `AuditArchiveService.verifyArchivedForCutoff(cutoff)` 校验目标时间段已归档且产物完整，通过后才按同一 cutoff 删除。已知边界：该校验证明"归档存在且完整"，不证明"覆盖到当前 cutoff 快照"（cron 归档后新过期的记录不在旧分片）；运行约定是每日 cron 归档保持产物新鲜，手动清理仅作恢复手段，严格场景先触发一次 cron 归档任务再手动清理。
- 归档检索（#324）：超期记录不在 DB（热数据仅 183 天），运维查归档走 CLI 脚本 `scripts/audit-archive-query.ts`——先校验月份 SHA-256 清单（不匹配/缺失拒绝输出，fail-closed），再解析 CSV 过滤输出。用法：

  ```bash
  cd packages/backend
  pnpm audit:archive-query -- --month 2026-07 [--userId <用户>] [--action <操作>] [--keyword <关键字>] [--json] [--dir <归档目录>]
  ```

  仅限运维人员本机使用（无网络暴露，等保最小权限）。

- 指标：清理删除数/耗时经 `CleanupMetricsService` 埋点 `cleanup_records_deleted_total{task="audit-cleanup:logs"}`、`cleanup_last_duration_seconds{task}`（#325/#322）。
- 可靠性 = fail-open：审计写库失败不阻塞业务操作，但打点/告警让运维可见，禁止静默失败；归档删除路径则为 fail-closed（宁可不删，不可丢日志）。
