# 移动端 — packages/frontend_mobile

Vue 3 + Vite 4 + vant + VoerkaI18n 移动 H5 版本，提供 CAD 编辑、图纸查看等功能。**轻量纳入前端地基**（对照 PC 前端 `packages/frontend`，但深度限定，见「关键规则」）。

## 结构（现实）

```
packages/frontend_mobile/
├── src/
│   ├── api-sdk/        # @cloudcad/api-sdk 桥接导出（index.ts）
│   ├── assets/         # 静态资源
│   ├── command/        # CAD 命令
│   ├── components/     # 全局组件
│   ├── composables/    # 组合式函数（useCooperate/useSave/useFileLoader 等）
│   ├── config/         # 配置（serverConfig/getConfig/uiConfig）
│   ├── languages/      # VoerkaI18n
│   ├── pages/          # 页面（<name>/index.vue + components/）
│   ├── plugins/        # Vue 插件（globalComponents/mxcad/vant）
│   ├── services/       # 业务服务（saveService/uploadService/extRefService 等）
│   ├── stores/         # Pinia store（collab/editor）
│   ├── styles/         # 全局样式
│   ├── test/           # 测试辅助（__mocks__/setup.ts）
│   ├── utils/          # 工具函数
│   ├── App.vue         # 根组件（始终渲染 Shell 壳模式）
│   ├── main.ts         # 入口
│   └── route.ts        # 路由定义（当前未通过 Vue Router 使用，仅声明）
```

- 入口是 `main.ts`（不是 `main.js`）
- `src/router/index.ts`（Vue Router 4，`createWebHashHistory`）：`/` 重定向到 `/shell`，Shell 渲染顶栏 + 编辑器根 + 子页覆盖层
- 壳模式始终启用——进入 App 即为壳（`http://localhost:7001/` 自动进入壳模式）
- `src/route.ts` 是遗留文件（未通过 Vue Router 使用），仅声明路由表，可忽略
- **无 CLAUDE.md**（本包轻量纳入，不建独立 AI 行为文档；本 AGENTS.md + `frontend-mobile-coding-standards` skill 足够）

## 关键命令

```bash
pnpm dev              # 启动开发服务器
pnpm build            # i18n compile → vite build
pnpm type-check       # vue-tsc --noEmit
pnpm test             # vitest run
pnpm i18nExtract      # 提取翻译（-D 模式）
pnpm i18nCompile      # 编译语言包
```

## 关键规则（四条）

### ① API 契约：走 @cloudcad/api-sdk，裸 fetch 豁免清单

- 一切后端 API 调用走 `@/api-sdk`（桥接 `@cloudcad/api-sdk` 生成函数），**禁止裸 fetch 调后端 API**
- 豁免仅限非后端 API 资源（同 PC 端清单，见 `frontend-coding-standards/docs/api-contracts.md`）
- `services/saveService.ts:61` savemxweb 收编以「直连 fetch 治理决策」ticket 185 决议为准（已列入执行队列）

### ② 状态管理归属边界

| 状态类型 | 归属 |
|----------|------|
| 业务域状态（协同 session、编辑器状态） | **Pinia store**（`src/stores/`，如 `collab.ts` / `editor.ts`） |
| 通用单例（初始化守卫、跨模块共享的锁/队列） | **模块级 ref 限定用途**（如 `useCooperate` 内的 `joiningLockRef`/`exitGuardRef`），不滥用 |
| 组件内状态 | 局部 `ref` / `reactive` |

- **禁止**把业务状态塞模块级变量（锁/守卫类单例外）
- 后端 server 数据通过 API 获取后由 Pinia 或局部状态持有，不手写全局 fetch 缓存

### ③ i18n 铁律（VoerkaI18n）

- 所有中文 UI 文本必须 `t("中文")` 包裹；`pnpm i18nExtract` → 补翻译 → `pnpm i18nCompile`
- 变量插值必须传第二参数：`t('剩余 {days} 天', { days: ... })`，**禁止 `.replace()` 手动替换**
- 自定义/非源码提取文本写入 `translates/messages/mxUIConfig.json`（`default.json` 会被 extract 覆盖，勿手动编辑）
- 语言列表：zh-CN（默认）/ en-US / zh-TW / ko-KR

### ④ 样式 token

- 颜色使用全局 CSS 变量（`--text-primary` / `--bg-elevated` / `--border-color` / `--font-size-body` / `--space-*`），**禁止硬编码色值**（`#333` / `white`）
- 移动端适配：px 由 postcss-pxtorem 自动转 rem；CSS 变量中的 px 不转换，变量值已定义为 rem

## 与 PC 端的关键差异

| 维度 | PC (frontend) | 移动端 (frontend_mobile) |
|------|--------------|------------------------|
| UI 框架 | React 19 + Radix UI | Vue 3 + vant |
| 状态管理 | Zustand / Context / react-query | Pinia + 模块级 ref（单例限定） |
| 构建工具 | Vite 5 | Vite 4 |
| TypeScript | 5.x | 4.x |
| i18n | VoerkaI18n | VoerkaI18n（同） |
| 计费功能 | ✅ 有 | ❌ 无（不包含计费/支付/会员/订单/退款） |
| 适配方式 | 响应式 | px→rem + lib-flexible |

## 移动端协同 SDK 行为

```
createWrok() → 创建 session → 自动加入（无需调 joinWork）
joinWork()   → 连接已有 session → SDK 自动加载文件
exitWrok()   → 断开连接 → 回退本地编辑
getWorks()   → 获取活跃 work 列表
init()       → 只需调用一次（模块级守卫）
```

**并发控制**：`joiningLockRef` 阻止并发 joinWork；`exitGuardRef` 退出后 3s 冷却期，防止 auto-join 干扰。

## 移动端 API 认证

`src/utils/apiConfig.ts` 的 `setupApiClient()` 配置 auth interceptor，从 `localStorage.getItem('accessToken')` 读取 token，注入 `Authorization: Bearer` header。

## 反模式

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 使用 Zustand（PC 做法） | Pinia / 模块级 ref（限定用途）/ 局部 ref |
| 业务状态塞模块级变量 | Pinia store |
| 裸 fetch 调后端 API | 走 `@/api-sdk` 生成函数 |
| 硬编码色值 | CSS 变量 |
| 不处理 i18n | 所有中文用 `t()` 包裹 |
| 直接调用 SDK `joinWork` | 使用 `useCooperate` 封装 |
| 忽略移动端适配 | 使用 rem 单位 + CSS 变量 |
| 弹窗不用 FloatingPopup | 继承 FloatingPopup 组件 |
| 底部按钮不用 footer slot | 放在 `<template #footer>` 中 |
