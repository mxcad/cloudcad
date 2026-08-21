# VIP 等级 + 键值对配额配置系统
**Status**: accepted

将原有的二元（FREE/PRO）会员体系升级为线性 VIP 等级体系，配额和权限通过后端注册的键值对系统配置。

## Context

旧版会员体系只有 FREE/PRO 两个 tier，`MembershipPlan.features` 为未使用的 JSON 占位字段。存储配额通过 `FileSystemNode.storageQuota` 节点级字段配置，与会员系统割裂。需要一套统一、可配置、即时生效的等级权限系统。

## Decision

### 等级模型

- **线性等级**：VIP0 → VIP1 → VIP2 → VIP3...，每级拥有低级全部权限
- **扁平配置**：每级存完整键值对快照，新增等级时复制上一级为模板
- **VIP0**：默认永久有效，所有用户初始即拥有
- **过期降级**：VIP1+ 过期后降为 VIP0

### 等级 × 时长正交

- 等级只定义权限/限额，时长只影响定价
- `最终价 = 等级月基础价 × 时长倍率 × 月数`
- 时长倍率按连续折扣曲线配置（1月1.0 → 12月0.7，按月线性递减）
- 购买时长支持 1~12 月任意整数月，每个月份有对应的倍率（种子数据生成所有 12 条记录）

### 配置系统

- 通用 Key-Value 结构（`TierConfig`），Key 由后端 `ConfigKeyRegistry` 注册
- Registry 定义每个 Key 的类型、显示名、多语言
- 前端/管理后台通过 `/api/tier-config/registry` 获取渲染配置
- 新增配置项只需后端注册 + 种子数据，不修改前端

### 配置项清单

| Key | 类型 | 说明 |
|-----|------|------|
| `quota.personal_storage_mb` | number | 个人空间容量上限(MB) |
| `quota.daily_conversion_count` | number | 每日转换次数上限 |
| `quota.project_size_mb` | number | 用户可参与的项目最大体积(MB) |
| `quota.max_projects` | number | 最大可创建项目数 |

### 检查机制

- **主动检查**：上传/转换前校验额度，不足时返回 `InsufficientQuotaException`
- **项目 / 个人空间体积**：检查目标（Project / PersonalSpace）的缓存 `totalSize` + 增量 ≤ 用户对应的限额。目标为个人空间时读 `quota.personal_storage_mb`，为项目时读 `quota.project_size_mb`。两者底层检查逻辑相同，仅读取的 key 不同
- **转换次数**：自然日 UTC+8 统计，不限转换格式（PDF/DXF/DWG 统一计数）
- **覆盖行为**：上传、粘贴、移动、复制、另存等增加项目体积的操作均检查

### 废弃

- `FileSystemNode.storageQuota` 字段删除，项目不再有独立配额属性
- 项目总大小改为动态实时计算

### 生效策略

等级配置变更即时生效，不保留购买时快照。

### 策略管道（扩展：RestrictionEngine + RestrictionStrategy）

原 `QuotaEnforcementService` 升级为通用策略管道，核心不变即可新增限制类型。

**接口设计**（来自 T1 决议）：

