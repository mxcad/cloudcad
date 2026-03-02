# IFLOW.md - CloudCAD 项目核心工作规则

> **遵守即任务成功，违反即任务失败**

---

## 1. 元约束（Meta Constraints）
> 违反任意一条即视为任务失败，无任何修复机会

- **100% 中文回复**（zh-CN，简体，技术术语可保留英文）
- **100% 通过基础安全检查**（无恶意代码、无敏感数据泄露）
- **100% 遵循编程规范与工程原则**（SOLID、KISS、DRY、YAGNI）
- **100% 使用 pnpm**（禁止使用 npm 或 yarn）
- **100% PowerShell 语法**（Windows 环境，命令必须符合 PowerShell 规范）
- **100% 使用 Express**（后端 NestJS 开发使用 Express 平台）
- **100% 禁止 any 类型**（TypeScript 严格模式，代码质量检查必须通过）
- **100% 禁止创建一个快速测试来验证修复**
- **100% API 类型安全**（后端 Swagger 定义 ↔ 前端类型自动生成，禁止手动维护 API 类型）

---

## 2. 核心身份与行为准则

### 2.1 身份定义

- **名称**：心流 CLI（iFlow CLI）
- **角色**：专业软件工程助手
- **目标**：安全、高效地协助完成软件开发任务

### 2.2 行为准则

| 准则           | 说明                             |
| -------------- | -------------------------------- |
| **技术优先**   | 优先考虑技术准确性，而非迎合用户 |
| **不猜测**     | 仅回答基于事实的信息，不进行推测 |
| **保持一致**   | 不轻易改变已设定的行为模式       |
| **承认局限**   | 在不确定时主动承认局限性         |
| **尊重上下文** | 尊重用户提供的所有上下文信息     |
| **专注执行**   | 专注于解决问题，而非解释过程     |

### 2.3 沟通原则

| 原则         | 要求                           |
| ------------ | ------------------------------ |
| **语气**     | 专业、直接、简洁               |
| **格式**     | 使用 Markdown 格式化响应       |
| **语言**     | 与用户保持一致（中文为主）     |
| **避免**     | 表情符号、对话式填充语、客套话 |
| **代码引用** | 使用反引号或特定格式           |
| **命令说明** | 执行前说明目的和原因           |

### 2.4 执行原则

- 复杂任务必须使用 TODO 列表规划
- 遵循「理解 → 计划 → 执行 → 验证」开发循环
- 优先探索（read_file-only scan），而非立即行动
- 尽可能并行化独立的信息收集操作
- 一次只将一个任务标记为「进行中」
- 完成任务后，进行清理工作

---

## 3. 项目概览

### 3.1 项目定位

CloudCAD 是一个基于 **NestJS + React** 的现代化云端 CAD 图纸管理平台，采用 **monorepo** 架构，专为 B2B 私有部署设计。

### 3.2 核心架构

- **前后端分离**：NestJS 后端 + React 前端
- **Monorepo 结构**：使用 pnpm workspace 管理多包
- **RBAC 权限控制**：基于角色的细粒度权限系统
- **本地文件存储**：基于文件系统的存储架构，支持智能目录分配
- **多级缓存**：权限缓存、角色缓存、Redis 缓存
- **分片上传**：支持大文件分片上传和断点续传
- **SVN 版本控制**：集成 SVN 版本控制工具，支持图纸版本管理
- **策略引擎**：Policy Engine 权限策略管理

### 3.3 技术栈

**后端**：NestJS 11.0.1, TypeScript 5.7.3, Express 5.2.1, Prisma 7.1.0, PostgreSQL 15+, Redis 5.10.0

**前端**：React 19.2.1, TypeScript ~5.8.2, Vite 6.2.0, React Router DOM 7.10.1, Tailwind CSS 4.1.18

**环境要求**：Node.js >= 20.19.5, pnpm >= 9.15.4

### 3.4 项目结构

```
cloudcad/
├── packages/
│   ├── backend/              # NestJS 后端服务
│   ├── frontend/             # React 前端应用（cloudcad-manager）
│   ├── mxcadassembly/        # MxCAD 转换工具
│   └── svnVersionTool/       # SVN 版本控制工具包
├── docs/                     # 项目文档
│   └── tasks/                # 任务跟踪文档
├── scripts/                  # 构建脚本
├── documents/                # 分层文档
│   ├── shared/               # 共享文档
│   ├── backend/              # 后端文档
│   │   ├── core/             # 核心模块文档
│   │   └── modules/          # 功能模块文档
│   └── frontend/             # 前端文档
│       ├── components/       # 组件文档
│       └── hooks/            # Hooks 文档
├── .iflow/                   # iFlow 配置
│   ├── agents/               # 专用代理（code-architect, code-explorer, code-reviewer）
│   ├── commands/             # 自定义命令（feature-dev, start）
│   └── skills/               # 技能集（code-concise, layered-context, ui-ux-pro-max, file-planner）
├── svn-repo/                 # SVN 仓库
├── filesData/                # 文件数据存储
├── temp/                     # 临时文件
└── uploads/                  # 上传文件
```

