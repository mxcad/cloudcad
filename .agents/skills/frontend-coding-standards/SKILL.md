---
name: frontend-coding-standards
description: 前端编码规范 — 主题系统、Z-Index 层级、组件复用、API 契约、权限 UI、CSS 变量约束。触发条件：编写 React 组件、样式、前端页面、API 调用、或任何 packages/frontend 下的代码变更。自动引用 project-coding-standards 的公共规范。
---

<what-to-do>

处理前端代码时，必须遵守以下前端特有规范。同时自动遵守 `project-coding-standards` 的全部公共规则。

**核心原则**：先查已有基础设施，再动手。所有视觉元素（颜色、z-index、字体、间距）必须使用 CSS 变量/Token，禁止硬编码。**这条"先查"同样覆盖功能能力**（复制/剪贴板、下载、日期格式化、权限判断…）：先 `grep` 底层 API 名，再决定是自己写还是走包内唯一出口，详见 `project-coding-standards` → `docs/reuse-first.md` 的「横切平台能力」专节。

**地基 ADR 必读**：前端开发地基由 ADR-0028~0034 沉淀（依赖分层/模块入口/状态归属/可替换/样式/拆分/fetch 治理），涉及对应场景先读 ADR 再动手，详见 `packages/frontend/AGENTS.md` 的地基 ADR 索引。

</what-to-do>

<supporting-info>

## 触发场景与按需加载

AI 应根据当前任务选择阅读相关文档：

| 场景 | 必须检查的文档 |
|------|-------------|
| 写任何样式 / CSS / 组件 | `docs/theme-system.md`（ADR-0032） |
| 处理层级、弹窗、Tooltip、Toast | `docs/z-index-rules.md`（ADR-0032） |
| 新增 UI 组件 | `docs/component-reuse.md` |
| 新增工具函数 / Hook / 任何横切平台能力（复制、下载、格式化…） | `project-coding-standards` → `docs/reuse-first.md`（按底层 API 名搜索，出口位置固定） |
| 前端 API 调用 / 类型定义 / 裸 fetch 治理 | `docs/api-contracts.md`（ADR-0034） |
| 权限相关 UI | `docs/permission-system.md` |
| 任何前端反模式检查 | `docs/anti-patterns.md` |
| 表单开发 | `docs/form-patterns.md` |
| 提交前检查 | `docs/verify.md` |
| 路由架构 / 新增页面 | `docs/routing-architecture.md` |
| 页面结构 / 组件尺寸 / 巨型文件拆分 | `docs/component-standards.md`（ADR-0033） |
| 模块入口 / Façade / hook 归属 | `docs/module-entry.md`（ADR-0029） |
| 状态管理归属 / React Query 开发 | `docs/state-ownership.md` + `docs/query-key-management.md`（ADR-0030） |
| 可替换 / 扩展点 / 何时抽象 | `docs/abstraction-rule.md`（ADR-0031） |
| 依赖方向 / 分层门禁 | `docs/dependency-layering.md`（ADR-0028，`pnpm depcruise`） |

## 核心基础设施（始终检查）

### 1. 主题系统（`src/styles/theme.css` + `src/styles/app.css`）— ADR-0032

主范式：**CSS 变量 token 为唯一事实源**，支持亮色/深色双主题：

- 组件侧语义 token（`theme.css`，唯一事实源）：背景 `--bg-canvas/--bg-primary/--bg-secondary/--bg-tertiary/--bg-elevated/--bg-overlay`、文字 `--text-primary/--text-secondary/--text-tertiary/--text-muted/--text-inverse`、边框 `--border-subtle/--border-default/--border-strong/--border-focus`、品牌色 `--primary-{50..900}`/`--accent-{50..900}`、语义色 `--success-*`/`--warning-*`/`--error-*`/`--info-*`、字体/间距/圆角/阴影 token
- **`--color-*` 命名空间已废弃**（ADR-0032）：禁止新增 `--color-*` 变量；存量引用迁移中（执行 ticket 193），见到 `var(--color-*)` 属存量应顺手替换为语义 token
- Tailwind 仅做布局 utility（间距/尺寸/flex/grid/定位），**不把主题色注册为 Tailwind 色板**；主题色用 `var(--primary-500)` 或任意值语法 `bg-[var(--primary-500)]`
- 组件复杂样式用 CSS Modules（`.module.css`）；内联 style 仅限动态值（分支、尺寸计算、transform）

**规则**: 所有颜色必须使用 CSS 变量，禁止硬编码色值（`#6366f1`, `white`, `#333` 等）、禁止 JS 模板字符串 CSS、禁止内联 style 写主题色。

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

