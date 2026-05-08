# Auth Login/Registration 功能审计报告

> 对比分支：`main`（旧，功能完整）vs `refactor/circular-deps`（新，重构中）
> 审计日期：2026-05-08

---

## 审计范围

| 层 | 文件 |
|---|------|
| 后端 Controller | `auth.controller.ts`, `session.controller.ts` |
| 后端 Service | `auth-facade.service.ts`, `login.service.ts`, `registration.service.ts`, `auth-token.service.ts` |
| 后端 Provider | `local-auth.provider.ts`（新增） |
| 后端 Interface | `auth-provider.interface.ts`（新增） |
| 后端 DTO | `auth.dto.ts` |
| 后端 Guard | `jwt-auth.guard.ts` |
| 后端 Strategy | `jwt.strategy.ts` |
| 前端页面 | `Login.tsx`, `Register.tsx` |

---

## 汇总表

| # | 端点/功能 | main 存在 | 当前存在 | 意图是否一致 | 状态 |
|---|-----------|----------|----------|-------------|------|
| 1 | `POST /auth/register` | ✅ | ✅ | ✅ | OK |
| 2 | `POST /auth/login` | ✅ | ✅ | ✅ | OK |
| 3 | `POST /auth/refresh` | ✅ | ✅ | ✅ | OK（cookie 新增） |
| 4 | `POST /auth/logout` | ✅ | ✅ | ✅ | OK（cookie 增强） |
| 5 | `GET /auth/profile` | ✅ | ✅ | ✅ | OK |
| 6 | `POST /auth/send-verification` | ✅ | ✅ | ✅ | OK（DTO 规范化） |
| 7 | `POST /auth/verify-email` | ✅ | ✅ | ✅ | OK（cookie 新增） |
| 8 | `POST /auth/verify-email-and-register-phone` | ✅ | ✅ | ✅ | OK |
| 9 | `POST /auth/resend-verification` | ✅ | ✅ | ✅ | OK |
| 10 | `POST /auth/bind-email-and-login` | ✅ | ✅ | ✅ | OK |
| 11 | `POST /auth/bind-phone-and-login` | ✅ | ✅ | ✅ | OK |
| 12 | `POST /auth/verify-phone` | ✅ | ✅ | ✅ | OK |
| 13 | `POST /auth/forgot-password` | ✅ | ✅ | ✅ | OK |
| 14 | `POST /auth/reset-password` | ✅ | ✅ | ✅ | OK |
| 15 | `POST /auth/bind-email` | ✅ | ✅ | ✅ | OK |
| 16 | `POST /auth/verify-bind-email` | ✅ | ✅ | ✅ | OK |
| 17 | `POST /auth/send-unbind-email-code` | ✅ | ✅ | ✅ | OK |
| 18 | `POST /auth/verify-unbind-email-code` | ✅ | ✅ | ✅ | OK |
| 19 | `POST /auth/rebind-email` | ✅ | ✅ | ✅ | OK |
| 20 | `POST /auth/send-sms-code` | ✅ | ✅ | ✅ | OK |
| 21 | `POST /auth/verify-sms-code` | ✅ | ✅ | ✅ | OK |
| 22 | `POST /auth/register-phone` | ✅ | ✅ | ✅ | OK |
| 23 | `POST /auth/login-phone` | ✅ | ✅ | ✅ | OK |
| 24 | `POST /auth/bind-phone` | ✅ | ✅ | ✅ | OK |
| 25 | `POST /auth/send-unbind-phone-code` | ✅ | ✅ | ✅ | OK |
| 26 | `POST /auth/verify-unbind-phone-code` | ✅ | ✅ | ✅ | OK |
| 27 | `POST /auth/rebind-phone` | ✅ | ✅ | ✅ | OK |
| 28 | `POST /auth/check-field` | ✅ | ✅ | ✅ | OK（DTO 规范化） |
| 29 | `GET /auth/wechat/login` | ✅ | ✅ | ✅ | OK |
| 30 | `GET /auth/wechat/callback` | ✅ | ✅ | ✅ | OK（cookie 新增） |
| 31 | `POST /auth/wechat/bind` | ✅ | ✅ | ✅ | OK |
| 32 | `POST /auth/wechat/unbind` | ✅ | ✅ | ✅ | OK |
| 33 | `POST /session/create` | ✅ | ✅ | 🔴 | **NEEDS DECISION** |
| 34 | `GET /session/user` | ✅ | ✅ | 🔴 | **NEEDS DECISION** |
| 35 | `POST /session/destroy` | ✅ | ✅ | 🔴 | **NEEDS DECISION** |

---

## 逐项分析

### ✅ 一致的项（无变更或仅重构增强）

**所有 Auth 端点**：main 分支到当前分支，所有 32 个 auth 端点的逻辑意图完全一致。重构变更仅在以下方面：

1. **DTO 规范化**：内联 body 类型提取为独立 DTO 类（`CheckFieldUniquenessDto`, `SendSmsCodeDto`, `VerifySmsCodeDto`, `RegisterByPhoneDto`, `LoginByPhoneDto`, `BindPhoneDto`, `SendVerificationDto`, `ResendVerificationDto`, `BindWechatDto`, `VerifyEmailAndRegisterPhoneDto`, `BindEmailAndLoginDto`, `BindPhoneAndLoginDto`, `VerifyUnbindCodeDto`, `RebindEmailDto`, `RebindPhoneDto`）。不影响 API 契约。

