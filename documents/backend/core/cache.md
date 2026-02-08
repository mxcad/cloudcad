# 缓存系统（Cache）

**文件位置**：`packages/backend/src/common/services/cache*.ts`, `packages/backend/src/common/schedulers/cache-cleanup.scheduler.ts`

## 概述

多级缓存架构，包括权限缓存、角色缓存、Redis 缓存，提供缓存监控、预热和自动清理功能。

## 核心组件

- **PermissionCacheService**: 用户权限缓存（本地内存，TTL 5-10 分钟）
- **RolesCacheService**: 角色信息缓存（本地内存，TTL 10 分钟）
- **RedisCacheService**: 分布式缓存服务
- **CacheWarmupService**: 缓存预热服务
- **CacheCleanupScheduler**: 缓存清理定时任务

## 缓存架构

```
┌─────────────────────────────────────────────────────────┐
│                     应用层                               │
├─────────────────────────────────────────────────────────┤
│  PermissionCacheService  │  RolesCacheService  │  RedisCacheService  │
│  - 用户权限缓存           │  - 角色信息缓存      │  - 分布式缓存         │
│  - TTL: 5-10 分钟         │  - TTL: 10 分钟       │  - TTL: 可配置       │
│  - 本地内存               │  - 本地内存           │  - Redis 存储        │
├─────────────────────────────────────────────────────────┤
│                     缓存管理层                            │
│  CacheWarmupService    │  CacheCleanupScheduler  │  CacheMonitorController│
│  - 缓存预热             │  - 定时清理任务          │  - 缓存监控接口        │
│  - 手动预热             │  - 过期清理              │  - 统计查询            │
├─────────────────────────────────────────────────────────┤
│                     存储层                               │
│  本地内存（Map）  │  Redis  │  数据库                        │
└─────────────────────────────────────────────────────────┘
```

## 缓存策略

| 缓存类型 | 存储位置 | TTL | 使用场景 |
|---------|---------|-----|---------|
| 用户权限 | 本地内存 | 5-10 分钟 | 系统权限检查 |
| 用户角色 | 本地内存 | 10 分钟 | 角色验证 |
| 项目权限 | 本地内存 | 5 分钟 | 项目权限检查 |
| 项目所有者 | 本地内存 | 10 分钟 | 项目所有权验证 |
| 节点访问角色 | Redis | 10 分钟 | 跨服务共享节点权限信息 |
| 用户角色信息 | Redis | 10 分钟 | 跨服务共享用户角色信息 |

## 缓存预热

**启动预热**（OnModuleInit）：
- 预热所有用户角色信息
- 预热常用用户权限
- 预热活跃项目的节点访问角色

**手动预热**：
- `/api/cache/warmup/all` - 预热所有缓存
- `/api/cache/warmup/user/:userId` - 预热指定用户缓存
- `/api/cache/warmup/project/:projectId` - 预热指定项目缓存

## 缓存失效

**自动失效**：
- TTL 过期自动清理
- 定时任务清理过期缓存

**主动失效**：
- 用户信息变更时清除用户缓存
- 角色权限变更时清除角色缓存
- 项目成员变更时清除相关缓存
- 权限配置变更时清除权限缓存

**事件驱动失效**：
- 使用 Redis Pub/Sub 发布缓存失效事件
- 多实例间同步缓存失效

## 缓存监控

**统计信息**：
- `/api/cache/stats` - 获取缓存统计信息
- `/api/admin/permissions/cache` - 获取权限缓存统计

**统计指标**：
- 总缓存条目数
- 已过期条目数
- 缓存命中率（估算）
- 各类型缓存数量

**管理操作**：
- `/api/cache/clear` - 清除所有缓存
- `/api/admin/permissions/cache/cleanup` - 清理过期缓存
- `/api/admin/permissions/cache/user/:userId` - 清除指定用户缓存