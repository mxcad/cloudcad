# 审计模块（audit）

## 概述

审计日志（AuditLog）是"管理员全局合规视图 + 项目成员操作历史视图"的**单表双投影**（ADR-0045）：业务代码只调一次 `audit()`，查询端按视图过滤（全局 vs `projectId`）。动作清单收窄到"改变了系统状态且难以察觉或不可逆"的操作（权限/角色变更、项目生命周期、成员变更、文件危险操作、账号安全）；高频读操作（上传/下载/登录成功）不记。

## 目录结构

```
src/audit/
├── audit-log.controller.ts     # 管理员审计视图（SYSTEM_ADMIN）
├── project-audit-log.controller.ts  # 项目操作历史视图（项目成员）
├── project-audit.guard.ts      # 项目归属校验（owner 或项目成员）
├── audit-log.service.ts        # 查询/统计/导出/清理
├── audit-logger.service.ts     # 审计写入入口（fail-open + 失败打点）
└── dto/                        # 查询/导出 DTO
```

`@Audit` 装饰器位于 `common/decorators/audit.decorator.ts`（#232），供各业务模块声明式埋点；写入统一收敛到 `AuditLogService.log()`。

## 数据模型（schema 单一源）

`AuditLog`：`action`（AuditAction 枚举，35 项）、`resourceType`/`resourceId`、`projectId`（系统级操作可空）、`resourceName`（名称快照，资源删除后记录仍可读）、`params`（结构化 JSON，替代旧 `details` blob）、`ipAddress`/`userAgent`、`success`。索引：`userId`、`projectId`、`[resourceType, resourceId]`、`createdAt`、`action`。

## API 端点

### 管理员视图（AuditLogController，前缀 `audit`，类级 SYSTEM_ADMIN）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/audit/logs` | 分页查询（filters: action/projectId/userId/startDate/endDate/success，page/limit 默认 20） |
| GET | `/api/v1/audit/logs/:id` | 日志详情 |
| GET | `/api/v1/audit/statistics` | 统计（startDate/endDate/userId） |
| POST | `/api/v1/audit/export` | 导出 CSV/Excel（AuditExportDto：filters + `format: csv\|excel`；文件流下载；导出动作本身记一条 `AUDIT_EXPORT` 审计） |
| POST | `/api/v1/audit/cleanup` | 手动触发清理（按保留天数删除） |

### 项目操作历史（ProjectAuditLogController，前缀 `audit`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/audit/project/:projectId` | 项目操作历史（ProjectAuditGuard 校验：owner 或项目成员；普通成员只读） |

## 保留与清理

- 默认保留 **180 天**，环境变量 `AUDIT_LOG_RETENTION_DAYS`（旧名 `AUDIT_RETENTION_DAYS` 兼容回退），`common/schedulers/audit-cleanup.scheduler.ts` 每日清理。
- 归档未实现（#223 fail-closed 决议）：`AUDIT_ARCHIVE_ENABLED=true` 时清理任务仅告警并跳过删除，日志零丢失。
- 可靠性 = fail-open：审计写库失败不阻塞业务操作，但打点/告警让运维可见，禁止静默失败。