**语义分级豁免**：局部层叠上下文内的 `z-index: 1/2`（非 fixed/absolute 全局浮层，如 `.input-icon`、sticky header）允许保留，但须注释说明「局部层叠上下文」；全局浮层（fixed 定位、`z-index >= 100`）一律 `Z_LAYERS.*`。禁止为 `z-index: 1` 建 `Z_LAYERS.LOCAL_1` 式条目。

### 3. 共享组件复用（`src/components/ui/`）

**在使用或实现任何组件前，必须先确认 `src/components/ui/` 下是否已有适合的全局组件。** 该规则同样覆盖原生 HTML 控件：直接写 `<input type="date">`、`<select>`、自绘下拉等，等同于自己实现了一个选择器组件，必须优先复用全局对应组件（如 `DatePicker`、`Select`）。全局组件不满足需求时扩展其 props，而非另写一套。

必须先搜索是否已有可复用组件：

- Button, ConfirmDialog, Modal, Table, Form, Input
- Pagination, TruncateText, Tooltip, DatePicker, Select, Autocomplete, Popover, Calendar
- 以及 `src/components/common/` 下的通用组件

已有组件不完美时，优先复用并改进，而非重写一套。详见 `docs/component-reuse.md`。

#### shadcn/ui 组件拉取流程（禁止手写成熟组件轮子）

新增输入/展示类成熟组件（日历、日期选择、弹层等）时，**优先从 shadcn/ui 拉取再改造**，禁止手写。在 `packages/frontend/` 下执行：

```bash
pnpm dlx shadcn@latest add <component>
```

要点与已知坑：

- **拒绝覆盖已存在文件**：遇到 `button.tsx already exists` 询问输入 `n`（项目自有 Button 体系），拉取后自行适配
- **Windows 上 CLI 内部 `pnpm add` 可能崩溃**（退出码 3221226505）：先手动 `pnpm add <deps>` 装依赖，再重试 CLI
- **registry 版本可能滞后于 latest**：装完核对组件 API 与依赖版本（例：shadcn Calendar 源码为 react-day-picker v9 API，须锁 `react-day-picker@^9`，v10 API 不兼容）

**拉取后必须逐项适配（检查清单）**：

1. **z-index**：shadcn 默认 `z-50` 假设「浮层同级」，与项目 `Z_LAYERS` 分级体系冲突 → 换成 `Z_LAYERS.*` 常量（Modal 内浮层用 `Z_LAYERS.POPUP`=15000 > `MODAL`=10000）
2. **主题 token**：shadcn 变量类（`bg-background`/`text-muted-foreground`/`bg-popover`/`text-popover-foreground`/`border-input` 等）→ 项目 CSS 变量（`var(--bg-*)`/`var(--text-*)`/`var(--border-*)`）
3. **全局样式依赖**：如 react-day-picker 需引入 `react-day-picker/style.css`。注意其规则是**非 layer**，优先级高于 Tailwind utilities layer——主题定制必须走 rdp 官方 CSS 变量覆盖（`src/styles/calendar.css` 中 `@import` + `.rdp-root { --rdp-*: ... }`），**不能靠 Tailwind 类覆盖**（会被 style.css 盖掉）
4. **依赖组件冲突**：shadcn Button 等 registry 依赖若与项目组件同名/冲突，改为原生元素或项目组件
5. **动画类**：`tailwindcss-animate` 项目未装，移除 `animate-in`/`animate-out` 等类
6. **cn 工具**：`src/lib/utils.ts`（clsx + tailwind-merge，已存在）；`components.json` 已配置

**验收**：`pnpm type-check` + vitest 单测 + `pnpm build` 后检查 CSS 产物中组件样式与覆盖规则均存在。

### 4. API 调用与类型（`src/api-sdk/`）— ADR-0034

- API 类型通过 `pnpm generate:api-types` 自动生成，禁止前端本地定义 API 类型
- 后端 DTO 的 `@ApiProperty` 是类型来源的前端依据
- SDK 在 `src/api-sdk/` 通过 `@hey-api/openapi-ts` 生成，禁止手动编辑
- **禁止裸 `fetch()` 调用后端 API**；multipart 场景 body 传**普通对象**（`body: { file, hash, ... } as never`，SDK 自动序列化；禁传原生 FormData——`Object.entries(FormData)` 为空致字段丢失，参考 b1cd0d56）；blob 下载走 `src/utils/download.ts`（唯一允许 `as Blob` 断言处）；豁免清单见 `docs/api-contracts.md`

### 5. 目录约定

