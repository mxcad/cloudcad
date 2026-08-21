# Spec: 可替换认证模块架构 — 契约包 + 多实现 + API SDK 独立

## Problem Statement

CloudCAD 后端认证模块包含敏感业务逻辑（微信登录、支付回调等），这些逻辑不能随开源代码一起分发给所有用户。同时，CloudCAD 需要服务三种部署模式（OSS/Pro/TOB/离线）以及客户定制化开发，每种场景需要不同的认证实现组合。

当前方案存在三个问题：

1. **私有包路径耦合**：`packages/auth-impl/` 中的服务通过 `@backend/*` 路径别名 import 后端 class（`DatabaseService`、`RuntimeConfigService` 等），编译后 Node.js 无法解析这些路径别名，导致运行时崩溃。
2. **单一私有包不可扩展**：`auth-impl/` 是唯一私有包，无法支持多种实现并存（Pro/客户A/离线），也无法支持第三方基于同一契约开发自有实现。
3. **API SDK 分散**：前端 SDK 由前端和移动端各自生成，没有统一 `@cloudcad/api-sdk` 包供多端消费。

## Solution

引入三个层次的解耦：

1. **`@cloudcad/contracts`（契约包）**：提取 DI token 常量和服务接口（`IDatabaseService`、`IEmailVerificationService` 等），作为后端（provider）和私有实现（consumer）之间的共享契约。auth-impl 不再 import backend 的 class，而是 import `@cloudcad/contracts` 的接口和 token——`import type` 被 SWC 完全擦除，产物零依赖。
2. **多实现体系**：每个实现是一个独立包（`impl-pro/`、`impl-offline/`、`customer-xxx/auth-impl/`），编译后通过 `IMPL=路径` 环境变量被 backend 加载。`IMPL` 机制已实现。
3. **`@cloudcad/api-sdk`（API SD K包）**：将前后端 API 契约从各前端项目中抽离为独立包，统一管理 API 调用方法 + DTO 类型。

## User Stories

1. 作为 CloudCAD 核心开发者，我想要将敏感认证逻辑从开源仓库分离到私有包，以便开源用户可以编译运行（非认证端点正常服务，认证端点返回 503）。
2. 作为 CloudCAD 核心开发者，我想要私有包通过 DI 容器获取后端服务（DatabaseService 等），而不是通过文件路径 import，以便私有包编译产物没有无法解析的路径别名。
3. 作为 CloudCAD 核心开发者，我想要共享接口和 DI token 常量放在一个独立的 `contracts` 包中，以便后端和所有私有实现引用同一套契约，TypeScript 保证接口一致性。
4. 作为 Pro 版本的部署者，我想要设置 `IMPL=./packages/impl-pro/dist` 来启用完整的认证功能（微信、短信、支付等），以便 Pro 客户获得全部能力。
5. 作为离线版本的部署者，我想要设置 `IMPL=./packages/impl-offline/dist` 来启用去掉了外部 API 调用的简化认证，以便在没有互联网的环境下正常运行。
6. 作为客户 A 的定制开发者，我想要基于 fork 的 `contracts` 接口开发自己的认证实现，并通过 `IMPL=/opt/customer-a-auth/dist` 加载，以便在不修改核心框架代码的前提下完成定制。
7. 作为第三方开发者，我想要查看 `contracts` 包了解需要实现哪些接口才能创建一个兼容的认证模块，以便我基于 CloudCAD 做二次开发。
8. 作为前端开发者，我想要统一从 `@cloudcad/api-sdk` 调用后端 API，而不是在前端和移动端分别复制 API 调用代码，以便减少重复和维护成本。
9. 作为测试工程师，我想要 mock `@cloudcad/contracts` 中定义的接口来编写认证模块的单元测试，以便不依赖真实后端服务也能验证逻辑正确性。
10. 作为 OSS 社区成员，我想要 clone 开源仓库后就能 `pnpm install && pnpm dev` 直接运行，不因缺少私有包而报错，以便快速上手体验。

## Implementation Decisions

### 1. `@cloudcad/contracts` 契约包

- **位置**: `packages/contracts/`
- **包名**: `@cloudcad/contracts`（pnpm workspace 正式成员）
- **内容**：只包含接口（interface）和 DI token 常量（string const），不包含任何 class 实现
- **构建**：TypeScript 源码直接引用（workspace 协议），无需编译为独立 npm 包
- **覆盖范围（首批）**：
  - `IDatabaseService` — auth-impl 用到的 `user.findUnique`、`user.create` 等方法
  - `IEmailVerificationService` — `sendVerificationEmail`、`verifyEmail`
  - `IRuntimeConfigService` — `getValue<T>`
  - `ISmsVerificationService` — `sendSms`、`verifyCode`
  - `ITokenBlacklistService` — `addToBlacklist`、`isBlacklisted`
  - DI tokens: `'DB'`、`'EMAIL'`、`'CONFIG'`、`'SMS'`、`'TOKEN_BLACKLIST'`
