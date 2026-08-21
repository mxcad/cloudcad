# 前端反模式清单

## 样式反模式（ADR-0032）

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `zIndex: 9999` | `zIndex: Z_LAYERS.MODAL` |
| `color: '#6366f1'` | `color: 'var(--primary-500)'` |
| `background: 'white'` | `background: 'var(--bg-primary)'` |
| `border: '1px solid #e2e8f0'` | `border: '1px solid var(--border-default)'` |
| `fontFamily: 'Inter, sans-serif'` | `fontFamily: 'var(--font-family-base)'` |
| 使用已废弃的 `var(--color-*)` 变量 | 语义 token `var(--primary-*)` / `var(--bg-*)` / `var(--text-*)` |
| JS 模板字符串 CSS（`<style>${...}</style>`） | CSS Modules（`.module.css`）或组件内 `<style>` |
| 内联 style 写主题色（`style={{ color: '#333' }}`） | 变量 token；内联 style 仅限动态值 |
| 新增普通 `.css` 文件（非 token/base） | 组件样式用 `.module.css` |
| Tailwind 原生色 `bg-white`, `text-gray-900` | 项目 Token `bg-primary`, `text-primary` / 布局类 |

## 组件反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 自己写 Modal/Table/Button | 复用 src/components/ui/ 已有组件 |
| 组件内定义组件（导致 re-mounting） | 组件顶层定义 |
| `div` 用于按钮/导航等语义元素 | 语义 HTML（button, nav, article 等） |
| 忽略 React keys | 列表必须提供稳定 key |
| 把 TypeScript 类型写在组件文件内 | 提取到独立 types 文件 |
| 新增 400+ 行源码文件 | 按 ADR-0033 拆分（页面目录化 / hook 组合式） |

## 状态管理反模式（ADR-0030）

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 直接 mutate Zustand state | 使用 setter |
| Store 文件放错目录 | 放 src/stores/ |
| 不用 selector（导致过度 re-render） | 使用 selector 实现细粒度响应 |
| **模块级可变变量**（`let x` / 模块级 `Map` 缓存） | Zustand（`getState()`）/ react-query / 局部 state |
| server 状态手写 fetch+缓存布尔（塞 Zustand/Context） | react-query（`queryKeys` 工厂 + staleTime） |
| 组件私有状态塞全局 store | 局部 `useState` |

## API 调用反模式（ADR-0034）

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 前端本地定义 API 类型 | 使用 api-sdk 自动生成的类型 |
| 裸 `fetch('/api/xxx')` / `fetchWithAuth` / `EventSource` 调后端 API | 使用 SDK 生成的函数（豁免清单见 api-contracts.md） |
| `as Blob` 断言散落在下载调用方 | 收敛到 `utils/download.ts` 单点 |
| `any` 或 `as` 绕过类型检查 | 修复类型不匹配 |
| 不处理 loading/error 状态 | 所有 API 调用处理 loading + error |
| 手动编辑 `sdk.gen.ts` / `types.gen.ts` | 由 `generate:api-types` 生成 |

## 依赖/模块入口反模式（ADR-0028/0029）

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| L1（utils/constants/...）依赖 L2/L3（stores/contexts/pages） | 依赖方向只能向下：L3 → L2 → L1 |
| `components/ui/` 依赖业务（services/stores/contexts/hooks） | ui 纯净，只依赖 L1 |
| pages 互相 import | 走路由导航 |
| 深路径导入已有入口的模块（`services/mxcadManager/mxcadSave`） | 从模块目录入口导入（`services/mxcadManager`） |
| 跨目录导入私有 hook（`pages/A/hooks` 被 B 用） | 提升 `hooks/` 根共享 |
| 页面/组件目录重复实现共享逻辑 | 提升 `hooks/` 根共享 |
| 前端照搬后端「接口 + DI token + @Optional()」抽象 / 造注册表、插件系统 | 默认不抽象，配置优先（ADR-0031） |

## 性能反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| render 中做重计算 | useMemo 包裹 |
| 不 memo 纯展示组件 | React.memo |
| 不清理 subscriptions / event listeners | useEffect return cleanup |
| 滥用 useCallback（简单函数不需要） | 只包裹传给子组件的回调 |