---

## 4. 模块结构

### 4.1 共享文档（Shared）

| 文档 | 描述 | 详细文档 |
|------|------|---------|
| 系统架构 | 系统架构概览 | [architecture.md](documents/shared/architecture.md) |
| 常量配置 | 环境变量和配置 | [constants.md](documents/shared/constants.md) |
| 开发规范 | 编程规范和开发指南 | [guidelines.md](documents/shared/guidelines.md) |

### 4.2 后端核心模块（Backend Core）

| 模块 | 描述 | 详细文档 |
|------|------|---------|
| 认证系统 | JWT 双 Token + Session 支持 | [auth.md](documents/backend/core/auth.md) |
| 权限系统 | RBAC 权限控制 + 多级缓存 + 策略引擎 | [permissions.md](documents/backend/core/permissions.md) |
| 缓存系统 | 多级缓存架构 | [cache.md](documents/backend/core/cache.md) |
| 存储管理 | 本地存储 + 智能目录分配 | [storage.md](documents/backend/core/storage.md) |
| 数据库架构 | Prisma ORM + PostgreSQL | [database.md](documents/backend/core/database.md) |

### 4.3 后端功能模块（Backend Modules）

| 模块 | 描述 | 详细文档 |
|------|------|---------|
| 文件系统 | 统一树形结构管理 | [file-system.md](documents/backend/modules/file-system.md) |
| MxCAD 转换 | CAD 图纸上传和转换 | [mxcad.md](documents/backend/modules/mxcad.md) |
| 图库管理 | 图纸库和图块库管理 | [gallery.md](documents/backend/modules/gallery.md) |
| 字体管理 | 字体库管理 | [fonts.md](documents/backend/modules/fonts.md) |
| 审计日志 | 操作审计和追踪 | [audit.md](documents/backend/modules/audit.md) |
| 健康检查 | 系统健康监控 | [health.md](documents/backend/modules/health.md) |
| 版本控制 | SVN 版本控制集成 | [version-control.md](documents/backend/modules/version-control.md) |
| 策略引擎 | 权限策略管理 | [policy-engine.md](documents/backend/modules/policy-engine.md) |

### 4.4 前端组件（Frontend Components）

| 组件 | 描述 | 详细文档 |
|------|------|---------|
| 文件系统管理器 | 文件和文件夹管理界面 | [file-system-manager.md](documents/frontend/components/file-system-manager.md) |
| 模态框组件 | 各种操作对话框 | [modals.md](documents/frontend/components/modals.md) |
| 权限组件 | 权限分配和管理 | [permission.md](documents/frontend/components/permission.md) |
| 管理员组件 | 系统管理功能 | [admin.md](documents/frontend/components/admin.md) |

### 4.5 前端 Hooks（Frontend Hooks）

| Hook | 描述 | 详细文档 |
|------|------|---------|
| 文件系统 Hooks | 文件系统操作封装 | [file-system-hooks.md](documents/frontend/hooks/file-system-hooks.md) |
| 权限 Hooks | 权限检查和管理 | [permission-hooks.md](documents/frontend/hooks/permission-hooks.md) |
| MxCAD Hooks | CAD 编辑器功能封装 | [mxcad-hooks.md](documents/frontend/hooks/mxcad-hooks.md) |

### 4.6 工具包（Tool Packages）

| 包名 | 描述 | 详细文档 |
|------|------|---------|
| svnVersionTool | SVN 版本控制工具包 | [README.md](packages/svnVersionTool/README.md) |

### 4.7 前端 API 服务（Frontend API Services）

| 服务 | 描述 |
|------|------|
| apiClient | Axios 封装，支持 Token 自动刷新、响应解包 |
| authApi | 认证相关 API |
| usersApi | 用户管理 API |
| projectsApi | 项目管理 API |
| filesApi | 文件系统 API |
| trashApi | 回收站 API |
| adminApi | 管理员 API |
| fontsApi | 字体管理 API |
| rolesApi | 角色管理 API |
| mxcadApi | MxCAD 转换 API |
| galleryApi | 图库管理 API |
| tagsApi | 标签管理 API |
| versionControlApi | 版本控制 API |
| auditApi | 审计日志 API |
| cacheApi | 缓存管理 API |
| healthApi | 健康检查 API |

---

## 5. 开发命令

### 5.1 根目录命令

```powershell
pnpm install                           # 安装所有依赖
pnpm dev                               # 启动所有服务
pnpm build                             # 构建所有包
pnpm lint                              # ESLint 检查
pnpm lint:fix                          # ESLint 修复
pnpm format                            # Prettier 格式化
pnpm format:check                      # Prettier 检查
pnpm check                             # 完整检查（lint + format:check + type-check）
pnpm check:fix                         # 检查并自动修复
pnpm type-check                        # TypeScript 类型检查
pnpm clean                             # 清理构建产物
pnpm backend:dev                       # 仅启动后端
pnpm backend:build                     # 构建后端
pnpm backend:start                     # 启动后端生产服务
pnpm backend:verify                    # 后端完整验证
pnpm frontend:verify                   # 前端完整验证（cloudcad-manager）
pnpm generate:frontend-permissions     # 生成前端权限常量
```

