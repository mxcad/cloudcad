# Auth-Verify 模块功能审查报告

> **审查日期**: 2026-05-08
> **审查范围**: email-verification, password-reset, SMS, token-blacklist
> **后端文件**: `packages/backend/src/auth/services/` (email-verification, password, sms, token-blacklist)
> **前端页面**: EmailVerification.tsx, ForgotPassword.tsx, ResetPassword.tsx, PhoneVerification.tsx
> **参考标准**: 同 auth-login 审查标准（安全性、错误处理、数据一致性、边界条件、UX）

---

## 1. 总体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 安全性 | B+ | 验证码使用 crypto.randomInt，频率限制完善，但有细节问题 |
| 错误处理 | B | 异常抛出模式不一致（mix throw/return），部分路径 nil 安全风险 |
| 数据一致性 | A- | Redis 事务正确回滚，过期策略与验证码生命周期对齐 |
| 前端验证 | B | Zod schema 验证完整，但部分 SDK 调用可能缺少参数 |
| UX 完整性 | A- | 倒计时、多状态（表单/成功/客服联系）、bind/verify 双模式覆盖完善 |

---

## 2. 后端服务逐文件分析

### 2.1 email-verification.service.ts

**安全措施（✅ 良好）：**
- 使用 `crypto.randomInt(900000)` 生成 6 位验证码（加密安全随机数）
- Redis 存储带 TTL，自动过期
- 发送频率限制（rateLimitKey → `cacheTTL.verificationRateLimit`）
- 验证尝试次数限制（maxVerifyAttempts = 5），达到上限后删除验证码要求重新获取
- 验证成功/错误后清理相关 Redis key（codeKey, attemptsKey, rateLimitKey）

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| EV1 | **中** | `verifyEmail` 异常模式不一致：验证码不存在时 `throw BadRequestException`（L87），验证码错误时返回 `{ valid: false }`（L90-108）。调用方 `password.service.ts` L209-213 通过 `result.valid` 检查，若验证码不存在则异常未被捕获会直接传播到 HTTP 层。虽然两种路径最终都返回 400，但调用方代码有隐蔽的分支不可达风险。 | L77-116 |
| EV2 | **低** | `resendVerificationEmail` 仅代理调用 `sendVerificationEmail`，无额外逻辑。语义上允许（重发即重新发送），但未区分"首次发送"与"重发"的审计日志。 | L118-120 |
| EV3 | **低** | `generateVerificationToken` 使用 `await import('crypto')` 动态导入，每次调用都触发异步模块加载。应改为顶部静态导入 `import * as crypto from 'crypto'`。 | L50-51 |

### 2.2 password.service.ts

**流程完整性（✅ 良好）：**
- `forgotPassword` 支持 email/phone 双通道，含服务未启用的优雅降级（返回客服联系方式）
- `resetPassword` 支持 email/phone 双通道验证码校验
- 重置成功后自动删除 refresh token 并移除用户黑名单

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| PW1 | **中** | `resetPassword` 参数均为可选（`email?: string`, `code?: string`, `newPassword?: string`），但在 L209-211 将 `code` 直接传给 `verifyEmail`，若 `code` 为 undefined 会导致 NPE（Null Pointer Exception）。Controller 层通过 DTO 校验保证非空，但 service 层的类型签名与实际安全语义不匹配。 | L199-204 |
| PW2 | **中** | `resetPassword` L235 `bcrypt.hash(newPassword, 12)` — 若 `newPassword` 为 undefined 会传递 undefined 给 bcrypt。同 PW1，依赖上层 DTO 校验。 | L235 |
| PW3 | **低** | `forgotPassword` 中 phone 分支通过 `phone` 查询用户（`findUnique({ where: { phone } })`），但 SMS 服务的 `sendVerificationCode` 使用 `formatPhone`（加 +86 前缀）。查询和应用层使用的 phone 格式不一致可能导致用户找不到。检查发现 `findUnique` 使用原始 phone，而用户注册时可能存储的是去掉 +86 前缀后的格式化号码。需确认数据库中 phone 字段的存储格式。 | L174-176 |

