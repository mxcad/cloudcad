# 注册自动送会员（Register Membership Gift）设计

日期：2026-10-29
状态：待确认
范围：后端（packages/backend）· 运行时配置（runtime-config）· 会员激活（vip/membership）

## 1. Intent / Why

新账号注册即赠送 **VIP1 基础档会员**，作为拉新促销。默认开启、默认送 1 个月；
管理员可通过运行时配置调整「开关」与「赠送月数」。业务语义：任何自服务方式新开账号，
创建成功后自动获得 N 个月的 VIP1 会员（一次性写入 userMembership）。

## 2. Goals / Non-goals / Anti-goals

### Goals
- 所有**自服务建号路径**成功后自动赠送固定 VIP1 × N 月：
  1. `registration.service.ts` 注册表单（邮件服务关闭直接建号）
  2. `registration.service.ts` 注册表单（不强制邮箱验证直接建号）
  3. `registration.service.ts` 邮箱验证通过后建号（`verifyEmailAndActivate`）
  4. `local-auth.provider.ts` 手机验证码自动注册（`allowAutoRegisterOnPhoneLogin`）
  5. `local-auth.provider.ts` 微信自动注册（`wechatAutoRegister`）
  6. `local-auth.provider.ts` 邮箱验证后手机号注册
  7. `local-auth.provider.ts` 手机号注册
- 赠送月数 N 可通过运行时配置调整，默认 1。
- 赠送开关默认开启。

### Non-goals
- **不**新增「赠送等级」配置键——等级固定 VIP1（level 1），本次用户已拍板。
- **不**改 `configKeyRegistry`（配额键表）、**不**改 DB schema、**不**产生 migration。
- **不**覆盖管理员/初始化建号路径（`first-admin-setup`、管理员手动建号）——「新账号」仅指自服务注册。
- **不**在注册页/登录页展示「注册即送 VIP」促销角标（本次范围外，另行评估）。

### Anti-goals
- 赠送失败**绝不阻断注册**：注册主流程成功即返回，赠送是 best-effort（打错误日志）。
- 不得绕过 `MembershipService.activate` 直接写 `userMembership`（ADR-0036 写侧唯一入口）。

## 3. Constraints

- 会员写侧唯一入口：`MembershipService.activate(tx, userId, { level, baseMonthlyPrice }, purchasedDays)`。
  新用户无旧会员记录 → 直接以 `now + N×MONTH_DAYS` 起始（`MONTH_DAYS = 30`，复用 `vip/membership.service.ts` 常量）。
- 运行时配置键加进 `RUNTIME_CONFIG_DEFINITIONS`（`runtime-config.constants.ts`）即可：
  启动时 `syncDefaultConfigs` 自动落库 `runtimeConfig` 表，配置页按 definitions 自动分组渲染
  （category/subgroup），**无需 migration、无需改前端配置页**。
- `activate` 需要 `baseMonthlyPrice`（仅用于旧档升级折算；新用户无旧记录会被短路，但传参仍需合法值）
  → 必须查 `vipTier` 表取 level 1 的 `baseMonthlyPrice`。
- 档位种子：VIP1(level 1, baseMonthlyPrice 1500)、VIP2(2)、VIP3(3)；`VipTier` 表运行时可改，故 level 1 可能缺失/停用 → 需兜底。

## 4. Approaches

### A. 独立 `RegistrationGiftService` + 各建号点显式调用（推荐）
- 新增 `packages/backend/src/auth/services/registration-gift.service.ts`，承载全部赠送逻辑
  （读配置 → 查 VIP1 档 → 事务内 activate → best-effort），各建号点加一行
  `await this.registrationGiftService.grantGiftIfEnabled(user.id)`。
- 单点可测；赠送逻辑不散落；失败静默且不污染注册主流程。
- 代价：7 个建号点各加一行调用。

### B. 在 `IUserService.create` 加 `grantGift` 选项
- 微信自动注册走 `userRepo.create`（不在 `userService.create` 内），仍要单独处理；
  `create` 同时被管理员/初始化共用，flag 语义混浊；实际不比 A 简单，不选。

