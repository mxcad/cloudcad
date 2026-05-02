# ⚠️ 此文档已废弃

> **所有内容已合并到 AGENTS.md。请以 AGENTS.md 为唯一项目上下文文档。**

---

# AI_CONTEXT.md - CloudCAD 项目说明书 (已废弃)

> ~~本文档是 CloudCAD 项目的 AI 阅读说明书，所有后续 AI 对话应以此为项目上下文基准。~~
> 生成日期：2026-05-02

---

## 1. 项目概述

**CloudCAD** 是一个基于 Web 的 CAD 协同平台，由成都梦想凯德科技有限公司开发。平台支持在线 CAD 编辑、版本控制、文件管理和团队协作，用户无需安装桌面软件即可通过浏览器完成设计、审阅和协作。

### 核心价值
- **在线 CAD 编辑** - 基于 MxCAD 组件的 Web 编辑器，支持 DWG/DXF 格式
- **团队协作** - 多用户实时协作、评论批注、在线审阅
- **版本管理** - 集成 SVN 版本控制，追踪设计变更历史
- **文件管理** - 完整的项目/文件夹/文件管理体系，支持分片上传
- **权限控制** - 双层权限系统（系统权限 + 项目权限），基于 RBAC

### Monorepo 包结构

| 包 | 端口 | 说明 |
|----|------|------|
| `packages/frontend` | 5173 | React 前端应用 |
| `packages/backend` | 3001 | NestJS 后端 API 服务 |
| `packages/config-service` | 3002 | 部署配置中心 |
| `packages/svnVersionTool` | - | SVN 版本控制工具（workspace 依赖） |
| `packages/server-tasks` | - | 服务端任务模块 |

### 关键端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Frontend | 5173 | Vite 开发服务器 |
| Backend API | 3001 | NestJS + Express |
| Config Service | 3002 | 部署配置中心 |
| Cooperation Service | 3091 | 实时协同服务（WebSocket） |

---

## 2. 技术栈清单

### 后端 (packages/backend)

| 技术 | 版本 | 用途 |
|------|------|------|
| NestJS | 11.x | 后端框架（必须使用 Express 适配器） |
| Express | 5.x | HTTP 平台 |
| Prisma | 7.1.0 | ORM 框架，PostgreSQL 适配器 |
| PostgreSQL | 15+ | 关系型数据库 |
| Redis (ioredis) | 7+ | 缓存 + Session 存储 |
| Passport + JWT | - | 身份认证（Access Token 1h / Refresh Token 7d） |
| class-validator | - | DTO 验证 |
| Multer | - | 文件上传处理 |
| Nodemailer | - | 邮件发送 |
| 阿里云 SMS | - | 短信验证 |
| 腾讯云 SMS | - | 短信验证（备选） |
| Archiver | - | ZIP 打包 |
| http-proxy-middleware | - | 协同服务反向代理 |

### 前端 (packages/frontend)

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.1 | UI 框架 |
| Vite | 6.2.0 | 构建工具 |
| Tailwind CSS | 4.1.18 | 样式框架（禁止硬编码颜色，使用 CSS 变量） |
| TypeScript | 5.8.2 | 类型系统（Strict 模式，禁止 any） |
| Zustand | 5.0.10 | 状态管理 |
| React Router | 7.10.1 | 路由管理 |
| Axios | 1.13.2 | HTTP 客户端 |
| React Hook Form + Zod | - | 表单验证 |
| Radix UI | - | 无障碍 UI 原语 |
| mxcad-app | 1.0.45 | CAD 核心库 |
| WebUploader | - | 分片上传组件 |
| Vitest | 4.x | 单元测试 |
| Recharts | - | 图表组件 |

### 基础设施

| 组件 | 用途 |
|------|------|
| Docker + docker-compose | 容器化部署 |
| Nginx | 反向代理 |
| SVN | 版本控制仓库 |
| MxCAD Assembly | CAD 文件转换引擎（外部可执行文件） |

### 代码规范