### 5.2 后端命令（packages/backend）

```powershell
pnpm dev                               # 启动基础设施 + 后端
pnpm dev:infra                         # 启动基础设施（PostgreSQL, Redis, pgAdmin, redis-commander）
pnpm dev:infra:stop                    # 停止基础设施
pnpm cooperate                         # 启动协作服务
pnpm start:dev                         # 仅后端（热重载）
pnpm build                             # 构建项目
pnpm start                             # 启动生产服务器
pnpm start:prod                        # 启动生产服务器（别名）
pnpm test                              # 运行所有测试
pnpm test:watch                        # 监听模式运行测试
pnpm test:cov                          # 测试覆盖率
pnpm test:unit                         # 单元测试
pnpm test:integration                  # 集成测试
pnpm test:e2e                          # E2E 测试
pnpm test:ci                           # CI 测试
pnpm test:permission                   # 权限测试
pnpm test:permission:scenarios         # 权限场景测试
pnpm test:permission:full              # 完整权限测试
pnpm db:generate                       # 生成 Prisma Client
pnpm db:push                           # 推送数据库架构
pnpm db:migrate                        # 运行数据库迁移
pnpm db:studio                         # 打开 Prisma Studio
pnpm db:seed                           # 执行种子数据
pnpm migrate:storage-paths             # 迁移存储路径
pnpm docker:build                      # 构建 Docker 镜像
pnpm docker:up                         # 启动 Docker Compose
pnpm docker:down                       # 停止 Docker Compose
pnpm docker:logs                       # 查看 Docker 日志
pnpm deploy:prod                       # 部署到生产环境
pnpm deploy:stop                       # 停止生产部署
pnpm lint                              # ESLint 检查
pnpm lint:fix                          # ESLint 修复
pnpm format                            # Prettier 格式化
pnpm format:check                      # Prettier 检查
pnpm check                             # 完整检查
pnpm check:fix                         # 检查并自动修复
pnpm type-check                        # TypeScript 类型检查
pnpm verify                            # 完整验证（check:fix + test + build）
```

### 5.3 前端命令（packages/frontend）

```powershell
pnpm dev                               # 启动开发服务器
pnpm build                             # 构建生产版本
pnpm preview                           # 预览生产版本
pnpm test                              # 运行测试
pnpm test:watch                        # 监听模式运行测试
pnpm test:ui                           # 打开 Vitest UI 界面
pnpm test:coverage                     # 覆盖率报告
pnpm lint                              # ESLint 检查
pnpm lint:fix                          # ESLint 修复
pnpm format                            # Prettier 格式化
pnpm format:check                      # Prettier 检查
pnpm check                             # 完整检查（lint + format:check）
pnpm check:fix                         # 检查并自动修复
pnpm type-check                        # TypeScript 类型检查（构建时执行）
pnpm generate:types                    # 生成 API 类型
pnpm verify                            # 完整验证（check + test + build）
```

### 5.4 SVN 版本工具命令（packages/svnVersionTool）

```powershell
pnpm test                              # 运行测试
```

---

## 6. 环境配置

### 6.1 后端环境变量（packages/backend/.env）

主要配置项：

**应用配置**：PORT, NODE_ENV
**JWT 配置**：JWT_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN
**数据库配置**：DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
**Redis 配置**：REDIS_HOST, REDIS_PORT, REDIS_DB
**本地存储配置**：FILES_DATA_PATH, FILES_NODE_LIMIT, STORAGE_CLEANUP_DELAY_DAYS
**磁盘监控配置**：DISK_WARNING_THRESHOLD, DISK_CRITICAL_THRESHOLD
**MxCAD 配置**：MXCAD_ASSEMBLY_PATH, MXCAD_UPLOAD_PATH, MXCAD_TEMP_PATH
**字体管理配置**：MXCAD_FONTS_PATH, FRONTEND_FONTS_PATH
**邮件服务配置**：MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS
**前端地址**：FRONTEND_URL

详细信息请参考：[constants.md](documents/shared/constants.md)

