# A7：健康检查深度审计报告

汇报人：Trea
日期：2026-05-03
分支：refactor/circular-deps

---

## 1. 模块概述

| 属性 | 值 |
|------|-----|
| 模块路径 | `apps/backend/src/health/` |
| 控制器 | `HealthController` |
| 依赖模块 | `TerminusModule`, `StorageModule`, `CommonModule`, `AuthModule` |
| 框架 | `@nestjs/terminus` |

## 2. 架构分析

### 2.1 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                      HealthController                          │
│  - GET  /health/live (Public) - Docker 健康检查              │
│  - GET  /health (Auth + SYSTEM_MONITOR)                      │
│  - GET  /health/db (Auth + SYSTEM_MONITOR)                   │
│  - GET  /health/storage (Auth + SYSTEM_MONITOR)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  NestJS Terminus HealthCheckService                          │
│  - database health check                                    │
│  - storage health check                                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 端点分析

| 端点 | 认证 | 权限 | 用途 |
|------|------|------|------|
| GET /health/live | ❌ Public | - | Docker/k8s 存活探针 |
| GET /health | ✅ JwtAuth | SYSTEM_MONITOR | 综合健康检查 |
| GET /health/db | ✅ JwtAuth | SYSTEM_MONITOR | 数据库健康检查 |
| GET /health/storage | ✅ JwtAuth | SYSTEM_MONITOR | 存储健康检查 |

## 3. 代码质量分析

### 3.1 优点

| 优点 | 说明 |
|------|------|
| 使用 Terminus | 标准 NestJS 健康检查框架 |
| 分离检查项 | 数据库、存储分离检查 |
| Public liveness | 支持容器编排探针 |

### 3.2 发现的问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 依赖模块过多 | 低 | 导入 StorageModule, AuthModule 可能引入循环依赖 |
| 无健康检查日志 | 低 | 失败时缺少日志记录 |
| 无超时控制 | 中 | healthCheck 可能hang |
| liveness 太简单 | 低 | 只返回 { status: 'ok' } 无实际检查 |

### 3.3 liveness 端点问题

```typescript
// health.controller.ts:42-44
async liveness() {
  return { status: 'ok', timestamp: new Date().toISOString() };
  // 问题：不执行任何实际检查，k8s 可能误判
}
```

**建议**: liveness 应该执行最小化检查（如进程存活、内存使用），readiness 才执行完整检查。

## 4. 循环依赖分析

### 4.1 依赖图

```
HealthModule
    ├── HealthController
    │       ├── JwtAuthGuard
    │       └── PermissionsGuard
    │
    ├── TerminusModule (第三方)
    ├── StorageModule ← 可能引入循环依赖
    ├── CommonModule
    └── AuthModule ← 可能引入循环依赖
```

### 4.2 循环依赖风险评估

| 依赖路径 | 风险等级 | 说明 |
|----------|----------|------|
| HealthModule → StorageModule | 🔴 中 | 需验证是否存在循环 |
| HealthModule → AuthModule | 🔴 中 | 需验证是否存在循环 |
| HealthModule → CommonModule | 低 | 标准模块依赖 |

**关键问题**: `HealthModule` 导入 `StorageModule` 和 `AuthModule`，但 `StorageModule` 或 `AuthModule` 可能反向依赖 `HealthModule`。

### 4.3 实际依赖分析

```typescript
// health.module.ts:20-22
@Module({
  imports: [TerminusModule, StorageModule, CommonModule, AuthModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

**检查 StorageModule 和 AuthModule**:
- 如果 `StorageModule` 或 `AuthModule` 导入或依赖 `HealthModule`，则存在循环依赖

**结论**: 需要验证 StorageModule 和 AuthModule 的依赖关系才能确定循环依赖风险。

## 5. 安全分析

### 5.1 权限控制

| 端点 | 权限 | 评估 |
|------|------|------|
| GET /health/live | 无 | ✅ 正确，liveness 应公开 |
| GET /health | SYSTEM_MONITOR | ✅ 正确 |
| GET /health/db | SYSTEM_MONITOR | ✅ 正确 |
| GET /health/storage | SYSTEM_MONITOR | ✅ 正确 |

### 5.2 安全问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| /health/live 无任何防护 | 低 | DoS 风险，但 liveness 通常短暂 |
| healthCheck 无超时 | 中 | 可能被恶意请求利用 |
| 无速率限制 | 低 | 建议添加 |

## 6. 测试覆盖分析

### 6.1 测试文件

- `apps/backend/src/health/**/*.spec.ts` - 未发现

### 6.2 覆盖建议

| 测试场景 | 优先级 |
|----------|--------|
| liveness 端点 | 高 |
| 数据库健康检查 | 高 |
| 存储健康检查 | 高 |
| 权限守卫验证 | 中 |
| 超时处理 | 中 |

## 7. 可维护性分析

### 7.1 代码组织

| 指标 | 评分 | 说明 |
|------|------|------|
| 模块化 | ⭐⭐⭐ | 简洁 |
| 单一职责 | ⭐⭐⭐⭐ | 单一职责明确 |
| 命名规范 | ⭐⭐⭐⭐ | 符合规范 |
| 注释 | ⭐⭐⭐ | 有基础注释 |

### 7.2 技术债

1. **liveness 无实际检查** - 可能导致容器编排误判
2. **无超时控制** - healthCheck 可能阻塞
3. **无日志记录** - 失败排查困难

## 8. 与其他模块的关系

| 模块 | 关系 | 循环依赖风险 |
|------|------|--------------|
| StorageModule | 依赖 | 🔴 中 |
| AuthModule | 依赖 | 🔴 中 |
| CommonModule | 依赖 | 低 |
| DatabaseModule | 间接依赖 | 低 |

## 9. 审计结论

| 维度 | 评级 | 备注 |
|------|------|------|
| 代码质量 | B+ | 简洁实用，有改进空间 |
| 安全性 | B+ | 权限控制正确 |
| 性能 | B | 无超时控制 |
| 可维护性 | B+ | 代码简单易维护 |
| 循环依赖 | 🔴 待确认 | 需验证 StorageModule/AuthModule 依赖 |

### 9.1 优先改进项

1. **[中]** 添加 healthCheck 超时控制
2. **[中]** 增强 liveness 端点（至少检查进程状态）
3. **[中]** 确认 StorageModule/AuthModule 循环依赖风险
4. **[低]** 添加 healthCheck 失败日志
5. **[低]** 考虑添加健康检查指标到监控

---

**审计人**: Trea
**审计时间**: 2026-05-03
