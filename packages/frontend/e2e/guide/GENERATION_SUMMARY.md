# CloudCAD E2E 测试生成总结

> **生成日期:** 2026-05-10  
> **生成工具:** Claude Code (Anthropic Sonnet 4.6 + Agent 工作流)  
> **目标项目:** CloudCAD — 基于 Web 的 CAD 协作平台  

---

## 生成概况

| 指标 | 数值 |
|------|------|
| 生成文件总数 | ~50 |
| Spec 文件 | 7（新增）+ 1（已有 login.spec.ts） |
| Page Object 文件 | 19 |
| Fixture 文件 | 3（1 已有 + 2 新增） |
| 测试计划文档 | 6 |
| 规划测试用例 | **706** |
| 业务域覆盖 | 5 |
| 覆盖页面数 | 25 |

---

## 生成的文件清单

### 1. Spec 文件（测试规格）

共 **8** 个 spec 文件，其中 `login.spec.ts` 为既有文件，其余 7 个为本次生成：

| # | 文件名 | 路径 | 业务域 | 执行模式 | 描述 |
|---|--------|------|--------|----------|------|
| 1 | `identity-auth.spec.ts` | `spec/` | 身份认证 | parallel | 登录/注册/个人资料/成员管理 |
| 2 | `auth-verification.spec.ts` | `spec/` | 身份认证 | parallel | 重置密码/邮箱验证/手机验证 |
| 3 | `drawing-content.spec.ts` | `spec/` | 图纸内容 | **serial** | CAD 编辑器/仪表盘 |
| 4 | `drawing-organization.spec.ts` | `spec/` | 图纸组织 | parallel | 文件树/批量操作/权限 |
| 5 | `library.spec.ts` | `spec/` | 资源库 | parallel | 图纸库/图块库/字体库 |
| 6 | `system-admin.spec.ts` | `spec/` | 系统管理 | parallel | 用户/角色/审计/监控/配置 |
| 7 | `project-members.spec.ts` | `spec/` | 项目管理 | parallel | 项目成员弹窗/角色弹窗 |
| 8 | `login.spec.ts` | `e2e/` | 身份认证 | parallel | 既有登录测试 |

### 2. Page Object 文件

共 **19** 个 Page Object，评分依据选择器语义化质量（5 分制）：

| # | 文件名 | 路径 | 对应页面/组件 | 评分 | 备注 |
|---|--------|------|--------------|------|------|
| 1 | `LoginPage.ts` | `pages/` | 登录页 | 4/5 | |
| 2 | `RegisterPage.ts` | `pages/` | 注册页 | 4/5 | |
| 3 | `ForgotPasswordPage.ts` | `pages/` | 忘记密码页 | 4/5 | |
| 4 | `ProfilePage.ts` | `pages/` | 个人资料页 | 3/5 | |
| 5 | `MembersModalPage.ts` | `pages/` | 成员管理弹窗 | 4/5 | |
| 6 | `CADEditorPage.ts` | `pages/` | CAD 编辑器 | 4/5 | WebGL 黑盒策略 |
| 7 | `SaveAsModalPage.ts` | `pages/` | 另存为弹窗 | 4/5 | |
| 8 | `DownloadFormatModalPage.ts` | `pages/` | 下载格式弹窗 | 4/5 | |
| 9 | `ExternalReferenceModalPage.ts` | `pages/` | 外部参照弹窗 | **5/5** ★ | 最佳选择器 |
| 10 | `DashboardPage.ts` | `pages/` | 仪表盘 | 4/5 | |
| 11 | `FileSystemPage.ts` | `pages/` | 文件系统 | 4/5 | |
| 12 | `LibraryPage.ts` | `pages/` | 图纸库 + 图块库 | 4/5 | |
| 13 | `FontLibraryPage.ts` | `pages/` | 字体库 | 3/5 | 重复定义已修复 |
| 14 | `UserManagementPage.ts` | `pages/` | 用户管理 | 4/5 | |
| 15 | `RoleManagementPage.ts` | `pages/` | 角色管理 | 4/5 | |
| 16 | `SystemMonitorPage.ts` | `pages/` | 系统监控 | **2/5** ⚠ | 需改进 |
| 17 | `AuditLogPage.ts` | `pages/` | 审计日志 | 4/5 | |
| 18 | `RuntimeConfigPage.ts` | `pages/` | 运行时配置 | **2/5** ⚠ | 需改进 |
| 19 | `SystemAdminPage.ts` | `pages/` | 系统管理总览 | 4/5 | |

### 3. Fixture 文件

