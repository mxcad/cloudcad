# E2E 测试执行手册

> 面向测试工程师和 CI 配置人员：本文档涵盖 CloudCAD E2E 测试的完整执行流程、命令参考、并行策略和故障排查。
> 参考文档：AI_E2E_GUIDE.md（测试策略）、TEST_DATA_SETUP.md（数据准备）、playwright-standards.md（代码规范）

---

## 前置条件

### 运行环境

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| **Node.js** | 18+ | 运行时 |
| **pnpm** | 最新 | 包管理器（monorepo） |
| **PostgreSQL** | 15+ | 主数据库 |
| **Redis** | 7+ | 缓存／会话存储 |
| **SVN 服务** | 任意版本 | 版本控制后端 |
| **WebGL 支持** | — | CAD 编辑器渲染需要（CI 用 xvfb） |

### 服务启动

```bash
# 1. 启动基础设施（PostgreSQL, Redis, SVN）
# 2. 运行数据库迁移
pnpm prisma migrate deploy

# 3. 导入种子数据（参考 TEST_DATA_SETUP.md）
pnpm db:seed

# 4. 生成 storageState 文件（存放于 e2e/.auth/）
#    通过 Playwright setup 项目预登录各角色用户

# 5. 启动后端服务（端口 3001）
pnpm dev:backend

# 6. 启动前端服务（端口 3000）
#    playwright.config.ts 中 webServer 自动启动，若手动启动：
pnpm --filter frontend dev
```

### 环境变量

测试运行时通过 `packages/frontend/.env.test` 配置文件注入：

```
BASE_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

> **注意**：`playwright.config.ts` 中 `webServer.url` 和 `use.baseURL` 均为 `http://localhost:3000`，与项目默认端口一致。`.env.test` 由 `dotenv` 在配置加载时读取。

### 种子数据检查清单

参考 `TEST_DATA_SETUP.md` 完整说明，关键检查项：

- [ ] 系统角色用户已创建（ADMIN / USER_MANAGER / FONT_MANAGER / USER）
- [ ] 项目角色用户已创建（OWNER / ADMIN / MEMBER / EDITOR / VIEWER）
- [ ] 预建项目已就绪（`e2e-full-file-tree` / `e2e-empty-project` / `e2e-quota-full-project` / `e2e-multi-role-project`）
- [ ] 资源库种子数据已填充（图纸库 30+ 文件，图块库 5-10 个，字体库 3-5 个）
- [ ] 审计日志数据已预置
- [ ] 运行时配置数据已预置
- [ ] `storageState` 文件已生成至 `e2e/.auth/`（9 个 JSON 文件）
- [ ] 测试样本文件已放置于 `e2e/fixtures/`

---

## 执行命令

所有命令在 `packages/frontend` 目录下执行。

### 全部测试

```bash
cd packages/frontend
pnpm exec playwright test
```

Playwright 配置（`playwright.config.ts`）会自动：
- 启动前端开发服务器（`VITE_MSW=true pnpm --filter frontend dev`）
- 使用 Chromium（Desktop Chrome）浏览器
- 生成 HTML 报告至 `playwright-report/`

### 按业务域执行

使用 `--grep` 按 tag 筛选：

```bash
# 身份权限
pnpm exec playwright test --grep "@identity-auth"

# 图纸内容（注意：域内串行执行）
pnpm exec playwright test --grep "@drawing-content"

# 图纸组织
pnpm exec playwright test --grep "@drawing-organization"

# 资源库
pnpm exec playwright test --grep "@library"

# 系统管理
pnpm exec playwright test --grep "@system-admin"
```

### 调试模式

```bash
# 单步调试（逐步执行，可断点）
pnpm exec playwright test --debug

# UI 模式（可视化交互式运行）
pnpm exec playwright test --ui

# 有头模式（显示浏览器窗口）
pnpm exec playwright test --headed

# 组合使用
pnpm exec playwright test --headed --grep "@identity-auth"
```

### 单文件执行

```bash
# 按 spec 文件
pnpm exec playwright test spec/identity-auth.spec.ts
pnpm exec playwright test spec/drawing-content.spec.ts
pnpm exec playwright test spec/drawing-organization.spec.ts
pnpm exec playwright test spec/library.spec.ts
pnpm exec playwright test spec/system-admin.spec.ts

# 按测试用例名
pnpm exec playwright test -g "输入有效凭证 → 登录成功 → 跳转首页"
```

---

## 并行策略

### 配置来源

`playwright.config.ts` 中的关键配置：