- **包管理器**: 100% pnpm（禁止 npm/yarn）
- **运行环境**: PowerShell（Windows）
- **代码格式**: Prettier（单引号、80 字符宽度、分号）
- **TypeScript**: Strict 模式，禁止 `any` 类型

---

## 3. 核心模块与职责

### 3.1 后端模块 (packages/backend/src)

#### auth/ - 认证模块
- **职责**: 用户登录、注册、密码管理、Token 刷新、第三方登录（微信）、短信/邮箱验证
- **关键文件**:
  - `auth-facade.service.ts` - 认证综合服务门面
  - `services/login.service.ts` - 登录逻辑
  - `services/registration.service.ts` - 注册逻辑
  - `services/password.service.ts` - 密码管理（重置、修改）
  - `services/auth-token.service.ts` - Token 生成与刷新
  - `services/email-verification.service.ts` - 邮箱验证
  - `services/sms/` - 短信验证服务
  - `services/wechat.service.ts` - 微信登录
  - `jwt.strategy.executor.ts` - JWT 策略执行器（全局 Guard）
  - `guards/` - 认证守卫

#### users/ - 用户模块
- **职责**: 用户 CRUD、用户信息管理、用户数据清理
- **关键服务**: UsersService、UserCleanupService

#### roles/ - 角色与权限模块
- **职责**: 系统角色管理、项目角色管理、系统权限检查、项目权限检查
- **关键文件**:
  - `roles.service.ts` - 系统角色 CRUD
  - `project-roles.service.ts` - 项目角色管理
  - `project-permission.service.ts` - 项目权限检查

#### common/ - 公共模块
- **职责**: 全局守卫、拦截器、管道、异常过滤器、通用服务
- **关键服务**:
  - `services/permission.service.ts` - 系统权限检查核心服务
  - `services/initialization.service.ts` - 系统初始化（创建初始管理员）
  - `services/storage-manager.service.ts` - 文件存储管理
  - `services/redis-cache.service.ts` - Redis 缓存操作
  - `services/permission-cache.service.ts` - 权限缓存
  - `services/file-lock.service.ts` - 文件锁
  - `services/directory-allocator.service.ts` - 目录分配器
  - `guards/` - 权限守卫、项目守卫
  - `pipes/validation.pipe.ts` - 全局验证管道
  - `filters/exception.filter.ts` - 全局异常过滤器
  - `interceptors/response.interceptor.ts` - 统一响应拦截器

#### file-system/ - 文件系统模块
- **职责**: 项目管理、文件树操作、文件 CRUD、文件移动/复制/删除、项目成员管理、存储配额
- **架构**: Facade 模式，FileSystemService 委托给 6 个子服务
- **子服务**:
  - `services/project-crud.service.ts` - 项目 CRUD
  - `services/file-tree.service.ts` - 文件树操作
  - `services/file-operations.service.ts` - 文件操作（移动、复制、删除等）
  - `services/file-download-export.service.ts` - 文件下载和导出
  - `services/project-member.service.ts` - 项目成员管理
  - `services/storage-info.service.ts` - 存储信息查询
  - `services/storage-quota.service.ts` - 存储配额管理
  - `services/quota-enforcement.service.ts` - 配额强制执行
  - `services/search.service.ts` - 文件搜索
- **关键文件**:
  - `file-system.service.ts` - Facade 外观类
  - `file-system.controller.ts` - REST 端点
  - `file-system-permission.service.ts` - 文件系统权限检查
  - `file-validation.service.ts` - 文件验证
  - `file-download-handler.service.ts` - 文件下载处理
  - `file-hash.service.ts` - 文件 Hash 计算

#### mxcad/ - MxCAD 转换模块
- **职责**: CAD 文件上传、转换（DWG/DXF → MXWeb）、分片上传管理、缩略图生成、外部引用处理
- **关键服务**:
  - `mxcad.service.ts` - MxCAD 主服务
  - `services/file-upload-manager-facade.service.ts` - 文件上传门面
  - `services/chunk-upload.service.ts` - 分片上传
  - `services/file-conversion.service.ts` - 文件转换（调用 MxCAD Assembly）
  - `services/file-conversion-upload.service.ts` - 转换后文件上传
  - `services/filesystem-node.service.ts` - 文件系统节点创建
  - `services/external-reference-update.service.ts` - 外部引用更新
  - `services/thumbnail-generation.service.ts` - 缩略图生成
  - `services/cache-manager.service.ts` - MxCAD 缓存管理
  - `services/node-creation.service.ts` - 节点创建
  - `orchestrators/` - 编排器（复杂流程编排）