| # | 文件名 | 路径 | 类型 | 用途 |
|---|--------|------|------|------|
| 1 | `auth.fixture.ts` | `fixtures/` | 认证 fixture | 用户登录状态注入（已有） |
| 2 | `multi-role.fixture.ts` | `fixtures/` | 多角色 fixture | 9 角色权限矩阵切换 |
| 3 | `project.fixture.ts` | `fixtures/` | 项目 fixture | 项目上下文注入 |

### 4. 测试计划文档

| # | 文件名 | 路径 | P0 | P1 | P2 | 总计 | 业务域 |
|---|--------|------|-----|-----|-----|------|--------|
| 1 | `PLAN.md` | `guide/domains/identity-auth/` | 64 | 88 | 43 | **195** | 身份认证 |
| 2 | `PLAN.md` | `guide/domains/drawing-content/` | 30 | 46 | 10 | **86** | 图纸内容 |
| 3 | `PLAN.md` | `guide/domains/drawing-organization/` | 21 | 56 | 37 | **114** | 图纸组织 |
| 4 | `PLAN.md` | `guide/domains/library/` | — | — | — | **68** | 图纸库/图块库 |
| 5 | `PLAN_FONT_LIBRARY.md` | `guide/domains/library/` | — | — | — | **56** | 字体库 |
| 6 | `PLAN.md` | `guide/domains/system-admin/` | 72 | 92 | 23 | **187** | 系统管理 |

### 5. 指导文档

| # | 文件名 | 路径 | 描述 |
|---|--------|------|------|
| 1 | `AI_E2E_GUIDE.md` | `guide/` | AI 生成 E2E 测试的完整指南（既有） |
| 2 | `TEST_DATA_SETUP.md` | `guide/` | 种子数据准备指南 |
| 3 | `EXECUTION_RUNBOOK.md` | `guide/` | 测试执行操作手册 |
| 4 | `TEST_REPORT_TEMPLATE.md` | `guide/` | 测试报告模板 |
| 5 | `GENERATION_SUMMARY.md` | `guide/` | 本文档 — 生成总结 |
| 6 | `PLAN_TEMPLATE.md` | `guide/templates/` | 测试计划模板 |

---

## 测试覆盖总览

### 按业务域统计

| 域 | 页面数 | 计划 P0 | 计划 P1 | 计划 P2 | 计划总计 | Spec 文件 |
|----|--------|---------|---------|---------|----------|-----------|
| identity-auth | 8 | 64 | 88 | 43 | **195** | identity-auth.spec.ts + auth-verification.spec.ts |
| drawing-content | 2 | 30 | 46 | 10 | **86** | drawing-content.spec.ts |
| drawing-organization | 5 | 21 | 56 | 37 | **114** | drawing-organization.spec.ts |
| library | 4 | — | — | — | **124** | library.spec.ts |
| system-admin | 6 | 72 | 92 | 23 | **187** | system-admin.spec.ts |
| project-members | — | — | — | — | — | project-members.spec.ts |
| **合计** | **25** | | | | **706** | **8** |

> **注:** library 域包含图纸库(68) + 字体库(56)，PLAN 中未按 P0/P1/P2 细分。  
> **注:** project-members 包含在 identity-auth 域 PLAN 中，单独拆出 spec 文件。

### 各域覆盖详情

#### identity-auth（身份认证）— 195 用例

- **登录页面:** 正常登录、错误处理、记住我、OAuth 入口、速率限制
- **注册页面:** 表单验证、邮箱注册、手机注册、邀请链接注册
- **忘记密码:** 邮箱重置、手机重置、令牌过期、新密码验证
- **个人资料:** 查看/编辑资料、修改密码、头像上传、账号绑定
- **成员管理:** 邀请成员、移除成员、批量导入、搜索筛选
- **邮箱/手机验证:** 发送验证码、验证码校验、过期处理、重发限制

#### drawing-content（图纸内容）— 86 用例

- **CAD 编辑器:** 打开图纸、缩放/平移、图层切换、绘图工具、撤销/重做
- **保存/另存为:** 保存、另存为 DWG/DXF/PDF、文件命名验证
- **下载:** 多格式下载（DWG, DXF, PDF, PNG, SVG）
- **外部参照:** 附着参照、拆离、路径更新、缺失提示
- **工作台:** 最近文件、收藏夹、搜索、缩略图加载

#### drawing-organization（图纸组织）— 114 用例

