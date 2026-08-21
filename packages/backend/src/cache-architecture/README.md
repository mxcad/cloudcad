# Cache Architecture 模块说明

## 概述

`cache-architecture` 是 CloudCAD 后端的两级缓存基础设施模块（`@Global()`），统一管理 **L1 进程内内存缓存** 与 **L2 Redis 分布式缓存**，对外提供多级读写、批量操作、模式删除、版本控制、监控统计与告警等能力。

模块被 `permission`、`runtime-config` 等核心模块消费，并通过 `common/schedulers/cache-cleanup.scheduler.ts` 与告警系统（AlertService）接线。

## 目录结构

```
src/cache-architecture/
├── cache-architecture.module.ts   # 全局模块定义（注册/导出全部组件）
├── controllers/
│   └── cache-monitor.controller.ts      # 缓存监控/管理 REST API（含 .spec.ts）
├── dto/
│   └── cache-stats.dto.ts               # 监控/操作相关 DTO
├── enums/
│   ├── cache-level.enum.ts              # L1/L2 级别、默认 TTL 与描述
│   └── cache-strategy.enum.ts           # LRU/LFU/FIFO/TTL/LRU_TTL 策略
├── interfaces/
│   ├── cache-manager.interface.ts       # ICacheManager / IL1CacheManager / IL2CacheManager
│   └── cache-stats.interface.ts         # 性能指标、健康状态接口
├── providers/
│   ├── l1-cache.provider.ts             # L1 内存缓存实现（LRU-TTL）
│   └── l2-cache.provider.ts             # L2 Redis 缓存实现（node-redis）
├── services/
│   ├── multi-level-cache.service.ts     # 多级缓存统一门面（含穿透/雪崩/版本控制）（含 .spec.ts）
│   ├── redis-cache.service.ts           # 遗留权限缓存服务（ioredis，permission: 前缀）
│   ├── cache-version.service.ts         # 缓存版本管理与分布式锁
│   └── cache-monitor.service.ts         # 监控、性能指标、趋势、结构化告警（含 .spec.ts）
└── utils/
    └── cache-key.utils.ts               # 缓存键生成/解析/校验工具
```

## 核心组件详解

### 1. 两级缓存模型（CacheLevel）

| 级别 | 载体 | 策略 | 容量 | 默认 TTL | 特性 |
|------|------|------|------|----------|------|
| L1 | 进程内 `Map` | `LRU_TTL` | 1000 条（可调） | 300s（5 分钟） | 最快、单实例独享；每 60s 定时清理过期条目；容量满时淘汰最近最少使用项 |
| L2 | Redis（node-redis） | `TTL` | 无上限（受 Redis 内存约束） | 1800s（30 分钟） | 跨实例共享；支持 `mGet`/pipeline 批量与 `scanIterator` 模式删除 |

L1 与 L2 均实现 `ICacheManager` 接口（`get/set/delete/deleteMany/clear/has/size/getLevel/getStrategy`），L1 额外提供 `deleteByPattern`、`setMaxCapacity`、`getHitRate`；L2 额外提供 `getMany/setMany/expire/ttl/deleteByPattern`。

### 2. MultiLevelCacheService —— 多级缓存门面

对外统一入口，职责：

- **读路径**：L1 → L2 顺序查询；L2 命中后自动回填 L1（`get`）。`getOrLoad(key, loader)` 支持缓存未命中时从数据源加载并写满两级。
- **写路径**：`set`/`delete` 并行作用于两级；`deleteByPattern` 汇总两级删除数量。
- **批量**：`getMany`/`setMany`/`deleteMany`。
- **单级操作**：`getFromLevel`/`setToLevel` 按 `CacheLevel` 定向读写。
- **统计**：`getStats` 聚合 L1/L2 的 hits/misses/hitRate/memoryUsage。

### 3. 缓存保护机制

| 问题 | 处理 | 配置（代码内常量） |
|------|------|--------------------|
| 穿透 | 空值兜底：`getOrLoad` 未命中时由调用方决定是否写入；内置 `CachePenetrationConfig`（`enabled: true, nullTTL: 60s, bloomSize: 1_000_000`），预留空值缓存与布隆过滤器位 | `penetrationConfig` |
| 击穿 | 由调用方通过 `getOrLoad` 的 loader 并发控制；版本服务通过分布式锁串行化版本创建 | — |
| 雪崩 | **TTL 随机化**：`getEffectiveTTL` 在基础 TTL（默认 300s）上追加 `[0, 300)s` 随机偏移，避免大批 key 同时过期（`avalancheConfig`） | `avalancheConfig.randomizationRange: 300` |

