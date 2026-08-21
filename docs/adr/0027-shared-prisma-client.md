# @cloudcad/db 共享 Prisma Client
**Status**: accepted

数据库 schema 与生成的 Prisma Client 长期归属 `packages/backend`：schema 在 `packages/backend/prisma/schema.prisma`，生成物写入 `node_modules/@prisma/client`（`prisma-client-js` generator）。`impl-mx` 只能把 `@prisma/client` 当 peerDependency 使用类型，`contracts` 的 `IDatabaseService` 退化为手写 `any` 接口，跨包类型漂移无法根治。调研结论（issue #172）确认 Prisma 7 官方 monorepo 模式即「独立 db 包 + 共享 client」。

**Decision**

1. **schema 单一源**：`packages/db/prisma/schema.prisma` 是唯一 schema。generator 使用 Prisma 7 的 `prisma-client`（Rust-free query compiler），`output = "../src/generated/client"`（相对 schema 解析），`moduleFormat = "cjs"` 对齐 backend 的 CJS 构建。`postgresqlExtensions` preview flag 保留（`extensions = [pg_trgm]` 在 7.8 仍要求该 flag）。`engineType`/`binaryTargets`/`prisma-client-js` 移除。
2. **生成物 gitignore**：`packages/db/src/generated/` 是 build artifact，不入库，靠构建时 `prisma generate` 重新生成。
3. **@cloudcad/db 编译产物模式**（沿用 `@cloudcad/contracts` 先例）：`pnpm db:generate && tsc` → `dist/`，`exports` 指向 `dist/index.js` + `dist/index.d.ts`。`src/index.ts` re-export 生成 client（`PrismaClient` 类、模型类型、枚举、`Prisma` namespace）。运行时依赖仅 `@prisma/client`。
4. **migration 留在 backend**：`packages/backend/prisma.config.ts` 的 `schema` 改为 `../db/prisma/schema.prisma`，`migrations.path` 保持 `prisma/migrations`。`prisma migrate dev/deploy` 照常在 backend 执行，migration 历史不动窝；从 backend 跑 `prisma generate` 同样生成到 db 包（output 随 schema 位置解析）。
5. **消费方式**：
   - 数据层类型（模型、枚举、`Prisma` namespace、`PrismaClient`）一律从 `@cloudcad/db` 获取；**禁止任何包直接 `import ... from '@prisma/client'` 取类型**。
   - 实例化仍归 backend：`DatabaseService extends PrismaClient`（`@cloudcad/db` 导出的类），构造时传入 `PrismaPg` adapter + 日志配置。
   - `contracts` 的 `IDatabaseService = PrismaClient`，`ITransactionClient = Prisma.TransactionClient`；`contracts` 以 `@cloudcad/db` 为（仅类型）依赖。
   - `impl-mx` 通过 `IDatabaseService` 获得全量真实类型，不再需要 `@prisma/client` peerDependency。
6. **版本门槛**：`@prisma/client` peer 要求 `typescript >= 5.4`，backend 的 TS 已从 `~5.0` 升到 `~5.9`（对齐根目录）。

**Guidance**

1. **schema 变更流程**：改 `packages/db/prisma/schema.prisma` → `pnpm --filter backend prisma migrate dev --name <描述>`（migration 写入 backend）→ 提交 `migrations/`。`prisma generate` 通过 `pnpm --filter @cloudcad/db db:generate` 或 backend 侧 `pnpm prisma generate` 触发。
2. **生成 client 重建**：改 schema 后必须重新 `prisma generate` 并重建 `@cloudcad/db`（`pnpm --filter @cloudcad/db build`），否则 backend/impl-mx 引用的是旧类型。
3. **Prisma 7 CLI 不再自动加载 `.env`**：`prisma.config.ts` 显式 `import 'dotenv/config'`；DATABASE_URL 归属运行命令所在包的 `.env`。
4. **已知机器差异**：本仓库离线打包把 `node_modules/.bin/node` 包装为指向 `runtime/windows/node` 的 shim（Windows 下相对路径计算有误）。在此类环境里 `pnpm run` 直调 `node` 的脚本可能失败；prisma/tsc 可用 `node <绝对路径>/node_modules/prisma/build/index.js` 或 backend 侧 pnpm 脚本绕行。该问题独立于本 ADR，修复应落在离线包装脚本本身。
5. **不引入实例单例**：官方示例在 db 包导出 globalThis 单例，本项目不需要——backend `DatabaseService` 需要自定义 adapter/日志参数，实例生命周期归 NestJS DI。

**Status**: accepted

**Cross-references**
- ADR-0019 分包架构、ADR-0021 contracts/impl 分界：本 ADR 落实「数据层类型单一来源」
- ADR-0026 扩展机制总纲：类型获取规则的数据库侧落地
- issue #172 [research] Prisma 7 monorepo 共享 client 最佳实践（调研依据）
- `packages/db/CONTEXT.md`：包内约定
- `prisma-database` skill：schema 变更/migration 规范
