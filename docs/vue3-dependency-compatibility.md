# Vue 3 依赖兼容性分析

> 分析日期：2026-05-03
> 分析范围：apps/frontend/package.json 中的所有前端依赖
> 目的：评估当前 React 技术栈各依赖在迁移至 Vue 3 时的兼容性与替代方案

---

## 一、框架无关依赖（可直接复用）

这些依赖不依赖 React 生命周期，在 Vue 3 中无需替换。

| 依赖 | 版本 | 用途 | Vue 3 兼容性 | 备注 |
|------|------|------|-------------|------|
| `axios` | ^1.13.2 | HTTP 客户端 | ✅ 完全兼容 | 框架无关，直接复用 |
| `zod` | ^4.2.1 | Schema 校验 | ✅ 完全兼容 | 框架无关，直接复用 |
| `spark-md5` | ^3.0.2 | 文件哈希计算 | ✅ 完全兼容 | 纯工具库，直接复用 |
| `tailwindcss` | ^4.1.18 | CSS 框架 | ✅ 完全兼容 | v4 同时支持 React 和 Vue |
| `typescript` | ~5.8.2 | 类型系统 | ✅ 完全兼容 | 框架无关 |
| `vite` | ^6.2.0 | 构建工具 | ✅ 完全兼容 | 官方支持 Vue 3 插件 |
| `prettier` | ^3.2.0 | 代码格式化 | ✅ 完全兼容 | 框架无关 |
| `eslint` | ^8.57.0 | 代码检查 | ✅ 完全兼容 | 需换用 Vue 规则集 |

---

## 二、React 专属依赖（需替换）

这些依赖深度绑定 React（Hooks、JSX 渲染逻辑），在 Vue 3 中无法直接复用，需寻找替代方案。

### 2.1 Lucide React → Lucide Vue Next