2. **JWT Cookie 增强**（新增功能，无破坏性变更）：
   - `AuthController` 新增 `setAuthCookie()` 私有方法，在 login/register/refresh/verify-email 响应时设置 `auth_token` httpOnly cookie
   - `logout` 端点新增 `response.clearCookie('auth_token', { path: '/' })` 清除 cookie
   - `JwtStrategy` 新增从 `auth_token` cookie 提取 token 的能力（`ExtractJwt.fromExtractors`）
   - 此功能支持 `<img>` 标签等无法携带 Authorization 头的请求场景

3. **架构重构**（无功能变更）：
   - `AuthFacadeService` → 委托给 `IAuthProvider`（`LocalAuthProvider` 实现）
   - `LoginService`、`RegistrationService` 移出 Facade 直接依赖，改为注入到 `LocalAuthProvider`
   - `UsersService` 转换为 `IUserService` 接口注入（`USER_SERVICE` token）
   - `deletedAt: null` 条件添加到多处 Prisma 查询（软删除过滤补丁）

4. **`AuthApiResponseDto` 继承变更**：
   - main: `class AuthApiResponseDto extends AuthResponseDto`
   - current: `class AuthApiResponseDto extends ApiResponseDto<AuthResponseDto>`
   - 仅影响 Swagger 文档生成，运行时响应格式由 `ResponseInterceptor` 控制

### 🔴 NEEDS DECISION — Session Controller 鉴权策略

| 项目 | main 分支 | refactor/circular-deps 分支 |
|------|-----------|---------------------------|
| **类装饰器** | `@UseGuards(JwtAuthGuard)` | `@Public()` |
| **效果** | 3 个 session 端点需 Bearer Token 认证 | 3 个 session 端点**无需认证**即可访问 |

**main 分支逻辑**：
- 只有登录用户才能调用 `POST /session/create`、`GET /session/user`、`POST /session/destroy`

**当前分支逻辑**：
- 任何人（包括未登录用户）都可以调用这些端点
- `session/create` 仍然需要 body 中的 `user` 对象，但无身份校验
- `session/user` 会返回当前 session 中的用户（如果有）
- `session/destroy` 会销毁当前 session

**风险**：如果 session 端点被设计为仅后端服务间调用，`@Public()` 可能有意为之（内网调用无需 JWT）。如果这些端点暴露给前端直接调用，则存在安全隐患。

**建议**：确认 `SessionController` 的调用方。如果仅后端内部调用，保持 `@Public()` 并添加 IP 白名单或内网限制。如果前端调用，恢复 `@UseGuards(JwtAuthGuard)`。

---

## 前端页面对比

| 文件 | main 分支 | 当前分支 | 差异 |
|------|-----------|----------|------|
| `Login.tsx` | 1295 行 | 1295 行 | **完全相同** |
| `Register.tsx` | 1254 行 | 1254 行 | **完全相同** |

前端 Login 和 Register 页面在两个分支间无任何代码差异。所有功能（邮箱登录、手机验证码登录、微信登录、注册步骤表单、密码强度指示器）均已保留。

---

## AuthTokenService 差异

| 项目 | main | current |
|------|------|---------|
| `storeRefreshToken` | 顺序 `deleteMany` → `create` | `$transaction([deleteMany, create])` |
| `logout` 参数类型 | `req?: any` | `req?: SessionRequest` |
| `refreshToken` 查询 | `findUnique({ where: { id } })` | `findUnique({ where: { id, deletedAt: null } })` |

- `$transaction` 变更是**改进**（原子性），意图相同。
- `SessionRequest` 类型变更是类型安全改进。
- `deletedAt: null` 是软删除过滤补丁。

---

## JwtStrategy 差异

| 项目 | main | current |
|------|-------|---------|
| token 提取方式 | 仅 `Authorization` header | `Authorization` header + `auth_token` cookie |
| 认证失败异常 | `throw new Error(...)` | `throw new BadRequestException(...)` / `throw new UnauthorizedException(...)` |
| 构造参数注入 | 普通注入 | `@Inject()` 装饰器注入 |

- Cookie 提取是**新增功能**，支持 `setAuthCookie` 场景
- 异常类型变更：`Error` → NestJS 标准异常是**改进**，意图相同
- `@Inject()` 是防御性 DI 措施

---

## 结论

### 无需修复的项
所有认证相关功能（注册、登录、token 刷新、登出、邮箱/短信验证、微信登录、密码重置、账号绑定）在两个分支间逻辑意图**完全一致**，重构仅涉及架构分层（Facade → Provider 委托）和 DTO 规范化。

### 需要决策的项（1 项）
**`SessionController` 鉴权策略从 `JwtAuthGuard` 变为 `@Public()`**，需确认是否为有意设计。

### 前端
Login.tsx 和 Register.tsx **无任何差异**，功能完整保留。
