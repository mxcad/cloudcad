# 缓存架构简化：移除 L3 数据库缓存层

三级缓存架构（L1 内存 → L2 Redis → L3 数据库）中，L3 层使用 Postgres `cacheEntry` 表缓存数据，而真实数据也在 Postgres。缓存查询路径比直接查真实表更长，数据更旧（24 小时 TTL），且增加一张表的维护成本。外部只有 `PermissionCacheService` 一个消费者，架构复杂度远超实际需求。

**Status**: accepted

**Decision**: 移除 L3（`cacheEntry` 表、`L3CacheProvider`、`HotDataStrategy`、`CacheWarmupService`），简化查询路径为 `L1 → L2 → loader` 或直接 `Redis → loader`。

**Details**: 参见 issue #92。

**Consequences**: 
- Prisma schema 移除 `cacheEntry` 模型，需生成 migration
- L1 是否保留作为独立决策，当前推荐全 Redis 方案
- Redis 降级策略保留（`isConnected` 检查 → 自动回退到 loader）