| 内容 | 位置 |
|------|------|
| UI 组件 | `src/components/<domain>/` |
| 页面 | `src/pages/` |
| Hooks | `src/hooks/`（全局共享）或页面/组件私有目录 |
| Stores | `src/stores/` |
| 路由配置 | App.tsx 聚合（无 `src/routes/` 目录） |
| 工具函数 | `src/utils/` |
| 类型定义 | `src/types/` 或就近 `<module>/types.ts` |
| 配置 | `src/config/` |
| Context | `src/contexts/` |
| 样式 | `src/styles/`（全局 token）/ 组件就近 `.module.css` |

**页面目录规则**（ADR-0033）：超过 300 行或有独立 hooks/子组件时，页面拆为 `src/pages/<Name>/index.tsx` + `hooks/` + `components/` + `types.ts`。详见 `docs/component-standards.md`。

**模块入口规则**（ADR-0029）：目录含多个实现文件或子目录时必须有 `index.ts` 作为唯一入口，外部消费者禁止深路径导入（`dir/sub/file`）。详见 `docs/module-entry.md`。

## 前端特有反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `zIndex: 9999` | `zIndex: Z_LAYERS.MODAL` |
| `color: #6366f1` | `color: var(--primary-500)` |
| `background: white` | `background: var(--bg-primary)` |
| `border: 1px solid #e2e8f0` | `border: 1px solid var(--border-default)` |
| `font-family: 'Inter', sans-serif` | `font-family: var(--font-family-base)` |
| 使用已废弃的 `--color-*` 变量 | 语义 token `--primary-*`/`--bg-*`/`--text-*`（ADR-0032） |
| JS 模板字符串 CSS（`<style>${...}</style>`） | CSS Modules（`.module.css`）或组件内 `<style>` |
| 内联 style 写主题色（`color: '#333'`） | 变量 token；内联 style 仅动态值 |
| 裸 `fetch('/api/xxx')` / `fetchWithAuth` / `EventSource` 调后端 | 走 `@cloudcad/api-sdk` 生成函数（ADR-0034） |
| 手写 fetch+缓存布尔（server 状态塞 Zustand/Context） | react-query（`queryKeys` 工厂）（ADR-0030） |
| 模块级可变变量 | Zustand store / react-query / 局部 state |
| 自己写一套 Modal/Table/Button | 复用 `src/components/ui/` 已有组件 |
| 直接用原生 `<input type="date">`/`<select>` 绕过全局 DatePicker/Select（实例：AdminStatsPage） | 先查 `components/ui/` 全局组件，不满足则扩展 props，见 `docs/component-reuse.md` |
| 在组件文件中定义 TypeScript 类型 | 提取到独立 types 文件 |
| 前端本地定义 API 类型 | 使用 `@hey-api/openapi-ts` 自动生成的类型 |
| 组件内定义组件（导致 re-mounting） | 组件顶层定义 |
| 直接修改 Zustand state | 使用 Zustand setter |
| 忽略 React keys | 列表必须提供稳定 key |
| `div` 用于语义元素 | 使用语义 HTML（button, nav, article 等） |
| 不处理 loading/error 状态 | 所有 API 调用处理 loading + error |
| App.tsx 路由堆积非懒加载 `<Route>` | 页面 `lazy(() => import('./pages/<Name>'))` + App.tsx 一行聚合（无 `src/routes/` 目录） |
| 单个组件 600+ 行 | 拆为主组件 + hooks + 子组件，< 400 行（硬门禁）/300 行（软目标） |
| 页面单文件超 300 行还不拆目录 | 拆为 `pages/<Name>/index.tsx` + hooks/ + components/ |
| `queryKey: ['硬编码']` 或本地常量 | 使用 `queryKeys` 工厂（`src/lib/queryKeys.ts`） |
| 每个页面各自定义 `const USERS_KEY` | 统一在 `queryKeys` 工厂维护 |
| 深路径导入已有入口的模块子文件（如 `services/mxcadManager/mxcadSave`） | 从模块目录入口导入，见 `docs/module-entry.md` |
| 页面/组件目录重复实现共享逻辑 | 提升 `hooks/` 根共享，见 `docs/module-entry.md` |
| 前端照搬后端「接口 + DI token + @Optional()」抽象 / 造注册表、插件系统 | 默认不抽象，配置优先，见 `docs/abstraction-rule.md` |
| 业务代码里直接内联 `navigator.clipboard` / `document.execCommand` | 走唯一出口 `src/lib/clipboard.ts`（+ `src/hooks/useCopy.ts`），调用方只消费结果。降级链只许写在出口文件里 |
| 同一能力在 ≥3 个文件重复实现（相同的降级链、逐字节相同的 helper、相同的格式化） | ≥3 份即缺陷：收敛到唯一出口、副本改为调用方；写之前先按底层 API 名 `grep`，见 `project-coding-standards` → `docs/reuse-first.md` |