```typescript
interface RestrictionStrategy {
  readonly key: string;
  check(config: Record<string, unknown>, ctx: RestrictionContext): RestrictionResult;
}

interface RestrictionResult {
  allowed: boolean;
  key: string;
  message?: string;
  current?: number;     // 当前用量（用于错误提示）
  limit?: number;        // 实际限制值（用于错误提示）
  configLimit?: number;  // 配置中的原始限制值
}

interface RestrictionContext {
  userId: string;
  projectId?: string;
  incrementBytes?: number;
  tierLevel: number;
  tierConfig: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

- `RestrictionEngine`：`evaluate(ctx: RestrictionContext): Promise<void>` — fail-fast，任一策略 `allowed=false` 即抛 `ForbiddenException`
- 无 `getQuotaOverview` 路径（以后需要时再添加）

**注册方式**：NestJS DI multi-provider 模式收集策略。定义 `RESTRICTION_STRATEGY` InjectionToken，`multi: true`，新增策略 = 新建 class + 加一行 provider：

```
// vip.module.ts
{
  provide: RESTRICTION_STRATEGY,
  multi: true,
  useClass: ProjectSizeStrategy,
}
```

**策略清单**：
| 策略 | Key | 逻辑 |
|------|-----|------|
| `ProjectSizeStrategy` | `quota.project_size_mb` | `incrementBytes + project.totalSize <= limitBytes` |
| `PersonalStorageStrategy` | `quota.personal_storage_mb` | `incrementBytes + personal.totalSize <= limitBytes` |
| `ConversionDailyStrategy` | `quota.daily_conversion_count` | Redis 计数器 `conversion:daily:{userId}:{YYYY-MM-DD}`，TTL 48h |

**配置 Key 命名规范**（来自 T2 决议）：
- 点分式前缀体系：`quota.*`（数值型额度）、`feature.*`（布尔型功能开关，未来）、`rate.*`（数值型速率限制，未来）
- Key 全小写 snake_case
- 值类型宽松，运行时无校验（信任 seed 数据）
- `ConfigKeyRegistry.type` 仅管理端 UI 展示 label/type/description，运行时完全不查询
- 默认值由策略代码硬编码：`(tierConfig[key] as number) ?? DEFAULT_VALUE`

**接入策略点枚举**（来自 T3 决议）：

上传/保存端点（检查 `personal_storage_mb` + `project_size_mb`）：
| # | 路由 | Controller |
|---|------|-----------|
| 1 | POST /mxcad/files/uploadFiles | mxcad-upload.controller.ts |
| 2 | POST /mxcad/savemxweb/:nodeId | save.controller.ts |
| 3 | POST /mxcad/save-as | save.controller.ts |
| 4 | POST /mxcad/up_ext_reference_dwg/:nodeId | external-ref.controller.ts |
| 5 | POST /mxcad/up_ext_reference_image/:nodeId | external-ref.controller.ts |
| 6 | POST /library/drawing/save/:nodeId | library.controller.ts |
| 7 | POST /library/drawing/save-as | library.controller.ts |
| 8 | POST /library/block/save/:nodeId | library.controller.ts |
| 9 | POST /library/block/save-as | library.controller.ts |
| 10 | POST /file-system/nodes/:nodeId/copy | node.controller.ts |
| 11 | POST /file-system/nodes/batch-copy | node.controller.ts |

转换端点（检查 `daily_conversion_count`）：
| # | 路由 | Controller |
|---|------|-----------|
| 1 | POST /mxcad/files/uploadFiles | mxcad-upload.controller.ts |
| 2 | POST /mxcad/up_ext_reference_dwg/:nodeId | external-ref.controller.ts |
| 3 | GET /mxcad/file/:nodeId/download-external-ref/:fileName | mxcad-file-access.controller.ts |
| 4 | POST /public-file/convert | public-file.controller.ts（@Public() 无认证—可能跳过额度） |
| 5 | GET /file-system/nodes/:nodeId/download-with-format | download.controller.ts |

项目创建端点（检查 `max_projects`）：
| # | 路由 | Controller |
|---|------|-----------|
| 1 | POST /file-system/projects | project.controller.ts |

接入方式：**Service 层**调用 `RestrictionEngine.evaluate()`，而非 Controller 层。理由：Service 层有完整运行时上下文（文件大小、目标路径等），新旧 `StorageQuotaInterceptor` 直接替换为 Engine 调用。

## Considered Options

- **固定字段配置**：每个 VIP 等级用固定列存储。否决理由：新增限制需改 schema + 部署，违背"易配置"目标。
- **等级+套餐双轴**：等级和套餐独立（如 SaaS 模式）。否决理由：过度设计，当前场景只需线性等级。
- **快照锁定**：购买时保存配置快照。否决理由：与"随时改套餐限制"需求冲突，增加复杂度。
- **继承+差量**：VIP2 只保存与 VIP1 的差异。否决理由：查询需逐级计算，增加查询复杂度；与"完整展平"需求不符。

### 数据库模型

```
VipTier:
  id, level (0/1/2/3), name ("VIP0"/"VIP1"/...),
  baseMonthlyPrice (分), isActive,
  configs (JSON)  ← 权限配置键值对