### 6.2 前端环境变量（packages/frontend/.env.local）

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_APP_NAME=CloudCAD
```

---

## 7. 核心功能

### 7.1 用户认证系统

JWT 双 Token + RBAC 权限控制 + 邮箱验证 + 登录后跳转回原页面

详细信息请参考：[auth.md](documents/backend/core/auth.md)

### 7.2 权限系统

基于角色的细粒度权限控制，支持系统权限和项目权限，多级缓存优化，策略引擎支持

详细信息请参考：[permissions.md](documents/backend/core/permissions.md)

### 7.3 文件系统

统一的树形结构管理，支持分片上传、文件去重、外部参照跟踪、回收站功能

详细信息请参考：[file-system.md](documents/backend/modules/file-system.md)

### 7.4 存储管理

本地文件系统存储，智能目录分配，磁盘监控，自动清理

详细信息请参考：[storage.md](documents/backend/core/storage.md)

### 7.5 MxCAD 转换服务

CAD 图纸分片上传、断点续传、自动转换

详细信息请参考：[mxcad.md](documents/backend/modules/mxcad.md)

### 7.6 图库管理

图纸库和图块库管理，支持分类浏览、筛选

详细信息请参考：[gallery.md](documents/backend/modules/gallery.md)

### 7.7 字体管理

字体库管理，支持上传、删除、下载

详细信息请参考：[fonts.md](documents/backend/modules/fonts.md)

### 7.8 审计日志

完整的操作审计系统，记录用户行为和系统操作

详细信息请参考：[audit.md](documents/backend/modules/audit.md)

### 7.9 系统监控

实时监控系统健康状态，包括数据库和存储服务

详细信息请参考：[health.md](documents/backend/modules/health.md)

### 7.10 缓存系统

多级缓存架构，支持权限缓存、角色缓存、Redis 缓存

详细信息请参考：[cache.md](documents/backend/core/cache.md)

### 7.11 SVN 版本控制

集成 SVN 版本控制工具，整个系统使用统一的 SVN 仓库，按项目目录隔离，支持图纸版本管理、检出、提交、历史查看等操作

详细信息请参考：[version-control.md](documents/backend/modules/version-control.md)

### 7.12 策略引擎

权限策略引擎，支持动态权限策略配置和评估

详细信息请参考：[policy-engine.md](documents/backend/modules/policy-engine.md)

---

## 8. API 架构

### 8.1 全局响应格式

**后端统一响应结构**：

```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "data": {
    /* 实际返回的 DTO 数据 */
  },
  "timestamp": "2025-12-29T03:34:55.801Z"
}
```

**前端自动解包**：API Service 自动解包响应数据，前端直接使用 `response.data`

### 8.2 API 端点概览

| 模块 | 路由 | 功能 |
|------|------|------|
| 认证 | `/api/auth/*` | 登录、注册、刷新令牌、邮箱验证、密码重置 |
| 用户 | `/api/users/*` | 用户信息、个人资料更新 |
| 管理员 | `/api/admin/*` | 用户管理、角色管理 |
| 文件系统 | `/api/file-system/*` | 项目、文件夹、文件的 CRUD |
| 项目 | `/api/projects/*` | 项目管理 |
| 图库 | `/api/gallery/*` | 图库管理（图纸库、图块库） |
| 标签 | `/api/tags/*` | 标签管理 |
| 字体管理 | `/api/font-management/*` | 字体上传、删除、下载、列表查询 |
| 审计日志 | `/api/audit/*` | 审计日志查询、统计、清理 |
| 健康检查 | `/api/health/*` | 服务状态监控 |
| 版本控制 | `/api/version-control/*` | SVN 版本控制操作 |
| MxCAD | `/api/mxcad/*` | CAD 文件上传、转换、缩略图 |
| API 文档 | `/api/docs` | Swagger UI |

---

## 9. 前端开发指南

### 9.1 组件开发

组件文档请参考：
- [file-system-manager.md](documents/frontend/components/file-system-manager.md)
- [modals.md](documents/frontend/components/modals.md)
- [permission.md](documents/frontend/components/permission.md)
- [admin.md](documents/frontend/components/admin.md)

### 9.2 Hooks 开发

Hooks 文档请参考：
- [file-system-hooks.md](documents/frontend/hooks/file-system-hooks.md)
- [permission-hooks.md](documents/frontend/hooks/permission-hooks.md)
- [mxcad-hooks.md](documents/frontend/hooks/mxcad-hooks.md)

### 9.3 页面开发

| 页面 | 路径 | 说明 |
|------|------|------|
| FileSystemManager | `/` | 文件系统管理器 |
| Gallery | `/gallery` | 图库页面 |
| FontLibrary | `/fonts` | 字体库页面 |
| AuditLogPage | `/audit` | 审计日志页面 |
| SystemMonitorPage | `/monitor` | 系统监控页面 |
| RoleManagement | `/roles` | 角色管理页面 |
| UserManagement | `/users` | 用户管理页面 |
| CADEditorDirect | `/cad-editor` | CAD 编辑器页面 |
| Profile | `/profile` | 个人资料页面 |
| Login | `/login` | 登录页面 |
| Register | `/register` | 注册页面 |
| EmailVerification | `/verify-email` | 邮箱验证页面 |
| ForgotPassword | `/forgot-password` | 忘记密码页面 |
| ResetPassword | `/reset-password` | 重置密码页面 |

---

## 10. 开发最佳实践

### 10.1 后端开发

| 实践 | 说明 |
|------|------|
| 模块化架构 | 遵循 NestJS 模块化设计 |
| 依赖注入 | 使用 NestJS 依赖注入 |
| DTO 验证 | 使用 class-validator 进行输入验证 |
| 异常处理 | 使用全局异常过滤器 |
| 使用 Express | 必须使用 @nestjs/platform-express |
| 测试覆盖 | 确保核心业务逻辑有充分的测试覆盖 |
| 装饰器使用 | 使用 @Req() 装饰器注入 Request 对象 |
| **权限检查架构** | **必须在 Controller 层通过 Guard + 装饰器完成，禁止在 Service 层检查权限** |
| 权限控制 | 使用 @RequirePermissions() 装饰器 |
| 项目权限 | 使用 @RequireProjectPermission() 装饰器 |
| 策略引擎 | 使用 PolicyEngineService 进行权限策略评估 |

### 10.2 前端开发

| 实践 | 说明 |
|------|------|
| 统一 API 调用 | 通过统一的 API 接口层（services/*.ts） |
| 类型安全 | 使用 openapi-typescript 生成的类型定义 |
| 组件设计 | 遵循单一职责原则 |
| 状态管理 | 使用 React Context + useReducer 或 Zustand |
| 错误处理 | 统一错误处理，提供友好的错误提示 |
| UI 组件库 | 使用 Radix UI + Tailwind CSS |
| 测试优先 | 新功能开发前先编写测试用例 |
| 参数规范 | MxCAD 接口统一使用 nodeId 参数 |
| 表单验证 | 使用 React Hook Form + Zod 进行表单验证 |
| 路由管理 | 使用 React Router 的 location.state 实现重定向 |
| 权限控制 | 使用 usePermission Hook 检查用户权限 |
| 项目权限 | 使用 useProjectPermission Hook 检查项目权限 |
| 权限分配 | 使用 PermissionAssignment 组件进行权限配置 |

### 10.3 数据库开发

| 实践 | 说明 |
|------|------|
| Prisma Client | 所有数据库操作必须通过 Prisma Client |
| 迁移管理 | 使用 Prisma Migrate 管理数据库架构变更 |
| 事务处理 | 多表操作使用 $transaction |
| 软删除 | 使用 deletedAt 字段标记删除 |

### 10.4 工具包开发

| 实践 | 说明 |
|------|------|
| SVN 工具 | 使用 @cloudcad/svn-version-tool 进行版本控制操作 |
| TypeScript 支持 | 工具包提供完整的 TypeScript 类型定义 |
| 回调模式 | 支持 Node.js 风格的回调函数 |
| 错误处理 | 统一的错误处理机制 |

### 10.5 常见失误与规避

#### 10.5.1 Prisma 原生 SQL 查询列名问题

**失误**：使用 `$queryRaw` 执行原生 SQL 时，使用蛇形命名（如 `parent_id`）而非数据库实际列名。

**后果**：PostgreSQL 报错 `column "xxx" does not exist`，导致服务启动失败或权限检查异常。

**规避**：
- 优先使用 Prisma ORM 方法（`findMany`、`findFirst` 等），避免列名映射问题
- 如必须使用原生 SQL，先用 Prisma Studio 或 `\d table_name` 确认实际列名
- Prisma schema 中的驼峰命名（`parentId`）在数据库中可能是蛇形命名（`parent_id`），需确认

#### 10.5.2 Prisma 单条操作 vs 批量操作

**失误**：使用 `delete()` 或 `update()` 操作可能不存在的记录。

**后果**：记录不存在时抛出 P2025 错误，Prisma 会打印 `prisma:error` 日志。

**规避**：
- 删除操作：使用 `deleteMany()` 替代 `delete()`，记录不存在时静默返回
- 更新操作：使用 `updateMany()` 替代 `update()`，或在业务逻辑中先检查存在性
- 示例：`await prisma.cacheEntry.deleteMany({ where: { key } })`

#### 10.5.3 缓存错误结果

**失误**：异常处理中返回空结果并缓存，导致后续请求持续返回错误数据。

**后果**：权限检查等关键逻辑因缓存空结果而失效，用户无法正常使用系统。

**规避**：
- 异常时不缓存返回值，让下次请求重新尝试
- 使用 `forceRefresh` 方法在关键初始化时强制刷新缓存
- 区分"无数据"和"查询失败"两种情况

#### 10.5.4 日志级别选择

**失误**：关键调试信息使用 `debug` 级别，默认不显示，排查问题困难。

**后果**：问题发生时无法快速定位原因，需要修改代码重新部署。

**规避**：
- 权限检查、缓存状态等关键路径使用 `log` 或 `warn` 级别
- 生产环境可通过 `DEBUG` 环境变量控制详细日志
- 临时调试完成后及时调整日志级别

#### 10.5.5 权限检查架构错误（严重）

**失误**：在 Service 层进行权限检查，而不是通过 Guard + 装饰器在 Controller 层统一处理。

**错误示例**：
```typescript
// ❌ 错误：Service 层检查权限
@Injectable()
export class FileSystemService {
  async getNodeChildren(nodeId: string, userId: string) {
    // 权限检查散落在业务逻辑中
    const hasPermission = await this.checkNodeAccess(nodeId, userId);
    if (!hasPermission) {
      throw new ForbiddenException('没有权限');
    }
    // 业务逻辑...
  }
}
```

**后果**：
- **维护困难**：权限逻辑散落在各处，没有集中管理
- **重复代码**：多个 Controller 调用同一个 Service 时需要重复检查
- **违反单一职责**：Service 应该只关心业务逻辑，不应该关心权限
- **架构混乱**：无法一眼看出哪些接口需要哪些权限

**正确做法**：
```typescript
// ✅ 正确：Controller 层使用装饰器
@Controller('file-system')
export class FileSystemController {
  @Get(':nodeId/children')
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)  // 集中声明权限
  async getNodeChildren(@Param('nodeId') nodeId: string) {
    // Service 只执行业务逻辑，不关心权限
    return this.fileSystemService.getNodeChildren(nodeId);
  }
}

@Injectable()
export class FileSystemService {
  async getNodeChildren(nodeId: string) {
    // 纯业务逻辑，不检查权限
    return this.prisma.fileSystemNode.findMany({...});
  }
}
```

**规避**：
- **所有权限检查必须在 Controller 层通过装饰器完成**
- **Service 层只接收已验证的用户ID，不检查权限**
- **使用 @RequirePermissions() 或 @RequireProjectPermission() 装饰器**
- **配合 @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard) 使用**

**架构原则**：
```
请求 → Controller → Guard（权限检查）→ Service（业务逻辑）
            ↑
       @RequireProjectPermission()
```

---

## 11. 测试架构

### 11.1 前端测试

| 配置 | 说明 |
|------|------|
| 测试框架 | Vitest 4.0.16 |
| 测试环境 | jsdom 27.3.0 / happy-dom 20.0.11 |
| 组件测试 | @testing-library/react 16.3.1 |
| 用户交互 | @testing-library/user-event 14.6.1 |
| 断言增强 | @testing-library/jest-dom 6.9.1 |

### 11.2 后端测试

| 测试类型 | 说明 |
|---------|------|
| 单元测试 | 测试独立函数和类方法 |
| 集成测试 | 测试 API 端点和业务流程 |
| E2E 测试 | 测试完整用户场景 |
| 权限测试 | 专门的权限系统测试 |

### 11.3 覆盖率要求

| 类型 | 要求 |
|------|------|
| 新增代码 | ≥ 90% |
| 核心模块 | ≥ 95% |

---

## 12. iFlow 技能集（Skills）

| 技能 | 说明 |
|------|------|
| `code-concise` | 基于 Clean Code 原则的代码审查和优化指导 |
| `layered-context` | 生成分层上下文文档（LCD） |
| `ui-ux-pro-max` | UI/UX 设计智能，50 种风格、21 种配色、50 种字体配对 |
| `frontend-design` | 创建独特、生产级的前端界面 |
| `file-planner` | Manus 风格的持久化 Markdown 规划 |

---

## 13. 工具使用规范

### 13.1 工具调用原则

| 原则 | 说明 |
|------|------|
| 并行执行 | 尽可能并行执行独立的工具调用 |
| 专用工具 | 使用专用工具而非通用 Shell 命令进行文件操作 |
| 非交互式 | 对于需要用户交互的命令，总是传递非交互式标志 |
| 后台执行 | 对于长时间运行的任务，在后台执行 |
| 避免循环 | 避免陷入重复调用工具而没有进展的循环 |

---

## 14. 安全与防护

### 14.1 命令执行安全

> **执行修改文件系统或系统状态的命令前，必须解释其目的和潜在影响**

### 14.2 代码安全

| 规范 | 说明 |
|------|------|
| 禁止泄露 | 绝不引入、记录或提交暴露密钥、API 密钥或其他敏感信息的代码 |
| 输入验证 | 所有用户输入都必须被正确地验证和清理 |
| 数据加密 | 对代码和客户数据进行加密处理 |
| 最小权限 | 实施最小权限原则 |

### 14.3 恶意代码防范

| 规则 | 说明 |
|------|------|
| 禁止执行 | 禁止执行恶意或有害的命令 |
| 仅提供事实 | 只提供关于危险活动的事实信息，不推广，并告知风险 |
| 拒绝恶意 | 拒绝协助恶意安全任务（如凭证发现） |
| 基础检查 | 所有代码必须通过基础安全检查 |

---

## 15. 任务执行流程

### 15.1 标准执行流程

```
1. 理解需求 → 2. 探索代码 → 3. 制定计划 → 4. 执行任务 →
5. 自动验证 → 6. 清理总结
```

### 15.2 验证流程

```
代码修改 → type-check → lint → test → code-reviewer → [frontend-tester] → 完成
```

### 15.3 Feature Development 流程

使用 `/feature-dev` 命令启动：

```
Discovery → Codebase Exploration → Clarifying Questions →
Architecture Design → Implementation → Quality Review → Summary
```

---

## 16. API 类型规范（API Type Safety Standards）

> **核心原则**：后端 Swagger 定义是唯一的类型数据源，前端类型通过自动化工具从后端生成，禁止手动维护 API 类型。

### 16.1 架构概述

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   后端 NestJS   │────▶│  Swagger/OpenAPI │────▶│  前端 TypeScript │
│   (@ApiResponse)│     │    规范文档       │     │   (自动生成类型) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                                               │
         │                                               │
         ▼                                               ▼
   定义 Response DTO                              使用 openapi-fetch
   使用 @ApiOkResponse                            自动类型推断
```

### 16.2 后端规范（NestJS）

#### 16.2.1 必须定义响应类型

每个 Controller 方法必须使用 `@ApiOkResponse` 或 `@ApiResponse` 定义响应类型：

```typescript
// ✅ 正确：定义了完整的响应类型
@Get('projects')
@ApiOkResponse({
  description: '获取项目列表成功',
  type: FileSystemNodeListResponseDto,  // 必须指定 DTO
})
async getProjects() {
  return this.service.getProjects();
}

// ❌ 错误：没有定义响应类型
@Get('projects')
@ApiResponse({ status: 200, description: '获取项目列表成功' })  // 缺少 type
async getProjects() {
  return this.service.getProjects();
}
```

#### 16.2.2 Response DTO 定义

所有 API 响应必须使用 DTO 定义，禁止使用原始类型：

```typescript
// ✅ 正确：使用 DTO 定义响应结构
export class FileSystemNodeDto {
  @ApiProperty({ description: '节点ID' })
  id: string;

  @ApiProperty({ description: '节点名称' })
  name: string;

  @ApiProperty({ description: '是否是文件夹' })
  isFolder: boolean;
  
  // ... 其他字段
}

export class FileSystemNodeListResponseDto {
  @ApiProperty({ description: '数据列表', type: [FileSystemNodeDto] })
  data: FileSystemNodeDto[];

  @ApiProperty({ description: '分页元数据' })
  meta: PaginationMetaDto;
}

// ❌ 错误：返回原始类型或 any
@Get('projects')
async getProjects(): Promise<any> {  // 禁止使用 any
  return this.service.getProjects();
}
```

#### 16.2.3 统一响应格式

后端统一使用 `{ code, message, data }` 格式，通过全局拦截器自动包装：

```typescript
// 全局响应拦截器会自动包装
{
  code: 'SUCCESS',
  message: '操作成功',
  data: { /* 实际的 DTO 数据 */ }
}
```

### 16.3 前端规范（TypeScript + React）

#### 16.3.1 类型生成

运行 `pnpm generate:types` 从后端 Swagger 自动生成类型：

```bash
# 前端目录下执行
pnpm generate:types

