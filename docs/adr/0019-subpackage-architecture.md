# 私有包分包架构 (@cloudcad/*)

CloudCAD 开源但核心差异化能力（MX 官方认证、BOM 计算等）需私有隔离。采用 `@cloudcad/*` 命名空间的 monorepo 分包架构——接口/契约放在 `@cloudcad/contracts`（开源），实现放在 `@cloudcad/impl-mx`（私有，.gitignored），通过环境变量 `IMPL` + NestJS DI 动态加载。实现层不感知开源侧的编排逻辑。

驱动因素：`auth-impl` 私有包曾用 `@backend/*` 路径别名引用后端代码，编译后 Node.js 无法解析这些别名（TypeScript paths 只在编译时生效，不转换输出中的 import 路径）。改用 `@cloudcad/contracts` 的 DI token + `import type` 后，编译产物零依赖路径别名。

**Status**: accepted

## Decision

### 包划分

| 包 | 路径 | 可见性 | 职责 |
|---|------|--------|------|
| `@cloudcad/contracts` | `packages/contracts/` | 开源 | DI token + TypeScript 接口类型 |
| `@cloudcad/impl-mx` | `packages/impl-mx/` | 私有（.gitignore） | MX 官方私有实现 |

### 依赖方向

```
backend (opensource) ───→ contracts (opensource)
                              ↑
impl-mx (private) ───────────┘
```

- `backend` 和 `impl-mx` 都依赖 `contracts`
- `impl-mx` 不依赖 `backend`（通过 DI token + `@Optional()` 解耦）
- `backend` 完全不感知 `impl-mx` 的存在（通过 `resolveAuthProviders()` 动态加载）

### 加载机制

`IMPL` 环境变量命名寓意：一个部署场景（Pro、客户定制、离线）对应一个私有覆盖层包，`IMPL` 指向该包的实现，不限于认证模块。

```typescript
// backend 启动时加载逻辑（AuthModule.forRoot）：
OSS 认证始终注册 → createDefaultAuthProviders()（开箱可用，无 503）
IMPL 未设置 → 仅 OSS 认证
IMPL=true / IMPL=1 → 叠加 packages/impl-mx/dist 覆盖层
IMPL=./packages/impl-pro → 叠加相对路径 Pro 覆盖层
IMPL=/opt/customer-a/dist → 叠加绝对路径客户定制覆盖层
```

`createDefaultAuthProviders()`（backend `src/auth/impl/`，开源单点）始终注册全部认证服务与 token 映射（`AUTHENTICATION_HANDLER`、`OAUTH_HANDLER`、`SMS_AUTH_HANDLER`、`ACCOUNT_BINDING_HANDLER`、`TOKEN_HANDLER`、`PASSWORD_RESET_HANDLER` 等）。`IMPL` 存在时，`createAuthProviders()`（覆盖层）返回的 `Provider[]` 被**叠加**到 providers 数组末尾——NestJS 对同模块同 token 后注册者胜出，因此覆盖层只覆盖 `AUTHENTICATION_HANDLER`（`OldSiteAuthHandler`），其余 token 保持 OSS 服务。OSS 版本即使无 `IMPL` 也拥有完整可用认证。

### 多实现体系

每个实现是独立 npm 包，有各自的 `package.json`、`.swcrc`、测试。各实现不共享 `node_modules`，避免依赖冲突：

| 包 | 路径 | 用途 |
|---|------|------|
| `@cloudcad/impl-mx` | `packages/impl-mx/` | MX 官方私有实现 |
| `@cloudcad/impl-pro` | `packages/impl-pro/` | Pro 增强版本（未来） |
| `@cloudcad/impl-offline` | `packages/impl-offline/` | 离线部署简化版（未来） |

不创建 `impl/` 统一目录——各实现应是独立项目，避免依赖冲突。

### import type + SWC elide

`impl-mx` 使用 `import type { IMembershipService }` + SWC build（elide 策略），保证运行时无源码级别的类型依赖。接口类型编译后不产生 import 语句。

### 契约层规范

`contracts` 包只包含：
- DI token 常量（`DB`、`CONFIG`、`MEMBERSHIP_SERVICE`、`EMAIL`、`SMS`、`TOKEN_BLACKLIST` 等）
- TypeScript 接口类型（`IMembershipService`、`IDatabaseService`、`IEmailVerificationService`、`IRuntimeConfigService`、`ISmsVerificationService`、`ITokenBlacklistService` 等）
- 不包含任何实现代码
- 不依赖 NestJS 或其他框架（纯 TypeScript 类型包）
- 首批覆盖范围限于 auth-impl 当前用到的服务接口，非全后端接口

### 测试策略

- `impl-mx` 的私有实现在自身包内独立测试
- 集成测试通过 backend 加载 `impl-mx` 模块，mock 外部 HTTP 请求
- 每个实现包独立测试，通过 `@cloudcad/contracts` 的 mock 替代真实后端服务
- `AuthModule.forRoot()` 的 env var 加载逻辑通过 AuthModule 测试覆盖
- 契约包的接口变更由 TypeScript 编译器保证后端和所有实现的一致性

## Considered Options

- **git submodule**：私有代码放在独立仓库。否决理由：开发循环不便、CI/CD 复杂度高。
- **Feature flag 内嵌**：私有逻辑通过 if/else 嵌入开源代码。否决理由：泄露私有逻辑、开源用户能看到内部业务规则。
- **npm private registry**：发布到私有 npm。否决理由：开发时需要发布/安装循环，增加部署步骤。

### 未来扩展：@cloudcad/api-sdk

API SDK 包（`packages/api-sdk/`）已规划但尚未实现。目标：由后端 Swagger/OpenAPI 规范自动生成统一 API 调用方法 + DTO 类型，替代前端和移动端各自 `generate:sdk` 的重复逻辑。

## Consequences

- `packages/impl-mx/` 目录加入 `.gitignore`
- 构建流程：`impl-mx` 先 build（SWC），backend 再通过 `IMPL` 环境变量加载
- OSS 用户无 `IMPL` 环境变量时，认证端点完整可用（由 `createDefaultAuthProviders()` 提供）；`IMPL` 存在时仅认证代理/私有能力被覆盖层增强
- 新增私有实现只需创建独立包 + 实现 contracts 接口，不影响开源代码
- 后端服务需实现 contracts 接口（`implements IDatabaseService` 等），并通过 DI 注册 token→class 映射
