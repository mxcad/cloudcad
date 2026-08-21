# ADR-0047: 会员配置注册表共享模块

## 状态

已实现

## 日期

2026-07-30

## 背景

支付管理、会员中心、升级方案弹框三处各自实现了不同的配置键格式化逻辑：

| 位置 | 函数/变量 | 方式 |
|------|-----------|------|
| `AdminBillingPage.tsx` | JSON textarea | 手动编辑 `configs` 对象 |
| `MemberCenter.tsx` | `formatQuotaValue()` | switch-case 硬编码 |
| `PlanSelectOverlay.tsx` | `formatFeature()` | switch-case 硬编码 |
| `ProfileMembershipTab.tsx` | `FEATURE_LABELS` + `FEATURE_FMT` | 对象映射硬编码 |

后端已有 `ConfigKeyRegistry` 表和 `/api/v1/vip/tiers/registry` API 作为配置键元数据的权威来源（key、type、label、description、defaultValue），但前端从未消费。

## 决策

### 1. 创建共享前端模块

- `packages/frontend/src/utils/tierConfigUtils.ts` — 纯工具函数
  - `ConfigRegistryEntry` 接口
  - `buildRegistryMap()` / `getConfigLabel()` / `getConfigDescription()` — 从 registry 获取元数据
  - `formatConfigValue()` / `formatConfigValueShort()` — 统一的配置值格式化
  - `resolveConfigKey()` — 处理前端不同键名（`maxStorage` → `quota.personal_storage_mb`）
  - 辅助函数：`formatBytes()`, `formatDurationDays()`, `formatPeople()`

- `packages/frontend/src/hooks/useTierConfigRegistry.ts` — React hook
  - 调用 `vipControllerGetRegistry()` 获取注册表
  - 全局单例缓存（避免重复请求）
  - 返回 `{ registry, entries, loading, refresh }`

### 2. 四类消费者统一使用

| 消费者 | 替换内容 |
|--------|----------|
| `MemberCenter.tsx` | 移除 `formatQuotaValue()`，改用 `formatConfigValue()`；标题从 registry 获取 |
| `PlanSelectOverlay.tsx` | 移除 `formatFeature()`，改用 `formatConfigValueShort()` + `getConfigLabel()` |
| `ProfileMembershipTab.tsx` | `FEATURE_LABELS`/`FEATURE_FMT` 改为用 `getConfigLabel()` + `formatConfigValue()` |
| `AdminBillingPage.tsx` | JSON textarea → 动态表单，从 registry 加载 type 和 label 渲染对应输入控件 |

### 3. VIP等级编辑表单重构

- 移除 JSON textarea
- 从 registry 加载已注册的配置键
- 根据 `type` 动态渲染：
  - `number` → 数字输入框 + description 灰显
  - `bool` → checkbox
- 提交时自动聚合成 `configs` 对象

### 4. 价格单位优化

- 月基础价：前端以**元**为单位（`baseMonthlyPriceYuan`），提交时 ×100 转为分
- 时长倍率：前端以**小数**输入（0.95 = 九五折），提交时 ×10000 转为 bps

### 5. 订单管理 UI

- 搜索栏高度统一使用 `h-[28px]`（对应 Button size="md"）
- 退款按钮移至订单行操作列
- 模拟回调仅对 PENDING 订单显示
- 状态使用 Tag 组件渲染

### 6. 支付弹窗统一

创建 `WechatPayModal` 组件统一三处的支付弹窗：MemberCenter、PlanSelectOverlay（保留）、ProfileMembershipTab。

## 影响

- 前端 4 个文件被修改，2 个新文件创建
- 无后端/数据库变更
- 配置键新增时只需在 `ConfigKeyRegistry` 中添加记录，前端自动适配
- 所有格式化逻辑集中在一处，添加新配置键只需扩展 `tierConfigUtils.ts`

## 未来

- 可在支付管理添加配置注册表管理 tab（ConfigKey CRUD）
- `ConfigKeyRegistry` 支持更多类型（`select`/`string`）时，扩展 `ConfigField` 组件