# 这会生成 types/api.ts，包含所有 API 的类型定义
```

#### 16.3.2 使用 openapi-fetch（强烈推荐 ✅）

使用 `openapi-fetch` 作为 API 客户端，**类型完全自动推断，无需手动指定**：

```typescript
import createClient from 'openapi-fetch';
import type { paths } from '../types/api';

const client = createClient<paths>({ baseUrl: API_BASE_URL });

// ✅ 正确：调用 API - 类型完全自动推断，无需手动指定泛型
const { data, error } = await client.GET('/file-system/projects');
// data 自动为 FileSystemNode[] 类型，无需导入或定义

// ✅ 正确：带路径参数 - 类型自动检查
const { data } = await client.GET('/file-system/nodes/{nodeId}', {
  params: { 
    path: { nodeId: '123' },  // TypeScript 自动检查 nodeId 必须是 string
    query: { page: 1 }        // TypeScript 自动检查查询参数类型
  },
});

// ❌ 错误：不需要也不能手动指定泛型
const { data } = await client.GET<FileSystemNode[]>('/file-system/projects');  // 错误！
```

**关键优势**：
- 无需导入任何类型
- 无需指定泛型
- 路径、参数、响应全部自动推断
- 后端 Swagger 变更后，重新生成类型即可，前端代码无需修改

#### 16.3.3 兼容 axios 的方案（过渡方案 ⚠️）

**仅在无法迁移到 openapi-fetch 时使用，新项目必须使用 openapi-fetch**

当前项目使用 axios 封装的 `apiClient`，类型通过手动定义接口实现：

```typescript
// services/tagsApi.ts 示例
export interface Tag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  isSystem: boolean;
}

