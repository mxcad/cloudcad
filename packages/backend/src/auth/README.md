# CloudCAD 认证模块（packages/backend/src/auth）

## 概述

认证模块是后端（NestJS 11，端口 3001）的全局认证子系统（`@Global()`），提供完整的账户生命周期能力：注册（邮箱/手机号/微信）、登录（密码/验证码/微信）、Token 签发与刷新、登出与撤销、密码找回/重置、邮箱与手机号绑定/换绑/解绑、微信绑定、设备授权（EXE 客户端 OAuth 设备码流）以及系统首次启动初始化（默认角色/管理员播种）。

模块遵循 ADR-0020「可替换模块 vs 内部服务」：核心认证能力通过「接口 + DI token」暴露扩展点，OSS 默认实现位于 `impl/`，私有实现（如 `packages/impl-mx`）可通过 `IMPL` 环境变量叠加覆盖层（后注册者覆盖同 token，见 `auth.module.ts` 的 `resolveAuthImplPath` / `resolveAuthProviders`）。

## 目录结构

```
src/auth/
├── auth.module.ts               # 模块注册（DynamicModule.forRoot，global）
├── auth.controller.ts           # 认证 REST 端点（35 个）
├── auth-facade.service.ts       # Façade 服务（IAuthFacade 实现）
├── jwt.strategy.executor.ts     # 全局 JWT 守卫执行器（Token/Session/OptionalAuth 判定）
├── decorators/                  # @Public / @OptionalAuth / @CsrfProtected 元数据装饰器
├── dto/                         # 认证 DTO（auth/wechat/email-verification/password-reset/account-binding/sms-verification）
├── guards/
│   └── csrf.guard.ts            # 双重提交 Cookie CSRF 守卫
├── interfaces/                  # 契约：IAuthFacade、IAuthProvider 及子接口、JWT payload 类型
├── impl/                        # OSS 默认实现（providers/repositories/services）
│   ├── providers/local-auth.provider.ts   # OssAuthProvider：聚合 6 个 handler 接口
│   ├── repositories/            # UserRepository / RefreshTokenRepository / RoleRepository
│   └── services/                # registration/login/password/account-binding/auth-token/wechat 系列
├── services/                    # TokenBlacklist / AccountRateLimit / Initialization
│   └── sms/                     # 短信验证码（sms.module + providers 工厂）
├── strategies/                  # jwt.strategy / refresh-token.strategy（passport-jwt）
├── utils/token-extractor.ts     # 从 Header/Cookie 提取 token
└── device/                      # EXE 设备授权（controller/service/constants/dto）
```

## 核心架构

### Façade 模式

`AuthFacadeService`（同时以类与 `IAUTH_FACADE` token 注册）是唯一被 Controller 消费的入口，组合以下内部服务（经 `@cloudcad/contracts` DI token 注入）：

| DI Token（contracts） | OSS 实现 | 职责 |
|---|---|---|
| `REGISTRATION_SERVICE` | RegistrationService | 注册 + 邮箱激活 |
| `PASSWORD_SERVICE` | PasswordService | 密码校验/找回/重置 |
| `ACCOUNT_BINDING_SERVICE` | AccountBindingService | 邮箱/手机号/微信绑定与换绑 |
| `AUTH_TOKEN_SERVICE` | AuthTokenService | Token 生成/刷新/登出/撤销 |
| `AUTHENTICATION_HANDLER` / `OAUTH_HANDLER` / `SMS_AUTH_HANDLER` / `ACCOUNT_BINDING_HANDLER` / `TOKEN_HANDLER` | OssAuthProvider | 登录类能力（可被私有实现覆盖） |
| 类注入 | EmailVerificationService / SmsVerificationService / MembershipService / IUserService | 验证码、会员展平、用户读写 |

Façade 方法使用 `@Audit()` 装饰器为注册/登录/绑定/解绑等关键操作写入审计日志（`AuditAction.*` + `ResourceType.USER`）。响应统一由全局 `ResponseInterceptor` 包装为 `{ code, message, data, timestamp }`。

### 可替换模块模式（IAuthProvider）

`interfaces/auth-provider.interface.ts` 定义了根接口 `IAuthProvider`，聚合 6 个子接口：`IAuthenticationHandler`（登录/注册）、`IOAuthHandler`（微信登录）、`ISmsAuthHandler`（短信登录/注册/验证）、`IPasswordResetHandler`、`IAccountBindingHandler`、`ITokenHandler`（刷新）。OSS 的 `OssAuthProvider` 在 `impl/index.ts:createDefaultAuthProviders()` 中将其全部绑定到同名 token；私有包（`IMPL=true` → `packages/impl-mx/dist`）通过 `createAuthProviders()` 提供覆盖实现即可整体替换登录行为（同 token 后注册者覆盖）。另外模块为私有实现提供 `DB` / `EMAIL` / `CONFIG` / `SMS` / `TOKEN_BLACKLIST` / `MEMBERSHIP_SERVICE` 六个 alias token（`auth.module.ts`）。

