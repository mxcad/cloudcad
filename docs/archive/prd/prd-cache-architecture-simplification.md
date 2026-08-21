# PRD: 缓存架构简化

## Problem Statement

缓存架构模块 `CacheArchitectureModule` 实现了三级缓存（L1 内存、L2 Redis、L3 数据库），但存在以下问题：

1. **L3（数据库缓存层）多余** — 用 Postgres 的 `cacheEntry` 表缓存数据，而真实数据也在 Postgres。L3 miss 后还要再查一次真实表，路径更长、数据更旧、维护成本更高
2. **模块复杂度远高于实际需求** — 7 个服务、3 个 Provider、4 个策略、1 个 Controller、1 张数据库表，但外部只有 `PermissionCacheService` 一个消费者
3. **L1 内存缓存存在一致性问题** — 多实例部署时，A 实例更新权限后 B 实例的 L1 仍为旧值，需等 TTL 过期

## Solution

移除 L3 缓存层，将缓存架构简化为 Redis-only。L1 是否保留作为可选决策。

### 具体变更

1. **删除 L3CacheProvider** — 移除 `cacheEntry` Prisma 模型和数据库表，移除 `L3CacheProvider` 全部代码和测试
2. **简化 MultiLevelCacheService** — 从 L1→L2→L3 三级查询改为直接查询 Redis；或保留 L1 作为可选热路径
3. **移除预热策略** — `HotDataStrategy`、`CacheWarmupService` 等相关代码无需外部预热，Redis 懒加载即可
4. **清理依赖** — 移除 `cacheEntry` 相关的 Prisma migration，清理 module 导出

## User Stories

1. 作为开发者，我希望缓存架构简单明确，以便于理解和维护
2. 作为运维人员，我希望减少不必要的数据库表和后台任务，以降低运维负担
3. 作为开发者，我不希望在修改权限缓存时需要理解三级缓存穿透/雪崩/版本控制机制
4. 作为架构师，我期望基础设施模块的复杂度与其实际使用场景匹配
5. 作为开发者，我希望在 L2（Redis）不可用时能优雅降级到直接查询数据库

## Implementation Decisions

### 模块范围

- 仅修改 `packages/backend/src/cache-architecture/` 下的代码
- `PermissionCacheService`（唯一外部消费者）可能需要调整注入方式
- Prisma schema 移除 `cacheEntry` 模型及其关联

### 接口变更

- `MultiLevelCacheService.get()` 签名不变，内部走 L1→L2→loader 或直接 L2→loader
- 导出接口中移除 L3 相关的类型和 Provider

### Redis 降级策略（保留）

Redis 不可用时，`L2CacheProvider` 已实现优雅降级（`isConnected` 检查），保留此行为——`get()` 直接返回 null 让 loader 查数据库。

### L1 保留决策（待定）

两个选项：

| 选项 | 做法 | 适用场景 |
|------|------|----------|
| 全 Redis | 删 L1+L3，PermissionCacheService 直接用 Redis | 简单、无一致性问题 |
| L1 + Redis pub/sub | 保留 L1，权限变更时 Redis 发布失效通知 | 热路径极致性能（当前无此需求） |

当前推荐**全 Redis**，权限查询 Redis 开销 <1ms，不在性能瓶颈上。

## Testing Decisions

- `MultiLevelCacheService` 已有 spec，移除 L3 后更新测试用例
- `L3CacheProvider` 的测试直接删除
- 预热策略的测试（如有）一并删除
- 验证 `PermissionCacheService` 在 Redis 断开时能通过 loader 降级到数据库

## Out of Scope

- 缓存监控前端页面（CacheMonitorController 保留）
- 保存流的事务重构（另有 ADR-0011 覆盖）
- 其他模块的缓存引入（本 PRD 只做简化，不新增缓存消费者）

## Further Notes

- 此 PRD 对应的 ADR 以 `docs/adr/0012-cache-architecture-simplification.md` 形式记录
- 与 #72（CacheMonitorController 添加 Guard）无冲突，Monitor 保留