export const tagsApi = {
  list: () => apiClient.get<Tag[]>('/tags'),
  create: (params: CreateTagParams) => apiClient.post<Tag>('/tags', params),
};
```

**⚠️ 重要限制**：axios 方案需要手动维护类型定义，增加了维护成本。

**绝对禁止**：
- 在前端手动定义 API 类型与后端不一致
- 使用 `any` 类型绕过类型检查

### 16.4 工作流程

#### 16.4.1 新增 API 的标准流程

1. **后端开发**：
   - 创建 Request/Response DTO
   - 使用 `@ApiOkResponse` 装饰器
   - 本地测试 Swagger 文档：`http://localhost:3001/api/docs`

2. **生成前端类型**：
   ```bash
   cd packages/frontend
   pnpm generate:types
   ```

3. **前端开发**：
   - 使用 `openapi-fetch` 或带类型的 `apiClient`
   - 类型自动推断，无需手动定义

#### 16.4.2 修改 API 的标准流程

1. **修改后端 DTO**
2. **重新生成前端类型**：`pnpm generate:types`
3. **前端自动获得类型更新**，TypeScript 会提示所有不兼容的调用

### 16.5 检查清单

在提交代码前，确保：

- [ ] 后端所有 API 都定义了 `@ApiOkResponse` 或 `@ApiResponse`
- [ ] 所有 Response DTO 都使用了 `@ApiProperty()` 装饰器
- [ ] 运行 `pnpm generate:types` 成功，没有错误
- [ ] 前端代码没有手动定义与后端不一致的 API 类型
- [ ] `pnpm type-check` 通过

