# DB 共享 Prisma Client 包

数据库 schema 单一源 + 生成的 Prisma Client 统一出口。所有包（backend、impl-mx、contracts）的数据层类型与 `PrismaClient` 类均从本包获取。

## Language

**schema 单一源**:
`packages/db/prisma/schema.prisma` 是唯一 schema。修改 schema 后必须：`pnpm --filter backend prisma migrate dev`（migration 落 backend）→ 重新 `prisma generate`。
_Avoid_: 在 backend/impl-mx 维护第二份 schema；`import ... from '@prisma/client'` 直接取类型

**PrismaClient**:
`@cloudcad/db` 导出 `prisma-client` generator 生成的全部内容：`PrismaClient` 类、各模型类型、枚举、`Prisma` namespace。实例化不在此包（backend `DatabaseService` 构造，带 adapter + 日志）。
_Avoid_: 在本包构造 globalThis 单例

**编译产物**:
`pnpm db:generate && tsc` → `dist/`（exports 指向 dist）。`src/generated/client` 是生成物，gitignore。

## Package Structure

```
packages/db/
├── prisma/
│   └── schema.prisma          # 单一源
├── prisma.config.ts           # generate/validate 用（url 来自环境变量）
├── src/
│   ├── generated/client/      # prisma generate 输出（.gitignored）
│   └── index.ts               # export * from generated client
├── package.json
└── tsconfig.json
```

## Rules

- 只依赖 `@prisma/client`（运行时）；`prisma` 为 devDependency（CLI）
- `moduleFormat = "cjs"`：匹配 backend 的 CJS 构建链，生成物不产生 `.js` 后缀 import
- migration 归 backend 执行（见 ADR-0027），本包不持有 migration 历史
- backend TS 必须 >= 5.4（@prisma/client peer 要求），当前 ~5.9

## Design Decisions

- **编译产物而非 JIT**：沿用 `@cloudcad/contracts` 先例，backend 无需 bundler 即可 `node dist/main` 运行
- **不导出实例**：官方 pnpm 指南的单例模式不适合——backend 需要自定义 `PrismaPg` adapter 与日志参数，实例生命周期归 NestJS DI
- **IDatabaseService = PrismaClient**（contracts）：手写 `any` 接口废弃，impl-mx 获得全量真实类型
