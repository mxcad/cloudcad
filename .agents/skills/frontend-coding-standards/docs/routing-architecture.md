# 路由架构

## 现实（现状）

路由在 `App.tsx` 中聚合（当前**无 `src/routes/` 目录**）：

- 页面用 `React.lazy(() => import('./pages/<Name>'))` 实现代码分割，`<Suspense>` 包裹
- `<Routes>` 在 App.tsx 中集中定义，按组套守卫：
  - **auth**（公开）：login, register, verify-*, forgot-password, reset-password, /device
  - **cad**（`CADEditorRouteGuard`）：/, /cad-editor, /cad-editor/:fileId
  - **main**（`ProtectedRoute` + Layout）：/projects, /personal-space, /profile, /shares
  - **admin**（`ProtectedRoute` + `PermissionRoute` + Layout）：/users, /roles, /font-library, /library, /audit-logs, /system-monitor, /billing, /runtime-config
- 守卫组件（`ProtectedRoute` / `PermissionRoute` / `CADEditorRouteGuard`）也定义在 App.tsx

## 原则

- 新增页面：只加 `const X = lazy(() => import('./pages/X'))` + 一行 `<Route>`，守卫/布局复用既有组
- 禁止在 App.tsx 内联堆砌大型路由逻辑（守卫、布局抽取为组件）
- 按域拆分到 `src/routes/*.routes.ts` 是既有演进目标（ADR-0028 依赖分层治理的一部分），当前未落地，勿按不存在的目录写代码

## 反模式

| ❌ | ✅ |
|----|-----|
| 新增页面时复制整段守卫/Layout 逻辑到新 Route | 复用 `ProtectedRoute` / `PermissionRoute` / 既有布局 |
| 在 App.tsx 中展开大型路由数组、内联 40+ 条 `<Route>` 再堆守卫 | 守卫抽组件、页面懒加载、保持 App.tsx 为薄聚合层 |
| 假设存在 `src/routes/` 目录并往里面写文件 | 路由定义写 App.tsx（当前现实），拆分是后续演进 |
