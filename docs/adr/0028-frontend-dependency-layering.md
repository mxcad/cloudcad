# 前端依赖分层与门禁
**Status**: accepted

前端 426 个 TS/TSX 文件、94k 行扁平排布，无任何分层规则、无循环依赖检查，页面直接调 api-sdk，`services/`/`utils/`/`components/ui` 之间出现超级循环依赖（`errorHandler → NotificationContext → ui/Modal → AuthContext → mxcadManager → errorHandler`）。我们为前端引入与后端 ADR-0007 同构的显式三层依赖方向约束，并用 dependency-cruiser 作为门禁，把「依赖方向受控」变成可自动检查的地基。

**Decision**

**三层模型**（与后端 ADR-0007 共享词汇，导入方向只能向下 L3 → L2 → L1）：

| 层 | 目录 | 角色 |
|---|---|---|
| L1 基础设施 | `constants/` `types/` `utils/` `lib/` `languages/` `config/` `api-sdk/` `styles/` | 纯工具/常量/类型/i18n/SDK 配置，不依赖任何业务 |
| L2 核心业务 | `services/` `stores/` `contexts/` `hooks/`（根目录共享 hook） | 领域服务（mxcadManager/collaboration）、Zustand、Context、组合 hook |
| L3 业务编排 | `pages/` `components/`（含页面/组件内 hook） | 表现层编排 |

**规则集**（`packages/frontend/.dependency-cruiser.cjs`）：

| 规则 | 级别 |
|---|---|
| 禁止循环依赖 `no-circular` | error |
| L1 → L2/L3（基础设施向上依赖业务） | error |
| L2 → L3（逻辑依赖表现） | error |
| `components/ui/` → 任何业务（services/stores/contexts/hooks/业务组件/pages） | error |
| pages 互相 import（走路由导航） | warn（存量逐步治理） |

**门禁姿态**：dependency-cruiser 作为独立脚本 `pnpm depcruise` 配置（复用根 devDependency），并在存量违反清零后接入前端 `pnpm check`（`lint && format:check && depcruise`）与 CI（生成 SDK 后执行 `pnpm depcruise`）。首次审计 61 项违反（56 error / 5 warn），清理见「前端依赖违反清理」ticket；违反清零后接入生效。

**Guidance**

- `types/` 保持纯类型；`types/filesystem.ts`、`types/collaboration.ts` 内的运行时函数迁入 `utils/`（记入尾部执行队列）。
- 测试目录（`src/test`、`*.spec.*`、`*.test.*`、`__tests__`）不参与规则；`mxcad-app`、`@cloudcad/api-sdk` 为外部包不参与。
- 已知根因（断环关键）：`components/ui/Modal.tsx` 依赖 `contexts/TourContext`/`AuthContext`；`utils/errorHandler.ts`/`message.ts`/`loadingUtils.ts` 依赖 contexts/stores——清理方案见「前端依赖违反清理」。
- 新增代码：默认遵守分层方向；新目录/新文件先判断归属层。
- Code Review 必查分层；AI 开发时 `pnpm depcruise` 可随时自检。

**Status**: accepted

**Cross-references**
- ADR-0007 三层依赖约束架构（后端同构模型）
- 前端依赖分层与门禁 ticket（map「前端 AI 开发地基建设」子票 177）
- 「前端依赖违反清理」ticket（尾部执行队列，违反清零后接 check/CI）