### 4. 缓存版本控制（CacheVersionService + MultiLevelCacheService）

- `CacheVersionService` 为每类缓存数据维护版本号（`cache:version:{type}:{key|global}`，TTL 24h，来自 `cacheTTL.cacheVersion` 配置），版本号格式 `v{时间戳}_{随机串}`。
- `MultiLevelCacheService.enableVersionControl(type)` 开启后，读写键自动追加版本后缀（`{key}:v{version}`），数据变更时 `updateVersion` 生成新版本即可整体失效旧键（懒删除，无需逐条删除）。
- 版本创建使用 Redis 分布式锁（`SET NX PX` + Lua 脚本原子释放），锁 TTL 来自 `timeout.distributedLock`（默认 5s），防止并发创建版本。
- **默认关闭**（`versionConfig.enabled = false`），由 `permission` 模块在启动时显式开启。

### 5. RedisCacheService —— 遗留权限缓存

使用 ioredis 的独立权限缓存（key 前缀 `permission:`），供权限体系直接调用：

| 缓存 | key | TTL |
|------|-----|-----|
| 用户系统权限 | `permission:user:{userId}` | 600s（10 分钟） |
| 节点访问角色（项目/文件夹/文件） | `permission:node:{userId}:{nodeId}` | 300s（5 分钟） |
| 用户角色 | `permission:role:{userId}` | 600s（10 分钟） |

提供 `clearUserCache`/`clearNodeCache`（SCAN 游标匹配删除，避免 KEYS 阻塞），`clearProjectCache`/`clearFileCache`/`getFileAccessRole` 为向后兼容别名（`@deprecated`）。

### 6. CacheMonitorService —— 监控与告警

- 内存中按级别记录性能数据点（`recordPerformance`，上限 1000 条/级），计算 avg/P50/P95/P99 响应时间、吞吐量、错误率。
- `getHealthStatus`：L1 恒 healthy；L2 依据 Redis 连接状态判定 `healthy/degraded/unhealthy`。
- `getPerformanceTrend`/`getSizeTrend`：按分钟聚合趋势（size-trend 目前仅返回当前大小单点）。
- 定时任务：`@Cron('0 * * * * *')` 每分钟清理 24h 前的性能数据（受 `runtime-config` 的 `cacheMonitorEnabled` 开关控制，并注册到 `task-run` 手动触发注册表，见 #210）。
- 结构化告警项（#242 定案）：`checkWarningItems()` 返回 `CacheWarningItem[]`（`messageKey + level + detail`），阈值如下：

| 告警键 | 级别 | 触发条件 |
|--------|------|----------|
| `cache_l1_capacity` | WARNING | L1 容量使用率 > 90% |
| `cache_hit_rate` | WARNING | 整体命中率 < 70% |
| `cache_l2_disconnected` | CRITICAL | L2（Redis）连接断开 |
| `cache_memory_high` | WARNING | 两级内存总量 > 500MB |

`checkWarnings()` 返回纯文本数组，保持旧 API 契约。

## 缓存 key 设计（CacheKeyUtil）

统一 `前缀:实体ID` 命名（`:` 分隔），便于模式删除：

- 权限：`permission:{id}`、`role:{id}`、`user:{id}`、`user:permissions:{id}`
- 项目：`project:{id}`、`project:permissions:{id}`
- 文件：`file:{id}`、`file:metadata:{id}`、`file:content:{id}`
- 其他：`font:{id}`、`font:list`、`audit:log:{id}`、`config:{key}`、`settings:{id}`

工具方法：`custom(prefix, ...parts)` 拼接、`pattern` 通配、`namespaced`、`versioned`（追加 `:v{version}`）、`parse`/`matchPrefix`/`validate`（≤1024 字符、禁特殊字符）/`normalize`/`hash`。

## API 端点

路由前缀 `/cache-monitor`，全部需 JWT + 权限守卫。权限模型（#217）：**类级默认 `SYSTEM_MONITOR`**（读端点继承），**写端点（POST/DELETE）方法级覆盖为 `SYSTEM_ADMIN`**。

| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| GET | `/cache-monitor/summary` | SYSTEM_MONITOR | 监控摘要（stats + health + performance + timestamp） |
| GET | `/cache-monitor/stats?level=&includePerformance=` | SYSTEM_MONITOR | 统计信息，可按 L1/L2 过滤、附加性能指标 |
| GET | `/cache-monitor/health` | SYSTEM_MONITOR | 健康状态（L1/L2/overall） |
| GET | `/cache-monitor/performance` | SYSTEM_MONITOR | 性能指标（avg/P50/P95/P99/吞吐/错误率） |
| GET | `/cache-monitor/performance-trend?level=&minutes=` | SYSTEM_MONITOR | 性能趋势（默认 60 分钟，按分钟聚合） |
| GET | `/cache-monitor/size-trend?minutes=` | SYSTEM_MONITOR | 大小趋势（L1/L2 数组） |
| GET | `/cache-monitor/warnings` | SYSTEM_MONITOR | 缓存警告列表（纯文本数组） |
| GET | `/cache-monitor/value?key=` | SYSTEM_MONITOR | 读取指定 key 的缓存值 |
| POST | `/cache-monitor/value` | SYSTEM_ADMIN | 设置缓存值（`{key, value, ttl?}`） |
| DELETE | `/cache-monitor/value?key=` | SYSTEM_ADMIN | 删除指定 key |
| DELETE | `/cache-monitor/pattern?pattern=` | SYSTEM_ADMIN | 按模式删除（支持 `*`/`?`，返回删除数量） |
| DELETE | `/cache-monitor/values` | SYSTEM_ADMIN | 批量删除（`{keys: string[]}`） |
| POST | `/cache-monitor/refresh` | SYSTEM_ADMIN | 刷新缓存（先删后以原值重写，key 不存在返回 `success: false`） |
| POST | `/cache-monitor/cleanup` | SYSTEM_ADMIN | 清理：`{pattern}` 按模式删；`{level: 'ALL'}` 或未指定清空全部；`{level: 'L1'\|'L2'}` 返回成功但**暂未实现单级清理** |

## 数据模型

本模块**无 Prisma 数据模型**，数据全部存放于内存（L1）与 Redis（L2）。Redis 中涉及的 key 命名空间：

- `permission:*` —— 权限缓存（RedisCacheService）
- `cache:version:*`、`cache:version:lock:*` —— 版本号与版本锁（CacheVersionService）
- 其余业务 key —— 由 `MultiLevelCacheService`/`CacheKeyUtil` 约定前缀

TTL 默认值来自全局配置 `cacheTTL`（`configuration.ts`：`default: 300s`、`permission: 300s`、`cacheVersion: 86400s`，均可用 `CACHE_TTL_*` 环境变量覆盖）。

## 与其他模块的协作

| 模块 | 协作方式 |
|------|----------|
| **permission**（PermissionCacheService） | 注入 `MultiLevelCacheService` 与 `CacheVersionService`：启动时开启 `USER_PERMISSIONS` 版本控制；失效时先 `updateVersion` + 发布 Redis pub/sub 失效事件（`permission:cache:invalidation:{user|project|role|all|pattern}`），再本地删除；订阅端仅处理 5s 内事件防止循环/重复清理（见 `permission/services/permission-cache.service.ts`） |
| **runtime-config** | `CacheMonitorService` 每分钟清理与 `CacheCleanupScheduler` 的定时任务均通过 `runtimeConfigService.getValue(TASK_ENABLED_KEYS.CACHE_MONITOR / CACHE_CLEANUP, true)` 开关控制 |
| **task-run** | 监控清理、告警检查、统计记录、健康检查均注册为手动触发任务（#210），定时 + 手动触发共用同一裸执行函数 |
| **alert**（CacheCleanupScheduler） | 每 10 分钟调 `checkWarningItems()` 上报 `AlertService.raise`（source = `cache-monitor`），无告警时按 `messageKey` 自动 `resolveBySourceKey` 恢复；任务失败上报 `task_run_failed`（#245） |
| **config** | L1/L2 TTL、版本 TTL、分布式锁超时均从 `ConfigService`（`cacheTTL`、`timeout`）读取 |

## 测试

- `multi-level-cache.service.spec.ts`：版本控制、get/getOrLoad/getMany、set/delete/deleteMany/deleteByPattern/clear、has、getStats、单级操作、refresh。
- `cache-monitor.service.spec.ts`：统计、健康状态、性能记录/趋势/指标、重置、文本与结构化警告、摘要、大小趋势。
- `cache-monitor.controller.spec.ts`：端点行为 + 权限矩阵（仅 MONITOR / ADMIN / 无权限，#217 装饰器元数据契约）。

运行：`pnpm test -- --testPathPattern="cache-architecture"`（或 `--testPathPattern="cache"`）。