## 核心组件详解

### AuthModule（auth.module.ts）

- `AuthModule.forRoot()` 返回全局动态模块（单例缓存），注册 `AuthController`，导入 Database/Common/Notification/Redis/RuntimeConfig/Users/Billing/Passport/Sms/AuditLog/Permission/DeviceAuth 模块与异步 `JwtModule`。
- 导出 `AuthFacadeService`、`IAUTH_FACADE`、`TokenBlacklistService`、`SmsModule` 供其他模块使用。

### AuthController（auth.controller.ts）

全部端点见下方端点表。要点：
- Cookie 配套：登录/注册/刷新等成功后写入 `auth_token`（httpOnly，1h，path `/`）与 `refresh_token`（httpOnly，7d，path `/api/v1/auth/refresh`）两个 cookie（`setAuthCookies`）；`logout` 幂等清除 Session 与全部认证 cookie。
- 微信相关响应强制 `Cache-Control: no-store`（防 CDN 缓存导致 state/code 串号）。
- 短信发送接口从 `x-forwarded-for` / `x-real-ip` / socket 提取客户端 IP。

### JwtStrategyExecutor（jwt.strategy.executor.ts）

全局 JWT 守卫（`AuthGuard('jwt')` 子类），判定顺序：`@Public()` → 直接放行；有 token（`extractTokenFromRequest`：Authorization Bearer 或 `auth_token` cookie）→ 强制 JWT 验证，失败时仅 `@OptionalAuth()` 端点降级为匿名；无 token → 回退 Session（校验用户黑名单/状态/实时角色并写回 `request.user`）；`@OptionalAuth()` → 匿名放行；否则 401。

### JwtStrategy / RefreshTokenStrategy

- `jwt.strategy.ts`：从 Authorization 或 cookie 提取 access token，校验 payload `type === 'access'`、token 黑名单、用户黑名单、用户状态 ACTIVE；角色以 DB 实时角色优先，权限经 `RoleInheritanceService.getRolePermissions` 从 Redis 角色缓存获取（0 DB 查询）。缺失 `JWT_SECRET` 时启动抛错。
- `refresh-token.strategy.ts`（策略名 `refresh-token`）：独立 `JWT_REFRESH_SECRET`，校验 `type === 'refresh'` 与用户状态。

### services/

- `token-blacklist.service.ts`：Redis 实现 token（`token:blacklist:<token>`）与用户级（`user:blacklist:<userId>`）黑名单；Redis 故障时安全降级为拒绝；用 SCAN 游标替代 KEYS。
- `account-rate-limit.service.ts`：账号维度限流（防撞库/爆破/轰炸），按 `login`（默认 5 次/60s）、`password_reset`、`register`（默认 5 次/3600s）动作以 Redis INCR+EXPIRE 计数，超限抛 429；`max <= 0` 禁用；Redis 故障 fail-open。
- `initialization.service.ts`：`OnModuleInit` 启动任务——清理同名系统角色重复行（防权限漂移）、播种系统/项目默认角色、初始化角色继承层级并预热权限缓存、创建初始管理员、为用户补齐个人空间、创建公共资源库。

### services/sms/

`SmsModule` 提供 `SmsVerificationService`（也绑定 `SMS_VERIFICATION_SERVICE` token 导出）。服务商层为统一接口 `SmsProvider`（`sendVerificationCode`/`sendTemplate`/`healthCheck`），`SmsProviderFactory` 按配置创建 `aliyun` / `tencent` / `mock` 实现（`providers/`）。安全限制：60s 发送间隔、每手机号每日上限（默认 10）、每 IP 每小时上限（默认 20）、验证最多 5 次尝试；短信未启用（运行时配置 `smsEnabled`）时自动回退 Mock 模式。

### impl/（OSS 默认实现）

