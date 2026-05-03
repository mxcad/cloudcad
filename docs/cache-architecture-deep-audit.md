# A6：缓存架构深度审计报告

汇报人：Trea
日期：2026-05-03
分支：refactor/circular-deps

---

## 1. 模块概述

| 属性 | 值 |
|------|-----|
| 模块路径 | `apps/backend/src/cache-architecture/` |
| 核心服务 | `MultiLevelCacheService`, `CacheMonitorService`, `CacheWarmupService` |
| 控制器 | `CacheMonitorController` |
| 缓存级别 | L1 (内存) / L2 (Redis) / L3 (数据库) |
| 全局模块 | `@Global()` |
| 依赖模块 | `ConfigModule`, `ScheduleModule`, `DatabaseModule`, `CommonModule` |

## 2. 架构分析

### 2.1 三级缓存架构

```
┌─────────────────────────────────────────────────────────────┐
│                   MultiLevelCacheService                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ L1: L1CacheProvider (内存缓存, Node Map)            │   │
│  │ L2: L2CacheProvider (Redis)                        │   │
│  │ L3: L3CacheProvider (PostgreSQL)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  功能:                                                       │
│  - get(): L1 → L2 → L3                                     │
│  - set(): 并行写入 L1, L2, L3                               │
│  - delete(): 删除所有级别                                    │
│  - getOrLoad(): 缓存未命中时加载                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 缓存策略

| 策略 | 类 | 说明 |
|------|-----|------|
| HotDataStrategy | 热点数据策略 | 识别高频访问数据 |
| PermissionStrategy | 权限缓存策略 | 权限数据专用缓存 |
| RoleStrategy | 角色缓存策略 | 角色数据专用缓存 |

### 2.3 保护机制

| 机制 | 配置 | 评估 |
|------|------|------|
| 缓存穿透保护 | `nullTTL: 60s, bloomSize: 1000000` | ✅ 存在 |
| 缓存雪崩保护 | `randomizationRange: 300s` | ✅ 存在 |
| 缓存版本控制 | `versionConfig.enabled: false` | ⚠️ 默认禁用 |

## 3. 代码质量分析

### 3.1 优点

| 优点 | 说明 |
|------|------|
| 三级缓存设计 | L1/L2/L3 分层，命中率优化 |
| 缓存穿透保护 | 空值缓存 + 布隆过滤器 |
| 缓存雪崩保护 | TTL 随机化 |
| 版本控制支持 | 可选的缓存版本控制 |
| 预热策略 | `CacheWarmupService` 支持启动预热 |
| 性能监控 | `CacheMonitorService` 实时监控 |

### 3.2 发现的问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 缓存版本默认禁用 | 低 | `versionConfig.enabled = false` |
| L3 模式匹配低效 | 高 | `deleteL3ByPattern` 获取所有数据后过滤 |
| setInterval 内存泄漏 | 高 | `CacheMonitorService` 使用 `setInterval` 未清理 |
| 性能数据无持久化 | 中 | 内存中的 `performanceData` 重启丢失 |

### 3.3 严重问题：L3 deleteByPattern 性能

```typescript
// multi-level-cache.service.ts:513-525
private async deleteL3ByPattern(pattern: string): Promise<number> {
  const allEntries = await this.l3Cache.getHotData(1000000); // ← 获取所有数据！
  const keysToDelete = allEntries
    .filter((entry) => this.matchPattern(entry.key, pattern))
    .map((entry) => entry.key);
  // ...
}
```

**问题**: 当 L3 数据量大时，`getHotData(1000000)` 会造成严重性能问题。

### 3.4 严重问题：setInterval 未清理

```typescript
// cache-monitor.service.ts:51-54
constructor(...) {
  setInterval(() => this.cleanOldPerformanceData(), this.monitoringInterval);
  // 问题：没有在 onModuleDestroy 或 ngOnDestroy 中清理
}
```

**风险**: 内存泄漏，定时任务永不停止。

## 4. 循环依赖分析

### 4.1 依赖图

```
CacheArchitectureModule (@Global())
    ├── Providers: L1CacheProvider, L2CacheProvider, L3CacheProvider
    ├── Services: MultiLevelCacheService, CacheWarmupService,
    │             CacheMonitorService, CacheVersionService
    ├── Controllers: CacheMonitorController
    └── Strategies: HotDataStrategy, PermissionStrategy, RoleStrategy

依赖链:
    PermissionCacheService (CommonModule)
            │
            ▼
    MultiLevelCacheService ←──────────────┐
            │                              │
            ▼                              │
    L1CacheProvider / L2CacheProvider / L3CacheProvider  │
            │                              │
            ▼                              │
    PermissionCacheService ────────────────┘ ???

