# AGENTS.md — CloudCAD monorepo

所有 agent 必须阅读此文件。

## 快速索引

| 文件 | 内容 |
|------|------|
| `CLAUDE.md` | 架构决策、关键陷阱、后端/前端约定 |
| `CONTEXT.md` | 领域术语、图纸归属、编码约束、反模式清单 |
| `packages/backend/CLAUDE.md` | NestJS DI 细节、Prisma v7、Express v5、Façade 模式 |
| `packages/frontend/AGENTS.md` | i18n (VoerkaI18n) 子库模式、library 约束 |
| `LEAN-CTX.md` | lean-ctx MCP tools 使用规则 |

---

## 总览

**pnpm monorepo** (`pnpm@9.15.9`, `node >=20.19.5`)。5 个包：

| 包 | 技术栈 | 端口 | 入口 |
|---|--------|------|------|
| `packages/frontend` | React 19 + Vite + Tailwind v4 + Zustand + Radix UI | 3000 | `src/main.tsx` |
| `packages/backend` | NestJS 11 + Express 5 + Prisma 7 + PostgreSQL + Redis | 3001 | `src/main.ts` |
| `packages/frontend_mobile` | Vue 3 + Vite 4 + vant + VoerkaI18n | — | `src/main.ts` |
| `packages/config-service` | **纯 Node.js HTTP** (0 依赖, 非 NestJS) | 3002 | `server.js` |
| `packages/svnVersionTool` | **CommonJS** SVN CLI 包装器 (无 build 步骤) | — | `svncmd.js` |

---

## 关键命令

```bash
# 根目录
pnpm dev                    # 并行启动所有 dev server
pnpm build                  # 构建所有包
pnpm check                  # lint → format:check → type-check
pnpm type-check             # pnpm -r type-check
pnpm generate:api-types     # 为 frontend + frontend_mobile 生成 API SDK

# 前端 (packages/frontend)
pnpm test                   # vitest run
pnpm type-check             # tsc --noEmit
pnpm generate:sdk           # 从 Swagger JSON 生成 API SDK (@hey-api/openapi-ts)
                            # → src/api-sdk/{sdk.gen.ts,types.gen.ts} (勿手动编辑)

# 后端 (packages/backend)
pnpm test                   # jest (30s timeout, clearMocks+restoreMocks+resetMocks)
pnpm test:unit              # 跳过 integration
pnpm test:integration       # 仅 integration (独立 jest config)
pnpm test:ci                # coverage + CI mode
pnpm test:permission        # 权限专门测试
pnpm test:permission:scenarios
pnpm type-check             # tsc --noEmit --project tsconfig.build.json
pnpm build                  # nest build (SWC) + generate:swagger
pnpm verify                 # check:fix → test → build
pnpm prisma generate        # 生成 Prisma Client
pnpm prisma migrate dev     # 创建新 migration (禁止仅用 db push)
pnpm prisma db push         # 仅开发环境快速同步
pnpm db:seed                # 种子数据

# 移动端 (packages/frontend_mobile)
pnpm dev                    # vite
pnpm build                  # i18n compile → vite build
pnpm generate:sdk           # 手动运行: node scripts/generate-sdk.cjs
```

---

## 关键陷阱

### 通用规则

**禁止使用 `git restore`** — 它会清除所有工程上下文，导致已完成的修改丢失。如需撤销，应手动用 `edit` 工具还原或通过版本历史对照重新实现。

**API SDK 自动生成** — `pnpm generate:api-types` 同时为 frontend + frontend_mobile 生成 SDK。手动编辑 `.gen.ts` 文件会被覆盖。

**格式化/Lint**:
- 根 / frontend / frontend_mobile: Prettier（`singleQuote`, `trailingComma: es5`, `printWidth: 80`）
- 后端 scripts: ESLint + Prettier（`biome.json` 存在但不由脚本调用）
- 后端 `check` = `eslint .` → `prettier --check .` → `tsc --noEmit`

---

### 前端规则

**Zustand 单一数据源** — 所有跨组件共享的前端状态必须存入 Zustand store，**禁止使用模块级变量**（如 `let currentFileInfo`）存储业务状态。当模块变量与 store 数据重复时，必须将 store 作为唯一写入点，模块代码通过 `useCADEditorStore.getState()` 读写。