- **外部依赖**: `MxCAD_ASSEMBLY_PATH` 环境变量指向 MxCAD 可执行文件

#### version-control/ - 版本控制模块
- **职责**: SVN 仓库管理、文件版本提交、版本历史查询、版本回滚、版本对比
- **关键文件**:
  - `version-control.service.ts` - SVN 操作服务（依赖 @cloudcad/svn-version-tool）
  - `version-control.controller.ts` - 版本控制 REST 端点
- **核心操作**: svnCheckout, svnCommit, svnLog, svnCat, svnList, svnPropset

#### database/ - 数据库模块
- **职责**: Prisma Client 封装、数据库连接管理
- **关键文件**: `database.service.ts`

#### redis/ - Redis 模块
- **职责**: Redis 连接管理、缓存操作

#### cache-architecture/ - 缓存架构模块
- **职责**: 多级缓存策略、缓存版本控制、缓存预热

#### audit/ - 审计日志模块
- **职责**: 操作审计记录、审计日志查询

#### admin/ - 管理后台模块
- **职责**: 系统管理功能（用户管理、角色管理、系统监控）

#### library/ - 图库模块
- **职责**: 图块管理、图库资源管理

#### fonts/ - 字体模块
- **职责**: 字体文件管理、字体上传/下载

#### storage/ - 存储模块
- **职责**: 文件存储路径管理、磁盘监控

#### runtime-config/ - 运行时配置模块
- **职责**: 动态配置管理、配置变更日志

#### public-file/ - 公共文件模块
- **职责**: 公开文件访问（无需认证）

#### policy-engine/ - 策略引擎模块
- **职责**: 基于策略的权限控制（时间/IP/设备策略）

#### health/ - 健康检查模块
- **职责**: 系统健康状态检查（@nestjs/terminus）

### 3.2 前端模块 (packages/frontend/src)

#### pages/ - 页面组件
| 页面 | 说明 |
|------|------|
| `Login.tsx` | 用户登录 |
| `Register.tsx` | 用户注册 |
| `ForgotPassword.tsx` | 忘记密码 |
| `ResetPassword.tsx` | 重置密码 |
| `Dashboard.tsx` | 工作台/仪表盘 |
| `FileSystemManager.tsx` | 文件系统管理器（项目/文件浏览） |
| `CADEditorDirect.tsx` | CAD 编辑器页面 |
| `Profile.tsx` | 用户个人中心 |
| `UserManagement.tsx` | 用户管理（管理员） |
| `RoleManagement.tsx` | 角色管理（管理员） |
| `FontLibrary.tsx` | 字体库管理 |
| `LibraryManager.tsx` | 图库管理 |
| `AuditLogPage.tsx` | 审计日志 |
| `SystemMonitorPage.tsx` | 系统监控 |
| `RuntimeConfigPage.tsx` | 运行时配置 |
| `EmailVerification.tsx` | 邮箱验证 |
| `PhoneVerification.tsx` | 手机验证 |

#### stores/ - Zustand 状态管理
| Store | 说明 |
|-------|------|
| `fileSystemStore.ts` | 文件系统状态（项目、文件树、当前选中） |
| `uiStore.ts` | UI 状态（主题、侧边栏、模态框） |
| `notificationStore.ts` | 通知状态 |

#### components/ - UI 组件
- `file-system-manager/` - 文件管理器组件
- `file-item/` - 文件列表项组件
- `modals/` - 模态对话框组件
- `sidebar/` - 侧边栏组件
- `permission/` - 权限相关组件
- `auth/` - 认证相关组件
- `ui/` - 基础 UI 组件
- `MxCadUploader.tsx` - MxCAD 文件上传组件
- `CollaborateSidebar.tsx` - 协作侧边栏
- `BreadcrumbNavigation.tsx` - 面包屑导航
- `Toolbar.tsx` - 工具栏

