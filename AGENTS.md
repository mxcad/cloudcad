# AGENTS.md — CloudCAD monorepo

所有 agent 必须阅读此文件。

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

**汇报语言：所有输出必须使用中文。**

## ⚠️ 铁律：三层一致性原则

任何变更必须同时评估以下三层，缺一不可：

```
前端 (packages/frontend)  ←→  API SDK (packages/api-sdk)  ←→  后端 (packages/backend)  ←→  数据库 (prisma schema + migration)
```

| 层 | 检查项 |
|---|---|
| **前端** | 是否有组件/hook/页面消费这个API？调用的 DTO/response 字段是否匹配？ |
| **API SDK** | DTO 变更后 `sdk.gen.ts` / `types.gen.ts` 是否自动更新？（dev/build 管道会自动触发 SDK 重生成，但需确认输出符合预期） |
| **后端** | Controller DTO / Service 逻辑 / Guard / Interceptor 是否全部对齐？ |
| **数据库** | Prisma schema 是否变更？是否生成 migration 而非 `db push`？存量数据是否需要迁移脚本？ |

**禁止**：修了下游（后端/DB）就关闭 issue，不确认上游（前端/SDK）是否需要联动修改。
**禁止**：仅看后端代码就下结论说"这个API没有调用者"——必须确认前端源码和 MSW mock handler。
**禁止**：修改 DTO 后不重新生成 API SDK，导致前端类型编译失败。
**禁止**：前端代码中使用 `fetch()` 调用后端 API。所有 API 调用必须走 `@/api-sdk` 生成的函数。multipart 场景传**普通对象**（`body: { file, hash, ... } as never`，SDK 的 `formDataBodySerializer` 会自动序列化；禁止传原生 `FormData`——`Object.entries(FormData)` 为空会导致字段全部丢失，参考头像上传修复 b1cd0d56）。（例外：.mxweb 文件流、缩略图图片链接等非 JSON 资源可接受直接 URL）。涉及 API 调用时，必须先加载 `api-contracts` Skill。

## ⚠️ 分支策略：main = 正式版本 / develop = 本地开发版本

- **`main`**：以后**所有 main 分支上的代码都是正式版本**——只允许功能完整、没有错误的代码合入。需要立即要一个完整可用的版本（打包、部署、交付）时，切到 `main` 打包。
- **`develop`**：**本地开发分支**——所有新功能开发、修复、进行中的实现都在这上面做。
- **基本 git 开发工作流**：实现到一半、马上需要一个功能完整没有错误的版本时 → `git switch main` 打包 → 打包完成后 `git switch develop` 切回继续开发。开发完成并验证通过后，把 `develop` 合入 `main` 作为新的正式版本。
- **不要随意切分支**：只允许「main↔develop 打包切换」这一种切分支场景。切换前必须：
  1. 确认工作区干净（`git status` 无未提交改动，有则先提交）；
  2. **确认没有其他 AI 会话在并发修改文件**（本工作区多会话共享，用 `git status` / `git log -1 -- <path>` 判断文件归属；有并发会话在改文件时先协调，勿直接切）。
- 除此之外，未经用户明确要求，禁止创建新分支、merge、cherry-pick、rebase 等任何分支操作。

## 快速索引