```typescript
fullyParallel: true,                    // 全局并行
workers: process.env.CI ? 1 : undefined, // CI 单 worker，本地自动
```

### 域级并行

5 个业务域在独立 worker 中并行执行：

| 域 | Tag | 并行模式 | 说明 |
|----|-----|----------|------|
| 身份权限 | `@identity-auth` | 并行 | 无共享状态冲突 |
| 图纸内容 | `@drawing-content` | **串行** | WebGL 单实例限制 |
| 图纸组织 | `@drawing-organization` | 并行 | 无共享状态冲突 |
| 资源库 | `@library` | 并行 | 无共享状态冲突 |
| 系统管理 | `@system-admin` | 并行 | 无共享状态冲突 |

### 图纸内容域串行配置

在 `drawing-content.spec.ts` 文件级别设置：

```typescript
test.describe.configure({ mode: 'serial' });
```

原因：`mxcad-app`（CAD 引擎）创建自己的 Vue 3 + Vuetify 应用，WebGL 上下文全局单例，并行执行会导致渲染冲突。

### 推荐配置

| 环境 | workers | 说明 |
|------|---------|------|
| **CI** | 1 | `playwright.config.ts` 默认 |
| **本地开发** | 不限制（自动检测 CPU） | 默认 `undefined` |

---

## 报告

### HTML 报告

```bash
# 查看 HTML 报告
pnpm exec playwright show-report
```

报告路径：`playwright-report/index.html`

### 失败产物

| 产物 | 路径 | 触发条件 |
|------|------|----------|
| **截图** | `test-results/` | 仅失败时（`screenshot: 'only-on-failure'`） |
| **Trace** | `test-results/` | 首次重试失败时（`trace: 'on-first-retry'`） |
| **视频** | 未启用 | 需要时在配置中添加 |

### 查看 Trace

```bash
# 在浏览器中打开 trace 文件
npx playwright show-trace test-results/<test-name>/trace.zip

# 或在 playwright UI 中查看
pnpm exec playwright test --ui
```

---

## CI 集成

### GitHub Actions 示例

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: cloudcad_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Setup SVN
        run: |
          sudo apt-get update
          sudo apt-get install -y subversion xvfb

      - name: Run database migrations
        run: pnpm prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/cloudcad_test

      - name: Seed test data
        run: pnpm db:seed
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/cloudcad_test

      - name: Generate storage states
        run: pnpm exec playwright test --project=setup

      - name: Run E2E tests
        run: |
          cd packages/frontend
          npx playwright test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/cloudcad_test
          REDIS_URL: redis://localhost:6379

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: packages/frontend/playwright-report/
          retention-days: 30

      - name: Upload test results (screenshots)
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: packages/frontend/test-results/
          retention-days: 30
```

### CI 环境 WebGL 支持

CI 无显示器环境需要虚拟帧缓冲：

```bash
# 安装 xvfb
apt-get install -y xvfb

# 启动虚拟显示
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# 或以 headed 模式运行（需要 xvfb）
pnpm exec playwright test --headed
```

---

## 已知限制

| 限制 | 影响域 | 说明 | 应对方案 |
|------|--------|------|----------|
| **CAD 编辑器需要 WebGL** | 图纸内容 | CI 无头环境无 GPU，`<canvas>` 渲染依赖 WebGL 上下文 | 使用 `xvfb-run` 或 `--headed` 模式 |
| **外部参照测试需要关联文件** | 图纸内容 | 外部参照检测需要一对主文件+参照文件 | 确保 `e2e/fixtures/xref-main.dwg` 和 `xref-ref.dwg` 已就绪 |
| **微信登录无法自动化** | 身份权限 | 微信 OAuth 需要扫码，无法通过 Playwright 模拟 | 跳过微信登录用例，或使用 `test.skip()` 标记 |
| **短信/邮箱验证需要 mock** | 身份权限 | 注册、密码重置依赖外部验证服务 | 使用 MSW（`VITE_MSW=true`）mock 验证接口；或标记为 `@skip-ci` |
| **种子数据依赖** | 全部 | 部分测试需要预建项目、预建用户等数据 | 运行前执行 `pnpm db:seed`，确保 `storageState` 已生成 |
| **上传测试需要样本文件** | 图纸内容/图纸组织/资源库/字体库 | 文件上传测试依赖 `e2e/fixtures/` 中的真实文件 | 确保样本文件已放置到位 |
| **CI 单 worker** | 全部 | `playwright.config.ts` 配置 CI 环境为 1 worker | 本地测试可提高 workers 数量加速 |

---

## 故障排查

### 测试超时

**症状**：`Test timeout of 30000ms exceeded`

**排查**：
1. 检查后端服务是否正常响应（`curl http://localhost:3001/api/health`）
2. 检查数据库连接是否正常
3. 增加 `playwright.config.ts` 中的 `timeout` 配置

