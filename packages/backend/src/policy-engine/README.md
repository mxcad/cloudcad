# CloudCAD 策略引擎模块（policy-engine）

## 概述

策略引擎模块提供**动态权限策略**能力：管理员可将"时间 / IP / 设备类型"等访问条件配置为策略，绑定到系统权限上；权限判定时按策略评估结果决定放行或拒绝。模块包含三部分能力：

1. **策略配置管理**（`PolicyConfigService` + `PolicyConfigController`）：策略 CRUD、启停、权限绑定，持久化到 `PermissionPolicy` / `PolicyPermission` 表。
2. **策略评估引擎**（`PolicyEngineService`）：注册策略实例、按 AND/OR 逻辑聚合评估、结果缓存。
3. **策略实现**（`policies/`）：`TimePolicy`、`IpPolicy`、`DevicePolicy` 三种内置策略类。

> ⚠️ **激活状态（基于源码核实，2026-08）**：模块**能力完整但生产链路未接线**。
>
> - `PolicyEngineModule` 已在 `app.module.ts:133` 注册，`/policy-config` 路由与配置管理功能可用；
> - 唯一评估入口 `PermissionService.checkSystemPermissionWithContext` **无任何生产调用方**（仅接口定义 `permission-service.interface.ts:29` 与单测引用），业务代码均走 `checkSystemPermission`；
> - `ContextPermissionStrategy`（`permission/strategies/context-permission.strategy.ts:24-27`）以 `@Optional()` 注入策略服务——注入存在但从未被触发，评估链路实际不生效；
> - `PermissionPolicy` 表无存量数据；`registerDefaultPolicies()` 为空实现。
> - **未发现 file-system / file-operations 等模块 import `policy-engine`**（全仓 grep 仅命中 `app.module.ts`、`permission/strategies/context-permission.strategy.ts` 及其 spec）。
>
> 激活条件：① 业务调用方改走 `checkSystemPermissionWithContext` 并传 context；② 管理员通过 `/policy-config` 配置策略数据。

## 目录结构

```
src/policy-engine/
├── policy-engine.module.ts              # 模块定义（注册 Controller + 3 个 Service）
├── controllers/
│   └── policy-config.controller.ts      # 策略配置 CRUD / 启停 API
├── services/
│   ├── policy-engine.service.ts         # 策略注册与评估引擎
│   ├── policy-factory.service.ts        # 策略实例工厂（含配置验证）
│   ├── policy-config.service.ts         # 策略配置持久化 + 缓存
│   └── policy-config.service.spec.ts    # 单元测试（仅缓存清理断言）
├── policies/
│   ├── base-policy.ts                   # 抽象基类（通用配置校验/结果构造）
│   ├── time-policy.ts                   # 时间策略（TIME）
│   ├── ip-policy.ts                     # IP 地址策略（IP）
│   └── device-policy.ts                 # 设备策略（DEVICE）
├── interfaces/
│   └── permission-policy.interface.ts   # IPermissionPolicy / PolicyContext / 结果类型
├── enums/
│   └── policy-type.enum.ts              # PolicyType 枚举 + 中文元数据
└── dto/
    ├── create-policy.dto.ts             # 创建策略请求体
    ├── update-policy.dto.ts             # 更新策略请求体（全部可选）
    └── policy.dto.ts                    # 响应/评估结果/Schema DTO
```

## 核心组件详解

### 1. PolicyEngineModule

```typescript
@Module({
  imports: [DatabaseModule, CommonModule, PermissionModule],
  controllers: [PolicyConfigController],
  providers: [PolicyFactoryService, PolicyEngineService, PolicyConfigService],
  exports: [PolicyFactoryService, PolicyEngineService, PolicyConfigService],
})
```

构造函数调用空实现的 `registerDefaultPolicies()`（策略配置应从数据库加载，模块内未注册任何默认策略实例）。

### 2. 策略接口与上下文（interfaces/permission-policy.interface.ts）

- `IPermissionPolicy`：所有策略必须实现——`getType()/getName()/getDescription()`、`evaluate(context)`、`validateConfig(config)`、`getConfigSchema()`。
- `PolicyContext`：评估输入，含 `userId`、`permission`、可选 `time` / `ipAddress` / `userAgent` / `metadata`。
- `PolicyEvaluationResult`：单策略结果（`allowed` + 可选 `reason` + `policyId`/`policyType`/`evaluatedAt`）。
- `PolicyConfigSchema` / `PolicyConfigProperty`：声明式配置结构，供前端展示与 `BasePolicy.validateConfig` 通用校验。

### 3. 策略实现（policies/）

| 策略类 | 类型 | 配置项（必填） | 评估逻辑 |
|---|---|---|---|
| `TimePolicy` | `TIME` | `startTime`、`endTime`（HH:mm） | 解析 `context.time`，支持跨天时间段（如 22:00-06:00）；可选 `allowedDays`（0=周日…6=周六，超出即拒绝） |
| `IpPolicy` | `IP` | `allowedIps` | 缺 `context.ipAddress` 即拒绝；先查 `deniedIps`/`deniedRanges`（CIDR），再查允许列表；自带 IPv4→数字与 CIDR 位掩码匹配实现 |
| `DevicePolicy` | `DEVICE` | `allowedTypes` | 从 `context.userAgent` 正则识别 `DESKTOP` / `MOBILE` / `TABLET` / `API_CLIENT` / `UNKNOWN`；支持 `deniedTypes` 与 `allowUnknown`（默认 false） |

`BasePolicy`（抽象）提供公共骨架：`validateConfig` 按 `getConfigSchema()` 校验必填字段、类型、枚举、数值范围；`createAllowedResult()` / `createDeniedResult(reason)` 构造评估结果；子类各自覆写 `evaluate` 并叠加专属校验（时间格式、IP/CIDR 格式、设备类型合法性）。