| 文件 | 内容 |
|------|------|
| `CLAUDE.md` | AI 行为准则与 ADR 索引 |
| `CONTEXT-MAP.md` | Bounded context 映射 |
| `CONTEXT.md` | 全局领域术语 |
| `packages/backend/CLAUDE.md` | 后端 NestJS 详细规范 |
| `packages/frontend/AGENTS.md` | 前端 i18n (VoerkaI18n) 配置 |
| `packages/config-service/AGENTS.md` | Config Center 说明 |
| `LEAN-CTX.md` | lean-ctx MCP 工具使用规则 |
| `docs/elastic-conversion-architecture.md` | 转换架构 + 容量规划（核数/内存/并发公式，调 `maxConcurrent` 前必读） |
| `docs/adr/0020-replaceable-vs-internal-service.md` | 扩展点 vs 内部服务 —— 何时用接口 + DI token，何时用 class-based DI |
| `docs/adr/0026-extension-mechanism-master.md` | 扩展机制总纲 —— 三类扩展判断 + 类型获取 + 契约先行 + AI 探针 |
| `docs/adr/0027-shared-prisma-client.md` | @cloudcad/db 共享 Prisma Client —— schema 单一源 + 数据层类型唯一出口 |
| `docs/adr/0056-deployment-runtime-packager-modularization.md` | 离线部署运行时与打包工具工程化 —— 双包架构（runtime-cli/packager）+ 两步迁移 + 前台真修复 + 入口双 facade（start=一键部署 / cloudcad=运维 CLI）+ 分层测试策略 |
| `docs/deployment-runtime-refactor-plan.md` | 部署运行时工程化重构的**可执行路线图**（痛点 P1-P9、契约 C1-C11、决策点、回归矩阵 V1-V8）——改 `runtime/scripts`、`scripts/pack-offline.js`、`start.sh`、`cloudcad.sh`、打包/启动相关代码前必读 |

## 包总览

**pnpm monorepo** (`pnpm@9.15.9`, `node >=20.19.5`)。

| 包 | 技术栈 | 端口 | 入口 |
|---|--------|------|------|
| `packages/frontend` | React 19 + Vite 6 + Tailwind v4 + Zustand + Radix UI | 3000 | `src/main.tsx` |
| `packages/backend` | NestJS 11 + Express 5 + Prisma 7 + PostgreSQL + Redis | 3001 | `src/main.ts` |
| `packages/frontend_mobile` | Vue 3 + Vite 4 + vant + VoerkaI18n | — | `src/main.ts` |
| `packages/config-service` | 纯 Node.js HTTP（0 外部依赖） | 3002 | `server.js` |
| `packages/storage-service` | 统一文件管理层（SVN 目录组分片、多节点路由） | 3200 | — |
| `packages/conversion-service` | 转换引擎托管运行时（嵌入式/自托管/云 FaaS） | 3100 | — |
| `packages/api-sdk` | @hey-api/openapi-ts 自动生成的 API 客户端 | — | `src/index.ts` |
| `packages/contracts` | 跨包 DI token + TypeScript 接口契约 | — | `src/index.ts` |
| `packages/db` | Prisma 7 共享 Client（schema 单一源 + generated client，数据层类型唯一出口） | — | `src/index.ts` |
| `packages/impl-mx` | 私有 MX 官方实现包（`IMPL` 环境变量动态加载） | — | — |
| `packages/mxVersionTool` | CommonJS MX CLI 包装器（无 build 步骤） | — | `mxcmd.js` |

## 关键命令

```bash
# 根目录
pnpm dev                    # 并行启动所有 dev server
pnpm build                  # 构建所有包
pnpm check                  # lint → format:check → type-check
pnpm generate:api-types     # 为 @cloudcad/api-sdk 生成 API SDK

# 前端 (packages/frontend)
pnpm test                   # vitest run
pnpm type-check             # tsc --noEmit

# 后端 (packages/backend)
pnpm test                   # 单元测试（默认语义，本地无 DB 可全绿）
pnpm test:unit              # 单元测试（与 pnpm test 同语义，显式别名）
pnpm test:integration       # 集成测试（需真实 PG+Redis，串行执行）
pnpm test:permission        # 权限测试
pnpm type-check             # tsc --noEmit
pnpm build                  # nest build (SWC) + generate:swagger
pnpm verify                 # check:fix → test → build
pnpm prisma migrate dev     # 创建 migration（禁止仅用 db push）
pnpm db:seed                # 种子数据

# 移动端 (packages/frontend_mobile)
pnpm build                  # i18n compile → vite build
```

## 关键陷阱与反模式

### 技术陷阱