- **文件树:** 展开/折叠、右键菜单、拖拽移动、多选、搜索
- **文件夹操作:** 新建、重命名、删除（含非空）、移动、复制
- **权限管理:** 项目级权限分配、继承、覆盖、权限预览
- **批量操作:** 批量删除、批量移动、批量下载、批量授权
- **版本控制:** 查看历史、版本对比、回滚、分支切换

#### library（资源库）— 124 用例

- **图纸库:** 浏览、搜索、分类筛选、上传、预览、引用
- **块库:** 创建块、编辑块、删除块、导入/导出、块属性编辑
- **字体库:** 上传字体、字体预览、字体替换、缺失字体提示、系统字体同步

#### system-admin（系统管理）— 187 用例

- **用户管理:** 创建用户、编辑用户、禁用/启用、删除、批量导入、搜索
- **角色管理:** 创建角色、编辑权限、删除角色、权限矩阵验证
- **审计日志:** 日志搜索、日期筛选、操作类型筛选、导出日志
- **系统监控:** 服务状态、资源使用率、在线用户、异常告警
- **运行时配置:** 查看配置项、修改配置、配置回滚、敏感项脱敏

### 角色权限覆盖矩阵

9 角色 × 5 域的权限交叉覆盖：

| 角色 | 级别 | 类型 | Fixture Key |
|------|------|------|-------------|
| SuperAdmin | 系统 | 内置 | `superAdmin` |
| SysAdmin | 系统 | 自定义 | `sysAdmin` |
| AuditViewer | 系统 | 自定义 | `auditViewer` |
| MonitorViewer | 系统 | 自定义 | `monitorViewer` |
| ProjectOwner | 项目 | 隐式 | `projectOwner` |
| ProjectEditor | 项目 | 自定义 | `projectEditor` |
| ProjectViewer | 项目 | 自定义 | `projectViewer` |
| ProjectUploader | 项目 | 自定义 | `projectUploader` |
| Guest | 项目 | 匿名 | — |

---

## 关键设计决策

### 1. CAD 编辑器串行执行

`drawing-content.spec.ts` 使用 `test.describe.serial` 模式，因为：
- CAD 编辑器使用 WebGL 渲染，浏览器仅支持单实例
- Canvas/WebGL 上下文不可并行共享
- 串行执行确保每次测试前 WebGL 上下文干净

### 2. Canvas/WebGL 黑盒测试策略

CAD 编辑器测试策略：
- **不**直接操作 Canvas 像素或 WebGL 上下文
- 通过 UI 交互（工具栏按钮、快捷键、菜单）触发操作
- 验证方式：
  - 命令历史变化
  - 文件状态变化（dirty flag）
  - 工具激活状态
  - Toast/通知消息
  - 属性面板数值变化
  - API 请求/响应断言

### 3. 选择器优先级策略

严格按优先级使用选择器：

```
1. getByRole()       → 最优先（语义化，无障碍友好）
2. getByLabel()      → 表单字段
3. getByPlaceholder() → 输入框
4. getByText()       → 文本内容
5. getByTestId()     → 兜底（data-testid）
```

当前 Page Object 中约 **60%** 使用语义选择器。

### 4. Page Object 设计模式

- 每个页面/弹窗独立 Page Object
- 暴露高层操作方法（而非底层 DOM 操作）
- 通过 `locator` getter 暴露定位器供断言使用
- 弹窗类 Page Object 包含 `open()` / `close()` / `isVisible()` 方法
- Spec 文件只调用 Page Object 方法，不直接操作 locator

### 5. 按业务域并行执行

Playwright 配置按业务域分 shard：
- `spec/identity-auth.spec.ts` ─┐
- `spec/auth-verification.spec.ts` ─┤
- `spec/drawing-organization.spec.ts` ─┤ 并行
- `spec/library.spec.ts` ─┤
- `spec/system-admin.spec.ts` ─┤
- `spec/project-members.spec.ts` ─┘
- `spec/drawing-content.spec.ts` ── 串行（独立 worker）

CI 建议 workers 数 = 域数 (5) + 缓冲 (1) = 6

### 6. 多角色 Fixture 设计

`multi-role.fixture.ts` 提供 9 种角色的 storageState 切换：
- 每个角色对应一个 `*.auth.json` 文件
- 测试通过 `test.use({ storageState: '...' })` 切换身份
- 避免每个 spec 重复登录

---

## 审查发现

### Page Object 选择器质量评估