DurationPricing:
  id, months (1~12), multiplierBps (10000/9700/9500/9200/.../7000),
  label ("N个月"), isActive, sortOrder

ConfigKeyRegistry:
  id, key, type (number/bool), label (i18n key),
  defaultValue, description, sortOrder

PaymentOrder:
  id, orderNo, userId, vipTierId (FK), months, amount (分),
  status, gateway, ...  ← 废弃 planId

UserMembership:
  id, userId (unique), tierLevel (int = 0/1/2/3),
  expiresAt, createdAt, updatedAt
```

### 价格计算

```
amount = VipTier.baseMonthlyPrice × DurationPricing.multiplierBps × months ÷ 10000
示例：VIP2(3000分) × 6月(0.86) × 6 = 15480分 ≈ 155元
```

连续折扣曲线（线性插值，四舍五入到百位）：

| months | multiplierBps | 折扣 |
|--------|-------------|------|
| 1 | 10000 | - |
| 2 | 9700 | 九七折 |
| 3 | 9500 | 九五折 |
| 4 | 9200 | 九二折 |
| 5 | 8900 | 八九折 |
| 6 | 8600 | 八六折 |
| 7 | 8400 | 八四折 |
| 8 | 8100 | 八一折 |
| 9 | 7800 | 七八折 |
| 10 | 7500 | 七五折 |
| 11 | 7300 | 七三折 |
| 12 | 7000 | 七折 |

### 迁移策略：Expand → Contract

所有涉及旧模型废弃的变更采用 **expand → contract** 两步迁移：

**Phase 1 - Expand**（新旧并存）：
- 新模型（`VipTier`、`DurationPricing`、`ConfigKeyRegistry`）创建，种子数据写入
- `PaymentOrder.planId` 改为可选，新增 `vipTierId` + `months`
- `FileSystemNode.totalSize` 新增，`storageQuota` 保留
- 新代码同时读写新旧路径，旧数据继续可读

**Phase 2 - Contract**（清理废弃）：
- 验证新模型数据完整，旧模型无引用
- DROP TABLE `membership_plans`
- DROP COLUMN `FileSystemNode.storageQuota`
- `PaymentOrder.planId` 彻底移除
- 回滚需从备份恢复

此模式减少了大爆炸式重构的风险，每步可单独验证和回滚。

## Consequences

- **新增模型**：`VipTier`、`DurationPricing`、`ConfigKeyRegistry`
- **废弃模型**：`MembershipPlan`（数据迁移至 `VipTier` + `DurationPricing`）
- **修改模型**：`UserMembership` 的 `tier` 枚举 → `tierLevel` 整数；`PaymentOrder` 的 `planId` → `vipTierId` + `months`
- **删除字段**：`FileSystemNode.storageQuota`
- **新增服务**：`RestrictionEngine`（策略管道引擎）、`ProjectSizeStrategy`、`PersonalStorageStrategy`、`ConversionDailyStrategy`、`TierConfigService`（读取+缓存 VIP 配置）
- **废弃服务**：`QuotaEnforcementService`（由策略管道替代）
- **重构服务**：`StorageQuotaService`/`StorageInfoService` 改为读 `VipTier.configs`；`MembershipService` 改为操作 `UserMembership.tierLevel`
- **新增 API**：`GET /api/vip-tiers`、`GET /api/vip-tiers/registry`、`GET /api/duration-pricings`、`PUT /api/admin/vip-tiers/:id/configs`
- **新依赖**：Redis 记录日转换次数（key: `conversion:daily:{userId}:{YYYY-MM-DD}`, TTL 48h）
