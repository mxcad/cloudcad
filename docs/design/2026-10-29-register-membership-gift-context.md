# 项目信息交接：注册自动送会员（Register Membership Gift）

> 本文档是**中立的项目信息交接**，不是实现方案。目的：把本功能相关的全部项目现状、代码位置、机制、约束与开放问题如实列出，供规划方（AI/人）据此做设计，无需再回源码勘察。
> 需求来源：用户 2026-10-29。
> 状态：需求已精确化；**未实现**。旧 `2026-10-29-register-membership-gift-design.md` 为本会话早期初步方案，已被本轮需求更新覆盖，可忽略。

---

## 0. 需求（用户原话 → 精确化）

- 原话：「需要实现一个注册自动送一个月会员的功能，并且明确表示是新账号免费使用一个月的vip，需要运行时配置，默认是开启状态，并且支持调整送几个月」
- 补充：「**就是首次没有送的，都送一个月，送过了的就始终都不再送了**」
- 用户已拍板（通过问答确认）：
  1. **覆盖范围 = 所有新账号**（注册表单 / 邮箱验证 / 手机验证码自动注册 / 微信自动注册 / 手机号注册）。
  2. **赠送等级 = 固定 VIP1 基础档（level 1）**，不新增「等级」配置键。
- 语义归纳：任何自服务方式**新开账号**，创建成功后即赠 N 个月 VIP1 会员（N 默认 1，运行时配置可调）；**同一账号只送一次，已送过的不再送**；赠送开关默认开启。

### 待规划方确认的语义歧义
- 「送过了就不再送」的**判定载体**与**跨注销/跨清理语义**（见 §4 开放问题 1）——用户未明说注销后重新注册是否算「送过了」。

---

## 1. 项目背景（monorepo）

- **pnpm monorepo**：`pnpm@9.15.9`，`node >=20.19.5`。
- 相关包：
  - `packages/backend`：NestJS 11 + Express 5 + Prisma 7 + PostgreSQL + Redis，端口 **3001**。
  - `packages/contracts`：跨包 DI token + TypeScript 接口契约。
  - `packages/db`：Prisma 7 共享 Client（schema 单一源 + generated client，数据层类型唯一出口）。
  - `packages/api-sdk`：@hey-api/openapi-ts 自动生成 API 客户端。
  - `packages/frontend`：React 19 + Vite 6 + Tailwind v4 + Zustand + Radix UI，端口 8000。
- 分支策略：`main`=正式版本 / `develop`=本地开发。当前分支 **develop**。
- **三层一致性铁律**：任何变更必须同时评估 前端（packages/frontend）↔ API SDK（packages/api-sdk）↔ 后端（packages/backend）↔ 数据库（prisma schema + migration）。禁止修了下游（后端/DB）就关闭 issue，不确认上游是否需要联动。
- 本功能对三层的影响评估：**仅后端 + 运行时配置**，无 DTO/Controller 变更 → **无需重新生成 API SDK**、无需改前端页面（配置页按 definitions 自动渲染），无需 migration（见 §2.3）。唯一潜在前端项是「促销角标」（未要求，见开放问题 3）。

---

## 2. 功能相关代码地图（均在 `packages/backend/src`）

### 2.1 注册 / 建号路径（赠送埋点候选）

**A. `auth/impl/services/registration.service.ts`** —— 注册表单主流程，3 条建号路径：

| 位置 | 路径 | 建号调用 | 返回变量 |
|---|---|---|---|
| `register()` 约 L93 | mailEnabled=false 直接建号 | `userService.create(...)` | `user` |
| `register()` 约 L126 | !requireEmailVerification 直接建号 | `userService.create(...)` | `user` |
| `verifyEmailAndActivate()` 约 L195 | 邮箱验证通过后建号 | `userService.create(...)` | `user` |

每条路径建号成功后紧接：`syncWechatAvatar`（可选）→ `authTokenService.generateTokens(user)` → 建立会话 → 返回 `{ ...tokens, user }`。
**建议埋点**：建号成功后、`generateTokens` 之前（确保用户首次拿到会话时会员已生效）。

**B. `auth/impl/providers/local-auth.provider.ts`** —— 登录侧自动/手机/微信注册，4 处：

| 位置 | 路径 | 建号调用 | 返回变量 |
|---|---|---|---|
| 约 L146 | 手机验证码自动注册（`allowAutoRegisterOnPhoneLogin`） | `userService.create(...)` | `newUser`（随后 `userRepo.findById(newUser.id)` 得 `user`） |
| 约 L274 | 微信自动注册（`wechatAutoRegister`） | **`userRepo.create(...)`** | `user` |
| 约 L687 | 邮箱验证后手机号注册 | `userService.create(...)` | `user` |
| 约 L771 | 手机号注册 | `userService.create(...)` | `user` |