---

## 4. 关键路径说明

### 4.1 文件上传 → 转换 → 查看 完整链路

```
[前端] 选择文件 (.dwg/.dxf)
    │
    ▼
[前端] MxCadUploader 组件 - 分片上传
    │  - 计算文件 Hash (SparkMD5)
    │  - 分片并发上传 (checkChunkExist → uploadChunk → mergeChunks)
    │
    ▼
[后端] MxCadController - 接收分片
    │  - ChunkUploadService: 存储分片到 data/uploads/
    │  - 分片完成后触发合并
    │
    ▼
[后端] FileConversionService - 文件转换
    │  - 调用 MxCAD Assembly (外部进程)
    │  - DWG/DXF → .mxweb 格式
    │  - 等待转换完成（超时 60s）
    │
    ▼
[后端] 转换后处理
    │  - FileConversionUploadService: 上传转换后的文件到存储
    │  - ThumbnailGenerationService: 生成缩略图 (MxWebDwg2Jpg)
    │  - ExternalReferenceUpdateService: 处理外部引用
    │  - NodeCreationService: 创建 FileSystemNode 记录
    │  - VersionControlService: 提交到 SVN 仓库
    │
    ▼
[后端] 更新数据库
    │  - FileSystemNode.fileStatus = COMPLETED
    │  - 记录 fileHash, size, mimeType, extension
    │
    ▼
[前端] 文件树刷新，显示新文件
    │
    ▼
[前端] 点击文件 → CADEditorDirect.tsx
    │  - 加载 .mxweb 文件
    │  - 初始化 MxCAD 编辑器
    │  - 支持实时协作（WebSocket → port 3091）
```

### 4.2 用户认证链路

```
[前端] 登录表单 (Login.tsx)
    │  - 提交 username + password
    │
    ▼
[后端] AuthController → LoginService
    │  - 验证用户名密码
    │  - 生成 Access Token (1h) + Refresh Token (7d)
    │  - Refresh Token 存储到数据库
    │  - 记录审计日志 (USER_LOGIN)
    │
    ▼
[前端] 存储 Token (localStorage)
    │  - Access Token: 用于 API 请求 Authorization header
    │  - Refresh Token: 用于自动刷新
    │
    ▼
[前端] 后续 API 请求
    │  - JwtStrategyExecutor (全局 Guard) 验证 Token
    │  - 权限守卫检查用户权限
    │
    ▼
[后端] Token 过期时自动刷新
    │  - 使用 Refresh Token 获取新 Access Token
```

### 4.3 项目权限检查链路

```
[前端] 用户访问项目资源
    │
    ▼
[后端] JwtStrategyExecutor 验证身份
    │
    ▼
[后端] ProjectGuard 检查项目成员资格
    │  - 查询 ProjectMember 表
    │  - 获取用户的 ProjectRole
    │
    ▼
[后端] PermissionGuard 检查操作权限
    │  - 查询 ProjectRolePermission 表
    │  - 对比所需权限 (ProjectPermission 枚举)
    │  - 权限不足 → 403 Forbidden
    │
    ▼
[后端] 业务逻辑执行
```

---

## 5. 数据库核心表

### 核心模型 (Prisma Schema)

| 模型 | 表名 | 说明 |
|------|------|------|
| `User` | `users` | 用户表（支持软删除 deletedAt） |
| `Role` | `roles` | 系统角色表（支持层级 parentId） |
| `RolePermission` | `role_permissions` | 角色-权限关联表 |
| `FileSystemNode` | `file_system_nodes` | 文件系统节点（统一模型：项目/文件夹/文件） |
| `ProjectRole` | `project_roles` | 项目角色表 |
| `ProjectRolePermission` | `project_role_permissions` | 项目角色-权限关联表 |
| `ProjectMember` | `project_members` | 项目成员表 |
| `Asset` | `assets` | 资源库表 |
| `Font` | `fonts` | 字体表 |
| `RefreshToken` | `refresh_tokens` | 刷新令牌表 |
| `AuditLog` | `audit_logs` | 审计日志表 |
| `UploadSession` | `upload_sessions` | 上传会话表（分片上传） |
| `CacheEntry` | `cache_entries` | 数据库缓存表 |
| `PermissionPolicy` | `permission_policies` | 权限策略表 |
| `PolicyPermission` | `policy_permissions` | 策略-权限关联表 |
| `RuntimeConfig` | `runtime_configs` | 运行时配置表 |
| `RuntimeConfigLog` | `runtime_config_logs` | 配置变更日志表 |

