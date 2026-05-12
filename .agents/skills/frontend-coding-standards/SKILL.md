---
name: frontend-coding-standards
description: 前端编码规范 — 主题系统、Z-Index 层级、组件复用、API 契约、权限 UI、CSS 变量约束。触发条件：编写 React 组件、样式、前端页面、API 调用、或任何 packages/frontend 下的代码变更。自动引用 project-coding-standards 的公共规范。
---

<what-to-do>

处理前端代码时，必须遵守以下前端特有规范。同时自动遵守 `project-coding-standards` 的全部公共规则。

**核心原则**：先查已有基础设施，再动手。所有视觉元素（颜色、z-index、字体、间距）必须使用 CSS 变量/Token，禁止硬编码。

</what-to-do>

<supporting-info>

## 触发场景与按需加载

AI 应根据当前任务选择阅读相关文档：

| 场景 | 必须检查的文档 |
|------|-------------|
| 写任何样式 / CSS / 组件 | `docs/theme-system.md` |
| 处理层级、弹窗、Tooltip、Toast | `docs/z-index-rules.md` |
| 新增 UI 组件 | `docs/component-reuse.md` |
| 前端 API 调用 / 类型定义 | `docs/api-contracts.md` |
| 权限相关 UI | `docs/permission-system.md` |
| 任何前端反模式检查 | `docs/anti-patterns.md` |
| 表单开发 | `docs/form-patterns.md` |
| 提交前检查 | `docs/verify.md` |

## 核心基础设施（始终检查）

### 1. 主题系统（`src/styles/app.css` + `src/styles/theme.css`）

两套 CSS 变量体系，支持亮色/深色双主题：

**Tailwind 侧** (`app.css`):
- 品牌色: `--color-primary-{50..900}` (工程蓝), `--color-accent-{50..900}` (青蓝)
- 中性色: `--color-slate-{50..900}`
- 语义色: `--color-success-*`, `--color-warning-*`, `--color-error-*`, `--color-info-*`
- 字体: `--font-family-base`, `--font-family-mono`
- 间距: `--spacing-{1..96}`
- 圆角: `--radius-*`
- 阴影: `--shadow-*`

**组件侧** (`theme.css` v2.0.0):
- 背景层次: `--bg-canvas`, `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-elevated`, `--bg-overlay`
- 文字层次: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-muted`, `--text-inverse`
- 边框: `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus`
- 品牌色: `--primary-{50..900}`, `--accent-{50..900}`

**规则**: 所有颜色必须使用 CSS 变量，禁止硬编码色值（`#6366f1`, `white`, `#333` 等）。

### 2. Z-Index 层级（`src/constants/layers.ts`）

所有 z-index 必须引用 `Z_LAYERS` 常量，禁止裸数字：

```typescript
import { Z_LAYERS } from '@/constants/layers';

// ✅ 正确
style={{ zIndex: Z_LAYERS.MODAL }}
style={{ zIndex: Z_LAYERS.TOOLTIP }}

// ❌ 错误
style={{ zIndex: 9999 }}
```

层级体系：BACKGROUND(0) → CONTENT(10) → SIDEBAR(100) → CAD_EDITOR(1000) → OVERLAY(5000) → MODAL(10000) → TOOLTIP(50000) → TOAST(100000)

### 3. 共享组件复用（`src/components/ui/`）

新增 UI 组件前，必须先搜索 `src/components/ui/` 是否已有可复用组件：

- Button, ConfirmDialog, Modal, Table, Form, Input
- Pagination, TruncateText, Tooltip
- 以及 `src/components/common/` 下的通用组件

已有组件不完美时，优先复用并改进，而非重写一套。

### 4. API 调用与类型（`src/api-sdk/`）

- API 类型通过 `pnpm generate:api-types` 自动生成，禁止前端本地定义 API 类型
- 后端 DTO 的 `@ApiProperty` 是类型来源的前端依据
- SDK 在 `src/api-sdk/` 通过 `@hey-api/openapi-ts` 生成，禁止手动编辑

### 5. 目录约定

| 内容 | 位置 |
|------|------|
| UI 组件 | `src/components/<domain>/` |
| 页面 | `src/pages/` |
| Hooks | `src/hooks/` |
| Stores | `src/stores/` |
| 工具函数 | `src/utils/` |
| 类型定义 | `src/types/` 或就近 `<module>/types.ts` |
| 配置 | `src/config/` |
| Context | `src/contexts/` |
| 样式 | `src/styles/` |

## 前端特有反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `zIndex: 9999` | `zIndex: Z_LAYERS.MODAL` |
| `color: #6366f1` | `color: var(--primary-500)` |
| `background: white` | `background: var(--bg-primary)` |
| `border: 1px solid #e2e8f0` | `border: 1px solid var(--border-default)` |
| `font-family: 'Inter', sans-serif` | `font-family: var(--font-family-base)` |
| 自己写一套 Modal/Table/Button | 复用 `src/components/ui/` 已有组件 |
| 在组件文件中定义 TypeScript 类型 | 提取到独立 types 文件 |
| 前端本地定义 API 类型 | 使用 `@hey-api/openapi-ts` 自动生成的类型 |
| 组件内定义组件（导致 re-mounting） | 组件顶层定义 |
| 直接修改 Zustand state | 使用 Zustand setter |
| 忽略 React keys | 列表必须提供稳定 key |
| `div` 用于语义元素 | 使用语义 HTML（button, nav, article 等） |
| 不处理 loading/error 状态 | 所有 API 调用处理 loading + error |

## 文档引用

- 公共编码规范：加载 `project-coding-standards` Skill
- 领域术语：`CONTEXT.md`
- i18n 状态：暂无基础设施，所有用户可见字符串直接写中文，预留扩展点
- 目录结构：遵守 `packages/frontend/src/` 约定 — 不随意创建新文件夹

## State Management (Zustand)

- Store 文件放 `src/stores/`
- 使用 selector 实现细粒度响应
- 禁止直接 mutate state，必须使用 setter
- Store 遵循不可变更新模式

## 性能约定

- 使用 `useMemo` / `useCallback` 包裹昂贵计算
- `React.memo` 用于纯展示组件
- 避免在 render 中做重计算
- 清理 subscriptions 和 event listeners（useEffect return）

## 注意事项

- 此 Skill 的所有规则均为强制性
- 公共规则（复用优先、文件约定、重构原则、提交前检查）由 `project-coding-standards` Skill 统一管理，此处不重复
- CAD 引擎（mxcad-app）为黑盒 npm 依赖，通过 `mxcadManager.ts` 单例管理

</supporting-info>