# 旧官网用户同步到 CloudCAD 私有认证方案

用户体系打通：公司旧官网（Express + 手机号/微信注册 + 多级 VIP）的用户和 VIP 权益自动同步到 CloudCAD（NestJS + JWT + tierLevel），不做旧官网改造、不影响 OSS 开源版本。在 `@cloudcad/impl-mx` 私有包中实现一个**登录同步扩展点**（`USER_SYNC_HOOK` / `IUserSyncHook`）——旧官网用户首次登录时，OSS 登录主流程在查询本地用户前调用该钩子，代理验证旧官网 + 同步用户信息 + VIP 权益到本地，认证主流程（密码校验、token 生成、session）始终由 OSS `LoginService` 完成。

**Status**: accepted

## Decision

### 同步流程（认证代理模式）

```
用户输入手机号+密码
  │
  ├─ POST /app/checkuser 检查旧官网
  │   ├── 未注册 → 标准 CloudCAD 本地认证（不变）
  │   └── 已注册 → 继续
  │
  └─ 旧官网用户分支：
      1. POST /app/login 代理到旧官网验证密码
         ├── 旧官网认证失败 → ❌ 返回登录失败
         └── 旧官网认证成功 → POST /app/personal 获取用户信息

      2. 查找 CloudCAD 本地用户（身份锚定：`oldSiteUserId` → `phone` 存量兼容 → 创建）
         ├── 无本地账号 → 创建新用户（bcrypt 存当前密码，绑手机号）
         │   - phone = oldSite.personal.phoneNumber
         │   - username = phoneNumber
         │   - oldSiteUserId = oldSite.personal.userId（不可变身份锚点）
         │   - nickname = oldSite.personal.nickName
         │   - avatar = oldSite.personal.img
         │   - password = bcrypt(userInputPassword)
         │   - provider = LOCAL
         │   - status = ACTIVE, phoneVerified = true
         ├── 按 oldSiteUserId 命中 → 更新用户信息（手机号换绑后仍命中）
         │   - nickname = oldSite.personal.nickName（覆盖）
         │   - avatar = oldSite.personal.img（覆盖）
         │   - 密码不更新
         │   - 已绑手机号不覆盖
         └── 按 phone 命中且无 oldSiteUserId（老数据）→ 补录关联 + 更新用户信息
             - 补录 oldSiteUserId 后锚定身份；锚点已被其他账号占用时视同身份冲突跳过同步
             - 身份冲突（本地 oldSiteUserId ≠ 登录身份）→ 跳过资料/VIP 同步，保留本地身份

      3. 用本地密码验证用户输入的密码（走原有 validateUser）
         ├── 密码不匹配 → ❌ 返回密码错误（即使旧官网认证通过）
         └── 密码匹配 → 继续

      4. 增量同步 VIP（见下文）
      5. 生成 JWT Token，登录成功
```

关键约束：
- **已有本地账号不更新密码** — 旧官网密码 ≠ 本地密码，各自独立。用户可以在旧官网改密码，不影响 CloudCAD 本地密码
- **密码验证走本地** — 旧官网只作为身份是否存在的验证，不对本地密码让步。防止旧官网被攻破导致全部账号沦陷
- **首次创建账号存密码** — 用户输入的明文密码经 bcrypt hash 后存入本地，后续直接本地验证
- **旧官网不可达**时：已同步用户走本地认证仍可登录；未同步用户无法登录（无法代理验证）

### VIP 增量同步算法

旧官网 `vipStatus` 与新系统 `tierLevel` 直接映射：0→0(VIP0)，1→1(VIP1)，2→2(VIP2)，3+→3+(VIP3+)。

`UserMembership.metadata` 中记录 `externalVipExpiresAt: ISO_DATE`（上次同步时旧官网的 `vipTime`，即外部会员到期时间）。每次登录同步：

```ts
const oldVipTime = personalResponse.vipTime;  // 旧官网过期日期
const now = new Date();

if (oldVipTime <= now) return;  // 旧官网 VIP 已过期 → 跳过

const externalExpiresAt = membership.metadata?.externalVipExpiresAt;
let delta: number;

if (!externalExpiresAt || new Date(externalExpiresAt) <= now) {
  // 首次同步 或 水位已过期 → 加剩余天数
  delta = daysBetween(oldVipTime, now);
} else {
  // 水位有效 → 只加增量
  delta = daysBetween(oldVipTime, new Date(externalExpiresAt));
  if (delta <= 0) return;  // 无增量
}

// 叠加到本地：base + delta
const base = Math.max(membership.expiresAt, now);
const tierLevel = Math.max(membership.tierLevel, personalResponse.vipStatus);

// 第 4 参为天数增量（非绝对日期），activate 内部以 base=max(expiresAt, now) 叠加
await membershipService.activate(tx, userId, tierLevel, delta);
metadata.externalVipExpiresAt = oldVipTime;
```