```typescript
// playwright.config.ts
export default defineConfig({
  timeout: 60 * 1000,           // 全局超时 60s
  expect: { timeout: 15 * 1000 }, // 断言超时 15s
});
```

### WebGL / 渲染问题

**症状**：CAD 编辑器不渲染或白屏

**排查**：
1. 确认 `VITE_MSW=true` 环境变量已设置
2. 确认浏览器支持 WebGL（访问 `chrome://gpu` 查看）
3. CI 环境确认 xvfb 已启动：`echo $DISPLAY` 应输出 `:99`
4. 尝试 `--headed` 模式：`pnpm exec playwright test --headed`

### storageState 缺失

**症状**：`Error: ENOENT: no such file or directory, open 'e2e/.auth/admin.json'`

**排查**：
1. 确认 `pnpm db:seed` 已运行
2. 运行 setup 项目生成 storageState：
   ```bash
   pnpm exec playwright test --project=setup
   ```
3. 检查 `e2e/.auth/` 目录下的 9 个 JSON 文件是否齐全

### 种子数据问题

**症状**：测试中找不到预建项目或用户

**排查**：
1. 确认 `pnpm prisma migrate deploy` 已运行
2. 确认 `pnpm db:seed` 已成功执行
3. 检查数据库连接字符串是否指向正确的实例
4. 手动验证数据：
   ```bash
   psql -U test -d cloudcad_test -c "SELECT name FROM \"Project\" WHERE name LIKE 'e2e-%';"
   ```

### 端口冲突

**症状**：`Error: Port 3000 is already in use`

**排查**：
1. 检查是否有残留进程：`lsof -i :3000` 或 `netstat -ano | findstr :3000`（Windows）
2. 杀死残留进程后重试
3. CI 中 `reuseExistingServer: !process.env.CI` 确保 CI 不使用已有服务

### 权限测试失败

**症状**：权限拒绝的测试用例未正确显示 NoPermissionPage

**排查**：
1. 确认 `storageState` 文件对应用户角色
2. 检查用户在后端的实际权限分配
3. 验证前端路由守卫是否正确配置

---

## 目录结构

```
packages/frontend/e2e/
├── guide/                          # 测试指南（AI 参考）
│   ├── AI_E2E_GUIDE.md            # 主入口 — 测试策略与业务域划分
│   ├── EXECUTION_RUNBOOK.md       # 本文件 — 执行手册
│   ├── TEST_DATA_SETUP.md         # 测试数据准备指南
│   ├── TEST_REPORT_TEMPLATE.md    # 测试报告模板
│   ├── conventions/
│   │   └── playwright-standards.md # Playwright 代码规范
│   ├── domains/                    # 按业务域划分的测试策略
│   │   ├── identity-auth.md
│   │   ├── drawing-content.md
│   │   ├── drawing-organization.md
│   │   ├── library.md
│   │   └── system-admin.md
│   └── templates/
│       ├── PLAN_TEMPLATE.md       # 测试计划模板
│       └── SPEC_TEMPLATE.md       # spec 文件模板
├── fixtures/                       # Playwright fixtures
│   ├── auth.fixture.ts
│   └── *.fixture.ts
├── pages/                          # Page Objects
│   ├── LoginPage.ts
│   └── *.ts
├── spec/                           # 测试文件
│   ├── identity-auth.spec.ts
│   ├── drawing-content.spec.ts
│   ├── drawing-organization.spec.ts
│   ├── library.spec.ts
│   └── system-admin.spec.ts
└── .auth/                          # storageState 文件
    ├── admin.json
    ├── user-manager.json
    ├── font-manager.json
    ├── user.json
    ├── project-owner.json
    ├── project-admin.json
    ├── project-member.json
    ├── project-editor.json
    └── project-viewer.json
```

---

## 相关文档

- [AI_E2E_GUIDE.md](./AI_E2E_GUIDE.md) — AI 生成测试的综合指南（工作流、业务域、权限矩阵）
- [TEST_DATA_SETUP.md](./TEST_DATA_SETUP.md) — 种子数据完整说明
- [playwright-standards.md](./conventions/playwright-standards.md) — Playwright 代码规范
- [TEST_REPORT_TEMPLATE.md](./TEST_REPORT_TEMPLATE.md) — 测试报告模板
- 各业务域测试策略：`domains/*.md`