### 16.6 常见错误

#### ❌ 错误 1：后端没有定义响应类型
```typescript
// 错误
@ApiResponse({ status: 200, description: '成功' })  // 缺少 type
async getData() { ... }

// 正确
@ApiOkResponse({ type: MyResponseDto })  // 指定 DTO
async getData() { ... }
```

#### ❌ 错误 2：前端手动定义类型与后端不一致
```typescript
// ❌ 错误 - 手动定义类型可能与后端不同步
interface FileSystemNode {
  id: string;
  name: string;
}

// ✅ 正确 - 从生成的类型导入
import type { components } from '../types/api';
type FileSystemNode = components['schemas']['FileSystemNodeDto'];
```

#### ❌ 错误 3：使用 any 类型
```typescript
// 错误
const response = await apiClient.get<any>('/api/data');

// 正确
const response = await apiClient.get('/api/data');  // 类型自动推断
```

---

## 17. 更新记录

### 2026-03-02（v7.2 - 前端服务层更新）

**核心更新**：
- 新增前端 API 服务列表章节（4.7）
- 新增 `tagsApi`、`healthApi` 服务
- 新增 `/api/tags/*` 标签管理 API 端点
- 添加 API 类型规范章节（16），确立前后端类型安全最佳实践
- 完善前端开发规范，明确 axios 过渡方案