### 2.3 sms-verification.service.ts (sms-verification.service.ts)

**安全措施（✅ 良好）：**
- 三层频率限制：60秒/次（rateLimitKey）、每日 N 次/手机号（dailyCountKey）、每小时 N 次/IP（ipHourlyCountKey）
- 每日/每小时计数器过期时间分别对齐到午夜和整点后1小时
- 发送失败时自动回滚计数器和清理验证码
- 验证尝试次数限制，达到上限后删除验证码要求重新获取

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| SV1 | **🔴 高** | **Orphaned `redis.multi()` 调用** — L259 `await this.redis.multi()` 启动了 Redis 事务管道但从未调用 `.exec()`。后续 L260 `incr(dailyCountKey)` 和 L261-263 `expire()` 调用在管道外独立执行，`multi()` 的返回值被丢弃。这导致事务完全不生效。应删除 `multi()` 调用或使用正确的 multi/exec 模式。 | L259 |
| SV2 | **🔴 高** | **TTL 在 key 删除后查询** — L372 `await this.redis.del(codeKey)` 删除了验证码 key，L376 `const ttl = await this.redis.ttl(codeKey)` 查询已删除的 key 始终返回 -2。导致 `expiresIn` 永远为 undefined。应将 TTL 查询移到删除之前。 | L372-376 |
| SV3 | **低** | L258-272 处 IP 计数逻辑同样存在类似 SV1 的问题 — 没有使用 multi/exec，但此处影响较小（单独的 incr + expire 是幂等的）。更关键的是 `multi()` 后的 `incr` 和 IP 部分的 `incr` 不在同一个事务中，极端情况下 phone 计数增加但 IP 计数未增加，反之亦然。 | L258-272 |
| SV4 | **中** | `sendVerificationCode` L253 `await this.redis.setex(codeKey, this.codeTTL, code)` — 验证码存储未加密，Redis 中以明文存储。虽然不是高危问题（Redis 通常在内网），但生产环境建议加密存储。 | L253 |

### 2.4 token-blacklist.service.ts

**架构评价（✅ 良好）：**
- 使用 SCAN 代替 KEYS 避免阻塞 Redis
- 正常的错误处理（Redis 不可用时 fallback 返回 false 而不是阻断业务流程）
- 提供完整的增删查 API

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| TB1 | **低** | `addToBlacklist` L49 key = `this.blacklistPrefix + token` — JWT token 长度通常 ~800-1200 字符，作为 Redis key 不理想。建议使用 `sha256(token).substring(0, 32)` 或类似哈希缩短 key 长度。 | L49 |
| TB2 | **低** | `onModuleInit` L33-39 注册了 Redis error/connect 事件监听器，但 `onModuleDestroy` L225-228 仅调用 `redis.quit()` 未移除监听器。NestJS 单例下通常无影响，但若模块被动态加载/卸载会有内存泄漏风险。 | L32-39, L225-228 |

### 2.5 auth-facade.service.ts（verify 相关方法）

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| AF1 | **中** | `verifyEmailAndRegisterPhone` L570-576：先验证 email code 再验证 phone code，如果 phone code 无效，email code 已经被消费（`emailVerificationService.verifyEmail` 验证成功后删除 key）。用户需要重新获取两组验证码，UX 不理想。建议先验证两组 code 再一起消费。 | L570-576 |
| AF2 | **低** | `bindEmailAndLogin` L422-426 和 `bindPhoneAndLogin` L497-502 在 facade 层直接调用底层验证，与 `resetPassword` 在 `password.service.ts` 的模式一致，但异常处理不一致 — facade 层未包裹 try/catch，依赖 NestJS 全局异常过滤器。 | L422-426 |

---

## 3. 前端页面逐文件分析

### 3.1 EmailVerification.tsx