- `repositories/`：`UserRepository`（findByEmail/Username/Phone/WechatId、`findLoginUser` 支持邮箱/用户名/手机号三合一并携带 membership）、`RefreshTokenRepository`（每用户每 client 最多 10 条 refresh token，超出淘汰最早过期者，事务写入）、`RoleRepository`。
- `services/`：`RegistrationService`（注册开关、防枚举统一文案、`register:pending:<email>` Redis 暂存 + 15min 过期、微信临时 token 绑定注册）、`LoginService`（bcrypt 校验、可选 `USER_SYNC_HOOK` 登录前同步扩展点、`EMAIL_REQUIRED`/`EMAIL_NOT_VERIFIED`/`PHONE_REQUIRED`/`PHONE_NOT_VERIFIED` 阻断码 + 30min tempToken、session 写入、membership 展平）、`PasswordService`（bcrypt 12 轮、防枚举不发送验证码但返回成功文案、重置后清 refresh token）、`AuthTokenService`（access 1h / refresh 7d、`jti` 防同秒冲突、refresh token 落库校验）、`WechatService`（微信 API 客户端，access_token 幂等缓存 + Redis 锁）、`WechatTransactionService`（桌面/移动端轮询事务，TTL 300s）、`WechatCallbackService`（state 携带 origin/isPopup/purpose/client，回调后重定向前端 `#wechat_result=`，支持 popup 与扫码轮询两种模式）。

### device/（EXE 设备授权）

OAuth 设备码流：`requestDeviceCode` 校验 `CLIENT_ID_WHITELIST`（`mx_cad_viewer`/`mxcad_fast_view`/`mx_cad_editor`），生成 device_code（randomBytes）+ user_code（8 位易读码 XXXX-XXXX），Redis Hash 存储 300s；`authorizeDevice` 用 Lua 脚本保证 PENDING→AUTHORIZED 原子转换；`pollForToken` 用 Lua 原子轮询，成功签发 EXE 专用 token（payload 含 `client_type: 'exe'`、`client_id`，access 7d / refresh 30d 并落库），错误码 `authorization_pending`/`expired_token`/`access_denied`。

## API 端点

全局路由前缀 `/api/v1`。鉴权列含义：公开（`@Public`）/ 登录（JWT Bearer 或 Session）/ 可选（`@OptionalAuth`）。

### 认证（AuthController，前缀 `/auth`）— 35 个端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | /auth/register | 公开 | 邮箱/用户名注册（邮件启用时返回待验证消息） |
| POST | /auth/login | 公开 | 账号密码登录（邮箱/用户名/手机号） |
| POST | /auth/refresh | 公开 | 刷新 Token（优先 body，其次 httpOnly cookie） |
| POST | /auth/logout | 可选 | 登出（黑名单 access token + 删 refresh token + 销毁 session，幂等） |
| GET | /auth/profile | 登录 | 当前用户信息 + 会员信息展平（剔除 password；含 `wechatId`/`provider` 字段，66486308） |
| POST | /auth/send-verification | 公开 | 发送邮箱验证码 |
| POST | /auth/verify-email | 公开 | 验证邮箱并激活（注册或补验） |
| POST | /auth/resend-verification | 公开 | 重发邮箱验证码 |
| POST | /auth/verify-email-and-register-phone | 公开 | 验证邮箱 + 手机号注册（201） |
| POST | /auth/bind-email-and-login | 公开 | 绑定邮箱并登录（tempToken 流） |
| POST | /auth/bind-phone-and-login | 公开 | 绑定手机号并登录（tempToken 流） |
| POST | /auth/verify-phone | 公开 | 验证手机号并登录 |
| POST | /auth/forgot-password | 公开 | 忘记密码（发送邮箱/短信验证码） |
| POST | /auth/reset-password | 公开 | 重置密码 |
| POST | /auth/bind-email | 登录 | 发送绑定邮箱验证码（支持 isRebind） |
| POST | /auth/verify-bind-email | 登录 | 验证并绑定邮箱 |
| POST | /auth/send-unbind-email-code | 登录 | 发送解绑邮箱验证码（验证原邮箱） |
| POST | /auth/verify-unbind-email-code | 登录 | 验证解绑邮箱码，返回换绑 token |
| POST | /auth/rebind-email | 登录 | 换绑邮箱（需先验证原邮箱） |
| POST | /auth/unbind-email | 登录 | 直接解绑邮箱 |
| POST | /auth/send-sms-code | 公开 | 发送短信验证码（scene: login/register/bind…，bind 场景预检占用） |
| POST | /auth/verify-sms-code | 公开 | 验证短信验证码 |
| POST | /auth/register-phone | 公开 | 手机号注册（201） |
| POST | /auth/login-phone | 公开 | 手机号验证码登录（412 = 未注册需跳注册） |
| POST | /auth/bind-phone | 登录 | 绑定手机号 |
| POST | /auth/send-unbind-phone-code | 登录 | 发送解绑手机号验证码 |
| POST | /auth/verify-unbind-phone-code | 登录 | 验证解绑手机号码，返回换绑 token |
| POST | /auth/rebind-phone | 登录 | 换绑手机号 |
| POST | /auth/unbind-phone | 登录 | 直接解绑手机号 |
| POST | /auth/check-field | 公开 | 字段唯一性检查（username/email/phone） |
| GET | /auth/wechat/login | 公开 | 获取微信授权 URL（origin/isPopup/purpose/client/txn） |
| GET | /auth/wechat/callback | 公开 | 微信授权回调（版本中立，302 重定向回前端） |
| GET | /auth/wechat/poll-transaction | 公开 | 轮询微信登录事务（桌面/移动端扫码） |
| POST | /auth/wechat/bind | 登录 | 绑定微信到当前账号（openid 缺失返回 400，f162c734） |
| POST | /auth/wechat/unbind | 登录 | 解绑微信 |

