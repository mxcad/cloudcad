## What to build

契约阶段：删除旧的 MembershipPlan 模型和 FileSystemNode.storageQuota 字段。清理所有相关代码。

- 删除 `MembershipPlan` 表（migration drop）
- 删除 `FileSystemNode.storageQuota` 字段（migration drop column）
- 删除 `PlansService`、`CreatePlanDto`、`UpdatePlanDto`
- 清理 `BillingService` 和 `BillingAdminController` 中引用 MembershipPlan 的代码
- 更新 seed.ts：删除 seedMembershipPlans，替换为 seedVipTiers + seedDurationPricing + seedConfigKeyRegistry
- 更新所有引用旧字段/模型的测试

## Acceptance criteria

- [ ] Prisma migration 删除 membership_plans 表
- [ ] Prisma migration 删除 storageQuota 列
- [ ] 代码中不再引用 MembershipPlan 类型和 storageQuota 属性
- [ ] seed 脚本使用新种子函数
- [ ] 所有测试通过（`pnpm test:unit` + `pnpm test:integration`）
- [ ] `pnpm type-check` 通过

## Blocked by

- #130 (T3 — 支付流程改用 vipTierId + months)