反例（已重构）:
```typescript
// mxcadManager/index.ts — 原模块级变量（已删除）
let currentFileInfo: CurrentFileInfo | null = null;
```
正例:
```typescript
// useCADEditorStore.ts — 唯一数据源
currentFileInfo: CurrentFileInfo | null;
setCurrentFileInfo(info) / patchCurrentFileInfo(partial)

// 非 React 代码中读写
const store = useCADEditorStore.getState();
store.setCurrentFileInfo({ ... });
store.patchCurrentFileInfo({ name: 'new.dwg' });
const fileInfo = store.currentFileInfo;
```

发现模块变量与 store 重复时，将模块变量迁移到 store 并删除重复的模块声明。

**CSS 约束**:
- `z-index`: 必须使用 `Z_LAYERS` 常量（`@/constants/layers`），禁止裸数字
- 颜色: 使用 `--color-*` / `--bg-*` / `--text-*` CSS 变量，禁止硬编码色值
- 字体: 使用 `--font-family-base` / `--font-family-mono` CSS 变量
- 新增 UI 前先检查 `src/components/ui/`（26 个全局组件可用）

**i18n: VoerkaI18n (子库模式)**:
- CloudCAD 是 mxcad-app 的 VoerkaI18n 子库（`library: true`），语言切换由 mxcad-app 驱动
- `@voerkai18n/vite` 插件必须在 `react()` 之前注册（vite.config.ts）
- **每次运行 `pnpm i18n:compile` 后，必须手动检查 `src/languages/index.ts` 中 `library: true` 是否被覆盖**（compile 会重置为 `false`）

**Zustand stores**（`src/stores/`）:
| Store | 用途 | 关键字段 |
|-------|------|----------|
| `useCADEditorStore` | CAD 编辑器全局状态 | `currentFileInfo`, `currentFileId`, `currentProjectId`, `isInCollaboration` |
| `useUIStore` | UI 全局状态 | `globalLoading`, `loadingMessage`, `sidebarOpen` |

**CAD 引擎是黑盒**:
`mxcad-app` npm 包内部自建 Vue 3 + Vuetify 应用，React 通过 `mxcadManager.ts`（单例）通信。`CADEditorDirect.tsx` 作为全局叠加层在 `<Routes>` 之外渲染，通过 `visibility` + `z-index` 跨路由保持 WebGL 上下文。

**协同 SDK (mxcad-app) 黑盒行为**:
`MxCpp.getCurrentMxCAD().getCooperate()` 提供的协同 API：
- `createWrok()` → 上传 mxweb → 创建 work session → **内部自动打开协同文件**。workid>0 成功；错误码 4 = 已存在
- `joinWork()` → 连接已有 session → **内部自动加载协同文件**
- `exitWrok()` → 断开连接 → 回退本地编辑（文件不关闭）
- `init()` 只需调用一次（通过 `cooperateInitRef` 守卫）
- 分享链接 + `collaborationEnabled=true` 时，`CADEditorDirect.tsx` 跳过 `doOpenMxFile`，由 `CollaborateSidebar` 的 auto-join 接管

**移动端 (frontend_mobile)**:
- Vue 3 + Vite 4 + TypeScript 4.9 + vant 组件库
- `voerkai18n` 国际化，同样有 `library` 配置文件需检查
- 使用 `postcss-pxtorem` + `lib-flexible` 做移动端适配
- 构建时自动编译 i18n → vite build

---

### 后端规则

**NestJS DI**: 永远不要对 DI 注入的类使用 `import type` — 装饰器元数据会被 strip。ESLint 的 `consistent-type-imports` 已禁用，但 `unused-imports` 插件仍可能触发自动删除。详见 `packages/backend/CLAUDE.md`。

**TypeScript（故意宽松）**: `strictNullChecks: false`, `noImplicitAny: false`, `noImplicitReturns: false`, `isolatedModules: false`。类型安全通过 lint 规则而非编译器保证。**注意 `package.json` 声明 `typescript: "~5.0.0"` 但 lockfile 解析到 5.9.3**，更严格的类型推断可能暴露 5.0 未发现的问题。