## 文档引用

- 公共编码规范：加载 `project-coding-standards` Skill
- 领域术语：`CONTEXT.md`
- i18n（VoerkaI18n）：详见 `packages/frontend/AGENTS.md` → i18n 章节。核心要点：
  - `t("中文")` 包裹 UI 文本，`pnpm i18n:extract` 提取
  - 自定义翻译写入 `translates/messages/db-strings.json`（`default.json` 会被覆盖）
  - `@voerkai18n/vite` 插件必须在 `react()` 之前注册
  - mxcad-app 语言同步通过 `CADEditorDirect.tsx` + `LanguageSwitcher.tsx` 双向同步
- 目录结构：遵守 `packages/frontend/src/` 约定 — 不随意创建新文件夹
- 路由架构：`docs/routing-architecture.md` — 路由在 App.tsx 懒加载聚合（无 `src/routes/` 目录），新增页面走 `pages/` 目录
- 页面结构与组件尺寸：`docs/component-standards.md` — 300 行软上限，页面拆目录规则
- 模块入口 / Façade：`docs/module-entry.md` — 有内部结构就有入口，hook 归属边界，同名收敛
- React Query Key 管理：`docs/query-key-management.md` — 统一使用 `queryKeys` 工厂
- 可替换与扩展点：`docs/abstraction-rule.md` — 前端默认不抽象、配置优先，逃生门只在模块入口

## State Management（ADR-0030）

**归属判断**：先问是不是 server 状态（从后端读取/写入的数据）→ 一律 react-query（queryKey 统一 `lib/queryKeys.ts` 工厂，staleTime 兜底缓存，禁止手写 fetch+缓存布尔）；client 状态按作用域：组件私有 → `useState`；子树共享、读重写轻 → React Context（Auth/Theme/Notification 等）；全局高频写 / 需 React 外访问（`getState()`）/ persist → Zustand。

- Store 文件放 `src/stores/`
- 使用 selector 实现细粒度响应
- 禁止直接 mutate state，必须使用 setter
- Store 遵循不可变更新模式

### 禁止模块级变量

```typescript
// ❌ 错误 — 模块级变量，跨组件共享导致不可控
let currentFileInfo: CurrentFileInfo | null = null;

// ✅ 正确 — 使用 Zustand store
const store = useCADEditorStore.getState();
store.setCurrentFileInfo(info);
```

非 React 代码通过 `useCADEditorStore.getState()` 读写。参见 `packages/frontend/src/stores/useCADEditorStore.ts`。

## 路由架构

路由在 `App.tsx` 中聚合（当前无 `src/routes/` 目录；按域拆分到 `src/routes/*.routes.ts` 是既有目标，见 `docs/routing-architecture.md`）。禁止在 App.tsx 内联新增 `<Route>` 定义后不做拆分。详见 `docs/routing-architecture.md`。

## React Query Key 管理

所有 `@tanstack/react-query` 的 `queryKey` 必须通过 `src/lib/queryKeys.ts` 工厂创建。禁止本地常量和硬编码字符串。详见 `docs/query-key-management.md`。

## 性能约定

- 使用 `useMemo` / `useCallback` 包裹昂贵计算
- `React.memo` 用于纯展示组件
- 避免在 render 中做重计算
- 清理 subscriptions 和 event listeners（useEffect return）

## 注意事项

- 此 Skill 的所有规则均为强制性
- 公共规则（复用优先、文件约定、重构原则、提交前检查）由 `project-coding-standards` Skill 统一管理，此处不重复
- CAD 引擎（mxcad-app）为黑盒 npm 依赖，通过 `mxcadManager.ts` 单例管理

### CAD 编辑器全局叠加层

`CADEditorDirect.tsx` 在 `<Routes>` 之外渲染，通过 `visibility + z-index` 跨路由保持 WebGL 上下文：

```typescript
<div style={{
  visibility: isActive ? 'visible' : 'hidden',
  zIndex: Z_LAYERS.CAD_EDITOR,
  pointerEvents: isActive ? 'auto' : 'none',
}} />
```

- 容器 `<div id="mxcad-global-container">` 永不销毁
- `mxcadManager` 在 `document.body` 下管理此容器
- 事件通信通过 `window.CustomEvent`（`mxcad-save-required`, `mxcad-file-opened` 等）

</supporting-info>