| 评级 | 数量 | 占比 | 文件 |
|------|------|------|------|
| ★★★★★ (优秀) | 1 | 5% | ExternalReferenceModalPage |
| ★★★★ (良好) | 13 | 68% | LoginPage, RegisterPage, ForgotPasswordPage, MembersModalPage, CADEditorPage, SaveAsModalPage, DownloadFormatModalPage, DashboardPage, FileSystemPage, LibraryPage, UserManagementPage, RoleManagementPage, AuditLogPage, SystemAdminPage |
| ★★★ (合格) | 3 | 16% | ProfilePage, FontLibraryPage |
| ★★ (需改进) | 2 | 11% | RuntimeConfigPage, SystemMonitorPage |

**整体语义选择器占比: ~60%** — 达标但仍有提升空间。

### 主要发现

1. **ExternalReferenceModalPage 评分最高 (5/5):** 全部使用 `getByRole` / `getByLabel` 语义选择器，结构清晰，方法命名直观，是其他 Page Object 的参考标准。

2. **RuntimeConfigPage 需改进 (2/5):** 依赖较多 `getByTestId`，缺少语义标签，建议与前端协作添加 aria-label。

3. **SystemMonitorPage 需改进 (2/5):** 监控面板内容动态渲染，选择器稳定性不足，建议添加 data-testid 锚点。

4. **FontLibraryPage 重复定义已修复:** 初版与 LibraryPage 存在方法重复，已重构为独立 Page Object。

### 已知技术债务

- ⚠️ `RuntimeConfigPage` 和 `SystemMonitorPage` 仍依赖较多 `data-testid`，需后续添加 ARIA 属性
- ⚠️ CAD 画布操作缺乏可靠的断言手段（WebGL 限制），覆盖深度受限
- ⚠️ 部分 Modal 缺少 `aria-label` 或 `aria-labelledby`，影响 `getByRole('dialog')` 定位精度

---

## 待办事项（用户需完成）

### 审核与确认
- [ ] 审核各域 `PLAN.md` 并确认测试范围（P0/P1/P2 优先级划分）
- [ ] 确认 9 角色权限矩阵是否与当前 RBAC 实现一致
- [ ] 审核 Page Object 选择器，确认与实际页面 DOM 匹配

### 种子数据准备
- [ ] 按 `TEST_DATA_SETUP.md` 初始化数据库种子数据
- [ ] 创建测试用户及对应角色：
  - `superadmin@test.com` / `sysadmin@test.com`
  - `auditviewer@test.com` / `monitorviewer@test.com`
  - `projectowner@test.com` / `projecteditor@test.com`
  - `projectviewer@test.com` / `projectuploader@test.com`
- [ ] 创建测试项目及文件夹结构
- [ ] 上传测试文件（sample.dwg, sample.dxf）

### storageState 文件
- [ ] 为每种角色创建 `e2e/.auth/*.json` 文件：
  - `.auth/superadmin.json`
  - `.auth/sysadmin.json`
  - `.auth/auditviewer.json`
  - `.auth/monitorviewer.json`
  - `.auth/projectowner.json`
  - `.auth/projecteditor.json`
  - `.auth/projectviewer.json`
  - `.auth/projectuploader.json`
  - `.auth/guest.json`

### 测试资源文件
- [ ] 准备 `sample.dwg` — CAD 图纸测试文件（放置于 `e2e/fixtures/files/`）
- [ ] 准备 `sample.dxf` — DXF 格式测试文件
- [ ] 准备 `sample.ttf` — 字体文件（用于字体库测试）
- [ ] 准备 `sample_block.dwg` — 图块测试文件
- [ ] 准备外部参照关联文件 pair（xref_host.dwg + xref_ref.dwg）

### CI 环境配置
- [ ] CI Pipeline 配置 PostgreSQL 15 服务容器
- [ ] CI Pipeline 配置 Redis 7 服务容器
- [ ] CI Pipeline 配置 SVN 服务容器
- [ ] CI Pipeline 安装 `xvfb`（虚拟显示，WebGL 需要）
- [ ] CI Pipeline 安装 Playwright 浏览器及系统依赖
- [ ] 配置 `playwright.config.ts` 中的 CI WebSocket 地址

### 测试执行
- [ ] 首次全量运行：`pnpm exec playwright test --config=e2e/playwright.config.ts`
- [ ] 验证 `drawing-content.spec.ts` 串行模式正常
- [ ] 验证 9 角色 storageState 切换正常
- [ ] 审查首次测试报告，修复失败用例

---

## 已知限制

### 技术限制