### 关键枚举

| 枚举 | 说明 |
|------|------|
| `Permission` | 系统权限（SYSTEM_ADMIN, SYSTEM_USER_*, SYSTEM_ROLE_*, LIBRARY_*, PROJECT_CREATE 等） |
| `ProjectPermission` | 项目权限（PROJECT_*, FILE_*, CAD_*, VERSION_READ 等） |
| `UserStatus` | 用户状态（ACTIVE, INACTIVE, SUSPENDED） |
| `FileStatus` | 文件状态（UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED） |
| `ProjectStatus` | 项目状态（ACTIVE, ARCHIVED, DELETED） |
| `RoleCategory` | 角色类别（SYSTEM, PROJECT, CUSTOM） |
| `PolicyType` | 策略类型（TIME, IP, DEVICE） |

### 重要关系

```
User ──1:N──> FileSystemNode (ownerId, NodeOwner 关系)
User ──1:N──> ProjectMember
User ──1:N──> AuditLog
Role ──1:N──> RolePermission
Role ──N:N──> User (通过 roleId)

FileSystemNode ──1:N──> FileSystemNode (parentId, NodeHierarchy 自引用)
FileSystemNode ──1:N──> FileSystemNode (projectId, NodeProject 项目-文件关系)
FileSystemNode ──1:N──> ProjectMember
FileSystemNode ──1:N──> ProjectRole

ProjectRole ──1:N──> ProjectRolePermission
ProjectRole ──1:N──> ProjectMember

PermissionPolicy ──1:N──> PolicyPermission
```

### FileSystemNode 统一模型说明

`FileSystemNode` 是一个统一模型，通过字段组合表示不同实体：
- **项目**: `isFolder=true, isRoot=true`
- **文件夹**: `isFolder=true, isRoot=false, projectId 不为空`
- **文件**: `isFolder=false, projectId 不为空`
- **个人空间**: `personalSpaceKey 不为空`
- **图库**: `libraryKey 不为空`

---

## 6. 当前架构的已知问题

### 6.1 循环依赖（5 对双向 forwardRef）

详见 `docs/circular-deps-analysis.md`

| 循环依赖 | 严重性 | 原因 |
|----------|--------|------|
| CommonModule ↔ AuditLogModule | 低 | PermissionService 注入 AuditLogService 但未使用 |
| CommonModule ↔ UsersModule | 中 | InitializationService → UsersService; UsersService → PermissionCacheService |
| CommonModule ↔ CacheArchitectureModule | 低 | 未发现具体服务注入，可能是冗余依赖 |
| AuthModule ↔ UsersModule | 高 | AuthFacadeService/LoginService → UsersService; UsersService → SmsVerificationService/EmailVerificationService |
| FileSystemModule ↔ RolesModule | 中 | FileSystemPermissionService → ProjectPermissionService; 间接通过 AuditLogService |

### 6.2 上帝模块问题

| 模块 | 问题 | 说明 |
|------|------|------|
| `common/` | 职责过多 | 包含权限、缓存、存储、初始化、文件锁、目录分配、清理等 14+ 服务 |
| `mxcad/mxcad.service.ts` | 890 行 | 虽然部分子服务已拆分，但主服务仍承担过多协调职责 |
| `file-system/file-system.service.ts` | Facade 模式已缓解 | 原文 3986 行，已拆分为 6 个子服务 |

### 6.3 其他已知问题

1. **CommonModule 作为共享模块过度使用**
   - 大多数模块都依赖 CommonModule，导致 CommonModule 成为依赖中心
   - 建议将 CommonModule 拆分为更细粒度的模块（如 PermissionModule、CacheModule、StorageModule）