### 设备授权（DeviceAuthController，前缀 `/device`）— 3 个端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | /device/code | 公开 | 申请设备码（EXE 客户端） |
| POST | /device/authorize | 登录 | 用户确认授权（浏览器页面） |
| POST | /device/oauth/token | 公开（限流 12 次/分） | 轮询获取 Token（EXE 客户端） |

## 数据模型

认证涉及的核心表（schema 单一源：`packages/db/prisma/schema.prisma`）：

- **users**：`id`、`email`/`username`/`phone`（唯一，可空）、`password`（bcrypt 哈希，不随响应返回）、`phoneVerified`/`emailVerified`、`wechatId`、`provider`（LOCAL/WECHAT）、`roleId`、`status`（ACTIVE 等）、`deletedAt`（软删，所有查询带 `deletedAt: null`）、`membership` 关系。

> **微信头像本地化**（606cc6d6）：登录/注册时 `syncWechatAvatar` 将微信头像下载落盘（`AVATAR_PATH` 或 `filesDataPath/avatars/`），`avatar` 字段不再直接存微信域名 URL；存量数据可跑 `packages/backend/scripts/migrate-wechat-avatars.ts` 一次性迁移。
- **refresh_tokens**：`token`、`userId`、`expiresAt`、`clientId`（web 为 null，EXE 区分客户端），每用户每 client 上限 10 条，刷新时旧 token 事务内删除。
- **roles** / **role_permissions**：系统角色（SystemRole）与项目角色（ProjectRole），角色继承关系存 `parentId`；JWT 校验时经 Redis 角色缓存取权限。

JWT payload：access token 为 `{ sub, email, username, role, roleId, type: 'access', jti }`；refresh token 为 `{ sub, type: 'refresh', jti }`；EXE token 额外含 `client_type`/`client_id`；微信临时 token 为 `{ sub, type: 'wechat_temp', wechatId }`。

## 安全措施

| 措施 | 实现 |
|---|---|
| 密码存储 | bcryptjs 12 轮盐值；登录/资料接口响应防御性剔除 password 字段 |
| Token 撤销 | 登出时 access token 入 Redis 黑名单（按剩余 TTL）、refresh token 删除；用户禁用走 `user:blacklist` |
| 双密钥 | access 用 `JWT_SECRET`、refresh 用独立 `JWT_REFRESH_SECRET`，refresh token 额外落库校验 |
| 限流 | IP 维度 RateLimitGuard（全局）+ 账号维度 `AccountRateLimitService`（login/register/password_reset）+ 验证码 per-identifier/每日/IP 上限 |
| 防枚举 | 注册冲突、登录失败、禁用账号、忘记密码均返回统一文案；`check-field` 为唯一显式唯一性接口 |
| CSRF | `CsrfGuard` 双重提交 cookie（`csrf_token` cookie + `x-csrf-token` header，timing-safe 比较，每次轮换）；Bearer token 存在时跳过 |
| 登录阻断 | `requireEmailVerification`/`requirePhoneVerification` 运行时配置启用时，未验证账号返回 `EMAIL_REQUIRED` 等阻断码 + 30min 临时 token 引导绑定 |
| 微信安全 | state 内含 64 位 csrf 随机数并校验；access_token 幂等缓存 + Redis 锁防 code 重放（40029）；回调/轮询禁缓存 |
| 其他 | 手机号注册/登录防自动注册需 `allowAutoRegisterOnPhoneLogin` 运行时开关；Redis 故障黑名单 fail-closed、限流 fail-open；设备码 Lua 原子状态转换 |

## 测试

- `auth-facade.service.spec.ts`（1177 行）：Façade 全方法单元测试。
- `auth.controller.spec.ts` / `auth.module.spec.ts`：Controller 与模块装配测试。
- `impl/services/`：`login.service.spec.ts`、`password.service.spec.ts`、`wechat.service.spec.ts`。
- `services/`：`token-blacklist.service.spec.ts`、`account-rate-limit.service.spec.ts`。
- `device/device-auth.service.spec.ts`：设备码流（含 Lua 脚本行为）。
- 运行：`pnpm test -- --testPathPattern="auth"`。
