# 健康检查（Health）

**文件位置**：`packages/backend/src/health/`

## 概述

系统健康监控功能，实时监控数据库和存储服务的连接状态。

## 核心组件

- **HealthService**: 健康检查服务
- **HealthController**: 健康检查控制器
- **HealthModule**: 健康检查模块

## 核心功能

- 健康状态监控：实时监控数据库和存储服务的连接状态
- 自动刷新：每 30 秒自动刷新系统状态
- 状态展示：清晰的状态图标和颜色标识（正常/异常）
- 详细信息：显示状态消息、检查时间等详细信息
- 权限控制：仅具有 SYSTEM_MONITOR 权限的用户可访问

## 监控指标

| 监控项 | 检查内容 |
|--------|---------|
| 数据库 | PostgreSQL 连接状态 |
| 存储服务 | 本地存储状态 |

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/health/*` | GET | 服务状态监控 |

## 前端组件

- **SystemMonitorPage**: `packages/frontend/pages/SystemMonitorPage.tsx`

## 权限要求

需要 SYSTEM_MONITOR 权限的用户可访问系统监控功能。