# A5：策略引擎深度审计报告

汇报人：Trea
日期：2026-05-03
分支：refactor/circular-deps

---

## 1. 模块概述

| 属性 | 值 |
|------|-----|
| 模块路径 | `apps/backend/src/policy-engine/` |
| 核心服务 | `PolicyEngineService`, `PolicyConfigService` |
| 控制器 | `PolicyConfigController` |
| 数据库表 | `permissionPolicy`, `policyPermission` |
| 策略类型 | `TIME`, `IP`, `DEVICE` |
| 依赖模块 | `DatabaseModule`, `CommonModule` |

## 2. 架构分析

### 2.1 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    PolicyConfigController                      │
│  - CRUD /v1/policy-config/*                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PolicyEngineService                        │
│  - registerPolicy() / registerPolicies()                   │
│  - createPolicy() / createPolicyUnsafe()                   │
│  - evaluatePolicy() / evaluatePolicies() / evaluatePoliciesAny() │
│  - 策略缓存 (PermissionCacheService)                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   PolicyConfigService                       │
│  - CRUD 策略配置                                            │
│  - 策略-权限关联管理                                        │
│  - 缓存管理 (PermissionCacheService)                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 策略评估流程

```
PolicyContext (userId, permission, ipAddress, userAgent, deviceType, timestamp)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  PolicyEngineService.evaluatePolicy()                       │
│  ├── 缓存查询 (PermissionCacheService)                       │
│  ├── 策略执行 (policy.evaluate())                           │
│  └── 结果缓存                                               │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  PolicyEvaluationResult { allowed, reason, policyId, ... }   │
└─────────────────────────────────────────────────────────────┘
```

## 3. 代码质量分析

### 3.1 优点

| 优点 | 说明 |
|------|------|
| 策略模式设计 | 使用策略工厂模式支持多种策略类型 |
| 缓存集成 | 策略评估结果缓存，减少重复计算 |
| AND/OR 评估 | 支持 `evaluatePolicies` (AND) 和 `evaluatePoliciesAny` (OR) |
| 配置验证 | 创建策略时验证配置合法性 |

### 3.2 发现的问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 缓存清除未实现 | 高 | `clearCache()` 方法为空实现 (PolicyConfigService:445) |
| 循环依赖风险 | 高 | PolicyConfigService → PolicyEngineService → PermissionCacheService |
| 缺少策略注册持久化 | 中 | 动态注册的策略重启后丢失 |
| createPolicyUnsafe 命名 | 中 | 暴露不安全方法 |

### 3.3 严重问题：循环依赖

```typescript
// PolicyEngineService 构造函数
constructor(
  private readonly configService: ConfigService,
  private readonly cacheService: PermissionCacheService  // ← 依赖 PermissionCacheService
) {}

// PolicyConfigService 构造函数
constructor(
  private readonly configService: ConfigService,
  private readonly prisma: DatabaseService,
  private readonly cacheService: PermissionCacheService,  // ← 依赖 PermissionCacheService
  private readonly policyEngine: PolicyEngineService      // ← 依赖 PolicyEngineService (循环!)
) {}
```

**依赖链分析**:
```
PolicyEngineModule
  ├── PolicyConfigService ←────────────┐
  │       └── PolicyEngineService ────┘  ← 循环！
  │
  └── PermissionCacheService (via CommonModule)
          └── MultiLevelCacheService
```

## 4. 循环依赖分析

### 4.1 依赖图

```
PolicyEngineModule
    ├── PolicyConfigService
    │       ├── DatabaseService
    │       ├── PermissionCacheService
    │       └── PolicyEngineService ← 循环依赖！
    │
    ├── PolicyEngineService
    │       ├── ConfigService
    │       └── PermissionCacheService
    │
    └── PolicyConfigController
            └── JwtAuthGuard + PermissionsGuard
```

### 4.2 循环依赖风险评估

| 依赖路径 | 风险等级 | 说明 |
|----------|----------|------|
| PolicyConfigService → PolicyEngineService | 🔴 高 | 直接循环依赖 |
| PolicyEngineService → PermissionCacheService | 低 | 单向依赖 |
| PermissionCacheService → MultiLevelCacheService | 低 | 单向依赖 |

### 4.3 循环依赖影响

**当前状态**: 在 `refactor/circular-deps` 分支上 - 说明此问题已被识别并正在修复。

**风险**:
1. NestJS 模块初始化顺序不确定
2. 可能导致 `undefined` 注入
3. 测试困难

## 5. 安全分析

### 5.1 策略安全性

| 策略类型 | 验证方式 | 评估 |
|----------|----------|------|
| TimePolicy | 时间范围验证 | ✅ |
| IpPolicy | IP 格式验证 | ✅ |
| DevicePolicy | 设备类型验证 | ✅ |

### 5.2 配置安全

```typescript
// PolicyConfigService - 策略配置更新
if (updates.config && updates.type) {
  const policy = this.policyEngine.createPolicyUnsafe(
    updates.type,
    `temp_${Date.now()}`,
    updates.config
  );
  // 问题：验证后不保存验证结果
}
```

**问题**: `createPolicyUnsafe` 创建的策略实例仅用于验证，但验证结果未保存。

## 6. 测试覆盖分析

### 6.1 测试文件

- `apps/backend/src/policy-engine/**/*.spec.ts` - 未发现

### 6.2 覆盖建议

| 测试场景 | 优先级 |
|----------|--------|
| 策略注册/注销 | 高 |
| 策略评估 AND/OR | 高 |
| 缓存命中/失效 | 高 |
| 配置 CRUD | 高 |
| 循环依赖场景 | 高（当前重点） |

## 7. 性能分析

| 指标 | 当前值 | 建议 |
|------|--------|------|
| 缓存 TTL | 从 ConfigService 读取 | ✅ 可配置 |
| 批量策略评估 | 串行评估 | 可考虑并行 |
| 策略优先级 | 支持 priority 字段 | ✅ |

## 8. 可维护性分析

### 8.1 代码组织

| 指标 | 评分 | 说明 |
|------|------|------|
| 模块化 | ⭐⭐⭐ | 策略模式良好 |
| 单一职责 | ⭐⭐⭐ | PolicyEngine vs PolicyConfig 边界清晰 |
| 命名规范 | ⭐⭐⭐⭐ | 符合项目规范 |
| 注释 | ⭐⭐⭐ | 基础 JSDoc 存在 |

### 8.2 技术债

1. **clearCache() 空实现** - `PolicyConfigService:445`
2. **createPolicyUnsafe 暴露** - 应仅内部使用
3. **策略元数据缺失** - 无创建者、修改者记录

## 9. 审计结论

| 维度 | 评级 | 备注 |
|------|------|------|
| 代码质量 | B | 架构设计良好，实现有缺陷 |
| 安全性 | B+ | 策略验证基本到位 |
| 性能 | A- | 缓存策略合理 |
| 可维护性 | B- | 循环依赖需解决 |
| 循环依赖 | 🔴 需修复 | 在 refactor/circular-deps 分支中 |

### 9.1 优先改进项

1. **[高]** 解决 PolicyConfigService ↔ PolicyEngineService 循环依赖
2. **[高]** 实现 clearCache() 或使用 clearPattern
3. **[中]** 移除或内部化 createPolicyUnsafe
4. **[中]** 添加策略变更审计日志
5. **[低]** 补充单元测试

---

**审计人**: Trea
**审计时间**: 2026-05-03
