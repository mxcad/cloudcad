# 可替换认证两层 seam 架构

Auth 模块是 CloudCAD 最复杂的可替换模块——既有基础设施依赖（DB、Email、SMS、Config），又有认证业务逻辑（注册、登录、密码、微信），还需要支持 OSS/Pro/TOB/离线四种实现，且实现层不感知开源编排逻辑。

我们构建了一个**两层 seam 架构**：AuthFacadeService 作为唯一编排入口，下层通过两个独立的接口层解耦——基础设施通过 `@cloudcad/contracts` DI token 替换，业务逻辑通过 `createAuthProviders()` 动态加载。两层均可独立替换，互不感知。

**Status**: accepted (significant update 2026-07)

## Architecture

```
AuthController (路由)
    │
    ▼
AuthFacadeService (编排 + 审计日志)
    │
    ├── Layer 1: 基础设施 (@cloudcad/contracts)
    │   ├── DB → DatabaseService
    │   ├── EMAIL → EmailVerificationService
    │   ├── CONFIG → RuntimeConfigService
    │   ├── SMS → SmsVerificationService
    │   ├── TOKEN_BLACKLIST → TokenBlacklistService
    │   └── MEMBERSHIP_SERVICE → MembershipService
    │   （在 AuthModule.forRoot() 中注册 token→class 映射）
    │
    └── Layer 2: 认证业务逻辑 (createAuthProviders)
        ├── Service Seam (服务层，开源 auth/impl/ 或私有 @cloudcad/impl-mx)
        │   ├── REGISTRATION_SERVICE → RegistrationService
        │   ├── PASSWORD_SERVICE → PasswordService
        │   ├── ACCOUNT_BINDING_SERVICE → AccountBindingService
        │   ├── AUTH_TOKEN_SERVICE → AuthTokenService
        │   └── WECHAT_CALLBACK_SERVICE → WechatCallbackService
        └── Provider Seam (提供者层，实现 6 个子接口)
            ├── IAuthenticationHandler (登录/注册/用户信息)
            ├── IOAuthHandler (OAuth/微信)
            ├── ISmsAuthHandler (短信登录/注册)
            ├── IPasswordResetHandler (密码重置)
            ├── IAccountBindingHandler (邮箱/手机绑定)
            └── ITokenHandler (Token 管理)
            实现: OssAuthProvider (OSS) / ProAuthProvider (Pro)
```

## Two Seams

### Seam 1: Service Seam (`service-interfaces.ts`)

细粒度的认证子服务接口，供 `AuthFacadeService` 直接调用：

| DI Token | 接口 | 职责 |
|----------|------|------|
| `REGISTRATION_SERVICE` | `IRegistrationService` | 注册 + 邮箱激活 |
| `PASSWORD_SERVICE` | `IPasswordService` | 密码验证 + 忘记/重置密码 |
| `ACCOUNT_BINDING_SERVICE` | `IAccountBindingService` | 邮箱/手机/微信的绑定换绑解绑 |
| `AUTH_TOKEN_SERVICE` | `IAuthTokenService` | Token 生成/刷新/吊销/登出 |
| `WECHAT_CALLBACK_SERVICE` | `IWechatCallbackService` | 微信授权 URL + 回调 + 轮询 |

OS S 实现在 `packages/backend/src/auth/impl/services/`，私有实现在 `@cloudcad/impl-mx/src/auth/services/`。

### Seam 2: Provider Seam (`auth-provider.interface.ts`)

6 个子接口的组合接口 `IAuthProvider`，覆盖完整认证生命周期。与 Service Seam 的关系：Facade 优先走 Provider Seam（如 `authHandler.login()`），Service Seam 仅用于 Provider 未覆盖的细分操作（如 `passwordService.validateUser()`）。

### Loading Mechanism

```
OSS (无 IMPL):
  AuthModule.forRoot()
    → createDefaultAuthProviders()  ← packages/backend/src/auth/impl/index.ts
    → 加载 OSS 版本 RegistrationService, LoginService, ..., OssAuthProvider

Pro (IMPL=...):
  AuthModule.forRoot()
    → resolveAuthProviders(IMPL)
    → createAuthProviders()  ← @cloudcad/impl-mx/dist/index.ts
    → 加载私有版本（可完全覆写 OSS 服务），同名 token 覆盖 OSS 注册
```

## Considered Options (original)

1. **固定接口（chosen）** — 每个认证方式有独立方法签名与 DTO 类型，保持 TypeScript 强类型安全。团队认知负担低，无需理解 plugin 机制。
2. **能力声明式** — `authenticate(capability: string, credentials: unknown)` 零接口变更，但丢失类型安全。

## Consequences

- `packages/backend/src/auth/interfaces/auth-provider.interface.ts` → 6 个独立接口（原决议）
- `LocalAuthProvider` → `OssAuthProvider`（原决议）
- **新增** `service-interfaces.ts`（Service Seam），双 seam 共存
- **新增** `auth/impl/` 目录（OSS 参考实现），与 `@cloudcad/impl-mx` 形成双实现体系
- **新增** `@cloudcad/contracts` 基础设施 DI token（ADR-0019）
- `AuthFacadeService` 担当单一编排层，统一注入 Provider + Service，包裹审计日志
- `AuthController` 不感知任何实现，只依赖 `AuthFacadeService`
- OSS 版本无 IMPL 时走 `createDefaultAuthProviders()`，认证端点正常服务；Pro 版本 IMPL 私有实现可完整覆写