> **关键**：微信自动注册走 `userRepo.create`（非 `userService.create`），因此**无法用 `IUserService.create` 单点收敛**所有建号路径——需在每个建号点显式调用赠送逻辑（或另寻收敛点）。

**建号收敛机制（重要发现）**：`@nestjs/event-emitter` 全局总线**已启用**（`app.module.ts` `EventEmitterModule.forRoot()`），且 `user-crud.service.ts:234` 在 create 成功（事务提交后）统一 `emit('user.created', { userId, email, username, timestamp })`（payload 类型 `UserLifecycleEventPayload`）。**所有走 `userService.create` 的建号路径都会触发此事件**（registration 3 处 + 手机 3 处 + **首启管理员 `initialization.service.ts:555`** + **管理员手动建号 `users.controller.ts:116`**）；**微信自动注册走 `userRepo.create`，不触发此事件**。
→ 单点监听 `user.created` 可覆盖 6 处自服务建号，但会**误伤首启/管理员建号**，且 payload 无「来源」字段无法区分；微信那处需单独处理或改道。

### 2.2 会员激活（写侧唯一入口，ADR-0036）

**`vip/membership.service.ts`** —— `MembershipService`：

- 常量：`MONTH_DAYS = 30`（「月=30 天」约定**单点定义**，写侧/读侧共用；消费方禁止各自手写 `months * 30`）、`DAY_MS = 86400000`。
- **写侧唯一入口**：
  ```ts
  activate(tx: Prisma.TransactionClient, userId: string,
           vipTier: { level: number; baseMonthlyPrice: number },
           purchasedDays: number): Promise<UserMembership>
  ```
  内部：查旧会员 → `calculateUpgradeExtraDays`（仅「升档且旧会员仍有效」才做旧月价→新月价折算；**新用户 `existing=null` 直接短路返回 purchasedDays**）→ 续期 / 永久会员保持 / 等级 max → `userMembership.upsert` → 失效配额缓存。
- **metadata Json 字段既有用途**：`externalVipExpiresAt`（外部水位，`hasValidExternalWatermark`，约 L169-190）。新增 metadata 键（如 `registerGiftGrantedAt`）**不与既有键冲突**，但禁止误写 `externalVipExpiresAt`。
- 读侧单点：`isActiveMembership`（expiresAt 为 null 视为永久有效，仅过去时间算过期）、`projectMembership`（扁平展示投影）。
- 其他写侧方法：`recalculateFromOrders`（退款重算）、`expireOverdueMemberships`（过期批量降级）、`deleteMembershipForUser`（清理删会员记录，供 user-cleanup）。

**`billing/payment-order.ts`** 约 L166-185 —— 参考调用模式（在既有事务内）：
```ts
const durationDays = (order.months ?? 1) * MONTH_DAYS;
await this.membershipService.activate(tx, order.userId,
  { level: order.vipTier.level, baseMonthlyPrice: order.vipTier.baseMonthlyPrice },
  durationDays);
```

### 2.3 运行时配置（无需 migration / 无需改前端配置页）

**`runtime-config/runtime-config.constants.ts`** —— `RUNTIME_CONFIG_DEFINITIONS`（约 L60 起），每键形状：
```ts
{ key, type, category, subgroup, description, defaultValue, isPublic, tier,
  input?, impact?, requires?, conflictsWith?, dangerous? }
```
- 范例 `allowRegister`（约 L608）：`category:'account', subgroup:'registration', defaultValue:true, isPublic:true, tier:'user', dangerous:true`。
- 范例 number 键 `userCancelGraceDays`（约 L637）：`type:'number', input:{min:1,max:365,step:1,unit:'天'}`。
- **新增键只需加进此数组**：启动时 `syncDefaultConfigs`（runtime-config.service.ts 约 L140-206）自动落库 `runtimeConfig` 表（缺失键创建，`isPublic/description/category` 改动回填，不碰 value/updatedBy）；配置页按 definitions 自动分组渲染。

**`runtime-config/runtime-config.service.ts`**：
- `getValue<T>(key)` 读已登记键；三层取值 `resolveValue`：DB 显式修改 > env（`envKey` 注入，部署期）> `defaultValue`。
- 键元数据不变式：`runtime-config.invariants.ts`（依赖边 `requires` / 互斥 `conflictsWith` / profile 排除键 `PROFILES_EXCLUDED_KEYS` 等）。新增键若无需依赖/互斥则不改 invariants。

