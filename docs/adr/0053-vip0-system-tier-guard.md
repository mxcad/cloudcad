# 0053 — VIP0 系统固有等级治理（System-reserved free tier guard）
**Status**: accepted

# 背景

VIP0（免费用户）是所有账号注册即拥有的默认等级：`UserMembership.tierLevel` 默认 0，
无会员行/已过期即免费态，系统各消费方（登录展平、会员展示、免费配额兜底、管理端降级用户、
旧订单继续支付兜底 `billing.service` 的 `findFirst level 0`）都把它当作固有基线。

但管理面一直把它当作**可上下架/可删除的商品**：`vip_tiers.isActive` 可任意翻转；
admin 的 `deactivate`/`remove`/`update`/`create` 无任何 level-0 保护，DTO 甚至 `@Min(0)` 允许创建
level 0；管理端 UI 对 VIP0 与其他等级一样显示「下架」「删除」按钮。

实际破坏后果：

- **下架 VIP0**：会员中心免费卡消失（所有等级下架时显示「暂无可用方案」）；
  权益对比少一行免费档。
- **删除 VIP0**：无 `vipTierId` 的旧订单「继续支付」404（`billing.service` 兜底查 level 0 失效）；
  免费配额 configs 失去载体，回落 registry 默认值。
- **症候**：`MembershipManageModal` 被迫硬编码「VIP0（免费用户）」兜底项，与接口返回的
  level 0 叠加出现「两个 VIP0」bug——前端在对抗一个不可信的概念模型。

用户明确要求：**VIP0 应作为系统固有等级，不可下架、不可删除**。

# Decision

## 1. 概念定位：VIP0 是系统固有默认等级，不是商品

- VIP0 = 免费基线，所有账号注册即拥有；「移除会员」= 提交 `tierLevel: 0`。
- **保留在 `vip_tiers` 表**（level 0 行）：其 `configs` 承载免费用户配额，是它留在表里的理由。
- 系统固有性由代码守卫 + UI 保护固化，不新增字段、不做数据迁移。

## 2. 后端守卫（`VipTierService`，常量 `FREE_TIER_LEVEL = 0`）

| 操作 | 行为 |
|------|------|
| `create` | 拒绝 `level === 0`（400） |
| `update` | 拒绝 `name`/`baseMonthlyPrice`/`isActive` 任一**实际变更**（与现有值比较，回传原值放行） |
| `deactivate`（下架） | 拒绝 level 0（400） |
| `remove`（物理删除） | 拒绝 level 0（400） |
| `updateConfigs` | **放行**（免费配额编辑入口） |

## 3. 前端管理页（`AdminBillingPage`）

- `TiersTab`：level 0 行显示「系统默认」Tag（替代上架/下架 Tag），隐藏下架/删除按钮；
  编辑按钮保留（configs 入口）。
- `TierFormModal`：`freeTier` prop 为 true 时锁定名称/价格输入（仅权益配置可改）；
  创建弹窗 level 输入 `min={1}`，杜绝 UI 路径创建 level 0。
- `useTierManagement` 维护 `tierEditingFreeTier`（`openEditTier` 按 `item.level === 0` 标记）。

## 4. 公开接口与前端消费约定

- `GET /vip/tiers`（`findActive`）**保持返回 level 0**——`MemberCenter` 套餐卡片依赖它渲染
  VIP0 免费卡；不得在后端过滤。
- 前端消费方按「接口恒含 level 0」设计，**禁止重复硬编码**免费选项；
  `MembershipManageModal` 改为直接用接口数据，仅当接口异常缺失 level 0 时 `unshift` 补一条兜底
  （防御 DB 异常，用 `some(level === 0)` 判断杜绝重复）。

# Rejected options

- **方案 B：概念归位（`vip_tiers` 只存 level ≥ 1，VIP0 移出为代码常量）**：概念最干净，
  但需数据迁移 + 改 billing 旧单兜底/免费配额来源/seed/管理端列表/前端多处联动，风险高；
  免费配额 configs 失去表载体。
- **仅修前端去重（不守卫）**：下架/删除 VIP0 的风险依然存在，等于保留 bug 的土壤。

# Known trade-offs

- `vip_tiers` 表仍含一条「非商品」记录，管理列表靠 `level === 0` 识别系统固有性
  （语义由守卫固化，未加标记字段）。
- 免费配额配置入口位于「VIP 等级」编辑弹窗的权益配置区，语义上是「默认等级配置」而非商品编辑。
- 创建弹窗仍可输入 level 1-99（`min={1}` 仅 UI 约束，`@Min(0)` DTO 未收紧以避免 SDK 连锁，
  守卫在 service 层兜住）。

# Cross-references

- `packages/backend/src/vip/vip-tier.service.ts`（`FREE_TIER_LEVEL` 守卫）
- `packages/backend/src/vip/vip-tier.service.spec.ts`（守卫用例，6 个）
- `packages/frontend/src/pages/AdminBillingPage/components/TiersTab.tsx` / `TierFormModal.tsx` /
  `hooks/useTierManagement.ts`
- `packages/frontend/src/pages/UserManagement/UserModals/MembershipManageModal.tsx`（重复 VIP0 根治）
- `packages/frontend/src/pages/MemberCenter.tsx`（`GET /vip/tiers` 消费 level 0 免费卡）
- `packages/backend/src/billing/billing.service.ts`（旧订单继续支付兜底 `findFirst level 0`）
- CONTEXT.md「VIP 等级」条目