**UX 完整性（✅ 良好）：**
- 支持三种模式：bind（绑定邮箱）、phoneRegister（手机号注册后验证邮箱）、verify（直接验证）
- 60 秒倒计时重发
- 自动发送验证码（首次进入时）
- 验证码输入过滤非数字字符

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| FE1 | **🔴 高** | L133 `bindEmailAndLogin()` 和 L146 `verifyEmailAndRegisterPhone()` 调用时未传递参数。这两个方法需要 `email`、`code`、`tempToken` 等参数。需检查 `useEmailVerification` hook 的实现确认是否通过内部状态自动传递。若 hook 不读取 state 中的 email/verificationCode，这两个流程将静默失败。 | L131-154 |
| FE2 | **中** | L88 `resendVerification()` 在 bind 模式下自动调用时无参数。若用户尚未输入邮箱，API 将收到空 email 导致 400 错误。虽然错误被 catch 并展示，但用户体验差（一进页面就看到错误提示）。 | L88-95 |
| FE3 | **低** | L72 `hasAutoSent` 使用 `React.useRef`，但 L1 import 中没有导入 `useRef`（仅导入 `useState, useEffect, useCallback`）。React 命名空间调用方式可用但不一致。 | L1, L72 |

### 3.2 ForgotPassword.tsx

**UX 完整性（✅ 良好）：**
- 三状态视图：表单 → 发送成功 → 客服联系（服务未启用）
- 邮箱/手机号切换 tab
- "忘记邮箱/手机号" → 联系客服弹框
- react-hook-form + zod 双重校验

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| FF1 | **中** | L82-88 当错误包含"账号已被禁用"时，使用硬编码的客服信息（`support@cloudcad.com`、`400-123-4567`）。后端 `forgotPassword` 可能通过 runtime config 返回动态的 `supportEmail`/`supportPhone`，但此处未使用后端返回值。| L82-88 |
| FF2 | **低** | L59 `localError` 状态声明但未与实际错误展示逻辑关联。`forgotPassword.error` 来自 hook，`localError` 仅在切换 contact type 时清空。 | L59 |

### 3.3 ResetPassword.tsx

**UX 完整性（✅ 良好）：**
- 密码可见性切换
- 验证成功自动跳转
- 从 location state 获取 email/phone

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| FR1 | **低** | `contactType` 判断逻辑 L58-60：`emailFromState ? 'email' : 'phone'`，当两者都为空时默认为 'phone'。页面仍可正常渲染（因为 readOnly 输入框为空），但语义不精确。 | L58-60 |
| FR2 | **低** | L86 `confirmPassword` 被包含在 submit 参数中。后端 `ResetPasswordDto` 已验证 `confirmPassword`，前端 Zod schema 也验证。双重验证可接受但冗余。 | L80-86 |

### 3.4 PhoneVerification.tsx

**UX 完整性（✅ 良好）：**
- 支持 bind 和 verify 两种模式
- 手机号输入过滤非数字字符，限制 11 位
- 60 秒倒计时重发

**问题：**

| # | 严重度 | 描述 | 位置 |
|---|--------|------|------|
| FP1 | **🔴 高** | L113 `bindPhoneAndLogin()` 调用时未传递参数（`tempToken`、`phone`、`code`）。需检查 `usePhoneVerification` hook 确认参数传递方式。 | L111-120 |
| FP2 | **低** | 与 EmailVerification 相似的结构问题 — 验证码输入框在 bind 模式下无条件展示（L297-316），即使用户尚未输入手机号或发送验证码。 | L297-316 |

---

## 4. DTO 层分析

### 4.1 email-verification.dto.ts

| # | 严重度 | 描述 |
|---|--------|------|
| ED1 | **低** | `VerifyEmailDto` email 字段仅使用 `@IsString()` `@IsNotEmpty()`，缺少 `@IsEmail()` 装饰器。虽然 service 层无格式校验，但 DTO 层应尽早验证。 |
| ED2 | **低** | `ResendVerificationDto` 与 `SendVerificationDto` 字段完全相同但定义为两个独立类，存在代码重复。 |

