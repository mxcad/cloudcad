# E2E 测试

基于 Playwright，测试前端 UI 渲染和交互。

## 前提

前端 dev server 需在 `http://localhost:3000` 运行：

```bash
cd apps/frontend-vue
pnpm dev
```

后端 API 如需测试登录等接口，也需要启动：

```bash
cd apps/backend
pnpm dev
```

## 运行

```bash
# 无头模式（命令行）
pnpm test:e2e

# 有 UI 界面（可一步步调试）
pnpm test:e2e:ui

# 生成 HTML 报告后自动打开
npx playwright show-report e2e-report
```

## 当前覆盖

| 文件 | 测试 | 说明 |
|------|------|------|
| `cad-editor.spec.ts` | 5 | 欢迎面板渲染、按钮状态、直达文件 |
| `login.spec.ts` | 3 | 登录/注册页面渲染 |

## 扩展

新增测试文件放到 `e2e/` 目录下，`playwright.config.ts` 会自动扫描。