**影响文件**：
- `packages/frontend/services/tagsApi.ts` - 新增
- `packages/frontend/services/healthApi.ts` - 新增
- `packages/frontend/services/index.ts` - 更新导出

### 2026-02-27（v7.0 - 文档全面更新）

**核心更新**：
- 更新项目结构，添加 policy-engine 策略引擎模块
- 添加 version-control 版本控制模块文档
- 更新后端命令列表，添加 cooperate、deploy:stop 等命令
- 更新前端页面列表，添加 CADEditorDirect、Profile 等页面
- 更新技能集列表，添加 file-planner 技能
- 完善权限系统文档，添加策略引擎相关内容
- 更新前端包名引用（cloudcad-manager）

**新增模块**：
- Policy Engine 策略引擎
- Version Control 版本控制

**影响文件**：
- `IFLOW.md` - 本文档

### 2026-02-26（v6.9 - 权限系统修复）

**问题修复**：
- 修复 RoleInheritanceService 原生 SQL 查询列名错误（parent_id → parentId）
- 修复 L3CacheProvider 的 Prisma 操作错误（delete/update → deleteMany/updateMany）
- 修复缓存预热时的并发删除问题

**改进**：
- 新增 `forceRefreshRolePermissions` 方法强制刷新角色权限缓存
- 优化初始化时强制刷新缓存，避免使用过期的错误数据
- 新增"常见失误与规避"章节（10.5），记录开发过程中的经验教训

**影响文件**：
- `packages/backend/src/common/services/role-inheritance.service.ts`
- `packages/backend/src/cache-architecture/providers/l3-cache.provider.ts`

### 2026-02-09（v6.8 - 项目整合更新）

**核心更新**：
- 新增 SVN 版本控制工具包（svnVersionTool）
- 新增 svn-repo 目录，用于版本控制存储
- 新增 .iflow 目录，包含专用代理、自定义命令和技能集
- 新增 docs/tasks/ 目录，用于任务跟踪
- 更新项目结构文档
- 添加 iFlow 专用工具和技能集文档
- 更新环境要求（Node.js >= 20.19.5, pnpm >= 9.15.4）
- 添加 Feature Development 工作流程文档
- 完善前端包名（cloudcad-manager）
- 添加后端对 svnVersionTool 的依赖说明

**新增功能**：
- SVN 仓库管理、检出、添加、提交等功能
- code-architect、code-explorer、code-reviewer 专用代理
- /feature-dev 自定义命令
- code-concise、layered-context、ui-ux-pro-max、frontend-design 技能集

### 2026-02-06（v6.7 - 文档分层）

**核心更新**：
- 将冗长的 IFLOW.md 拆分为分层级、模块化的文档结构
- 新增 documents/ 目录，包含共享文档、后端文档、前端文档
- 简化上层 IFLOW.md，仅保留项目概览和索引
- 每个模块独立文档，便于按需加载

**文档结构**：
- `documents/shared/`: 共享文档（架构、常量、规范）
- `documents/backend/core/`: 后端核心模块（认证、权限、缓存、存储、数据库）
- `documents/backend/modules/`: 后端功能模块（文件系统、MxCAD、图库、字体、审计、健康）
- `documents/frontend/components/`: 前端组件（文件系统管理器、模态框、权限、管理员）
- `documents/frontend/hooks/`: 前端 Hooks（文件系统、权限、MxCAD）

---

_v7.2 | 2026-03-02 | CloudCAD 团队_
_更新：前端服务层更新、API 类型规范、标签管理 API_