| 项目 | 说明 |
|------|------|
| 当前依赖 | `lucide-react` ^0.556.0 |
| Vue 3 替代 | [`lucide-vue-next`](https://lucide.dev/guide/packages/lucide-vue-next) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | 官方维护的 Vue 3 版本，API 一致，组件名相同 |
| 迁移成本 | 低 — 组件名一一对应，只需改 import 路径 |

```ts
// React 用法
import { Home, User } from 'lucide-react'

// Vue 3 用法
import { Home, User } from 'lucide-vue-next'
```

---

### 2.2 Radix UI → Radix Vue

| 项目 | 说明 |
|------|------|
| 当前依赖 | `@radix-ui/react-avatar`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-select`, `@radix-ui/react-slot` |
| Vue 3 替代 | [`radix-vue`](https://radix-vue.com/) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | 社区官方推荐，API 设计对齐 Radix UI，覆盖所有当前使用的组件 |
| 迁移成本 | 中 — 组件结构相似，但 Vue 插槽 vs React children 需调整 |

> `class-variance-authority`、`clsx`、`tailwind-merge` 可继续使用（框架无关）。

---

### 2.3 React Router → Vue Router

| 项目 | 说明 |
|------|------|
| 当前依赖 | `react-router-dom` ^7.10.1 |
| Vue 3 替代 | [`vue-router`](https://router.vuejs.org/) (官方) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | Vue 官方路由库，功能对等（路由守卫、懒加载、嵌套路由） |
| 迁移成本 | 中 — 路由配置需重写，但概念一一对应 |

概念对照：

| React Router | Vue Router |
|-------------|------------|
| `<BrowserRouter>` | `createRouter({ history: createWebHistory() })` |
| `<Routes>` / `<Route>` | `createRouter({ routes: [...] })` |
| `useNavigate()` | `useRouter().push()` |
| `useParams()` | `useRoute().params` |
| `<Link>` | `<router-link>` |
| 路由守卫 | `beforeEach` / `beforeResolve` |

---

### 2.4 Zustand → Pinia

| 项目 | 说明 |
|------|------|
| 当前依赖 | `zustand` ^5.0.10 |
| Vue 3 替代 | [`pinia`](https://pinia.vuejs.org/) (官方推荐) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | Vue 官方状态管理，替代 Vuex；支持 Composition API |
| 迁移成本 | 中 — 状态管理概念不同，需重写 store 定义 |

> Zustand 是 React Hook 驱动的，Vue 3 的响应式系统（ref/reactive）与 Pinia 深度集成，无法直接迁移。

概念对照：

| Zustand | Pinia |
|---------|-------|
| `create((set) => ...)` | `defineStore('name', () => { ... })` 或 Option 风格 |
| `useStore()` | `useStore()` （同名但导入不同） |
| `set({ count: count + 1 })` | `state.count++` （直接修改，或使用 `$patch`） |
| 无 action 概念 | `actions: { increment() {} }` |
| 无 getter 概念 | `getters: { double: (state) => state.count * 2 }` |

---

### 2.5 React Hook Form → VeeValidate / Vue Hook Form

| 项目 | 说明 |
|------|------|
| 当前依赖 | `react-hook-form` ^7.68.0, `@hookform/resolvers` ^5.2.2 |
| Vue 3 替代 | [`vee-validate`](https://vee-validate.logaretm.com/v4/) (推荐) 或 [`vue-hook-form`](https://github.com/blueplayer360/vue-hook-form) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | vee-validate 是 Vue 生态最成熟的表单验证库，支持 Zod 校验器（与当前 zod 依赖复用） |
| 迁移成本 | 中 — 表单验证逻辑可复用（Zod schema），但组件绑定方式需重写 |

> `@hookform/resolvers` 在 Vue 侧对应 `vee-validate` 内置的 `toTypedSchema`（来自 `@vee-validate/zod`）。

---

### 2.6 Recharts → ECharts / Vue ECharts

| 项目 | 说明 |
|------|------|
| 当前依赖 | `recharts` ^3.5.1 |
| Vue 3 替代 | [`echarts`](https://echarts.apache.org/) + [`vue-echarts`](https://github.com/ecomfe/vue-echarts) (推荐) 或 [`chart.js`](https://www.chartjs.org/) + [`vue-chartjs`](https://vue-chartjs.org/) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | ECharts 功能最全，vue-echarts 是官方推荐封装；Recharts 的声明式组件 API 在 ECharts 中无直接对应，需改用配置对象模式 |
| 迁移成本 | 高 — 图表配置需完全重写，API 范式不同 |

---

### 2.7 React DOM / React

| 项目 | 说明 |
|------|------|
| 当前依赖 | `react` ^19.2.1, `react-dom` ^19.2.1 |
| Vue 3 替代 | `vue` ^3.5+ (官方) |
| 兼容性 | ❌ 不兼容，需替换 |
| 替代方案 | Vue 3 核心库（`vue`）替代 React，Composition API 与 React Hooks 概念类似但语法不同 |
| 迁移成本 | 高 — 所有 `.tsx` 组件需改写为 `.vue` 单文件组件 |

---

### 2.8 其他 React 专属依赖

| 依赖 | 用途 | Vue 3 方案 |
|------|------|-------------|
| `react-horizontal-scrolling` ^0.1.13 | 横向滚动容器 | 用 CSS `overflow-x: auto` + 自定义指令或 Vue 组件重写 |
| `react-hook-form` 的依赖 | 表单处理 | 见 2.5 节 |
| `@testing-library/react` | 组件测试 | 替换为 `@testing-library/vue` |
| `@types/react`, `@types/react-dom` | React 类型定义 | 替换为 `@vue/runtime-core` 类型（内置） |

---

## 三、不确定性依赖（需进一步验证）

| 依赖 | 用途 | 问题 |
|------|------|------|
| `mxcad-app` ^1.0.45 | CAD 核心库 | 需确认是否绑定 React（检查是否依赖 React JSX/Hooks）。如绑定 React，需封装为 Web Component 或寻找 Vue 版本 |
| `webuploader` ^0.1.8 | 分块上传组件 | 需确认是否绑定 React。如不绑定（纯 JS），可直接复用；如绑定 React，需替换为 `vue-upload-component` 或类似库 |
| `openapi-client-axios` ^7.5.5 | OpenAPI 客户端生成 | 框架无关，但需确认生成代码是否包含 React 类型引用 |

---

## 四、替代方案总览

| React 依赖 | Vue 3 替代 | 官方/社区 | 成熟度 |
|------------|-----------|----------|--------|
| lucide-react | lucide-vue-next | 官方 | ⭐⭐⭐⭐⭐ |
| @radix-ui/react-* | radix-vue | 社区(官方推荐) | ⭐⭐⭐⭐ |
| react-router-dom | vue-router | Vue 官方 | ⭐⭐⭐⭐⭐ |
| zustand | pinia | Vue 官方推荐 | ⭐⭐⭐⭐⭐ |
| react-hook-form | vee-validate | 社区(主流) | ⭐⭐⭐⭐⭐ |
| recharts | vue-echarts (ECharts) | 社区(主流) | ⭐⭐⭐⭐⭐ |
| react / react-dom | vue | Vue 官方 | ⭐⭐⭐⭐⭐ |
| mxcad-app | 待验证 | — | ❓ |
| webuploader | 待验证 | — | ❓ |

---

## 五、结论与建议

1. **框架无关依赖**（axios、zod、tailwindcss、vite、spark-md5）可直接复用，零迁移成本。
2. **UI 组件库**（Radix UI → radix-vue，Lucide → lucide-vue-next）有成熟替代，迁移成本可控。
3. **核心框架依赖**（React → Vue，Router，状态管理，表单，图表）均需替换，是迁移的主要工作量。
4. **mxcad-app 和 webuploader** 需优先验证是否绑定 React，如绑定则影响迁移方案（可能需保留 React 微前端或改写为 Web Component）。
5. 建议迁移顺序：先验证 `mxcad-app` 和 `webuploader` 的框架绑定情况，再制定详细迁移计划。

---

*汇报人：CodeBuddy Code*
