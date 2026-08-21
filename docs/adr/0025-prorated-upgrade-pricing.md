# ADR-0025: VIP 升级按价差折算延期

## 状态

2026-07-30 通过

## 背景

旧官网已有 VIP 的用户同步到本地后，再在本地购买更高级 VIP（V2/V3）时，原系统只是简单地将新购买时长叠加在旧到期时间之上，旧 VIP 剩余时间被"白送"，不折算成新等级的时间。

例如：用户有 VIP1（剩余 60 天），再买 VIP2（90 天）。
- 旧行为：VIP2 到期 = now + 90 天（旧 VIP1 剩余 60 天白送）
- 期望：VIP2 到期 = now + 120 天（旧 VIP1 剩余价值折算成 30 天 VIP2）

## 决策

### 核心算法

升级时，将旧等级的**剩余价值**按**价格比例**折算为等价的新等级天数：

```
extraDays = floor(remainingDays × oldTierMonthlyPrice / newTierMonthlyPrice)
totalDays = purchasedDays + extraDays
```

### 公式推导

```
旧等级日单价 = oldTierMonthlyPrice / 30
旧等级剩余价值 = remainingDays × (oldTierMonthlyPrice / 30)
新等级日单价 = newTierMonthlyPrice / 30
额外天数 = 旧等级剩余价值 / 新等级日单价
        = remainingDays × (oldTierMonthlyPrice / 30) / (newTierMonthlyPrice / 30)
        = remainingDays × oldTierMonthlyPrice / newTierMonthlyPrice
```

### 实施位置

在 `BillingService.handlePaymentNotify()` 中、调用 `MembershipService.activate()` 之前，新增 `calculateUpgradeExtraDays()` 方法计算折算天数。

### 边界处理

| 场景 | 行为 |
|------|------|
| 续费同等级 | `existing.tierLevel >= newTier.level` → 不折算，直接用 `purchasedDays` |
| 已过期后升级 | `expiresAt <= now` → 不折算 |
| 无旧会员记录 | `!existing` → 不折算 |
| 旧等级价格不可查 | `!oldTier` → 不折算，容错返回 |
| 旧等级价格 ≤ 0 | 不折算，防止除零 |
| 剩余天数极短 | `extraDays = floor(...)` 向下取整，可能为 0 |
| 降级 | `createOrder` 阶段已被拦截，不会到达此逻辑 |

### 不影响的范围

- **续费同等级**：tierLevel 判断跳过，行为不变
- **降级**：createOrder 阶段拦截
- **旧官网同步**：同步路径走 `OldSiteUserSyncService` 直接调 `activate()`，不走 `handlePaymentNotify()`
- **退款重算**：走 `recalculateMembershipAfterRefund()`，独立逻辑

## 示例验证

| 旧等级 | 新等级 | 旧月价 | 新月价 | 旧剩余 | 购买月数 | 公式 | 额外 | 总延期 |
|--------|--------|--------|--------|--------|---------|------|------|--------|
| VIP1 | VIP2 | ¥10 | ¥20 | 60天 | 3月(90天) | 60×10/20 | 30天 | 120天 |
| VIP1 | VIP3 | ¥10 | ¥50 | 60天 | 3月(90天) | 60×10/50 | 12天 | 102天 |
| VIP2 | VIP3 | ¥20 | ¥50 | 45天 | 6月(180天) | 45×20/50 | 18天 | 198天 |

## 反对方案

- **按差价支付**：下单时计算差价，用户只支付差额。否决理由：需改网关支付金额，涉及退款重算，复杂度高，且旧官网同步来源的 VIP 无实际支付记录。
- **不退旧等级直接升级**（当前行为）：旧剩余时间白送。否决理由：伤害用户利益，升级意愿降低。

## 后果

- `BillingService` 新增 `calculateUpgradeExtraDays()` 私有方法
- 所有现有 `handlePaymentNotify` 测试需要补充 `userMembership` 和 `vipTier` 的 tx mock 对象
- 升级后总延期天数 = 购买天数 + 折算天数，`MembershipService.activate()` 接口不变
- 如果未来引入按比例退款等场景，此处的剩余价值计算可作为基础能力复用
