# Prisma 7 monorepo 共享 client 最佳实践调研

> 对应 ticket: [#172](https://github.com/mxcad/cloudcad/issues/172)（[research] Prisma 7 monorepo 共享 client 最佳实践），属于 #171，是建 @cloudcad/db 包（#176）的前置调研。
>
> 调研日期：2026-07-31
>
> 当前项目基线（调研时确认）：
> - `prisma` / `@prisma/client` / `@prisma/adapter-pg` 均为 **7.8.0**，query compiler 已启用（`prisma --version` 输出 "Query Compiler: enabled"）
> - schema 位于 `packages/backend/prisma/schema.prisma`，使用旧 generator：`provider = "prisma-client-js"` + `engineType = "library"` + `binaryTargets` + `previewFeatures = ["postgresqlExtensions"]`
> - `packages/backend/prisma.config.ts` 已存在，`datasource.url` 用 `process.env.DATABASE_URL`（非 `env()` helper，因此缺变量不抛错）
> - backend TypeScript `~5.0.0`；根目录 TypeScript `~5.9.3`
> - 现有共享包模式：`@cloudcad/contracts` 采用 **编译产物模式**（`main/types` 指向 `dist/`，build = `tsc`）
> - `@cloudcad/impl-mx` 目前把 `@prisma/client` 作为 peerDependency 使用类型

---

## 结论摘要

1. **官方推荐 monorepo 模式就是「独立 db 包 + 共享 Prisma Client」**：Prisma 官方文档提供 pnpm-workspaces、Turborepo、Bun workspaces 三份 monorepo 指南，结构一致——schema.prisma 放进 `packages/db`，`prisma-client` generator 的 `output` 指向包内自定义目录，`client.ts` + `index.ts` 把实例和全部生成类型 re-export，消费方 `import { prisma, type User } from "@cloudcad/db"`。来源：[pnpm-workspaces 指南](https://www.prisma.io/docs/guides/deployment/pnpm-workspaces)、[Turborepo 指南](https://www.prisma.io/docs/guides/deployment/turborepo)、[Bun workspaces 指南](https://www.prisma.io/docs/guides/deployment/bun-workspaces)。
2. **Prisma 7 下 `prisma-client` generator 的 `output` 是必填项**，client 不再默认生成进 `node_modules`。生成代码是「纯 TypeScript」，放在 schema 指定的目录（路径相对 schema.prisma 文件位置解析）。来源：[Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[Generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)、[Generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)。
3. **Prisma 7 已移除 `engineType = "library"/"binary"` 与 `binaryTargets`**（LibraryEngine/BinaryEngine 删除），Rust-free query compiler 为默认；这两个字段只属于被废弃的 `prisma-client-js`。当前 schema 里 `engineType = "library"`、`binaryTargets`、`previewFeatures = ["postgresqlExtensions"]` 迁包时都应移除（`extensions` 已是 datasource 普通字段，不再需要 preview flag）。来源：[Prisma ORM v7.0.0 release notes](https://www.prisma.io/changelog/2025-11-19)、[Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)、[Preview features 列表](https://www.prisma.io/docs/orm/reference/preview-features/client-preview-features)。
4. **datasource 的连接信息（`url`/`directUrl`/`shadowDatabaseUrl`）已从 schema 迁出**，统一放到 `prisma.config.ts` 的 `datasource.url`。schema 里只剩 `provider`/`extensions`/`relationMode`/`schemas`。Prisma CLI 的所有数据库连接（migrate、db push、studio）都走 config。来源：[Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[Data sources](https://www.prisma.io/docs/orm/prisma-schema/overview/data-sources)、[Prisma Config API](https://www.prisma.io/docs/orm/reference/prisma-config-reference)。
5. **migration 留在 backend 可行且是 Prisma 7 一等公民场景**：`prisma.config.ts` 里 `schema` 与 `migrations.path` 是两个独立路径，且都**相对 config 文件位置解析**。backend 保留 `prisma.config.ts`，`schema: "../db/prisma/schema.prisma"` + `migrations.path: "prisma/migrations"`，`pnpm prisma migrate dev/deploy` 照常在 backend 跑、migration 历史不挪窝。`prisma generate` 的 output 相对 schema 解析，所以从 backend 或 db 包跑 generate 都会生成到 db 包内。来源：[Prisma Config API — path resolution / migrations.path](https://www.prisma.io/docs/orm/reference/prisma-config-reference)。
6. **Prisma 7 CLI 不再自动加载 `.env`，也不再自动跑 generate/seed**：`prisma.config.ts` 需显式 `import 'dotenv/config'`；`migrate dev`/`db push` 不再自动 `prisma generate`，seed 需显式 `prisma db seed`。DATABASE_URL 的归属 = 运行命令所在包自身的 `.env`（dotenv 按 CWD 解析）。来源：[Upgrade to v7 — environment variables / seeding](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[Prisma Config API — loading env vars](https://www.prisma.io/docs/orm/reference/prisma-config-reference)。
7. **驱动适配器在 Prisma 7 是强制项**：`new PrismaClient()` 必须传 adapter（本项目已用 `@prisma/adapter-pg`），`datasources`/`datasourceUrl` 构造参数已删除。db 包运行时依赖 = `@prisma/client`（提供 runtime / query-compiler WASM 子路径）+ `@prisma/adapter-pg` + `pg`。来源：[Upgrade to v7 — driver adapters](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[prisma-examples aws-lambda-sst-esbuild](https://github.com/prisma/prisma-examples/tree/latest/generator-prisma-client/aws-lambda-sst-esbuild)、本机 `@prisma/client@7.8.0` 的 `exports`（`./runtime/client`、`./runtime/wasm-compiler-edge`）。
8. **环境门槛：Node >= 20.19.0、TypeScript >= 5.4.0**（`@prisma/client` peerDependencies 也声明 `typescript >= 5.4.0`）。本项目 backend 锁的是 `typescript: ~5.0.0`，**低于 Prisma 7 最低要求，建 @cloudcad/db 时 backend 的 TS 必须升级**（建议对齐根目录 5.9）。来源：[Upgrade to v7 — prerequisites](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、本机 `@prisma/client@7.8.0` package.json peerDependencies。

---

## schema 单一源组织

### 官方 pnpm-workspaces 模式（与我们的目标最贴近）

Prisma 官方 [pnpm workspaces 指南](https://www.prisma.io/docs/guides/deployment/pnpm-workspaces) 给出的共享 db 包结构：

```
packages/database/
├── prisma/
│   ├── schema.prisma          # 单一源
│   └── migrations/            # 官方把 migration 也放在 db 包
├── generated/client/          # prisma generate 输出（gitignore）
├── client.ts                  # PrismaClient 实例（带 adapter + globalThis 单例）
├── index.ts                   # export { prisma }; export * from "./generated/client";
├── prisma.config.ts           # schema / migrations / datasource 配置
└── package.json
```

schema.prisma（官方示例）:

```prisma
generator client {
  provider = "prisma-client"
  output = "../generated/client"   // 相对 schema.prisma 所在目录
}

datasource db {
  provider = "postgresql"
}
```

`output` 路径按「相对 schema.prisma 文件位置」解析（即 `packages/db/prisma/schema.prisma` → `packages/db/generated/client`）。来源：[Generators — getting started](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)、[pnpm workspaces 指南 §2.2](https://www.prisma.io/docs/guides/deployment/pnpm-workspaces)。

### 目录与 output 配置建议

- `output` 可指向 `../generated/client`（官方 pnpm 指南）或 `../src/generated/prisma`（官方 Turborepo 指南、esbuild 示例），两者都是社区/官方认可的「生成进包内源码区」做法。
- **推荐把 generated 目录加入 `.gitignore`**，靠 build/postinstall 重新生成（Turborepo 指南明确建议）。来源：[Turborepo 指南 §2.2](https://www.prisma.io/docs/guides/deployment/turborepo)。
- 生成产物的结构（`prisma-client` generator 拆分文件）：`client.ts`（服务端全量）、`browser.ts`（前端类型，无 PrismaClient）、`enums.ts`、`models.ts`、`models/<ModelName>.ts`。来源：[Generators — importing types](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)。

### 与官方模式的差异点（按 ticket 需求）

官方指南把 migration 也放 db 包。本项目要求 **migration 留在 backend**，这需要 deviation，详见下文「migration 接线」。

---

## generated client 消费方式

### 官方推荐的导出设计

db 包内 `client.ts`（官方 pnpm 指南，含 globalThis 单例）：

```ts
import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

`index.ts`：

```ts
export { prisma } from "./client";
export * from "./generated/client";
```

来源：[pnpm workspaces 指南 §2.2 client.ts / index.ts](https://www.prisma.io/docs/guides/deployment/pnpm-workspaces)。

### backend 与 impl-mx 的 import 方式

- **backend**：`import { prisma, Prisma, type User, Permission } from "@cloudcad/db"`。运行时用共享的 `prisma` 实例，或仿照现有 `DatabaseService extends PrismaClient` 的做法在 NestJS DI 中注入（设计决策属 #176）。
- **impl-mx**：当前仅把 `@prisma/client` 当类型来源（peerDependency），迁移后改为 `import type { User, Prisma } from "@cloudcad/db"`。type-only import 编译期擦除，不触发运行时连接，也不需要 adapter。
- **类型子路径**（更细粒度）：`@cloudcad/db` 可在 package.json exports 里额外暴露 `./enums`、`./models`、`./browser`，分别对应生成的 `enums.ts`/`models.ts`/`browser.ts`，便于 tree-shaking 与前端/纯类型场景。来源：[Generators — importing types](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)。

### 包消费方式：JIT vs 编译产物（重点）

官方文档默认 **Just-in-Time packaging**（exports 直接指向 `.ts` 源码，如 `".": "./src/index.ts"`），并要求消费方有 bundler。Turborepo 指南明确警告：**无 bundler 时改用 Compiled Packages 策略**。来源：[Turborepo 指南 §2.4](https://www.prisma.io/docs/guides/deployment/turborepo)、[Turborepo 内部包文档](https://turborepo.dev/docs/core-concepts/internal-packages)。

- 本项目已有先例：`@cloudcad/contracts` 是**编译产物模式**（`tsc` → `dist`，exports 指 `dist/index.js` + `dist/index.d.ts`）。**@cloudcad/db 应沿用该模式**：`pnpm db:generate && tsc` → `dist/`，backend 无需 bundler 即可 `node dist/main` 运行。
- 注意：编译产物模式下，`@prisma/client`（含 `./runtime/*`、`./runtime/wasm-compiler-edge` 等子路径）必须列为 db 包的**运行时 dependency**，pnpm 会把它 link 进 db 包的 node_modules，db 包 dist 里的 `require('@prisma/client/runtime/...')` 在运行时由其自身 node_modules 解析，backend 侧无需重复安装。

### 与 backend 构建链的兼容性（关键坑）

- backend `tsconfig.json`：`module: commonjs` + `moduleResolution: node`。生成 client 的 `moduleFormat` 默认「从环境推断」——若 db 包 package.json 设了 `"type": "module"`，会推断成 ESM，生成代码内部 import 带 `.js` 后缀，在 `moduleResolution: node` 下无法解析 `.js → .ts`。
- **两个稳妥选项**：(a) db 包不设 `"type": "module"` 并显式 `moduleFormat = "cjs"`（匹配 backend 的 CJS 构建/运行）；(b) 若用 tsx/SWC 跑 TS，设 `importFileExtension = "ts"`（官方文档针对 tsx 的 `Cannot find module './internal/class.js'` 问题给出的解法）。来源：[Generators — field reference / tsx 注意事项](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)。
- backend TypeScript 必须从 `~5.0.0` 升到 `>= 5.4.0`（见结论 8）。

---

## migration 接线

### 路径解析规则（决定接线方式）

- `prisma.config.ts` 中 `schema`、`migrations.path` 等**一律相对 config 文件所在位置解析**。
- CLI 发现 config 的规则：prisma 安装在子包时，从该包目录运行命令即可找到。来源：[Prisma Config API — path resolution / monorepos](https://www.prisma.io/docs/orm/reference/prisma-config-reference)。
- 多文件 schema 才要求 migrations 与定义 datasource 的 `.prisma` 同目录；**单文件 schema + 显式 `migrations.path` 时，migrations 可以与 schema 分处不同包**。来源：[Prisma Config API — multi-file schemas](https://www.prisma.io/docs/orm/reference/prisma-config-reference)、[Schema location](https://www.prisma.io/docs/orm/prisma-schema/overview/location)。

### 接线方案（migration 留 backend）

```
packages/
├── db/
│   ├── prisma/schema.prisma          # 单一源（generator + datasource + models）
│   ├── prisma.config.ts              # 供 prisma generate 用
│   └── generated/ 或 src/generated/  # client 输出（gitignore）
└── backend/
    ├── prisma.config.ts              # schema 指向 ../db/prisma/schema.prisma
    ├── prisma/migrations/            # 历史 + 新增 migration 不动窝
    └── prisma/seed.ts                # import 源改为 @cloudcad/db
```

**backend/prisma.config.ts**（改造现有文件，只改 schema 路径）：

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../db/prisma/schema.prisma',   // 相对 backend 包根
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',          // 现有配置保留
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cloudcad',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cloudcad_shadow',
  },
});
```

**db/prisma.config.ts**（供 generate/validate 用，migrations 可省略或指向 backend）：

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL || '' },
});
```

**命令归属**：
- `prisma migrate dev/deploy` → backend（`pnpm --filter backend prisma migrate dev --name xxx`），读 backend config → schema 从 db 包读、migration 写到 backend/prisma/migrations。来源：[Prisma CLI reference](https://www.prisma.io/docs/orm/reference/prisma-cli-reference)、[Prisma Config API](https://www.prisma.io/docs/orm/reference/prisma-config-reference)。
- `prisma generate` → 建议放 db 包（`pnpm --filter @cloudcad/db db:generate`），output 相对 schema 解析，落到 db 包内；从 backend 跑同样生效（output 与 config 无关，只随 schema 文件位置）。

### DATABASE_URL 归属

- Prisma 7 中 `DATABASE_URL` 只在 `prisma.config.ts` 的 `datasource.url` 里被读取（schema 里已无 `url = env(...)`）。来源：[Upgrade to v7 — schema changes](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)。
- dotenv 按 **CWD** 找 `.env`：从 backend 跑 migrate → 读 `packages/backend/.env`；从 db 包跑 generate → 读 `packages/db/.env`。两个包各自维护（或根目录/`dotenvx` 共享，见 [dotenvx monorepo 文档](https://dotenvx.com/docs/monorepos/turborepo)）。
- `env()` helper 在变量缺失时**抛错且连 `prisma generate` 都会失败**；若环境变量可能缺失（如 CI 只跑 generate），用 `process.env.DATABASE_URL` 直取（backend 现有 config 已是此写法，符合官方推荐）。来源：[Prisma Config API — handling optional env vars](https://www.prisma.io/docs/orm/reference/prisma-config-reference)。

---

## Prisma 7 新坑清单

| # | 坑 | 说明 | 来源 |
|---|---|---|---|
| 1 | `prisma-client-js` 已废弃 | 未来版本会移除；新项目用 `prisma-client`（Rust-free，更快更小） | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[Generators](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) |
| 2 | `output` 必填 | `prisma-client` generator 必须显式 output，不再默认生成进 `node_modules` | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[Generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client) |
| 3 | `engineType`/`binaryTargets` 已移除 | `engineType = "library"/"binary"` 与 `binaryTargets` 只属于 `prisma-client-js`；v7 删除 Library/Binary/DataProxy 引擎，query compiler 为默认（WASM）。`prisma-client` generator 无这些字段，取而代之的是 `compilerBuild: "fast"\|"small"` | [v7.0.0 release notes](https://www.prisma.io/changelog/2025-11-19)、[Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)、[v7.3.0 changelog](https://www.prisma.io/changelog) |
| 4 | schema 里删 url | `datasource.url`/`directUrl`/`shadowDatabaseUrl` 迁到 `prisma.config.ts`；schema 只剩 provider/extensions/schemas/relationMode | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference) |
| 5 | 驱动适配器强制 | `new PrismaClient({ adapter })` 必传；`datasources`/`datasourceUrl` 选项删除；SSL 默认校验改严（node-pg），连不上时可能报 P1010 | [Upgrade to v7 — driver adapters / SSL](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[GitHub issue #28795](https://github.com/prisma/prisma/issues/28795) |
| 6 | env 不再自动加载 | CLI 需要 `prisma.config.ts` 里 `import 'dotenv/config'`；一堆 `PRISMA_*` 环境变量被删 | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[v7.0.0 release notes](https://www.prisma.io/changelog/2025-11-19) |
| 7 | migrate 不再自动 generate/seed | `--skip-generate`/`--skip-seed` 删除；migrate dev/db push 后需手动 `prisma generate`；seed 需显式 `prisma db seed` | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) |
| 8 | 中间件 `$use` 删除 | 用 Client Extensions 替代 | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) |
| 9 | ESM 优先 | 建议 `"type": "module"`；backend 是 CJS 时注意 `moduleFormat`（见上文） | [Upgrade to v7 — ESM support](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) |
| 10 | 版本门槛 | Node >= 20.19.0，TypeScript >= 5.4.0（backend 现为 5.0，必须升） | [Upgrade to v7 — prerequisites](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、本机 `@prisma/client@7.8.0` peerDependencies |
| 11 | `postgresqlExtensions` preview flag | v7 里 `extensions` 已是 datasource 普通字段，preview 列表已无此项；当前 schema 的 `previewFeatures = ["postgresqlExtensions"]` 应移除（保留是否报错需建包时用 `prisma validate` 实测） | [Prisma Schema Reference — datasource](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)、[Preview features](https://www.prisma.io/docs/orm/reference/preview-features/client-preview-features) |
| 12 | 其他 CLI 变化 | package.json `prisma` 字段删除；introspection 需 config；`db execute` 删 `--schema/--url`；`migrate diff` 用 `--from-config-datasource`/`--to-config-datasource`；`prisma generate --no-engine` 等 flag 删除 | [Upgrade to v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[v7.0.0 release notes](https://www.prisma.io/changelog/2025-11-19) |
| 13 | 生成物 gitignore | generated 目录是 build artifact，官方建议 gitignore + 构建时重新生成 | [Turborepo 指南 §2.2](https://www.prisma.io/docs/guides/deployment/turborepo) |
| 14 | 类型引用自 @prisma/client | 生成 client 的 `client.ts` 传递依赖 Node/server 侧包（`@prisma/client/runtime/...`），纯类型场景优先从 `browser.ts`/`enums.ts`/`models.ts` 引入；impl-mx 用 `import type` 无运行时副作用 | [Generators — importing types](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) |

---

## 来源列表

官方文档（primary sources）：
- [Upgrade to Prisma ORM v7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)（破坏性变更总览：output 必填、driver adapters、env 加载、prisma.config.ts、seed/generate 行为、版本门槛）
- [Prisma ORM v7.0.0 release notes](https://www.prisma.io/changelog/2025-11-19)（Rust-free client 默认化、移除 engines、config 化）
- [Prisma Changelog](https://www.prisma.io/changelog.md)（7.0.0–7.8.0 变更核对）
- [pnpm workspaces monorepo 指南](https://www.prisma.io/docs/guides/deployment/pnpm-workspaces)（官方共享 db 包模式）
- [Turborepo monorepo 指南](https://www.prisma.io/docs/guides/deployment/turborepo)（JIT vs 编译产物、gitignore、任务编排）
- [Bun workspaces 指南](https://www.prisma.io/docs/guides/deployment/bun-workspaces)
- [Generators（prisma-client / prisma-client-js）](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)（字段表、import 类型、tsx 注意事项）
- [Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)（datasource/generator 字段权威表）
- [Prisma Config API](https://www.prisma.io/docs/orm/reference/prisma-config-reference)（schema/migrations.path/datasource.url、path resolution、env() 行为）
- [Generating Prisma Client](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client)
- [Data sources](https://www.prisma.io/docs/orm/prisma-schema/overview/data-sources)
- [Schema location](https://www.prisma.io/docs/orm/prisma-schema/overview/location)（单文件 vs 多文件、migrations 同目录约束仅限多文件）
- [Preview features（Client & Schema）](https://www.prisma.io/docs/orm/reference/preview-features/client-preview-features)
- [PostgreSQL extensions](https://www.prisma.io/docs/orm/prisma-schema/postgresql-extensions)
- [Prisma CLI reference](https://www.prisma.io/docs/orm/reference/prisma-cli-reference)

官方示例仓库（GitHub）：
- [prisma/prisma-examples — generator-prisma-client/nextjs-starter-webpack-monorepo](https://github.com/prisma/prisma-examples/tree/latest/generator-prisma-client/nextjs-starter-webpack-monorepo)（pnpm 共享 db 包示例）
- [prisma/prisma-examples — generator-prisma-client/nextjs-starter-webpack-turborepo](https://github.com/prisma/prisma-examples/tree/latest/generator-prisma-client/nextjs-starter-webpack-turborepo)
- [prisma/prisma-examples — generator-prisma-client/aws-lambda-sst-esbuild](https://github.com/prisma/prisma-examples/tree/latest/generator-prisma-client/aws-lambda-sst-esbuild)（最小依赖集：`@prisma/client` + `@prisma/adapter-pg` + `pg`，`moduleFormat = "esm"`，db.ts 工厂模式）

社区/其他：
- [Turborepo 内部包文档（JIT vs Compiled）](https://turborepo.dev/docs/core-concepts/internal-packages)
- [dotenvx Turborepo monorepo 环境变量指南](https://dotenvx.com/docs/monorepos/turborepo)
- [GitHub issue #28795（v7 SSL 校验变化）](https://github.com/prisma/prisma/issues/28795)

本地核实：
- 本机 `node_modules/.pnpm/@prisma+client@7.8.0_*/node_modules/@prisma/client/package.json`（`./runtime/client`、`./runtime/wasm-compiler-edge` exports；peerDependencies `typescript >= 5.4.0`）
- `packages/backend/prisma.config.ts`、`packages/backend/tsconfig.json`、`packages/backend/package.json`（TS 5.0）、`packages/contracts/package.json`（编译产物模式先例）、`packages/impl-mx/package.json`（`@prisma/client` peerDep）