- **消费方式**：私有包通过 `import type { IDatabaseService } from '@cloudcad/contracts'` 获取类型，SWC 编译时彻底擦除；运行时通过 `@Inject('DB')` 由 NestJS DI 容器注入实际实现
- **非目标**：不包含业务逻辑、不包含 DTO、不包含 API 路由定义

### 2. 后端适配 contracts

- `DatabaseService` 实现 `IDatabaseService`
- `EmailVerificationService` 实现 `IEmailVerificationService`
- `RuntimeConfigService` 实现 `IRuntimeConfigService`
- 其余已有服务类似处理
- `AuthModule.forRoot()` 注册 token→class 映射：`{ provide: 'DB', useExisting: DatabaseService }`
- OSS stub 服务继续保持（已有），返回 503

### 3. 私有实现体系

- 每个实现是**独立 npm 包**，有各自的 `package.json`、构建配置、测试
- `IMPL` 环境变量已支持：`true`/`1` 走默认路径 `packages/auth-impl/dist`，其他值为任意路径
- `auth-impl/` 保持现有结构，后续改为从 `contracts` 包 import
- 新增 `impl-pro/`、`impl-offline/` 等包时各自独立 clone/构建
- **不创建 `impl/` 统一目录**——各实现应是独立项目，避免依赖冲突

### 4. `@cloudcad/api-sdk` API SDK 包（后置任务）

- **位置**: `packages/api-sdk/`
- **来源**: 由后端 Swagger/OpenAPI 规范自动生成
- **消费**: 替代 `frontend` 和 `frontend_mobile` 各自的 `generate:sdk`
- **当前状态**：规划阶段，本期暂不实现

### 5. `IMPL` 环境变量（已实现）

当前 `AuthModule.forRoot()` 的加载逻辑保持不变：

```
IMPL 未设置 → createStubProviders()（503 fallback）
IMPL=true / IMPL=1 → resolve('packages/auth-impl/dist')
IMPL=任意路径 → resolve(env) 加载该路径
```

### 6. 迭代策略

| 阶段 | 内容 | 依赖 |
|------|------|------|
| 1 | 创建 `contracts/` 包，定义首批接口+token | 无 |
| 2 | 后端服务实现 contracts 接口，注册 token 映射 | 阶段 1 |
| 3 | auth-impl 改为从 contracts import（`import type` + `@Inject('TOKEN')`） | 阶段 1, 2 |
| 4 | 清理 `@backend/*` 路径别名依赖，验证 SWC 编译产物无 `require('@backend/')` | 阶段 3 |
| 5 | 可选的私有实现包制作（impl-pro、impl-offline 等） | 阶段 3 |
| 6 | api-sdk 独立（后置） | 阶段 5 后 |

## Testing Decisions

### 测试原则

- 只测试外部行为，不测试实现细节
- 每个实现包独立测试，通过 `@cloudcad/contracts` 的 mock 替代真实后端服务
- `AuthModule.forRoot()` 的 env var 加载逻辑通过 AuthModule 测试覆盖
- 契约包的接口变更由 TypeScript 编译器保证后端和所有实现的一致性

### 测试范围

| 测试对象 | 类型 | 方式 |
|----------|------|------|
| `contracts` 包 | — | 不测试（仅类型定义，TypeScript 保证正确性） |
| `AuthModule.forRoot()` | 单元测试 | Mock `process.env.IMPL`，验证加载正确实现 |
| 后端服务实现 | 现有测试 | 不变 |
| auth-impl 服务 | 单元测试 | Mock contracts 接口，验证业务逻辑 |
| auth-impl 服务 | 集成测试 | 通过真实的 token 映射与后端服务集成 |
| 自定义实现 | 由实现方自测 | 遵循 contracts 接口约定 |

### 已有参考

- `packages/backend/src/auth/auth-facade.service.spec.ts`
- `auth-impl/tests/*.spec.ts`（需要修复编码问题后可复用）
- ADR-0006 定义的接口层次（6 个子接口 + IAuthProvider 组合接口）

## Out of Scope

- 将 `api-sdk` 抽离为独立包（后置任务，本期不涉及）
- contracts 包的 npm 发布（仅 pnpm workspace 协议）
- 认证之外的模块（billing、export 等）私有化——仅建立架构模式
- contracts 包覆盖整个后端——**仅提取 auth-impl 当前用到的**服务接口
- 删除或重构现有的 `interfaces/` 目录——contracts 作为新包存在，不替换旧接口
- 第三方实现包的 CI/CD 流程

## Further Notes

- 已有 ADR-0006（认证提供商策略模式）为本次架构的决策依据，ADR-0016（渐进式部署三种模式）与本架构的 TOB/离线场景一致
- `import type` + SWC elide 模式是本次架构的技术基石——确认 SWC 对 `import type` 的擦除行为后全面采用
- 环境变量名 `IMPL` 已在 `.env.example` 和部署文档中记录
- `packages/auth-impl/` 已在 `.gitignore` 中永久排除
