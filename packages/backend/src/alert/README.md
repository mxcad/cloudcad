# 告警模块（alert）

## 概述

运维告警记录（#245 #246 #247 #210）：系统组件（磁盘水位、缓存监控、调度器任务失败、手动任务触发失败等）通过 `AlertService.raise()` 上报告警，支持**按 source+messageKey 去重**（同源未解决时更新而非重复插入）与**两态流转** OPEN ↔ RESOLVED（自动恢复 `resolveBySourceKey` / 手动兜底 `resolveById`）。

## 目录结构

```
src/alert/
├── alert.controller.ts      # 告警查询/解决（SYSTEM_MONITOR）
├── alert.service.ts         # raise / resolveBySourceKey / resolveById / findAll（去重走 $transaction）
├── webhook/webhook.service.ts  # 通用 webhook 适配器（模板渲染，detail 转义防注入）
├── enums/                   # 本地枚举（对应 schema AlertLevel/AlertStatus）
└── dto/                     # 查询 DTO
```

## 数据模型（schema 单一源）

`AlertRecord`：`source`、`messageKey`、`level`（`AlertLevel`：WARNING / CRITICAL）、`message`（i18n 模板 key）、`detail Json?`、`status`（`AlertStatus`：OPEN / RESOLVED）、`resolvedAt`。索引：`[source, messageKey, status]`、`[status, level]`、`createdAt`。

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