| 陷阱 | 说明 | 参考 |
|------|------|------|
| 状态管理（前端） | Zustand store，**禁止模块级变量** | frontend-coding-standards |
| API SDK 自动生成 | 勿手动编辑 `.gen.ts`，**修后端 DTO** | api-contracts |
| Controller 参数声明 | 读取 `req.params`/`req.query` 必须显式声明 `@Param`/`@Query`（可选参数配 `@ApiQuery({required:false})`），否则 Swagger/SDK 生成 `never`、前端被迫手拼 URL/fetch。提交前跑 `pnpm scan:undeclared-params` | backend-coding-standards |
| NestJS DI | `import` 而非 `import type`，否则装饰器元数据丢失 | backend-coding-standards |
| 后端 TypeScript | `strictNullChecks` 增量开启中（ADR-0008）。新接口文件目录单独启用，旧模块分批治理 | backend-coding-standards |
| 后端模块依赖 | 三层依赖方向约束（ADR-0007）：Layer1 基础设施 ← Layer2 核心业务 ← Layer3 业务编排，箭头方向不可逆 | — |
| 模块健康 | 新建模块前三问（有无消费者/有无测试/是否值得独立，<5 文件并入相关模块）；无消费者代码删或标注；未激活模块必须 JSDoc 标注 + 登记 issue；迁移（expand-contract）必须排收尾票禁双轨 | backend-coding-standards, #228, #234 |
| 可替换模块设计 | 需要 OSS/Pro/TOB 不同实现的模块，统一使用接口 + DI token + @Optional() 模式。现有参考：IAuthProvider、IPermissionStore、IUserService、StorageProvider | replaceable-module |
| 类型获取 | 数据层类型从 `@cloudcad/db`（Prisma 模型/枚举/Prisma namespace，禁 `import from '@prisma/client'`）、业务类型从 `@cloudcad/contracts`、HTTP DTO 由 api-sdk 自动生成不手动定义；接口方法不得 `any` | ADR-0026/0027, backend-coding-standards |
| 后端格式化 | 全仓统一 Prettier（根目录 `.prettierrc`）；后端无 Biome | backend-coding-standards |
| Prisma v7 | schema 变更后类型可能变 `ModelNameOmit`；枚举不可直接 `@ApiProperty` | prisma-database |
| Express v5 | `session.destroy()`/`save()` 返回 `Promise<void>` | backend-coding-standards |
| CAD 引擎黑盒 | `mxcadManager` 单例，`CADEditorDirect` 全局叠加层保 WebGL | cad-engine-integration |
| 协同 SDK | `createWrok` 自动加入、`joinWork` 自动加载文件、`exitWork` 回退本地 | cad-engine-integration |
| 后端 i18n | 新增错误键必须写 4 个语言文件 | backend-coding-standards |
| 外部参照路径 | `filesDataPath/YYYYMM/nodeId/src_file_md5/fileName` | file-storage-paths |
| mxcad 转换子进程传参 | Windows 下 `spawn` 传含双引号的 JSON 参数**必须** `windowsVerbatimArguments: true`（`mxcad-exec.ts` 已设 `!isLinux`）：Node 默认把参数里的 `"` 转义成 `\"`，而 mxcadassembly 按原始命令行解析、不认转义 → 解析不到 `srcpath` 报 `read file error`（实例：aaf2626 把 exec 改 spawn 后回归）。**mxcadassembly 成功/失败退出码恒 2123，结果只认 JSON stdout 的 `code`，勿按退出码判成败** | — |
| conversion-service 参数两级命名 | backend↔conversion-service **HTTP 契约是 camelCase `ConversionOptions`**（`srcPath`/`fileHash`/`createPreloadingData`/`dwgVersion`），**不是** lowercase；lowercase `srcpath`/`src_file_md5`/`create_preloading_data` 是**低层 mxcadassembly 二进制接口**，由 conversion-service 内部 `MxcadRunner._buildParam` 桥接（camelCase→lowercase，唯一翻译点）。两个 backend 调用方（`file-conversion.service.ts` 转发分支 + `batch-download/conversion-runner.ts` 的 `WorkflowConvertTask`）都发 camelCase。**改任一层字段名须同步 backend spec + conversion-service runner 测试**（721fe02 曾因转发分支误发 lowercase 致 `replace` 崩溃） | ADR-0064 |
| CI | main/develop 分支；需要 PG15 + Redis7；前端 CI 只 type-check | — |
| runtime 依赖包复用 | node/pg/redis/svn 标准组件提取一次打**内容寻址** Release 资产（`cloudcad-runtime-deps-<os>-<arch>-<fingerprint>.tar.gz`），CI + dev preinstall 都**只下载不重提**；勿在 release.yml 里按发行版重新 `apt/dnf install`+提取（`runtime/cache/` 被 gitignore、runner 恒空）。打包 `scripts/pack-runtime-deps.js` + 独立 workflow `runtime-deps.yml`，发行版收敛 3 glibc 档（centos7/ubuntu22/rocky9） | ADR-0059 |
| 断网启动验证硬门禁 | 部署包产出后**先断网验证通过才上传** Release（`verify-linux-deploy.js`/`verify-windows-deploy.js`，`docker run --network none` + 全服务健康检查 pg/redis/backend/frontend/cooperate/config-service）；任一包失败→release 失败。勿跳过验证直接上传 | ADR-0059 |
| 下载源多源回退 | 所有 runtime 资产下载走 `scripts/lib/download-sources.js`（单一事实源）：多源有序回退（GitHub 主源→内置公开加速镜像→用户 `RUNTIME_DOWNLOAD_URLS`），超时+状态码双判；prisma engine 是 `@prisma/engines` npm 包（随 store 离线可用）不属 runtime 依赖包，勿单独预下载 | ADR-0059 |