### C. 事件总线监听
- 无现成事件总线，1 个监听器过度设计；且难以保证赠送先于令牌签发（用户登录即应看到会员），不选。

**结论：选 A。**

## 5. The How（已定部分）

### 5.1 配置键（`runtime-config.constants.ts`，`RUNTIME_CONFIG_DEFINITIONS`）

新增两键，`category: 'account'`、`subgroup: 'registration'`（与 `allowRegister` 同组）：

| key | type | defaultValue | isPublic | tier | input |
|---|---|---|---|---|---|
| `registerGiftEnabled` | boolean | `true` | false | admin | — |
| `registerGiftMonths` | number | `1` | false | admin | `{ min: 1, max: 36, step: 1, unit: '月' }` |

说明：
- `isPublic: false`、`tier: 'admin'` → 仅管理端配置页可见可改，不出现在公共配置 API（促销角标后续如需展示再提公开）。
- `registerGiftMonths` 上限设 36（3 年）为安全上限，管理员可调 1~36。

### 5.2 `RegistrationGiftService.grantGiftIfEnabled(userId: string): Promise<void>`

1. `registerGiftEnabled = getValue<boolean>('registerGiftEnabled')`；`false` → return。
2. `months = getValue<number>('registerGiftMonths')`；`months <= 0` → return。
3. `tier = prisma.vipTier.findUnique({ where: { level: 1 } })`；缺失或 `!tier.isActive` → logger.warn + return（best-effort）。
4. `prisma.$transaction(tx => membershipService.activate(tx, userId, { level: 1, baseMonthlyPrice: tier.baseMonthlyPrice }, months * MONTH_DAYS))`。
5. 整方法 try/catch：失败 `logger.error`（含 userId），**不抛**——赠送失败不阻断注册。

依赖注入：`RuntimeConfigService`、`MembershipService`、`DatabaseService`（`DatabaseService` 已由 `DatabaseModule` 导出；
`MembershipService` 已由 `VipModule` 导出并在 `auth.module.ts` 直接 import，均可注入）。
`RegistrationGiftService` 注册进 `AuthModule.providers`。

### 5.3 建号点埋点（7 处，均在 user 创建成功后立即调用）

| 文件 | 行（现基线） | 变量 |
|---|---|---|
| `registration.service.ts` | ~93（邮件关闭） | `user.id` |
| `registration.service.ts` | ~126（无需邮箱验证） | `user.id` |
| `registration.service.ts` | ~195（verifyEmailAndActivate） | `user.id` |
| `local-auth.provider.ts` | ~146（手机自动注册） | `newUser.id` |
| `local-auth.provider.ts` | ~274（微信自动注册） | `user.id` |
| `local-auth.provider.ts` | ~687（邮箱验证后手机注册） | `user.id` |
| `local-auth.provider.ts` | ~771（手机号注册） | `user.id` |

> 埋点放在建号成功后、签发令牌前（`generateTokens` 之前），确保用户首次拿到会话时会员已生效。

## 6. Left to the Builder（实现时裁决）

- `registerGiftMonths` 上限 36 为我的默认裁决，如需更高可调。
- 单测覆盖 `grantGiftIfEnabled`：禁用 → 不调用 activate；months=0 → 不调用；level 1 缺失 → 不调用；成功 → 调 activate 且入参正确（level 1 / months×30 天）。
- 建号点回归：mock 掉 gift service，确认 7 处调用未破坏现有注册测试。
- 运行：`pnpm --filter @cloudcad/backend test`（涉及 auth/vip）+ `pnpm --filter @cloudcad/backend type-check`。

## 7. 测试与验证

- 单测：`registration-gift.service.spec.ts`（上述 4 分支）。
- 现有注册单测 `registration.service.spec.ts` / `local-auth.provider.spec.ts` 需同步 mock 注入的 gift service。
- 集成（可选，排票）：真实 PG 注册 → 断言 userMembership 生成 tierLevel=1、expiresAt≈now+30 天。