| 限制 | 影响域 | 说明 | 缓解措施 |
|------|--------|------|----------|
| 微信登录无法自动化 | identity-auth | 微信 OAuth 需扫码/回调，无法在 E2E 中模拟 | 使用 mock API 或跳过微信登录场景 |
| 短信/邮箱验证 | auth-verification | 外部服务不可控 | 使用 mock 服务或预置验证码 |
| WebGL 依赖 | drawing-content | CI 无 GPU，需 xvfb 软件渲染 | 配置 xvfb + 降低渲染期望 |
| Canvas 不可靠截图 | drawing-content | WebGL Canvas 截图可能为空/黑屏 | 不依赖 Canvas 截图断言 |
| 外部参照测试 | drawing-content | 需要关联文件 pair | 种子数据预创建关联 |
| SVN 依赖 | drawing-organization | 版本对比需真实 SVN 仓库 | 使用测试专用 SVN repo |

### 测试设计限制

| 限制 | 说明 |
|------|------|
| 种子数据预加载 | 部分测试依赖特定数据库状态，需按 `TEST_DATA_SETUP.md` 准备 |
| 角色权限组合 | 706 个用例覆盖 9 种角色 × 25 页面的子集，未穷举所有组合 |
| CAD 功能黑盒 | 无法直接验证图形操作结果（如线条坐标），仅验证 UI 状态 |
| 时间敏感操作 | 审计日志、监控面板等依赖实时数据，可能受测试执行顺序影响 |

---

## 文件结构总览

```
packages/frontend/e2e/
├── login.spec.ts                          # 既有登录 spec
├── spec/                                  # 本次生成的 spec 文件
│   ├── identity-auth.spec.ts              # 身份认证
│   ├── auth-verification.spec.ts          # 验证流程
│   ├── drawing-content.spec.ts            # CAD 编辑器 + 仪表盘 (serial)
│   ├── drawing-organization.spec.ts       # 文件树 + 批量操作 + 权限
│   ├── library.spec.ts                    # 图纸库 + 图块库 + 字体库
│   ├── system-admin.spec.ts              # 系统管理
│   └── project-members.spec.ts           # 项目成员弹窗
├── pages/                                 # Page Object 模型
│   ├── LoginPage.ts
│   ├── RegisterPage.ts
│   ├── ForgotPasswordPage.ts
│   ├── ProfilePage.ts
│   ├── MembersModalPage.ts
│   ├── CADEditorPage.ts
│   ├── SaveAsModalPage.ts
│   ├── DownloadFormatModalPage.ts
│   ├── ExternalReferenceModalPage.ts
│   ├── DashboardPage.ts
│   ├── FileSystemPage.ts
│   ├── LibraryPage.ts
│   ├── FontLibraryPage.ts
│   ├── UserManagementPage.ts
│   ├── RoleManagementPage.ts
│   ├── SystemMonitorPage.ts
│   ├── AuditLogPage.ts
│   ├── RuntimeConfigPage.ts
│   └── SystemAdminPage.ts
├── fixtures/                              # 测试 fixtures
│   ├── auth.fixture.ts                    # 认证 fixture (既有)
│   ├── multi-role.fixture.ts              # 多角色 fixture (新增)
│   └── project.fixture.ts                 # 项目上下文 fixture (新增)
└── guide/                                 # 指导文档
    ├── AI_E2E_GUIDE.md                    # 完整 E2E 指南 (既有)
    ├── TEST_DATA_SETUP.md                 # 种子数据准备指南
    ├── EXECUTION_RUNBOOK.md               # 测试执行操作手册
    ├── TEST_REPORT_TEMPLATE.md            # 测试报告模板
    ├── GENERATION_SUMMARY.md              # 本文档
    ├── conventions/                       # 编码规范
    ├── domains/                           # 各域测试计划
    │   ├── identity-auth/PLAN.md          # 195 tests
    │   ├── drawing-content/PLAN.md        # 86 tests
    │   ├── drawing-organization/PLAN.md   # 114 tests
    │   ├── library/PLAN.md                # 68 tests
    │   ├── library/PLAN_FONT_LIBRARY.md   # 56 tests
    │   └── system-admin/PLAN.md           # 187 tests
    └── templates/
        └── PLAN_TEMPLATE.md
```

---

## 下一步行动建议

1. **立即:** 审核 `system-admin/PLAN.md`（187 用例，用例最多），确认 P0 范围
2. **短期:** 准备种子数据和 storageState 文件，解除执行阻塞
3. **中期:** 提升 Page Object 语义选择器覆盖率至 80%
4. **长期:** 补充性能测试和可访问性测试

---

> **文档版本:** v2.0  
> **最后更新:** 2026-05-10  
> **维护者:** CloudCAD 前端团队 / Claude Code Agent