> **注意**：`metadata.externalVipExpiresAt` 水位的更新与 `MembershipService.activate()` 必须在**同一事务**内完成，否则水位先写、activate 失败时，下次登录会按旧水位重复发放增量。
>
> **字段命名**：字段名为 `externalVipExpiresAt`（外部会员到期时间）而非 `lastSyncedVipTime`，避免按字段名误写"上次同步时间"（过去时间戳）。`billing.service.recalculateMembershipAfterRefund` 的退款水位保护依赖该字段承载未来到期时间。

`MembershipService.activate()` 已有 `Math.max(existing.tierLevel, vipTierLevel)` 和 `base + durationDays` 逻辑，直接调用。

| 场景 | 行为 |
|------|------|
| 首次同步 | 加剩余天数，记水位 |
| 旧官网续费 | 叠加增量（新旧 `vipTime` 差值） |
| 本地自购 VIP | 不动（无增量，`externalVipExpiresAt` 不变） |
| 两边都买 | 叠加旧官网增量 + 本地原有时长 |
| 旧官网退款/退级 | 不动（水位不降，不退本地已加天数） |
| 旧官网 VIP 过期 | 跳过同步 |
| 水位过期后重买 | 当作首次同步，加剩余天数 |

### 永久会员语义

本地创建/旧官网同步若产生 `expiresAt = null` 且 `tierLevel > 0`，视为**永久有效**：`getEffectiveTier` / `getMembership` 均按此判定（不因无过期时间而把等级降为 VIP0）。

- 永久会员在同步时**不写水位**（`externalVipExpiresAt` 无意义，无需增量叠加）。
- 若永久会员后续在旧官网转回限期会员，以新 `vipTime` 重新走增量同步逻辑。

### 冲突策略

| 场景 | 策略 |
|------|------|
| 手机号在旧官网注册 + 本地无账号 | 创建本地账号，存密码，绑手机号 |
| 手机号在旧官网注册 + 本地有账号 | 不更新密码，不覆盖已绑手机号，更新 nickname/avatar |
| 本地有账号 + 手机号不在旧官网 | 标准本地认证流，不涉及同步 |
| 旧官网 VIP 过期 | 跳过 VIP 同步，其余用户信息仍同步 |

### 身份锚定与手机号换绑

同步关联键从「可变绑定手机号」升级为「不可变身份锚点 `User.oldSiteUserId`（旧官网 userId）」，解决换绑/解绑导致的三类问题：

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| 换绑/解绑后旧手机号再登录 | `findLocalUserByPhone(旧号)` 落空 → 按 username 重建撞唯一约束 P2002 → 登录 500 | 按 `oldSiteUserId` 命中老账号 → 更新资料/VIP，不创建；极端残留数据 P2002 时兜底按 username 找回老账号并补录关联 |
| 用新手机号登录（旧官网无此号） | `checkUser` 不命中 → 旧官网 VIP/资料断联 | 不变（旧官网无该身份，无从同步） |
| 新手机号恰是旧官网另一账号 | 该账号资料/VIP 被错误同步到换绑用户 | 身份冲突（本地 `oldSiteUserId ≠` 登录身份）→ 跳过资料/VIP 同步，保留本地身份 |

查找优先级：`oldSiteUserId → phone（存量兼容）→ 创建`。历史数据（无 `oldSiteUserId`）首次按 phone 命中时补录关联，之后不再依赖 phone。`User.oldSiteUserId` 为 `@unique` 索引，换绑（`rebindPhone`）只改 `phone` 不影响锚点。

### 防重复发放与注销接管（2026-08 补充）

**防刷语义**：旧官网身份 X 的 VIP 权益总量只发放一次。水位（`membership.metadata.externalVipExpiresAt`，即上次同步的旧官网 `vipTime`）按**旧官网身份维度**读取——`syncVip` 事务内按 `user.oldSiteUserId = X` 查询持有该身份的用户（**含已注销残留**）的 membership 水位，而非当前登录用户自己的水位：