2. **FileSystemNode 统一模型过于复杂**
   - 项目、文件夹、文件使用同一张表，通过字段组合区分
   - 导致查询逻辑复杂，索引优化困难
   - 建议考虑分表或使用明确的类型字段

3. **MxCAD Assembly 外部进程管理**
   - 文件转换依赖外部可执行文件，进程管理、超时、错误恢复机制需加强
   - 当前使用简单的 spawn 调用，缺乏进程池和并发控制

4. **缓存一致性**
   - Redis 缓存与数据库之间存在一致性风险
   - 权限缓存（PermissionCacheService）在权限变更时需要手动清理

5. **分片上传缺少断点续传的持久化**
   - UploadSession 表记录了上传状态，但分片文件存储在临时目录
   - 服务重启后分片数据丢失

6. **SVN 版本控制的性能**
   - 每次文件变更都触发 SVN 操作
   - 大项目 SVN 仓库体积增长快，缺乏压缩和清理策略

---

## 7. 环境变量关键配置

### 后端必需环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | - |
| `JWT_SECRET` | JWT 密钥 | your-secret-key |
| `DB_PASSWORD` | 数据库密码 | password |
| `MXCAD_ASSEMBLY_PATH` | MxCAD 可执行文件路径 | runtime/windows/mxcad/mxcadassembly.exe |
| `REDIS_HOST` | Redis 主机 | localhost |
| `REDIS_PORT` | Redis 端口 | 6379 |
| `REDIS_PASSWORD` | Redis 密码 | - |
| `FILES_DATA_PATH` | 文件存储路径 | data/files |
| `SVN_REPO_PATH` | SVN 仓库路径 | data/svn-repo |
| `COOPERATE_URL` | 协同服务地址 | http://localhost:3091 |

### 前端环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_APP_NAME` | 应用名称 | CloudCAD |
| `VITE_API_BASE_URL` | API 地址 | - |
| `VITE_APP_COOPERATE_URL` | 协同服务地址 | - |

---

## 8. 文件存储结构

```
data/
├── files/                 # 正式文件存储 (FILES_DATA_PATH)
│   └── [project-id]/     # 按项目 ID 组织
│       └── [node-id]/    # 按节点 ID 组织
│
├── uploads/               # MxCAD 上传临时目录 (MXCAD_UPLOAD_PATH)
│   └── chunks/           # 分片文件
│   └── temp/             # 转换中间文件
│
├── temp/                  # 临时文件 (MXCAD_TEMP_PATH)
│
└── svn-repo/              # SVN 仓库 (SVN_REPO_PATH)
    └── [project-id]/     # 每个项目一个 SVN 仓库
```

---

## 9. 开发工作流

### 启动开发环境

```bash
# 根目录执行
pnpm dev          # 启动所有服务（前端 + 后端 + 配置中心）

# 或单独启动
cd packages/backend && pnpm dev   # 后端 (port 3001)
cd packages/frontend && pnpm dev  # 前端 (port 5173)
```

### 数据库操作

```bash
cd packages/backend
pnpm prisma generate        # 生成 Prisma Client
pnpm prisma migrate dev     # 运行迁移（开发环境）
pnpm prisma db push         # 推送 schema（仅限原型）
pnpm prisma studio          # 打开 Prisma GUI
```

### 代码检查

```bash
pnpm check        # 全项目 lint + format + type-check
pnpm check:fix    # 自动修复 lint + format
```

### 测试

```bash
# 后端
cd packages/backend && pnpm test
cd packages/backend && pnpm test:unit
cd packages/backend && pnpm test:integration
cd packages/backend && pnpm test:permission

# 前端
cd packages/frontend && pnpm test
cd packages/frontend && pnpm test:ui
```

---

## 10. API 文档

- **Swagger UI**: `http://localhost:3001/api/docs`
- **API 前缀**: `/api`
- **认证方式**: Bearer Token (JWT)

---

*本文档由 AI 自动扫描项目结构生成，应随项目演进而定期更新。*
