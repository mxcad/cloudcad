# AI E2E 测试指南 — 主入口

你是一名 CloudCAD 项目的 Playwright E2E 测试工程师。你的任务：读取本指南后，自动发现页面、生成测试计划、编写可执行的 `.spec.ts` 测试代码。

## 工作流程

### 阶段 1：生成测试计划

1. 阅读本文件了解全局设定
2. 按业务域加载 `domains/<domain>.md`，了解该域的路由、核心工作流、权限要求
3. 读取 `templates/PLAN_TEMPLATE.md` 了解计划格式
4. **可选：探索页面** — 如需确认交互元素细节，可以：
   - 读源码：`packages/frontend/src/pages/<PageName>/` 下的 `.tsx` 文件，提取 JSX 中的 button、input、select、modal、form 等交互元素
   - 启动 Playwright 做 DOM 快照：`page.goto('/route')` → `page.locator('...').count()` 确认元素存在
5. 为每个业务域生成一份 `domains/<domain>/PLAN.md` 测试计划，提交给用户审核
6. **等待用户审核确认后才能进入阶段 2**

### 阶段 2：生成测试代码

1. 审核通过后，逐域生成 `.spec.ts` 文件
2. 读取 `conventions/playwright-standards.md` 了解代码规范
3. 读取 `templates/SPEC_TEMPLATE.md` 了解 spec 文件结构
4. 参考 `packages/frontend/e2e/` 下现有的 `login.spec.ts`、`fixtures/`、`pages/` 作为示例
5. 新 spec 文件写入 `packages/frontend/e2e/spec/<domain>.spec.ts`
6. 新 Page Object 写入 `packages/frontend/e2e/pages/<PageName>.ts`
7. 新 fixture 写入 `packages/frontend/e2e/fixtures/<name>.fixture.ts`

## 业务域划分

对齐项目 CONTEXT.md 的限界上下文，测试按 5 个域组织：

| 域 | 文件 | 核心职责 |
|----|------|---------|
| 身份权限 | `domains/identity-auth.md` | 登录/注册/密码重置/角色权限/项目成员管理 |
| 图纸内容 | `domains/drawing-content.md` | 上传/转换/打开/编辑/保存/导出图纸 |
| 图纸组织 | `domains/drawing-organization.md` | 文件树 CRUD/移动复制/版本管理/存储配额 |
| 资源库 | `domains/library.md` | 图纸库/图块库/字体库 浏览管理 |
| 系统管理 | `domains/system-admin.md` | 用户管理/角色管理/审计日志/系统监控/运行时配置 |

## 目录结构

```
packages/frontend/e2e/
├── guide/                          # 本指南（AI 读取）
│   ├── AI_E2E_GUIDE.md            # 主入口 ← 本文件
│   ├── domains/                    # 按业务域划分的测试策略
│   │   ├── identity-auth.md
│   │   ├── drawing-content.md
│   │   ├── drawing-organization.md
│   │   ├── library.md
│   │   └── system-admin.md
│   ├── conventions/
│   │   └── playwright-standards.md # Playwright 代码规范
│   └── templates/
│       ├── PLAN_TEMPLATE.md       # 测试计划模板
│       └── SPEC_TEMPLATE.md       # spec 文件模板
├── fixtures/                       # Playwright fixtures
│   └── auth.fixture.ts            # 已有
├── pages/                          # Page Objects
│   └── LoginPage.ts               # 已有
├── spec/                           # 生成的测试文件
│   └── <domain>.spec.ts           # 按业务域组织
└── login.spec.ts                   # 已有（后续重构迁移到 spec/）
```

## 测试范围

**全部页面 + 核心工作流 + 交互全覆盖**。每个页面覆盖：

1. **基础交互**：点击、双击、右键菜单、hover 提示、键盘 Tab/Enter/Esc
2. **表单交互**：输入、清空、粘贴、校验失败、必填标记、密码显隐
3. **选择交互**：下拉框展开/选中/搜索、Radio、Checkbox、日期选择
4. **列表交互**：排序、筛选、分页、行选中、拖拽排序、无限滚动
5. **弹窗交互**：打开/关闭（X/遮罩/Esc）、确认/取消、表单提交
6. **状态交互**：加载中（Spinner/Skeleton）、空状态、错误状态、成功反馈（Toast）
7. **边界条件**：超长文本截断、大量数据分页、并发操作、快速连续点击

