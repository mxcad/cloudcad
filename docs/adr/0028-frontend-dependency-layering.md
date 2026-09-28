# 前端依赖分层与门禁

**Status**: accepted

前端 426 个 TS/TSX 文件、94k 行扁平排布，无任何分层规则、无循环依赖检查，页面直接调 api-sdk，`services/`/`utils/`/`components/ui` 之间出现超级循环依赖（`errorHandler → NotificationContext → ui/Modal → AuthContext → mxcadManager → errorHandler`）。我们为前端引入与后端 ADR-0007 同构的显式三层依赖方向约束，并用 dependency-cruiser 作为门禁，把「依赖方向受控」变成可自动检查的地基。

**Decision**

**三层模型**（与后端 ADR-0007 共享词汇，导入方向只能向下 L3 → L2 → L1）：

| 层          | 目录                                                                              | 角色                                                                |
| ----------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| L1 基础设施 | `constants/` `types/` `utils/` `lib/` `languages/` `config/` `api-sdk/` `styles/` | 纯工具/常量/类型/i18n/SDK 配置，不依赖任何业务                      |
| L2 核心业务 | `services/` `stores/` `contexts/` `hooks/`（根目录共享 hook）                     | 领域服务（mxcadManager/collaboration）、Zustand、Context、组合 hook |
| L3 业务编排 | `pages/` `components/`（含页面/组件内 hook）                                      | 表现层编排                                                          |

**规则集**（`packages/frontend/.dependency-cruiser.cjs`）：

| 规则                                                                         | 级别                 |
| ---------------------------------------------------------------------------- | -------------------- |
| 禁止循环依赖 `no-circular`                                                   | error                |
| L1 → L2/L3（基础设施向上依赖业务）                                           | error                |
| L2 → L3（逻辑依赖表现）                                                      | error                |
| `components/ui/` → 任何业务（services/stores/contexts/hooks/业务组件/pages） | error                |
| pages 互相 import（走路由导航）                                              | warn（存量逐步治理） |
| 深路径导入已有入口模块（ADR-0029）                                           | warn（存量逐步治理） |

**门禁姿态**：dependency-cruiser 作为独立脚本 `pnpm depcruise`（复用根 devDependency），并接入前端 `pnpm check` 与 CI。存量违反收录在 `.dependency-cruiser-known-violations.json`，脚本用 `--ignore-known` 显式指向它——基线内条目被忽略，**新增违反仍为红灯**。基线是债务台账，每清一批重跑 `pnpm depcruise:baseline` 缩减。

**2026-09-28 基线（744 项 / 719 模块 / 3870 依赖）**：`no-cross-page-import` 374 warn、`no-deep-path-import` 348 warn、`no-l2-to-l3` 14 error、`no-circular` 6 error、`no-upward-from-l1` 2 error、`no-ui-to-business` **0**。error 类共 22 项，集中在 L2→L3 与 mxcadManager 内部循环，清理见「前端依赖违反清理」ticket。对比首次审计的 61 项（56 error / 5 warn）：error 从 56 降到 22，warn 从 5 升到 722 是因为补上了 ADR-0029 的深路径规则与 pages 互引规则——存量债务此前根本没被数过。

**dependency-cruiser 16.x 配置坑**（首次落地实测）：

- CLI 的 `--baseline` 已改名为 `--ignore-known`，且**不会自动拾取默认文件名**，必须在脚本里显式传路径；
- `options.tsConfig` 的键是 `fileName`（不是旧版 `projectFiles`），`enhancedResolveOptions.useTsResolver` 已移除，TS 解析改用 `parser: 'tsc'` + `tsConfig: { fileName }`；
- 规则必须用 `from.path: '^src/'` 收窄作用域并配 `doNotFollow: { path: 'node_modules' }`，否则 `no-circular` 会扫进 recharts / victory-vendor 内部循环，产生数百条假违规（实测 867 条）；
- `to.path` 里若把 `components/` 计入业务层，会连带把 `components/ui/` 内部互引算成违规，需用 `pathNot` 排除自身。

**Guidance**

- `types/` 保持纯类型；`types/filesystem.ts`、`types/collaboration.ts` 内的运行时函数迁入 `utils/`（记入尾部执行队列）。
- 测试目录（`src/test`、`*.spec.*`、`*.test.*`、`__tests__`）不参与规则；`mxcad-app`、`@cloudcad/api-sdk` 为外部包不参与。
- 2026-09-28 实测的 error 分布（清理靶点）：
  - `no-l2-to-l3` 14 项，源头 10 个文件：`contexts/NotificationContext.tsx`、`hooks/file-browser/`（3）、`hooks/file-system/`（5）、`services/mxcadManager/cmd/toggleFileQueue.ts`。共性是 L2 直接依赖 L3 展示组件（`SearchFilters`、`Pagination`、`ui/Toast`、`fileActionConfig`），应把纯数据/纯函数下沉到 L1 后由组件消费。
  - `no-circular` 6 项，全部在 `services/mxcadManager/`：1 项在 `cmd/`（`insertImageCommand` ↔ `types` ↔ `saveFile`），5 项在 manager 核心，**共同节点是 `mxcadHelpers.ts`**（`mxcadCollaboration` / `mxcadInstanceManager` / `mxcadOpenFlow` 都绕它成环）——断环从它入手。
  - `no-upward-from-l1` 2 项：`utils/fileUtils.ts` → `components/ui/FileSize.tsx`、`utils/notificationEvents.ts` → `components/ui/Toast.tsx`。`fileUtils` 那条应把格式化逻辑留在 `utils/`、只让组件 import 它（现状是反向）。
- `no-ui-to-business` 当前为 **0**：本 ADR 立项时点名的 `components/ui/Modal.tsx` → `contexts/TourContext`/`AuthContext` 反向依赖已被修复，`ui/` 现为干净叶子——新增代码勿重新引入。
- 新增代码：默认遵守分层方向；新目录/新文件先判断归属层。
- Code Review 必查分层；AI 开发时 `pnpm depcruise` 可随时自检。

**Status**: accepted

**Cross-references**

- ADR-0007 三层依赖约束架构（后端同构模型）
- ADR-0029 前端模块入口（Façade/barrel）——深路径导入规则出自其第 7 条
- 前端依赖分层与门禁 ticket（map「前端 AI 开发地基建设」子票 177）
- 「前端依赖违反清理」ticket（尾部执行队列，违反清零后接 check/CI）