需验证: 是否存在 CacheArchitectureModule ↔ PermissionCacheService 循环
```

### 4.2 依赖注入分析

从代码分析：
- `CacheArchitectureModule` 是 `@Global()` 模块
- `PermissionCacheService` 在 `CommonModule` 中
- `PermissionCacheService` 依赖 `MultiLevelCacheService`

**潜在循环**:
```
CacheArchitectureModule (@Global)
  └─ exports: MultiLevelCacheService, L1CacheProvider, L2CacheProvider, L3CacheProvider

CommonModule
  └─ imports: CacheArchitectureModule (隐式或显式)
  └─ PermissionCacheService (depends on MultiLevelCacheService)
```

**结论**: 需验证 CommonModule 是否导入 CacheArchitectureModule。如果导入，可能存在循环依赖。

### 4.3 循环依赖风险评估

| 依赖路径 | 风险等级 | 说明 |
|----------|----------|------|
| CacheArchitecture → Common → PermissionCache → MultiLevelCache | 🔴 待确认 | 需验证模块导入关系 |
| MultiLevelCacheService → L1/L2/L3 Providers | 低 | 单向依赖 |

## 5. 安全分析

### 5.1 缓存安全

| 安全措施 | 实现情况 |
|----------|----------|
| 敏感数据加密 | ❌ 未实现 |
| 缓存键隔离 | ✅ 使用前缀隔离 |
| 缓存过期 | ✅ TTL 管理 |
| 缓存清理 | ✅ 手动 + 自动清理 |

### 5.2 监控安全

| 端点 | 权限要求 | 评估 |
|------|----------|------|
| GET /cache/stats | ? | 需确认 |
| GET /cache/health | ? | 需确认 |
| GET /cache/metrics | ? | 需确认 |

## 6. 测试覆盖分析

### 6.1 测试文件

- `apps/backend/src/cache-architecture/**/*.spec.ts` - 未发现

### 6.2 覆盖建议

| 测试场景 | 优先级 |
|----------|--------|
| 三级缓存读写 | 高 |
| 缓存穿透保护 | 高 |
| 缓存雪崩保护 | 高 |
| L3 deleteByPattern | 高（性能） |
| 缓存版本控制 | 中 |

## 7. 性能分析

| 指标 | 当前值 | 评估 |
|------|--------|------|
| L1 命中率 | 内存级 (~ns) | ✅ 极快 |
| L2 命中率 | Redis (~ms) | ✅ 快 |
| L3 命中率 | DB (~ms-s) | ⚠️ 需优化 |
| 并行写入 | Promise.all | ✅ 良好 |

### 7.1 性能问题汇总

| 问题 | 严重程度 | 影响 |
|------|----------|------|
| L3 getHotData(1000000) | 高 | 大数据量时内存/性能问题 |
| setInterval 未清理 | 高 | 内存泄漏 |
| 串行 L3 批量删除 | 中 | 删除操作慢 |

## 8. 可维护性分析

### 8.1 代码组织

| 指标 | 评分 | 说明 |
|------|------|------|
| 模块化 | ⭐⭐⭐⭐ | 分层清晰 |
| 单一职责 | ⭐⭐⭐⭐ | 服务职责单一 |
| 命名规范 | ⭐⭐⭐⭐ | 符合项目规范 |
| 注释 | ⭐⭐⭐ | 存在但可完善 |

### 8.2 技术债

1. **setInterval 未清理** - 需实现 OnModuleDestroy
2. **L3 deleteByPattern 低效** - 需优化或限制使用
3. **性能数据内存存储** - 重启丢失，无持久化
4. **版本控制默认禁用** - 文档和默认值不一致

## 9. 审计结论

| 维度 | 评级 | 备注 |
|------|------|------|
| 代码质量 | B+ | 架构设计优秀，实现有缺陷 |
| 安全性 | B | 基本安全，缺加密 |
| 性能 | B- | 有严重性能问题需修复 |
| 可维护性 | B | 需修复内存泄漏 |
| 循环依赖 | 🔴 待确认 | 需验证 CacheArchitecture ↔ CommonModule 关系 |

### 9.1 优先改进项

1. **[高]** 修复 setInterval 内存泄漏（实现 OnModuleDestroy）
2. **[高]** 优化 L3 deleteByPattern 实现
3. **[中]** 确认并解决可能的 CommonModule 循环依赖
4. **[中]** 性能数据持久化或限制内存使用
5. **[低]** 考虑默认启用缓存版本控制

---

**审计人**: Trea
**审计时间**: 2026-05-03