### 反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 自己写一套 Modal/Table | 复用 `src/components/ui/` 已有组件 |
| 在组件文件中定义类型 | 提取到独立 types 文件 |
| 后端 Controller 写业务逻辑 | 逻辑放 Service，Controller 只做路由委托 |
| Controller 手动返回 `{ message, data: xxx }` | **直接 `return xxx`**：全局 `ResponseInterceptor` 已统一包装 `{ code, message, data, timestamp }`，手包形成 data 双层嵌套，前端 `responseTransformer` 只解包一层 → 页面数据恒空/"添加后列表不刷新"（实例：IP 黑名单；MSW 直通结构掩盖此问题） |
| `import type { XService }`（NestJS DI） | `import { XService }` |
| 修改 Prisma schema 后只执行 `db push` | 必须生成 migration 脚本并提交 |
| Prisma 枚举用在 `@ApiProperty` | 使用本地枚举，显式转换 |
| `console.log()` | 使用 NestJS Logger |
| `import ... from '@prisma/client'` 取类型 | 数据层类型一律从 `@cloudcad/db`（`PrismaClient`/模型/枚举/`Prisma` namespace） |
| 手写 DB 形状 / 接口返回 `any` | 用 `@cloudcad/db` 导出的 Prisma 类型（`IDatabaseService = PrismaClient`） |
| 改后端/DB 就关 issue，不查前端/SDK 是否需要联动 | 必须拉通三层评估后再结案 |
| Controller 读 `req.params`/`req.query` 却不声明 `@Param`/`@Query` | 显式声明装饰器（可选参数配 `@ApiQuery({required:false})`），否则 SDK 生成 `never`、前端只能手拼 URL/fetch（实例：`filesData/*path` 曾长期缺 `@Param('path')`，ADR-0034 豁免因此存在，2026-08-12 补齐后解除）；审计：`pnpm scan:undeclared-params` |
| 断言"这个API没有调用者"却不搜前端源码和 MSW handler | 先确认前端和 SDK 的调用链再下结论 |
| 新建模块/服务/barrel 却无消费者、无测试（孤儿） | 新建前三问：有无消费者？有无测试？是否值得独立（<5 文件并入相关模块）？无消费者代码删或标注；未激活模块必须 JSDoc 标注 + 登记 issue（实例：ownership 空壳 #228、policy-engine 未接线） |
| 扩展架构迁移（expand-contract）只扩不缩，停留在双轨 | 扩的同时排收尾票（contract：旧路径退休）；新抽象不得与旧抽象并行命名混淆（实例：storage vs storage-provider 的 IStorageProvider_Elastic，见 #234；#273/#274 已合并单轨收尾） |
| 业务代码里直接内联调用底层浏览器/运行时 API（`navigator.clipboard`、`document.execCommand`、`window.open` 下载、`Intl.DateTimeFormat`…） | 走包内**唯一出口**（PC：`src/lib/` 纯函数 + `src/hooks/`；移动：`src/utils/` + `src/components/`），业务侧只消费结果、不各自 try/catch、不各自定义降级链。**实例**：clipboard 曾散在 10 文件 / 15 调用点 / 4 套互不相同的降级策略，含 1 处 `.catch(() => {})` 完全静默、1 处未检查 `execCommand` 返回值就提示「已复制」；已收敛为 `frontend/src/lib/clipboard.ts` + `hooks/useCopy.ts`、`frontend_mobile/src/utils/clipboard.ts` + `components/ShareLinkSheet.vue`。门禁见各前端 skill 的 `docs/verify.md` → 重复实现扫描 |
| 同一能力在 ≥3 个文件重复实现（逐字节相同的 helper、相同的降级链、相同的日期/金额格式化） | ≥3 份即缺陷，收敛到唯一出口、副本改为调用方，不等"以后再抽"；写之前先 `grep` 是否已有实现（`project-coding-standards` → `docs/reuse-first.md`） |
| 在 PowerShell 里把 CLI 输出（如 `gh issue edit --body $body`）经变量/管道中转后写回 | 中文/UTF-8 会被按 GBK 双重转码破坏成 mojibake（`鍓嶇` 等）且不可逆。**一律先写 UTF-8 文件再 `--body-file` 传入**（gh 按 UTF-8 读文件）；读回 body 用 `node` 字节级处理（`execFileSync` + `buf.toString('utf8')`），不经 PowerShell 变量 |
| `git restore` / `git reset` / `git checkout --` / `git checkout .` / `git checkout <ref> -- <path>` / `git clean -f` / `git revert` / `git stash`（含 save/push/pop/apply/drop/clear 全部形式）/ `git switch -f` / `git checkout <branch>` 等任何可能改变工作区/暂存区/HEAD 状态的操作 | **禁止任何形式的 git 恢复、回退、暂存、切分支操作**，会丢弃无法恢复的工作区改动或打乱并行工作流。已在命令层被 `.opencode/plugins/block-dangerous-git.ts` 钩子硬拦截；需要撤销或临时验证时改用非破坏性方式（手动编辑文件、复制文件到临时目录、提交新改动）。**唯一例外**：「main↔develop 打包切换」按上文《分支策略》执行（工作区干净 + 无其他 AI 会话并发改文件） |
| `git worktree add` 创建临时 worktree 来验证 HEAD 基线/并行会话状态 | **禁止默认使用 git worktree**（`worktree add`/`remove`/`list`/`prune` 均默认禁止）：worktree 需要重装 node_modules/重跑 pnpm install，代价高且与本仓库「避免破坏性变更 + 并行会话隔离」约束冲突；验证基线请用只读方式（`git show HEAD:<path>`、`git diff`、直接读文件判断），确需 worktree 时先与用户确认并获得明确许可 |
| 用浏览器自动化（Playwright MCP 等）打开页面/登录/截图来诊断问题 | **禁止默认调用浏览器操作**（`playwright_browser_*` 系列工具）：耗时且需登录态，多数问题可通过读代码、查日志（后端 NestJS Logger / 浏览器 console）、直接请求后端接口（`Invoke-WebRequest`/curl 带 cookie/token）验证。浏览器操作仅在用户明确要求时才使用 |
| 把 `exec`（经 shell）改成 `spawn`（无壳）却不验证参数传递语义 | `exec` 经 cmd.exe 传原始参数，`spawn` 由 Node 转义（含 `"` 的参数变 `\"`）——mxcad 转换因此报 `read file error`（aaf2626 回归，`mxcad-exec.ts` 加 `windowsVerbatimArguments` 修复）。改进程启动方式必须用**真实子进程**对照复现（默认 vs `windowsVerbatimArguments`），不能只看"进程能起来"；且 mxcadassembly 退出码恒 2123，成败只认 JSON stdout |
| CLI/部署脚本/打包工具中硬编码产品名（`CloudCAD` / 中文名） | **产品名单一事实源**：用户可见品牌名一律从 `runtime/scripts/lib/branding.js`（`PRODUCT_NAME`）引用（JS `require`）或由 `scripts/sync-brand.js` 统一同步。改产品名只改 branding.js + 追加旧名到 `sync-brand.js` 的 `CN_LEGACY`，再跑 `pnpm brand:sync`（打包入口已自动执行）。静态文件里的逻辑标识（`cloudcad` 小写：包名/命令名/DB 名/`CloudCAD-PM2`/`CloudCAD fixed wrapper` 等）**禁止替换**；`.md` 文档不进自动同步 |