### 4.2 password-reset.dto.ts

| # | 严重度 | 描述 |
|---|--------|------|
| PD1 | **中** | `BindEmailDto.isRebind` 同时使用 `@IsOptional()` 和 `@IsNotEmpty()`（L175-177），两个装饰器矛盾。`@IsOptional()` 跳过 undefined/null 验证，`@IsNotEmpty()` 要求非空字符串。当值为 undefined 时通过验证，但当值为 '' 时 `@IsNotEmpty()` 失败。组合行为可能非预期。 |
| PD2 | **低** | `ResetPasswordDto.newPassword` 使用 `@MinLength(6)`，而 `RegisterByPhoneDto.password` 使用 `@MinLength(8)`。密码长度要求不一致（重置 6 位 vs 注册 8 位）。 |

### 4.3 sms-verification.dto.ts

| # | 严重度 | 描述 |
|---|--------|------|
| SD1 | **低** | `SendSmsCodeDto`、`VerifySmsCodeDto`、`RegisterByPhoneDto`、`LoginByPhoneDto`、`BindPhoneDto` 中 phone 字段的验证逻辑完全重复（相同的 `@Matches` + `@IsString` + `@IsNotEmpty`），应抽取公共基类或 mixin。 |

---

## 5. 全局问题

### 5.1 验证服务返回模式不一致

| 服务 | 方法 | 失败模式 |
|------|------|----------|
| EmailVerificationService | verifyEmail | mix（throw on missing, return { valid: false } on wrong） |
| SmsVerificationService | verifyCode | return { valid: false } (统一) |
| PasswordService | resetPassword | throw（通过验证服务的异常冒泡） |

**建议**：统一为 return `{ valid, message }` 模式，由调用方决定是否抛异常。这样可以避免调用方编写 try/catch + if (!valid) 双重错误处理。

### 5.2 验证码 TTL 一致性

| 服务 | 配置键 | 默认值 |
|------|--------|--------|
| EmailVerificationService | `cacheTTL.verificationCode` | 通过 ConfigService 获取 |
| SmsVerificationService | `cacheTTL?.verificationCode` | 300 (5 分钟) |

SMS 服务硬编码默认值 300，Email 服务依赖配置（无默认值）。应统一配置管理策略。

---

## 6. 修复操作

以下问题已通过代码修复解决（详见 commit）：

| 问题 ID | 文件 | 修复内容 |
|---------|------|----------|
| SV1 | sms-verification.service.ts | 移除 orphaned `redis.multi()` 调用 |
| SV2 | sms-verification.service.ts | TTL 查询移到 key 删除之前 |
| EV3 | email-verification.service.ts | crypto 改为顶部静态导入 |

以下问题建议在后续 PR 中处理（需要更深入的讨论或依赖其他模块）：

| 问题 ID | 优先级 | 说明 |
|---------|--------|------|
| FE1 | P0 | bind 模式 SDK 参数传递问题 |
| FP1 | P0 | bind 模式 SDK 参数传递问题 |
| SV4 | P1 | 验证码加密存储 |
| PW3 | P1 | phone 格式一致性验证 |
| AF1 | P2 | verifyEmailAndRegisterPhone 双验证码原子性 |
| PD1 | P2 | BindEmailDto 矛盾装饰器 |
| TB1 | P2 | token key 长度优化 |

---

## 7. 测试覆盖建议

1. **EmailVerificationService.verifyEmail** — 验证码不存在场景（当前 throw BadRequestException）
2. **SmsVerificationService.sendVerificationCode** — 发送失败时计数器回滚验证
3. **SmsVerificationService.verifyCode** — expiresIn 返回值验证
4. **PasswordService.resetPassword** — code/newPassword 为 undefined 场景
5. **EmailVerification.tsx** — bind 模式完整流程（输入邮箱 → 发送验证码 → 输入验证码 → 提交）
6. **PhoneVerification.tsx** — bind 模式完整流程