**前端配置页** `packages/frontend/src/pages/RuntimeConfigPage/`：按 `GET /runtime-config/definitions` 自动分组（category/subgroup）渲染，新增键**无需改前端**。

### 2.4 会员档位

- **`packages/db/prisma/schema.prisma`** 约 L772-784：
  ```prisma
  model VipTier {
    id String @id @default(cuid())
    level Int @unique
    name String
    baseMonthlyPrice Int
    isActive Boolean @default(true)
    configs Json @default("{}")
    ...
    @@map("vip_tiers")
  }
  ```
- **种子** `packages/backend/prisma/seed.ts` 约 L296+：VIP1(level 1, `baseMonthlyPrice 1500`)、VIP2(2, 3000)、VIP3(3, 6000)，按 level 幂等 upsert。`VipTier` 表运行时可改 → **level 1 可能缺失/停用**，赠送需兜底。
- **档位 CRUD**：`vip/vip-tier.service.ts`、`vip/vip.controller.ts`（管理端）。

### 2.5 DB Schema（User / UserMembership）

- **UserMembership**（`user_memberships`）：`id` / `userId @unique` / `tierLevel Int @default(0)` / `expiresAt DateTime?` / `metadata Json?` / `createdAt` / `updatedAt`。
- **User**（`users`）：`id` / `email? @unique` / `emailHmac? @unique` / `username @unique` / `phone? @unique` / `phoneHmac? @unique` / `wechatId? @unique` / `status` / `deletedAt?` / …。PII 字段级加密（`emailEnc`/`phoneEnc`，AES-256-GCM `enc:v1`）+ HMAC 归一化索引（`emailHmac`/`phoneHmac`，#417 等保）。**软删除** `deletedAt`。
- **无** registerGift 相关既有字段/表。

### 2.6 注销 / 清理（影响「送过不再送」判定）

- **`users/services/user-status.service.ts`**：`deactivate` 软删除（`deletedAt + status INACTIVE + deactivatedBy SELF/ADMIN`），**保留 email/phone/wechatId 唯一键值**；`restore` 恢复（`deletedAt: null, status ACTIVE`）。
- **`local-auth.provider.ts`** 约 L94/L238 注释：登录/注册命中**已注销用户**时走「冷静期自动恢复或拒绝」，防止已注销手机号被误自动注册新账号。
- **`userCleanupEnabled`**（runtime-config）：注销冷静期（`userCancelGraceDays` 默认 7 天）到期后自动清理数据，清理调用 `MembershipService.deleteMembershipForUser`（删 membership 记录）。
- **结论**：同一自然用户通常复用同一 `user` 实体（冷静期恢复）；但**清理彻底删数据后重新注册 = 全新 `user` 实体**（membership 也没了）。

---

## 3. 关键约束（实现必守）

1. **ADR-0036**：会员写侧唯一入口 `activate`，**禁止绕过**直接写 `userMembership`。
2. **月=30 天**：必须用 `MONTH_DAYS` 常量，禁止手写 `months * 30`。
3. **赠送 must be best-effort**：失败**绝不阻断注册**（打日志，注册主流程照常返回）。用户已明确此语义（「送过了不再送」意味着赠送是附属动作，不是注册的前置条件）。
4. **幂等 + 持久化「已赠送」标记**：同一账号重复触发不得重复送（用户明确「送过了的始终不再送」）。
5. **新用户赠送传参**：`activate` 需要合法 `baseMonthlyPrice`（仅升档折算用；新用户 `existing=null` 短路）→ 查 `vipTier` level 1 的 `baseMonthlyPrice`；缺失/停用 → 兜底（打警告返回）。
6. **三层一致性**：本功能仅后端 + 运行时配置，无 DTO/Controller 变更 → 无需重新生成 API SDK、无需改前端、无需 migration。若未来加促销角标，则涉及前端（需 SDK/接口评估）。
7. **i18n**：若新增任何错误/提示文案，必须写 **4 个语言文件**（`common/i18n/translations/en-US / ko-KR / zh-CN / zh-TW` 的 `error.yml`）。
8. **测试**：新赠送逻辑必须单测；现有 `registration.service.spec.ts`、`local-auth.provider.spec.ts` 需同步 mock 新增注入的依赖。
9. **数据层类型**从 `@cloudcad/db` 导入（Prisma 模型/枚举/Prisma namespace）；业务类型从 `@cloudcad/contracts`；接口方法不得 `any`。
10. **后端 tsc** 需 `--max-old-space-size=8192`（否则 V8 OOM）。
11. **禁止**对 `packages/backend` 文件跑 `prettier --write`（根配置会让后端整文件假 diff）——手写匹配周边风格。
12. 模块依赖方向（ADR-0007）：Layer1 基础设施 ← Layer2 核心业务 ← Layer3 业务编排，箭头方向不可逆。