> **钩子**：`.opencode/plugins/block-dangerous-git.ts` 会在 bash 工具执行前拦截上述 git 恢复/回退/暂存/切分支命令（含 `git -C <dir>` 变体、`-f/--force` 强制标志、`git stash` 全部形式、`git checkout <branch>`/`-b`、`git switch` 等），并默认拦截 `git worktree` 命令。误拦截需豁免时，先与用户确认并在注释说明原因。

> 完整反模式清单见 `project-coding-standards`、`backend-coding-standards`、`frontend-coding-standards` 技能文档。

## 常用工作流

### 数据库迁移

1. 修改 `packages/db/prisma/schema.prisma` → `pnpm prisma migrate dev --name <描述>`
2. 提交生成的 `migrations/` 目录到 Git
3. 生产自动执行 `prisma migrate deploy`
4. 破坏性变更：先加新字段 → 同步数据 → 再删旧字段（分版本发布）

> 详细流程见 `prisma-database` 技能。

### 测试

- **后端**：jest（`clearMocks+restoreMocks+resetMocks` 全 true）。覆盖阈值：P0 80%（auth.service.ts, permission.service.ts），P1 70%。
- **前端**：vitest + MSW（handler 由 Swagger 自动生成）。CI 运行 vitest + Playwright E2E。
- 聚焦单模块：`pnpm test -- --testPathPattern="auth"`（后端）或 `pnpm test -- --run src/Some.test.ts`（前端）。

