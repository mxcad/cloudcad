## What to build

当前 `UserMembership.tier` 是枚举 `FREE/PRO`。迁移为整数 `tierLevel`（0=VIP0, 1=VIP1, 2=VIP2...），支持多等级体系。

- `UserMembership`：`tier` → `tierLevel Int`，`expiresAt` 逻辑不变（VIP0 永不过期）
- `MembershipService.activate()`：改为写入 `tierLevel` + 计算过期时间
- `MembershipService.getEffectiveTier()`：返回整数等级，过期返回 0
- 数据迁移：现有 FREE→0，PRO→1，设合理默认 expiresAt

## Acceptance criteria

- [ ] Prisma migration：tier 枚举 → tierLevel Int，现有数据迁移
- [ ] `MembershipService.activate()` 写入正确的 tierLevel
- [ ] `MembershipService.getEffectiveTier()` 返回整数等级，过期返回 0
- [ ] `MembershipService.getMembership()` 返回 `{ tierLevel, expiresAt, daysRemaining }`
- [ ] 退款重算逻辑升级为整数比较
- [ ] 单元测试覆盖激活、过期、降级、退款重算场景

## Blocked by

- #128 (T1 — VipTier + DurationPricing + ConfigKeyRegistry 领域模型)
