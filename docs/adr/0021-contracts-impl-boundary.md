# Contracts 与 Impl 的分界约定
**Status**: accepted

后端可替换模块使用「接口 + DI token」模式解耦，但接口定义的位置（`@cloudcad/contracts` vs 后端本地 `interfaces/`）长期缺乏约定。导致 `impl-mx` 包通过 `../../dto/auth.dto` 等相对路径间接依赖后端源码，编译后 Node.js 无法解析。

**Decision**

所有可替换模块的接口 + DI token 统一放在 `@cloudcad/contracts` 包中，按三层分层：

| 层级 | 内容 | 例子 | 消费者 |
|------|------|------|--------|
| 基础设施 | DB、EMAIL、SMS、CONFIG、TOKEN_BLACKLIST | `IDatabaseService`、`IEmailVerificationService` | impl-mx、OSS impl |
| 领域仓库 | Repository 接口 | `IUserRepository`、`IRoleRepository` | OSS impl（impl-mx 跳过此层直连 DB） |
| 业务服务 | Auth/VIP 等服务接口 | `IRegistrationService`、`IMembershipService` | impl-mx、auth-facade |

**Guidance**

1. **Interface 定义**：contracts 包的接口使用 `@cloudcad/contracts/src/auth/types.ts` 中的纯类型（interface，非 class），不依赖 NestJS 装饰器、Swagger、class-validator。后端 DTO 类（含装饰器）与 contracts 类型通过结构类型兼容。

2. **DI Token**：所有 token 统一在 `packages/contracts/src/tokens.ts` 定义，按「基础设施 / 业务服务 / Auth / 仓库」分组。后端 `auth.module.ts` 直接引用 contracts token。

3. **后端本地接口文件**：`packages/backend/src/auth/interfaces/*.ts` 保留为向后兼容的 re-export 层。不在此定义新接口。新接口直接写入 contracts。

4. **impl-mx**：通过 `@cloudcad/contracts` 获取 DI token + 接口类型。不得通过相对路径（`../../dto/`、`../../interfaces/`）或路径别名（`@backend/*`）引用后端源码。

5. **OSS impl**（`packages/backend/src/auth/impl/`）：通过 `@cloudcad/contracts` 获取 token 和接口类型。class 定义加 `implements` 子句确保类型契约。

6. **Domain types**：跨 impl 共享的用户类型（`UserRecord`、`UserRoleRef` 等）在 `contracts/src/domain/` 中定义。不共享的类型留在各 impl 内部。

**Status**: accepted

**Cross-references**
- ADR-0019 分包架构：contracts 包是 OSS/impl-mx 解耦的前提
- ADR-0020 可替换 vs 内部服务：判断"是否走接口抽象"的决策规则
- `packages/contracts/CONTEXT.md`：包内约定详述
- `replaceable-module` skill：接口定义和实现组织的详细规范