### 4. PolicyFactoryService（services/policy-factory.service.ts）

以 `Map<PolicyType, factory>` 注册三类策略构造函数；`createPolicy()` 创建实例并执行 `validateConfig`（失败抛 `BadRequestException`，i18n 键 `error.policy.unknown_type` / `error.policy.config_validation_failed`）；`createPolicyUnsafe()` 跳过验证（供配置存储路径使用）。独立成服务以解除 `PolicyConfigService` 对 `PolicyEngineService` 的依赖。

### 5. PolicyEngineService（services/policy-engine.service.ts）

- 内存注册表 `Map<string, IPermissionPolicy>`：`registerPolicy` / `registerPolicies` / `getPolicies` / `getPolicyByType` / `removePolicy` / `clearPolicies`；`createPolicy(Unsafe)` 委托工厂。
- `evaluatePolicy`：先查缓存（键 = `policy:{type}:{userId}:{permission}:{ip}:{ua}`，TTL 来自 `cacheTTL.policy` 配置秒数 ×1000），未命中才执行 `policy.evaluate` 并写缓存；策略抛异常时降级为拒绝并记录错误。
- `evaluatePolicies`（AND）：任一策略拒绝立即短路返回；`evaluatePoliciesAny`（OR）：任一放行即返回。
- `clearPolicyCache` 为占位实现（仅日志，未真正清缓存）。

### 6. PolicyConfigService（services/policy-config.service.ts）

策略配置的持久化层，操作 Prisma 模型 `PermissionPolicy`（表 `permission_policies`）与 `PolicyPermission`（表 `policy_permissions`，`@unique([policyId, permission])`）：

- `createPolicyConfig` / `updatePolicyConfig` / `deletePolicyConfig` / `getPolicyConfig` / `getAllPolicyConfigs`（按 `priority` 降序）/ `togglePolicyConfig` / `getEnabledPoliciesForPermission`。
- 写路径均通过 `createPolicyUnsafe` 做配置预检（`createPolicyConfig` 必检；`updatePolicyConfig` 仅在 `config` 与 `type` **同时**提供时校验）。
- 读路径缓存 `policy_config:{id}` / `policy_config:all` / `policy_config:permission:{perm}`；任何写操作后调用 `clearCache()` 按模式清除 `policy_config:*` 与 `policy:*` 两类缓存。
- 异常统一抛 `InternalServerErrorException`（不存在时抛 `NotFoundException`，i18n 键 `error.policy.config_not_found`）。

### 7. PolicyConfigController（controllers/policy-config.controller.ts）

`@Controller('policy-config')` + `@ApiBearerAuth()`，写操作与启停需 `SYSTEM_ROLE_PERMISSION_MANAGE`，查询需 `SYSTEM_ROLE_READ`。`@Request()` 取 `req.user.id` 作为操作者。注意：`GET :id` 的 404 分支使用裸 `throw new Error(...)` 而非 NestJS 异常。

### 8. DTO（dto/）

- `CreatePolicyDto`：`type`（枚举校验）、`name`、`description?`、`config`（对象）、`permissions`（`SystemPermission[]`，非空）、`enabled?`（默认 true）、`priority?`（默认 0）。
- `UpdatePolicyDto`：`PartialType(OmitType(CreatePolicyDto, ['type']))` + 可选 `type`，全部字段可选。
- `policy.dto.ts`：`PolicyResponseDto`（响应体）、`PolicyConfigPayloadDto`、`PolicyEvaluationResultDto` / `PolicyEvaluationSummaryDto`、`PolicyConfigSchema(Property)Dto`（Swagger 文档用）。

## API 端点

路由前缀 `policy-config`（统一经 JWT 认证 + 权限校验）：

| 方法 | 路径 | 所需权限 | 描述 |
|---|---|---|---|
| POST | `/policy-config` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 创建策略配置（201） |
| PUT | `/policy-config/:id` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 更新策略配置 |
| DELETE | `/policy-config/:id` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 删除策略配置（204） |
| GET | `/policy-config/:id` | `SYSTEM_ROLE_READ` | 查询单个策略配置 |
| GET | `/policy-config` | `SYSTEM_ROLE_READ` | 查询全部策略配置（按优先级降序） |
| PUT | `/policy-config/:id/enable` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 启用策略 |
| PUT | `/policy-config/:id/disable` | `SYSTEM_ROLE_PERMISSION_MANAGE` | 禁用策略 |

创建示例（TIME 策略）：

```json
{
  "type": "TIME",
  "name": "工作时间限制",
  "description": "仅允许 9:00-18:00 访问",
  "config": { "startTime": "09:00", "endTime": "18:00", "allowedDays": [1, 2, 3, 4, 5] },
  "permissions": ["SYSTEM_USER_DELETE"],
  "enabled": true,
  "priority": 0
}
```

## 数据模型

`PermissionPolicy`（`permission_policies`）：`type`（`PolicyType` 枚举）、`name`、`description?`、`config`（JSON）、`enabled`（默认 true）、`priority`（默认 0），索引 `[type]` / `[enabled]` / `[priority]`。
`PolicyPermission`（`policy_permissions`）：策略-权限多对多关联，`onDelete: Cascade`，唯一约束 `(policyId, permission)`。

## 测试

仅 `policy-config.service.spec.ts` 一份单测（`PolicyConfigService`）：mock Prisma / 缓存 / 工厂，验证 create / update（含权限更新）/ delete / toggle 成功后按模式清空 `policy_config:*` 与 `policy:*` 两类缓存。策略类（`TimePolicy` / `IpPolicy` / `DevicePolicy`）、`PolicyEngineService`、`PolicyFactoryService` 均无单测。
