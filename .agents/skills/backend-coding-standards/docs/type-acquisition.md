# 类型获取规则

> 总纲：ADR-0026《扩展机制总纲》第二节 + ADR-0027《@cloudcad/db 共享 Prisma Client》。

## 四类类型的唯一来源

| 类型 | 来源 | 禁止 |
|------|------|------|
| 数据访问层（Prisma 模型记录类型） | `@cloudcad/db` 导出的 Prisma 类型 | 在 contracts 或 impl 手写 DB 形状 |
| 业务层（跨包共享业务契约） | `@cloudcad/contracts` | — |
| HTTP 层 DTO 形状（请求/响应） | **不手动定义**；唯一来源 = backend DTO class → Swagger → `@cloudcad/api-sdk` 自动生成（`types.gen.ts`） | contracts 不得重复定义 HTTP DTO |
| 本地私有类型（单实现内部） | 留在 impl 内部 | 不进 contracts（避免契约膨胀） |

## 具体规则

1. **数据层类型一律从 `@cloudcad/db` 导入**（`PrismaClient`、模型类型、枚举、`Prisma` namespace）。**禁止任何包 `import ... from '@prisma/client'` 取类型**。schema 单一源：`packages/db/prisma/schema.prisma`。
2. **接口方法不得使用 `any`**。`IDatabaseService = PrismaClient`、`ITransactionClient = Prisma.TransactionClient`（定义在 `@cloudcad/contracts`），数据适配器接口返回 Prisma 类型而非 any。
3. **HTTP DTO 形状不手动定义**——由 api-sdk 自动生成。impl 需要时 `import type { XxxDto } from '@cloudcad/api-sdk'`（type-only import 编译期擦除，零运行时依赖）。
4. **扩展点接口方法签名不直接引用 HTTP DTO 类型**，只用基础类型 + contracts 领域类型——保持 contracts 独立（零框架依赖、不依赖 api-sdk）。
5. **契约先行**：类型/接口被 **≥2 个独立包**引用才进 contracts（ADR-0026 第三节）。

## 依赖方向

```
backend → contracts
backend → api-sdk(生成物)
impl-mx → contracts
impl-mx → api-sdk(type-only)
```

无环。contracts 不得反向依赖 backend / api-sdk。

## 迁移与验证

- schema 变更流程见 `prisma-database` skill / ADR-0027 Guidance：改 `packages/db/prisma/schema.prisma` → `pnpm --filter backend prisma migrate dev` → 重新 generate + 重建 `@cloudcad/db`。
- 每次改动后 `pnpm type-check` 验证（backend / contracts / impl-mx）。
