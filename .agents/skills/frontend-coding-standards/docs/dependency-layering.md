# 依赖分层与门禁（ADR-0028）

前端三层依赖方向约束（与后端 ADR-0007 共享词汇），导入方向**只能向下**：L3 → L2 → L1。

## 三层模型

| 层 | 目录 | 角色 |
|----|------|------|
| **L1 基础设施** | `constants/` `types/` `utils/` `lib/` `languages/` `config/` `api-sdk/` `styles/` | 纯工具/常量/类型/i18n/SDK 配置，**不依赖任何业务** |
| **L2 核心业务** | `services/` `stores/` `contexts/` `hooks/`（根目录共享 hook） | 领域服务（mxcadManager/collaboration）、Zustand、Context、组合 hook |
| **L3 业务编排** | `pages/` `components/`（含页面/组件内 hook） | 表现层编排 |

## 规则集（packages/frontend/.dependency-cruiser.cjs）

| 规则 | 级别 |
|------|------|
| 禁止循环依赖 `no-circular` | error |
| L1 → L2/L3（基础设施向上依赖业务） | error |
| L2 → L3（逻辑依赖表现） | error |
| `components/ui/` → 任何业务（services/stores/contexts/hooks/业务组件/pages） | error |
| pages 互相 import（走路由导航） | warn（存量逐步治理） |
| 禁止深路径导入已有入口模块（ADR-0029） | warn |

## 门禁姿态

- 独立脚本 `pnpm depcruise`（暂未接入 `pnpm check` / CI；违反清零后接入）
- 测试目录（`src/test`、`*.spec.*`、`*.test.*`、`__tests__`）不参与规则；`mxcad-app`、`@cloudcad/api-sdk` 为外部包不参与

## 判断新文件归属层

```
新文件是什么？
  ├─ 纯工具/常量/类型/i18n/SDK 配置 → L1
  ├─ 领域服务/store/context/组合 hook → L2
  └─ 页面/组件编排 → L3
```

## 已知断环关键点

- `components/ui/Modal.tsx` 不应依赖 `contexts/TourContext`/`AuthContext`（ui 纯净性）
- `utils/` 不应依赖 contexts/stores（L1 纯净性）
- 页面内代码上升为领域服务 → L2；hook 下放页面 → L3

## ADR 参考

- ADR-0028 前端依赖分层与门禁：`docs/adr/0028-frontend-dependency-layering.md`
- ADR-0007 后端三层依赖约束架构（同构模型）