**Prisma v7**: 更新 schema 后生成的新类型可能是 `ModelNameOmit` 而非 `ModelName`。始终运行 `pnpm type-check` 确认。

---

## 数据库迁移规程

1. 修改 `packages/backend/prisma/schema.prisma` 后必须运行 `pnpm prisma migrate dev --name <描述>`
2. 将生成的 `migrations/` 目录提交到 Git
3. 生产部署自动执行 `prisma migrate deploy`
4. 破坏性变更：先加新字段，同步数据，再删旧字段（分版本发布）
5. 迁移历史修复步骤见底部

### 迁移历史修复（仅首次部署时执行）

**场景**：已有 migration 文件在 git 中被修改过，导致 `prisma migrate deploy` 因 checksum 不匹配而失败。

在生产数据库上执行一次 fix（只更新 `_prisma_migrations` 元数据表，不涉及 DDL）：

```bash
npx prisma migrate resolve --rolled-back 20260330025027_init
npx prisma migrate resolve --applied 20260330025027_init
npx prisma migrate resolve --rolled-back 20260330025133_baseline
npx prisma migrate resolve --applied 20260330025133_baseline
npx prisma migrate resolve --rolled-back 20260330030233_add_gallery_add_permission
npx prisma migrate resolve --applied 20260330030233_add_gallery_add_permission
npx prisma migrate resolve --rolled-back 20260407_add_user_phone_wechat_fields
npx prisma migrate resolve --applied 20260407_add_user_phone_wechat_fields
npx prisma migrate resolve --rolled-back 20260414100000_sync_enum_changes
npx prisma migrate resolve --applied 20260414100000_sync_enum_changes
npx prisma migrate deploy
```

---

## 测试

```bash
# 后端
pnpm test                           # 所有 jest 测试 (30s timeout, forceExit)
pnpm test -- --testPathPattern="auth"
pnpm test:unit                      # 跳过 integration
pnpm test:integration               # 独立 jest config (test/jest-integration.json)
pnpm test:permission                # --testPathPatterns=permission --testNamePattern="PermissionTestRunner"
pnpm test:permission:scenarios
pnpm test:cov                       # 带覆盖率
pnpm test:ci                        # CI 模式

# 前端
pnpm test                           # vitest run
pnpm test:e2e                       # Playwright
pnpm test:e2e:headed                # Playwright 有头模式
pnpm test:coverage                  # 覆盖率报告
```

后端覆盖阈值（per-file）：P0 80%（auth.service.ts, permission.service.ts），P1 70%（file-system, role-inheritance 等）。Jest: `clearMocks`, `restoreMocks`, `resetMocks` 全 true。

**注意**：CI workflow 中 frontend 不跑 vitest，只跑 `type-check`。后端 CI 需要 PostgreSQL + Redis 服务。

---

## 关键 Skills

Skills 在 `.agents/skills/`（27 个）和 `.opencode/skills/`（8 个）。重要技能及触发条件：

| 技能 | 触发条件 |
|------|----------|
| `project-coding-standards` | 任何代码生成/新建/重构/提交前检查 |
| `frontend-coding-standards` | React 组件、样式、API 调用 |
| `backend-coding-standards` | NestJS service/controller、Prisma、权限 |
| `config-management` | 环境变量、运行时配置、`process.env` |
| `permission-system` | 权限检查、角色管理、Guard/装饰器 |
| `api-contracts` | DTO 变更、类型不匹配、Swagger |
| `nestjs-circular-dependency` | 循环依赖、`forwardRef` |
| `prisma-database` | schema.prisma 变更、迁移 |
| `perfect-theme-system` | 主题、颜色、CSS 变量、深色/亮色模式 |
| `vercel-react-best-practices` | React 性能优化 |
| `diagnose` | 调试 bug、性能回归 |

---

<!-- lean-ctx -->
## lean-ctx

Prefer lean-ctx MCP tools (`ctx_read`, `ctx_shell`, `ctx_search`, `ctx_tree`, `ctx_edit`) over native equivalents. 10 read modes, 95+ shell compression patterns. Full rules: `LEAN-CTX.md`.
<!-- /lean-ctx -->
