# 告警模块（alert）

## 概述

运维告警记录（#245 #246 #247 #210）：系统组件（磁盘水位、缓存监控、调度器任务失败、手动任务触发失败等）通过 `AlertService.raise()` 上报告警，支持**按 source+messageKey 去重**（同源未解决时更新而非重复插入）与**两态流转** OPEN ↔ RESOLVED（自动恢复 `resolveBySourceKey` / 手动兜底 `resolveById`）。

## 目录结构

```
src/alert/
├── alert.controller.ts      # 告警查询/解决（SYSTEM_MONITOR）
├── alert.service.ts         # raise / resolveBySourceKey / resolveById / findAll（去重走 $transaction；raise/resolve 后 emit alert.raised / alert.resolved 事件，#311）
├── alert.events.ts          # 领域事件常量（alert.raised / alert.resolved）
├── webhook/webhook.service.ts  # 通用 webhook 适配器（模板渲染，detail 转义防注入）
├── notification/alert-notification.service.ts  # 邮件通知订阅方（P0 实时 + P1 聚合 + P2 日报 + 恢复通知 + 失败升级，#311 #312）
├── enums/                   # 本地枚举（对应 schema AlertLevel/AlertStatus）
└── dto/                     # 查询 DTO
```

## 数据模型（schema 单一源）

`AlertRecord`：`source`、`messageKey`、`level`（`AlertLevel` 三档：P0 即时 / P1 聚合 / P2 静默，#310；存量 WARNING→P1、CRITICAL→P0 已迁移）、`message`（i18n 模板 key）、`detail Json?`、`status`（`AlertStatus`：OPEN / RESOLVED）、`resolvedAt`。索引：`[source, messageKey, status]`、`[status, level]`、`createdAt`。

### 触发点等级标注清单（#310）

| 等级 | 语义 | 触发点 |
|------|------|--------|
| P0 | 服务不可用 / 数据丢失，即时通知 | `disk_space_critical`（storage-cleanup.scheduler）、`cache_l2_disconnected`（cache-monitor.service）、`audit.write.failed`（audit-log.service） |
| P1 | 单任务失败 / 磁盘告警 / 缓存容量与命中率，聚合通知 | billing-cron、cache-cleanup.scheduler、cache-monitor.service 的 `task_run_failed`；task-run.controller 手动触发失败；`disk_space_low`；`cache_l1_capacity` / `cache_hit_rate` / `cache_memory_high` |
| P2 | 低频清理失败，仅静默记录 | storage-cleanup（孤儿清理）、user-cleanup、audit-cleanup、batch-download-cleanup 的 `task_run_failed` |

## API 端点（AlertController，前缀 `alert`，类级 SYSTEM_MONITOR）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/alert` | 告警分页查询（QueryAlertDto：按 status/level/source 过滤） |
| PATCH | `/api/v1/alert/:id/resolve` | 手动解决告警（置 RESOLVED + resolvedAt） |

## 告警触发源

- 磁盘水位 / 缓存监控失败（#217 #245）
- 调度器任务失败 → `task_run_failed`（#210，与 task-run 模块联动）
- 手动任务触发失败（#210）
- webhook 通知：`webhook.service.ts` 通用适配器，模板渲染时对 `detail` 转义（#246），webhook 消息格式见 `docs/research/webhook-message-formats.md`

## 邮件通知链路（#311）

`AlertService` 在 raise/resolve 后通过 `@nestjs/event-emitter` 全局总线发布 `alert.raised` / `alert.resolved` 事件，`AlertNotificationService` 订阅消费：

| 行为 | 说明 |
|------|------|
| P0 实时邮件 | `ALERT_EMAIL_ENABLED=true` 且配置 `ALERT_EMAIL_TO` 后，P0 告警立即发纯文本告警单；成功后在 detail 持久化 `emailNotifiedAt` |
| P1 聚合（#312） | 按 source 聚合窗口（`ALERT_P1_WINDOW_MINUTES`，默认 15）内多条告警合并一封邮件（含事件数与首次/末次时间）；内存态实现，多实例部署存在跨实例重复发送风险（设计可接受） |
| P2 日报（#312） | 每日 `ALERT_P2_DAILY_HOUR` 点（默认 9）发送前一日新增告警日报，按 level/source 分组统计；无前日告警不发送空日报 |
| 恢复通知 | 告警 RESOLVED 时仅对已发过邮件（detail.emailNotifiedAt）的记录发送恢复邮件（与 P1 聚合独立，resolve 即时发送） |
| 失败升级 | 发送失败记 error 日志 + detail 标记失败；连续失败 ≥ `ALERT_EMAIL_FAIL_ESCALATE` 次（默认 5）raise P0 告警（source=`alert-email`），计数器重置 |
| 自循环防护 | source=`alert-email` 的告警不再触发邮件 |
