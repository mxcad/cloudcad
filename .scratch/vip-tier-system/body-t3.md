## What to build

支付流程从固定的 MembershipPlan 切换为正交的 VipTier × DurationPricing 模式。

- `PaymentOrder`：`planId` → `vipTierId`(FK) + `months`(Int)
- 价格计算：`amount = VipTier.baseMonthlyPrice × DurationPricing.multiplier × months`
- `BillingService.createOrder()`：接收 `vipTierId` + `durationPricingId`，依新公式算价
- 退款重算：按 vipTierId + months 累加
- 订单查询 API 返回 VIP 等级名和时长，不再引用 plan name

## Acceptance criteria

- [ ] Prisma migration：PaymentOrder 新增 vipTierId + months，planId 改为可选，现有数据迁移
- [ ] `POST /api/billing/orders` 接收新的 body 格式
- [ ] 价格正确计算（验证公式：baseMonthlyPrice × multiplier × months）
- [ ] 支付成功 → MembershipService.activate 正确设置 tierLevel
- [ ] 退款重算逻辑正确
- [ ] 订单查询 API 返回 VIP 等级信息

## Blocked by

- #128 (T1 — VipTier + DurationPricing + ConfigKeyRegistry 领域模型)
- #129 (T2 — UserMembership 迁移至 tierLevel)