#### 集成测试规则（#284-#296 立项依据）

- **新增关键业务模块/路径必须附带集成测试或排票声明**，禁止出现"零测试模块"（实例：share/public-file/notification 曾整体零测试）。判断标准：跨模块编排 + 真实基础设施（DB/Redis/三方/WebSocket）交互，单测 mock 覆盖不了正确性。
- **关键 bug 修复必须带回归测试**（无法单测覆盖的走集成测试），防止同类回归。
- **集成测试规则**：集成测试统一归口 `test/integration/`（真实 PG+Redis，`pnpm test:integration` 跑，串行）；mock 单测禁止命名 `*.integration.spec.ts`（一律 `*.unit.spec.ts`）。三命令语义已固化在 `packages/backend/jest.config.cjs`：`pnpm test` / `test:unit` = 纯单元测试（本地无 DB 全绿），`pnpm test:integration` = 真集成（需 DB）。
- **契约先行**：改 DTO/Controller 后必须重新生成 API SDK + MSW handler 并提交（CI 门禁见 #296）。

> 策略和 mock 规范见 `testing-strategy` 技能。

## Skills
遇到对应场景时优先使用技能

---

<!-- lean-ctx -->
## lean-ctx

Prefer lean-ctx MCP tools (`ctx_read`, `ctx_shell`, `ctx_search`, `ctx_tree`, `ctx_edit`) over native equivalents. 10 read modes, 95+ shell compression patterns. Full rules: `LEAN-CTX.md`.
<!-- /lean-ctx -->
