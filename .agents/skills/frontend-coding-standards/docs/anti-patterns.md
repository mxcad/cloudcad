# 前端反模式清单

## 样式反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| `zIndex: 9999` | `zIndex: Z_LAYERS.MODAL` |
| `color: '#6366f1'` | `color: 'var(--primary-500)'` |
| `background: 'white'` | `background: 'var(--bg-primary)'` |
| `border: '1px solid #e2e8f0'` | `border: '1px solid var(--border-default)'` |
| `fontFamily: 'Inter, sans-serif'` | `fontFamily: 'var(--font-family-base)'` |
| Tailwind 原生色 `bg-white`, `text-gray-900` | 项目 Token `bg-primary`, `text-primary` |

## 组件反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 自己写 Modal/Table/Button | 复用 src/components/ui/ 已有组件 |
| 组件内定义组件（导致 re-mounting） | 组件顶层定义 |
| `div` 用于按钮/导航等语义元素 | 语义 HTML（button, nav, article 等） |
| 忽略 React keys | 列表必须提供稳定 key |
| 把 TypeScript 类型写在组件文件内 | 提取到独立 types 文件 |

## 状态管理反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 直接 mutate Zustand state | 使用 setter |
| Store 文件放错目录 | 放 src/stores/ |
| 不用 selector（导致过度 re-render） | 使用 selector 实现细粒度响应 |

## API 调用反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 前端本地定义 API 类型 | 使用 api-sdk 自动生成的类型 |
| 手动 `fetch('/api/xxx')` | 使用 SDK 生成的函数 |
| `any` 或 `as` 绕过类型检查 | 修复类型不匹配 |
| 不处理 loading/error 状态 | 所有 API 调用处理 loading + error |
| 手动编辑 `sdk.gen.ts` / `types.gen.ts` | 由 `generate:api-types` 生成 |

## 性能反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| render 中做重计算 | useMemo 包裹 |
| 不 memo 纯展示组件 | React.memo |
| 不清理 subscriptions / event listeners | useEffect return cleanup |
| 滥用 useCallback（简单函数不需要） | 只包裹传给子组件的回调 |