## CAD 编辑器测试策略

**mxcad-app 是黑盒**，不测试 `<canvas>` 内的 CAD 引擎交互（画线、缩放、实体操作）。

只测试编辑器外围 React DOM：
- 编辑器容器是否渲染（`#mx-cad-container` 存在）
- 工具栏按钮（保存、另存为、导出、撤销、重做）可见性与点击
- "另存为"弹窗（目标类型选择、搜索目标项目、确认保存）
- "导出"弹窗（格式选择 DWG/DXF/PDF、下载触发）
- 保存后 Toast 提示
- 外部参照弹窗（缺失参照列表、上传替换）
- 未保存修改提示（切换/关闭图纸时的确认弹窗）

## 权限测试策略

指南内嵌显式角色矩阵（取自 `packages/backend/src/common/enums/permissions.enum.ts`）：

### 系统角色 × 页面访问

| 系统角色 | 用户管理 | 角色管理 | 审计日志 | 系统监控 | 运行时配置 | 字体库 |
|---------|---------|---------|---------|---------|----------|-------|
| ADMIN | CRUD | CRUD | 查看 | 查看 | 读写 | 完整 |
| USER_MANAGER | CRUD | CRUD | - | - | - | - |
| FONT_MANAGER | - | - | - | - | - | 完整 |
| USER | - | - | - | - | - | - |

### 项目角色 × 文件操作

| 项目角色 | 创建 | 上传 | 打开 | 编辑 | 删除 | 下载 | 移动 | 复制 | 保存 | 外参 | 版本 |
|---------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MEMBER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| EDITOR | - | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| VIEWER | - | - | ✅ | - | - | ✅ | - | - | - | - | ✅ |

测试策略：每个域用 OWNER（最高权限）测全功能，VIEWER 测权限拒绝，中间角色选代表性权限交叉验证。

## 执行策略

- **按业务域并行**：5 个域各自独立 worker 并行跑
- **CAD 相关串行**：图纸内容域 spec 设为 `fullyParallel: false`（WebGL 单实例限制）
- 域内串行（Playwright 默认 `fullyParallel: false` 在 `test.describe` 级别）

## 测试数据（种子数据）

需预先准备（引用后端 seed 脚本，不嵌入指南明文凭据）：

- **多角色用户**：至少 ADMIN/USER_MANAGER/FONT_MANAGER/USER（系统角色）+ OWNER/ADMIN/MEMBER/EDITOR/VIEWER（项目角色）
- **预建项目**：含文件树（dwg/mxweb 文件），支持上传/打开/编辑/保存/导出/移动/复制全流程测试
- **资源库种子**：图纸库和图块库各预置少量文件
- **storageState**：用 `playwright.config.ts` 的 `globalSetup` 预登录各角色，保存到 `e2e/.auth/` 目录

指南只描述种子数据**意图**，不嵌入实际凭据。AI 生成测试时提示用户确保种子数据已就绪。

## 报告输出

- **Playwright HTML Reporter**：`playwright.config.ts` 配置 `reporter: [['html', { outputFolder: 'playwright-report' }]]`
- **Markdown 摘要**：AI 运行完测试后，按业务域生成一份 `TEST_REPORT.md`，包含通过率、失败用例截图路径、CAD 专项结果

## CI 集成前提

CI 环境需满足：
- PostgreSQL 15 + Redis 7
- 后端服务启动（`pnpm dev:backend`）
- 前端服务启动（`pnpm dev:frontend`）
- `pnpm db:seed` 运行种子数据
- `BASE_URL` 环境变量指向前端地址

## 领域术语（对齐 CONTEXT.md）

| 术语 | 英文 | 含义 |
|------|------|------|
| 图纸 | Drawing | CAD 文件，mxweb 格式 |
| 文件节点 | FileNode | 文件树中的组织单元 |
| 项目 | Project | 文件组织基本单位 |
| 私人空间 | Personal Space | 用户专属项目 |
| 资源库 | Library | 公共图纸库/图块库 |
| 另存为 | Save As | 保存到其他位置 |
| 外部参照 | External Reference | CAD 外部引用文件 |