- 首次同步（X 无水位）→ 全量发放
- 续费（`vipTime` 增长）→ 只发增量
- 水位未增长（含新账号接管）→ 增量 0，跳过发放

**存储保证**：`user_memberships.userId` 外键为 `ON DELETE RESTRICT`（migration 20260622000001），`user-cleanup` 不删除 UserMembership，因此**同步过 VIP 的注销用户行不会被物理清理**，其 membership 水位随残留行保留。新账号接管 X 时读到残留水位 → 增量 0 → 刷 VIP（注销→重注册→再同步）收益为零。此保证是防刷的隐性依赖，若未来清理逻辑允许删除带 membership 的用户，必须同步回归本方案的测试。

**注销身份接管**：已注销账号（冷静期残留）占用的 `oldSiteUserId` 可让位给新账号——`takeoverOldSiteId` 在单事务内完成 ① 残留行 membership 水位迁移到新用户（取两者较晚值）② 释放残留行锚点 ③ attach 新用户。活跃账号占锚点仍视为身份冲突，跳过同步。

**注销后直接手机号登录**：`createUserFromOldSite` 的 username（=手机号）唯一冲突且占用者为已注销账号时，不再 500——抛出明确错误提示冷静期内恢复账号（不接管 username，避免破坏注销账号的登录凭据）。

**activate 入参**：`MembershipService.activate` 的第三参为 `VipTierActivateInput { level, baseMonthlyPrice }`；外部同步来源传 `baseMonthlyPrice: 0`，触发升级折算除零保护短路，天数增量原样叠加（外部来源不参与本地购买升级折算）。

### 旧官网 API Client

在 `@cloudcad/impl-mx` 中封装三个端点：`POST /app/checkuser`（`mobile`）、`POST /app/login`（`username, password`）、`POST /app/personal`（`token`），form-urlencoded 格式，超时 10s。

### 环境变量

- `OLD_SITE_API_BASE` — 旧官网 API 基础 URL，通过 `CONFIG` DI token（RuntimeConfigService）获取
- `IMPL` — 指向 `@cloudcad/impl-mx/dist`，启用时生效，不影响 OSS 版本

### 模块归属

所有同步逻辑位于 `@cloudcad/impl-mx` 私有包，新增 `OldSiteApiClient`、`OldSiteUserSyncService`、`OldSiteUserSyncHook`。同步以 `IUserSyncHook` 扩展点接入：OSS `LoginService.login()` 在 `findLoginUser()` 之前通过 `@Optional() @Inject(USER_SYNC_HOOK)` 调用 `syncBeforeLogin(account, password)`；无钩子时行为零变化。`@cloudcad/impl-mx` 通过 `@Inject(DB)`、`@Inject(CONFIG)`、`@Inject(MEMBERSHIP_SERVICE)` 获取依赖。

### 与旧方案的差异（重构：认证接管 → 同步扩展点）

原实现 `OldSiteAuthHandler` 覆盖 `AUTHENTICATION_HANDLER` 整个 token，导致：
- `register()` / `getUserInfo()` 一并被接管，OSS 注册能力（邮箱/手机验证）丢失
- 复刻了 `generateTokenPair`，绕过 OSS `AuthTokenService`/session/黑名单，双实现漂移

重构后私有层不再覆盖任何核心认证 token，只注册 `USER_SYNC_HOOK` 可选扩展点；认证主流程始终由 OSS 执行。

### 测试 seam

最高 seam：`IUserSyncHook.syncBeforeLogin()` 接口。辅助 seam：`OldSiteApiClient`。Mock 所有外部依赖（旧官网 HTTP API、DB、MembershipService）。

## Considered Options

- **直接复用旧官网认证**：CloudCAD 不存用户，每次请求反向代理到旧官网验证。否决理由：旧官网不可改造、延迟高、CloudCAD 需要自己的用户体系管理项目。
- **一次性批量导入**：全量拉取旧官网用户。否决理由：无法处理增量同步（续费、改密码），用户需通知旧官网改造成本高。
- **OAuth/SSO 桥接**：标准 OAuth 流程。否决理由：旧官网无法改造支持 OAuth，部署复杂度高。

## Consequences

- `@cloudcad/contracts` 新增 `MEMBERSHIP_SERVICE` token，使 `@cloudcad/impl-mx` 可调用 `MembershipService.activate()`
- OSS 版本的 `auth-impl.stub.ts` 不受影响
- 微信登录同步、批量历史同步、密码变更检测、前端 UI 变更均不在本次范围内
