# AGENTS.md — CloudCAD monorepo

所有 agent 必须阅读此文件。

## 快速索引

| 文件 | 内容 |
|------|------|
| `CLAUDE.md` | 关键陷阱、常用命令、架构决策、后端/前端约定 |
| `CONTEXT.md` | 领域术语、图纸归属、上传协议、保存流程、编码约束、反模式清单 |
| `.agents/skills/` | 主技能（project / frontend / backend coding-standards） |
| `LEAN-CTX.md` | lean-ctx MCP tools 使用规则 |

---

## 总览

**pnpm monorepo** (`pnpm@9.15.9`, `node >=20.19.5`)。5 个包：

| 包 | 技术栈 | 端口 | 入口 |
|---|--------|------|------|
| `packages/frontend` | React 19 + Vite + Tailwind v4 + Zustand + Radix UI | 5173 | `src/main.tsx` |
| `packages/backend` | NestJS 11 + Express 5 + Prisma 7 + PostgreSQL + Redis | 3001 | `src/main.ts` |
| `packages/frontend_mobile` | Vue 3 + Vite + vant | — | `src/main.ts` |
| `packages/config-service` | NestJS (配置中心) | 3002 | `src/main.ts` |
| `packages/svnVersionTool` | SVN CLI wrapper | — | `src/main.ts` |

---

## 关键命令

```bash
# 根目录
pnpm dev                    # 并行启动所有 dev server
pnpm build                  # 构建所有包
pnpm check                  # lint → format:check → type-check
pnpm type-check             # pnpm -r type-check

# 前端 (packages/frontend)
pnpm test                   # vitest run
pnpm type-check             # tsc --noEmit
pnpm generate:sdk           # 从 Swagger JSON 生成 API SDK (@hey-api/openapi-ts)
                            # → src/api-sdk/{sdk.gen.ts,types.gen.ts} (勿手动编辑)

# 后端 (packages/backend)
pnpm test                   # jest (30s timeout)
pnpm test:unit              # 跳过 integration
pnpm test:integration       # 仅 integration
pnpm test:ci                # coverage + CI mode
pnpm type-check             # tsc --noEmit --project tsconfig.build.json
pnpm build                  # nest build (SWC) + generate:swagger
pnpm verify                 # check:fix → test → build
pnpm prisma generate        # 生成 Prisma Client
pnpm prisma migrate dev     # 创建新 migration (禁止仅用 db push)
pnpm prisma db push         # 仅开发环境快速同步
pnpm db:seed                # 种子数据
pnpm generate:swagger       # 生成 swagger-spec.json (build 内自动执行)

# 移动端 (packages/frontend_mobile)
pnpm dev                    # vite
pnpm build                  # i18n compile → vite build
```

---

## 关键陷阱

### NestJS DI (后端)
**永远不要对 DI 注入的类使用 `import type`** — 装饰器元数据会被 strip。Biome 的 `organizeImports` 可能自动做此事，运行后需要手工复查。详见 `packages/backend/CLAUDE.md`。

### 双格式化系统
- **根 / frontend / frontend_mobile**: Prettier（`singleQuote`, `trailingComma: es5`, `printWidth: 80`）
- **backend 代码**: Biome（单引号、2-space、LF、`src/**/*.ts` 和 `test/**/*.ts` 范围）
- 后端运行 `pnpm check` 时同时启用 ESLint 和 Biome，配置文件在 `packages/backend/biome.json`

### 后端 TypeScript 配置（故意宽松）
`strictNullChecks: false`, `noImplicitAny: false`, `noImplicitReturns: false`。类型安全通过 lint 规则而非编译器保证。

### CAD 引擎是黑盒
`mxcad-app` npm 包内部自建 Vue 3 + Vuetify 应用，React 通过 `mxcadManager.ts`（单例）通信。`CADEditorDirect.tsx` 作为全局叠加层在 `<Routes>` 之外渲染，通过 `visibility` + `z-index` 跨路由保持 WebGL 上下文。

### API SDK 自动生成
修改后端 API 后运行 `pnpm generate:api-types`（= `pnpm --filter frontend generate:sdk`），会从 Swagger spec 重新生成 `packages/frontend/src/api-sdk/`。手动编辑生成的 `.gen.ts` 文件会被覆盖。

### Prisma v7 类型
更新 Prisma schema 后，生成的新类型可能是 `ModelNameOmit` 而非 `ModelName`。始终运行 `pnpm type-check` 确认。

### 前端 CSS 约束
- z-index: 必须使用 `Z_LAYERS` 常量（`@/constants/layers`），禁止裸数字
- 颜色: 使用 `--color-*` / `--bg-*` / `--text-*` CSS 变量，禁止硬编码色值
- 字体: 使用 `--font-family-base` / `--font-family-mono` CSS 变量

### 移动端 (frontend_mobile)
- Vue 3 + Vite 4 + TypeScript 4.9
- 使用 `voerkai18n` 做国际化，构建时会自动编译 i18n
- 构建命令: `pnpm build`（含 i18n 编译步骤）
- 使用 vant 组件库

---

## 数据库迁移规程

1. 修改 `packages/backend/prisma/schema.prisma` 后必须运行 `pnpm prisma migrate dev --name <描述>`
2. 将生成的 `migrations/` 目录提交到 Git
3. 生产部署自动执行 `prisma migrate deploy`
4. 破坏性变更：先加新字段，同步数据，再删旧字段（分版本发布）

---

## 测试

```bash
# 后端
pnpm test                           # 所有 jest 测试
pnpm test -- --testPathPattern="auth"
pnpm test:permission                # 权限专门测试
pnpm test:permission:scenarios

# 前端
pnpm test                           # vitest run
pnpm test:e2e                       # Playwright
pnpm test:e2e:headed                # Playwright 有头模式
```

后端覆盖阈值（per-file）：P0 80%（auth/permission service），P1 70%（file-system/role-inheritance 等）。Jest config: `clearMocks`, `restoreMocks`, `resetMocks` 全 true。

---

## 可用 Skills

| 技能 | 触发条件 |
|------|----------|
| **project-coding-standards** | 任何代码生成/新建/重构/提交前检查 |
| **frontend-coding-standards** | React 组件、样式、API 调用、`packages/frontend` 代码 |
| **backend-coding-standards** | NestJS service/controller、Prisma、权限、`packages/backend` 代码 |
| **config-management** | 环境变量、运行时配置、`process.env` |
| **permission-system** | 权限检查、角色管理、Guard/装饰器 |
| **api-contracts** | DTO 变更、类型不匹配、Swagger |
| **nestjs-circular-dependency** | 循环依赖、`forwardRef` |
| **prisma-database** | schema.prisma 变更、迁移 |
| **diagnose** | 调试 bug、性能回归 |

---

<!-- lean-ctx -->
## lean-ctx

Prefer lean-ctx MCP tools (`ctx_read`, `ctx_shell`, `ctx_search`, `ctx_tree`, `ctx_edit`) over native equivalents. 10 read modes, 95+ shell compression patterns. Full rules: `LEAN-CTX.md`.
<!-- /lean-ctx -->