---

## 4. 开放问题（规划方需权衡，必要时向用户确认）

1. **「送过了不再送」的判定载体 + 跨注销/跨清理语义**（最重要）：
   - **方案 a**：在 `UserMembership.metadata` 打键（如 `registerGiftGrantedAt`）→ 按 `user` 实体去重。**无 migration**；同实体重复触发天然幂等；与既有 `externalVipExpiresAt` 键不冲突。局限：清理删除数据后重建新实体 → 会再送。
   - **方案 b**：`User` 表加字段（如 `registerGiftGrantedAt`）→ 需 migration；同样按实体去重；局限同 a。
   - **方案 c**：独立一次性标记表 / 按 `phoneHmac`/`emailHmac`/`wechatId` 记录已赠送 → **跨注销/跨清理防重**；需 migration；PII 加密下按 HMAC 归一化查询可行；需处理「同一自然用户多个标识」的合并去重（如先手机后绑定微信）。
   - **需向用户确认**：注销 / 清理后同人重新注册是否算「送过了」？这决定 a/b 还是 c。用户未明说。
   - **方案 d（事件监听，已查证可行但净收益为负）**：监听 `user.created` 单点覆盖 6 处走 `userService.create` 的自服务建号。但：① 该事件也由**首启管理员**与**管理员手动建号**触发 → 误伤；payload 无「来源」字段，回查 user 的 role/provider 无法区分「管理员建的普通用户」vs「自服务注册用户」（管理员建的普通用户 provider 也是 LOCAL）→ 需给 `create` 加来源选项并在 payload 携带 source，**反而要在每个建号点标注来源（≥7 处）**；② 微信自动注册走 `userRepo.create` **不触发此事件**，要么单独埋点、要么改道 `userService.create`（有 password/hash/个人空间创建/事件副作用风险）；③ `emit` 为同步派发、不 await 监听器 → 赠送异步完成，登录即时性略差。**结论：不推荐，显式 7 处更稳。**
2. **运行时配置键形态**：`registerGiftEnabled`（boolean，默认 `true`）+ `registerGiftMonths`（number，默认 `1`）。
   - `isPublic`：默认 admin-only（false）？还是公开（供前端读「送 X 个月」）？
   - `registerGiftMonths` 上限：此前我暂定 36，**未获用户确认**。
   - 是否需要 `tier:'user'` 还是 `tier:'admin'`（编辑权限）。
3. **是否展示促销角标**（注册页「注册即送 1 个月 VIP」）——用户未要求，本次范围外。
4. **赠送时机**：建号成功后、签发令牌前（推荐）；或异步不阻塞。
5. **等级固定 VIP1** 已拍板，**不**新增等级配置键。

---

## 5. 建议验证

- **单测** `grantGiftIfEnabled` 分支：① 开关关闭 → 不调用 activate；② 月数 ≤0 → 不调用；③ level 1 档位缺失/停用 → 不调用；④ 成功 → 调 `activate` 且入参正确（level 1 / `months × MONTH_DAYS`）；⑤ 已赠送（标记存在）→ 跳过不重复送。
- **回归**：`registration.service.spec.ts`、`local-auth.provider.spec.ts` 同步 mock 新增依赖。
- **命令**：`pnpm --filter @cloudcad/backend test` + `pnpm --filter @cloudcad/backend type-check`。
- **可选集成**（需真实 PG+Redis，`pnpm test:integration`）：注册 → 断言 `userMembership` 生成 `tierLevel=1`、`expiresAt ≈ now + N×30天`；重复触发不重复送。

---

## 附：关键命令速查

```bash
pnpm --filter @cloudcad/backend test          # 后端单元测试（本地无 DB 全绿）
pnpm --filter @cloudcad/backend type-check    # 后端 tsc（注意 --max-old-space-size=8192）
pnpm test:integration                          # 集成测试（需真实 PG+Redis，串行）
pnpm --filter @cloudcad/backend prisma migrate dev --name <desc>  # 仅当需要 migration
pnpm --filter @cloudcad/backend build          # nest build (SWC) + generate:swagger
```
