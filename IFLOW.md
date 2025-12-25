# IFLOW.md - CloudCAD 项目核心工作规则

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
## 2. 项目概览

CloudCAD 是一个基于 **NestJS + React** 的现代化云端 CAD 图纸管理平台，采用 **monorepo** 架构，专为 B2B 私有部署设计。核心功能包括：

- 🔐 **用户认证系统**：JWT 双 Token + RBAC 权限控制 + 邮箱验证
- 📁 **统一文件系统**：FileSystemNode 树形结构（项目/文件夹/文件统一管理）
- ☁️ **云存储集成**：MinIO (S3 兼容) + 分片上传 + 文件去重（SHA-256）
- 🎨 **资产管理**：图块库和字体库管理
- 👥 **项目协作**：项目成员管理 + 细粒度权限控制
- 📊 **健康监控**：数据库、Redis、MinIO 服务状态监控
- 🔧 **CAD 图纸转换**：MxCAD 图纸转换服务（分片上传 + 断点续传 + 自动转换，基于 mxcadassembly.exe）
- 🔌 **MxCAD-App 集成**：兼容现有 MxCAD-App 前端应用的完整后端接口（`/mxcad/*` 路由）
- ✅ **完整测试覆盖**：单元测试 + 集成测试 + E2E 测试

### 项目结构

```
cloudcad/
├── packages/
│   ├── backend/          # NestJS 后端服务
│   │   ├── src/
│   │   │   ├── admin/           # 管理员模块
│   │   │   ├── auth/            # 认证模块（JWT、策略、守卫）
│   │   │   ├── common/          # 通用模块（过滤器、拦截器、管道）
│   │   │   ├── config/          # 配置模块
│   │   │   ├── database/        # 数据库服务
│   │   │   ├── file-system/     # 文件系统统一模块（项目+文件夹+文件）
│   │   │   ├── files/           # 文件处理（遗留模块，逐步迁移到 file-system）
│   │   │   ├── health/          # 健康检查
│   │   │   ├── mxcad/           # MxCAD 图纸转换模块
│   │   │   │   ├── dto/         # 数据传输对象
│   │   │   │   ├── enums/       # 枚举定义
│   │   │   │   ├── interceptors/ # 拦截器
│   │   │   │   ├── *.spec.ts    # 单元测试
│   │   │   │   ├── README.md     # 模块文档
│   │   │   │   ├── minio-sync.service.ts # MinIO 同步服务
│   │   │   │   ├── mxcad-permission.service.ts # MxCAD 权限服务
│   │   │   │   ├── mxcad.controller.ts # 控制器
│   │   │   │   ├── mxcad.service.ts    # 服务
│   │   │   │   └── mxcad.module.ts     # 模块
│   │   │   ├── projects/        # 项目管理（遗留模块，逐步迁移到 file-system）
│   │   │   ├── redis/           # Redis 缓存
│   │   │   ├── storage/         # MinIO 存储服务
│   │   │   ├── test/            # 测试工具
│   │   │   └── users/           # 用户管理
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # 数据库架构（唯一源）
│   │   │   └── seed.ts          # 数据库种子
│   │   ├── templates/
│   │   │   └── email-verification.hbs # 邮件模板
│   │   ├── test/                # E2E 测试
│   │   ├── docker-compose.dev.yml  # 开发环境配置
│   │   ├── docker-compose.yml      # 生产环境配置
│   │   ├── Dockerfile              # Docker 镜像
│   │   └── package.json            # 后端配置
│   ├── frontend/         # React 前端应用（cloudcad-manager）
│   │   ├── components/          # 通用组件
│   │   │   ├── BreadcrumbNavigation.tsx # 面包屑导航
│   │   │   ├── FileItem.tsx     # 文件项组件
│   │   │   ├── FileUploader.tsx # 文件上传组件
│   │   │   ├── Layout.tsx       # 布局组件
│   │   │   ├── MxCadUploader.tsx # MxCAD 文件上传组件（新版）
│   │   │   ├── Toolbar.tsx      # 工具栏组件
│   │   │   └── ui/              # UI 基础组件（Shadcn UI）
│   │   │       ├── ConfirmDialog.tsx # 确认对话框
│   │   │       └── Toast.tsx    # 消息提示
│   │   ├── contexts/            # React Context
│   │   │   └── AuthContext.tsx  # 认证上下文
│   │   ├── hooks/               # 自定义 Hooks
│   │   │   ├── useFileSystem.ts # 文件系统 Hook
│   │   │   └── useMxCadUploadNative.ts # MxCAD 原生上传 Hook
│   │   ├── pages/               # 页面组件
│   │   │   ├── AssetLibrary.tsx      # 资产库管理
│   │   │   ├── CADEditorDirect.tsx  # CAD 编辑器直连
│   │   │   ├── EmailVerification.tsx # 邮箱验证
│   │   │   ├── FileSystemManager.tsx # 文件管理
│   │   │   ├── ForgotPassword.tsx    # 忘记密码
│   │   │   ├── Login.tsx             # 登录
│   │   │   ├── Profile.tsx           # 用户资料
│   │   │   ├── ProjectManager.tsx    # 项目管理
│   │   │   ├── Register.tsx          # 注册
│   │   │   ├── ResetPassword.tsx     # 重置密码
│   │   │   ├── RoleManagement.tsx    # 角色管理
│   │   │   └── UserManagement.tsx    # 用户管理
│   │   ├── services/            # API 服务
│   │   │   ├── api.ts               # 统一 API 接口
│   │   │   ├── apiService.ts        # API 服务封装
│   │   │   ├── fileUploadService.ts # 文件上传服务
│   │   │   ├── mxcadManager.ts      # MxCAD 全局管理器
│   │   │   └── mockDb.ts            # Mock 数据库
│   │   ├── types/               # 类型定义
│   │   │   ├── api.ts           # API 类型定义
│   │   │   └── filesystem.ts    # 文件系统类型定义
│   │   ├── utils/               # 工具函数
│   │   │   └── validation.ts    # 验证工具
│   │   ├── config/              # 配置文件
│   │   │   ├── getConfig.ts     # 配置获取
│   │   │   └── serverConfig.ts  # 服务器配置
│   │   ├── public/              # 静态资源
│   │   │   ├── debug-mxcad.html # MxCAD 调试页面
│   │   │   ├── webuploader-test.html # WebUploader 测试页面
│   │   │   └── ini/             # 配置文件
│   │   ├── styles/              # 样式文件
│   │   ├── scripts/             # 构建脚本
│   │   │   └── generate-types.js # 类型生成脚本
│   │   ├── types.ts             # 前端类型定义
│   │   ├── App.tsx              # 主应用组件
│   │   ├── index.html           # HTML 入口
│   │   ├── index.tsx            # React 入口
│   │   ├── vite.config.ts       # Vite 配置（含 MxCAD 代理）
│   │   └── package.json         # 前端配置
│   └── mxcadassembly/      # MxCAD 转换工具
│       └── windows/
│           └── release/         # Windows 版本转换工具
├── docs/                        # 项目文档
│   ├── API.md                          # API 文档
│   ├── API_UPLOAD_DOCUMENTATION.md     # MxCAD 文件上传 API 文档（完整接口规范）
│   ├── AUTH_TROUBLESHOOTING.md         # 认证问题排查
│   ├── CAD_EDITOR_INTEGRATION_PLAN.md  # CAD 编辑器集成计划
│   ├── CAD_FILE_PROCESSING_ARCHITECTURE.md # CAD 文件处理架构
│   ├── DEPLOYMENT.md                   # 部署指南
│   ├── DEVELOPMENT.md                  # 开发指南
│   ├── DEVELOPMENT_GUIDE.md            # 开发指南（详细版）
│   ├── FAQ.md                          # 常见问题
│   ├── GIT_WORKFLOW.md                 # Git 工作流
│   ├── MXCAD_FILE_SYSTEM_UNIFICATION_PLAN.md # 文件系统统一架构方案
│   ├── MXCAD_UNIFIED_UPLOAD_IMPLEMENTATION.md # MxCAD 统一上传实施方案
│   ├── MXCAD_UPLOAD_INTEGRATION.md     # MxCAD 上传服务集成方案（核心文档）
│   ├── PROJECT_OVERVIEW.md             # 项目概述
│   └── USER_SYSTEM_ARCHITECTURE_BRAINSTORM.md # 用户系统架构
├── scripts/                     # 构建脚本
├── 代码参考/                     # 参考代码
├── .eslintrc.js                 # ESLint 配置
├── .gitignore                   # Git 忽略文件
├── .iflowignore                 # iFlow 忽略文件
├── .prettierrc                  # Prettier 配置
├── CONTRIBUTING.md              # 贡献指南
├── LICENSE                      # 许可证
├── package.json                 # 根目录配置
├── pnpm-workspace.yaml          # pnpm 工作空间配置
├── tsconfig.json                # TypeScript 配置
├── README.md                    # 项目说明
└── IFLOW.md                     # 本文件
```

## 3. 技术栈与版本

### 后端技术栈

- **NestJS**: 11.0.1（企业级 Node.js 框架）
- **TypeScript**: 5.7.3（严格模式）
- **Express**: 5.2.1（Web 框架，@nestjs/platform-express）
- **Prisma**: 7.1.0（类型安全的 ORM，@prisma/adapter-pg 7.1.0）
- **PostgreSQL**: 15+（关系型数据库）
- **Redis**: 7+（缓存和会话存储，@nestjs-modules/ioredis 2.0.2）
- **MinIO**: 8.0.6（S3 兼容对象存储）
- **JWT**: @nestjs/jwt 11.0.2 + Passport 0.7.0（认证）
- **bcryptjs**: 3.0.3（密码加密）
- **Swagger**: @nestjs/swagger 11.2.3（API 文档）
- **Jest**: 30.0.0（测试框架）
- **Nodemailer**: 7.0.11 + Handlebars 4.7.8（邮件服务）
- **Multer**: 2.0.2（文件上传处理）
- **UUID**: 13.0.0（唯一标识符生成）

### 前端技术栈

- **React**: 19.2.1（UI 框架）
- **TypeScript**: ~5.8.2（严格模式）
- **Vite**: 6.2.0（构建工具）
- **React Router DOM**: 7.10.1（路由）
- **Axios**: 1.13.2（HTTP 客户端）
- **Lucide React**: 0.556.0（图标库）
- **Recharts**: 3.5.1（图表库）
- **Radix UI**: 最新版本（无障碍 UI 组件库）
- **Tailwind CSS**: 4.1.18（样式框架，@tailwindcss/vite 4.1.18）
- **React Hook Form**: 7.68.0（表单管理，@hookform/resolvers 5.2.2）
- **Zod**: 4.2.1（数据验证）
- **openapi-typescript**: 7.10.1（类型生成）
- **Vitest**: 4.0.16（单元测试框架）
- **Testing Library**: 16.3.1（React 组件测试）
- **mxcad-app**: 1.0.45（MxCAD 编辑器组件）
- **webuploader**: 0.1.8（百度 WebUploader 文件上传）
- **class-variance-authority**: 0.7.1（类变体权威）
- **clsx**: 2.1.1（条件类名工具）
- **tailwind-merge**: 3.4.0（Tailwind 类名合并）

### 开发工具

- **Node.js**: >= 20.19.5（LTS）
- **pnpm**: >= 9.15.4（包管理器）
- **ESLint**: 8.57.0（代码检查）
- **Prettier**: 3.2.0（代码格式化）
- **Docker**: 最新版本（容器化）

## 4. 编程规范（强制执行）

### 命名规范

| 类型      | 规范             | 示例                                  |
| --------- | ---------------- | ------------------------------------- |
| 变量/函数 | camelCase        | `getUserInfo`, `fileCount`            |
| 类/接口   | PascalCase       | `UserService`, `FileSystemNode`       |
| 常量      | UPPER_SNAKE_CASE | `MAX_FILE_SIZE`, `JWT_SECRET`         |
| 文件名    | kebab-case       | `user-service.ts`, `file-manager.tsx` |
| 组件文件  | PascalCase       | `FileUploader.tsx`, `Layout.tsx`      |

**禁止使用拼音命名！**

### 函数规范

- 单行长度 ≤ 80 字符
- 圈复杂度 ≤ 5
- 参数 ≤ 5 个
- 函数长度 ≤ 50 行
- 优先使用纯函数

### 类与模块规范

- 单文件单类原则
- 单一职责原则（SRP）
- 类的公共方法 ≤ 10 个
- 导入语句按字母顺序排列

### TypeScript 规范

- 严格模式（`strict: true`）
- **禁止使用 `any` 类型**
- 接口优先于类型别名
- 使用泛型提高代码复用性
- 使用 `async/await` 而非 Promise 链
- 测试文件已从类型检查中排除（tsconfig.json exclude 配置）

### 注释规范

- 公共 API 必须包含 JSDoc 文档
- 业务代码注释「为什么」>「做什么」
- 复杂逻辑必须添加注释说明

### 异常处理

- 禁止裸 `try-catch`（必须处理异常）
- 自定义异常继承自 `HttpException`（NestJS）
- 统一错误格式（使用全局异常过滤器）

### 测试规范

- 新增代码覆盖率 ≥ 90%
- 核心模块覆盖率 ≥ 95%
- TDD 流程：红线 → 绿线 → 重构
- 前端使用 Vitest + Testing Library
- 后端使用 Jest

## 5. 开发命令

### 根目录命令

```bash
# 依赖管理
pnpm install                    # 安装所有依赖

# 开发服务
pnpm dev                        # 启动所有服务（前端 + 后端）
pnpm backend:dev                # 仅启动后端
cd packages/frontend && pnpm dev # 仅启动前端

# 构建
pnpm build                      # 构建所有包
pnpm backend:build              # 仅构建后端

# 代码质量
pnpm check                      # 完整检查（lint + format + type-check）
pnpm check:fix                  # 检查并自动修复
pnpm lint                       # ESLint 检查
pnpm lint:fix                   # ESLint 修复
pnpm format                     # Prettier 格式化
pnpm format:check               # Prettier 检查
pnpm type-check                 # TypeScript 类型检查

# 后端专用命令（根目录）
pnpm backend:verify             # 后端完整验证流程（check:fix + test + build）

# 前端专用命令（根目录）
pnpm frontend:verify            # 前端完整验证流程（check + test + build）

# 清理
pnpm clean                      # 清理构建产物
```

### 后端命令（packages/backend）

```bash
# 开发环境
pnpm dev                        # 启动基础设施 + 后端
pnpm dev:infra                  # 仅启动基础设施（Docker）
pnpm dev:infra:stop             # 停止基础设施
pnpm start:dev                  # 仅启动后端开发服务器（热重载）

# 构建与启动
pnpm build                      # 构建项目
pnpm start                      # 启动生产服务器
pnpm start:prod                 # 启动生产服务器（别名）

# 测试
pnpm test                       # 运行所有测试
pnpm test:unit                  # 仅单元测试
pnpm test:integration           # 仅集成测试
pnpm test:all                   # 运行所有测试（详细输出）
pnpm test:e2e                   # E2E 测试
pnpm test:cov                   # 测试覆盖率
pnpm test:watch                 # 监听模式
pnpm test:debug                 # 调试模式
pnpm test:ci                    # CI 模式

# 数据库（Prisma 7.x）
pnpm db:generate                # 生成 Prisma Client
pnpm db:push                    # 推送数据库架构（开发环境）
pnpm db:migrate                 # 运行数据库迁移（生产环境）
pnpm db:studio                  # 打开 Prisma Studio
pnpm db:seed                    # 执行种子数据

# Docker 部署
pnpm docker:build               # 构建 Docker 镜像
pnpm docker:up                  # 启动 Docker 容器
pnpm docker:down                # 停止 Docker 容器
pnpm docker:logs                # 查看 Docker 日志
pnpm deploy:prod                # 生产环境部署
pnpm deploy:stop                # 停止生产环境

# 代码质量
pnpm check                      # 完整检查
pnpm check:fix                  # 检查并修复
pnpm lint                       # ESLint 检查
pnpm lint:fix                   # ESLint 修复
pnpm format                     # Prettier 格式化
pnpm format:check               # Prettier 检查
pnpm type-check                 # TypeScript 类型检查
pnpm verify                     # 完整验证（check:fix + test + build）
```

### 前端命令（packages/frontend）

```bash
# 开发
pnpm dev                        # 启动开发服务器
pnpm build                      # 构建生产版本
pnpm preview                    # 预览生产版本

# 测试
pnpm test                       # 运行单元测试
pnpm test:ui                    # 测试 UI 界面
pnpm test:watch                 # 监听模式
pnpm test:coverage              # 生成覆盖率报告

# 类型生成
pnpm generate:types             # 从后端 OpenAPI 生成类型定义

# 代码质量
pnpm check                      # 完整检查
pnpm check:fix                  # 检查并修复
pnpm lint                       # ESLint 检查
pnpm lint:fix                   # ESLint 修复
pnpm format                     # Prettier 格式化
pnpm format:check               # Prettier 检查
pnpm type-check                 # TypeScript 类型检查
pnpm verify                     # 完整验证（check + test + build）
```

### 重要规定

- **禁止自动启动服务器**：不要执行任何启动开发服务器的命令，由用户自行启动
- **只进行代码检查和修复**：所有命令仅用于代码质量保证，不涉及服务启动
- **数据库迁移前先备份**：执行 `db:migrate` 前确保数据已备份
- **测试优先**：新功能开发前先编写测试用例

## 6. 环境配置

### 后端环境变量（packages/backend/.env）

```env
# 应用配置
PORT=3001
NODE_ENV=development

# JWT配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=cloucad
DB_SSL=false
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_IDLE_TIMEOUT=30000

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_MAX_RETRIES=3
REDIS_RETRY_DELAY=100

# MinIO配置
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_REGION=us-east-1
MINIO_BUCKET=cloucad

# 文件上传配置
UPLOAD_MAX_SIZE=104857600
UPLOAD_ALLOWED_TYPES=.dwg,.dxf,.pdf,.png,.jpg,.jpeg

# MxCAD 转换服务配置（Windows 平台）
MXCAD_ASSEMBLY_PATH=D:\web\MxCADOnline\cloudcad\packages\mxcadassembly\windows\release\mxcadassembly.exe
MXCAD_UPLOAD_PATH=D:\web\MxCADOnline\cloudcad\uploads
MXCAD_TEMP_PATH=D:\web\MxCADOnline\cloudcad\temp
MXCAD_FILE_EXT=.mxweb
MXCAD_COMPRESSION=true

# 邮件服务配置
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password
MAIL_FROM=CloudCAD <noreply@cloucad.com>

# 前端地址
FRONTEND_URL=http://localhost:3000
```

### 前端环境变量（packages/frontend/.env.local）

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_APP_NAME=CloudCAD
```

### 服务地址（开发环境）

- **前端应用**: http://localhost:3000（Vite 默认端口）
- **后端 API**: http://localhost:3001
- **API 文档**: http://localhost:3001/api/docs
- **数据库**: localhost:5432 (postgres/password)
- **Redis**: localhost:6379
- **MinIO**: http://localhost:9000 (minioadmin/minioadmin)
- **MinIO Console**: http://localhost:9001
- **PgAdmin**: http://localhost:5050 (admin@cloucad.com/admin123)

## 7. 数据库架构

### 核心数据模型

数据库架构源文件：`packages/backend/prisma/schema.prisma`

#### FileSystemNode（文件系统统一模型）

**核心设计理念**：统一管理项目、文件夹和文件的树形结构

**字段说明**：

| 字段            | 类型           | 说明                                    |
| --------------- | -------------- | --------------------------------------- |
| `id`            | String         | 主键（CUID）                            |
| `name`          | String         | 节点名称                                |
| `isFolder`      | Boolean        | 是否为文件夹（true=文件夹，false=文件） |
| `isRoot`        | Boolean        | 是否为项目根目录                        |
| `parentId`      | String?        | 父节点 ID（自引用）                     |
| `originalName`  | String?        | 原始文件名（仅文件）                    |
| `path`          | String?        | MinIO 存储路径（仅文件）                |
| `size`          | Int?           | 文件大小（字节，仅文件）                |
| `mimeType`      | String?        | MIME 类型（仅文件）                     |
| `extension`     | String?        | 文件扩展名（仅文件）                    |
| `fileStatus`    | FileStatus?    | 文件状态（仅文件）                      |
| `fileHash`      | String?        | SHA-256 哈希值（仅文件，用于去重）      |
| `description`   | String?        | 项目描述（仅根节点）                    |
| `projectStatus` | ProjectStatus? | 项目状态（仅根节点）                    |
| `ownerId`       | String         | 所有者 ID                               |
| `createdAt`     | DateTime       | 创建时间                                |
| `updatedAt`     | DateTime       | 更新时间                                |

**节点类型**：

| 类型       | isRoot | isFolder | 字段特点                                         |
| ---------- | ------ | -------- | ------------------------------------------------ |
| 项目根目录 | true   | true     | 包含 `projectStatus`, `description`              |
| 文件夹     | false  | true     | 仅包含基础字段（`name`, `owner`, `parent`）      |
| 文件       | false  | false    | 包含 `path`, `size`, `mimeType`, `fileStatus` 等 |

**索引优化**：

- `parentId`：加速树形查询
- `ownerId`：加速所有者查询
- `isRoot`：加速项目查询
- `isFolder`：加速文件/文件夹区分

#### User（用户模型）

- **基础信息**: `email`, `username`, `password`, `nickname`, `avatar`
- **角色权限**: `role` (ADMIN/USER), `status` (ACTIVE/INACTIVE/SUSPENDED)
- **邮箱验证**: `emailVerified`, `emailVerifiedAt`
- **关联关系**: 项目成员、文件所有者、文件访问权限

#### ProjectMember（项目成员）

- **角色**: OWNER（所有者）、ADMIN（管理员）、MEMBER（成员）、VIEWER（查看者）
- **关联**: User + FileSystemNode（根节点）

#### FileAccess（文件访问权限）

- **角色**: OWNER（所有者）、EDITOR（编辑者）、VIEWER（查看者）
- **关联**: User + FileSystemNode

#### UploadSession（上传会话）

- **分片上传**: 记录 MinIO 分片上传状态
- **状态管理**: INITIATED, UPLOADING, COMPLETED, FAILED, ABORTED
- **进度跟踪**: `totalParts`, `uploadedParts`

#### Asset（资产库）

- **图块管理**: 名称、描述、分类、路径、缩略图
- **状态**: ACTIVE, INACTIVE, DELETED

#### Font（字体库）

- **字体管理**: 名称、字体族、路径、大小
- **状态**: ACTIVE, INACTIVE, DELETED

#### RefreshToken（刷新令牌）

- **JWT 刷新**: 存储刷新令牌，支持长期登录

### 数据库操作规范

1. **使用 Prisma Client**: 所有数据库操作必须通过 Prisma Client
2. **事务处理**: 多表操作使用 `$transaction`
3. **软删除**: 使用 `status` 字段标记删除，避免物理删除
4. **索引优化**: 关键字段已添加索引（`parentId`, `ownerId`, `isRoot`, `isFolder`）
5. **级联删除**: 使用 `onDelete: Cascade` 确保数据一致性

## 8. 认证与权限

### JWT 双 Token 机制

- **Access Token**: 1 小时（用于 API 访问）
- **Refresh Token**: 7 天（用于刷新 Access Token）
- **Token 黑名单**: 登出时将 Token 加入 Redis 黑名单，防止重复使用

### 三层权限体系

#### 1. 用户角色（UserRole）

- **ADMIN**：系统管理员，拥有所有权限
- **USER**：普通用户，拥有基础权限

#### 2. 项目成员角色（ProjectMemberRole）

- **OWNER**：项目所有者，拥有项目所有权限
- **ADMIN**：项目管理员，可管理项目成员和文件
- **MEMBER**：项目成员，可查看和编辑文件
- **VIEWER**：项目查看者，仅可查看文件

#### 3. 文件访问角色（FileAccessRole）

- **OWNER**：文件所有者，拥有文件所有权限
- **EDITOR**：文件编辑者，可编辑文件
- **VIEWER**：文件查看者，仅可查看文件

### 邮箱验证流程

1. 用户注册时，账号状态为 `INACTIVE`
2. 系统发送验证邮件（包含验证链接或验证码）
3. 用户点击验证链接或输入验证码
4. 验证成功后，账号状态更新为 `ACTIVE`，`emailVerified` 设为 `true`
5. 用户可正常登录

### 密码重置流程

1. 用户点击「忘记密码」，输入邮箱
2. 系统发送重置邮件（包含验证码）
3. 用户输入验证码和新密码
4. 验证通过后，密码更新成功
5. 旧的 Refresh Token 失效，用户需重新登录

## 9. 文件系统架构

### 核心优势

- ✅ **统一的树形结构**：项目、文件夹、文件使用同一个模型（FileSystemNode）
- ✅ **灵活的层级管理**：支持无限嵌套文件夹
- ✅ **简化的权限控制**：统一的权限管理逻辑
- ✅ **高效的查询性能**：通过自引用实现递归查询
- ✅ **文件去重**：基于 SHA-256 哈希值检测重复文件
- ✅ **分片上传**：支持大文件分片上传和断点续传
- ✅ **安全防护**：多层文件验证机制（白名单 + 黑名单 + 大小限制）

### 文件验证配置

```typescript
export const FILE_UPLOAD_CONFIG = {
  allowedExtensions: ['.dwg', '.dxf', '.pdf', '.png', '.jpg', '.jpeg'], // 白名单
  maxFileSize: 104857600, // 100MB
  maxFilesPerUpload: 10, // 单次最多上传 10 个文件
  blockedExtensions: ['.exe', '.bat', '.sh', '.cmd', '.ps1', '.scr', '.vbs'], // 黑名单
};
```

### 文件上传流程

1. **初始化上传会话**：前端调用 `/api/file-system/initiate-multipart-upload`
2. **获取预签名 URL**：前端调用 `/api/file-system/get-upload-part-url`
3. **上传分片**：前端直接上传分片到 MinIO
4. **完成上传**：前端调用 `/api/file-system/complete-multipart-upload`
5. **文件去重**：后端检查 SHA-256 哈希值，避免重复存储

### 文件下载流程

1. **权限验证**：后端验证用户是否有文件访问权限
2. **生成预签名 URL**：后端生成 MinIO 预签名 URL（有效期 1 小时）
3. **前端下载**：前端使用预签名 URL 直接从 MinIO 下载文件

## 10. API 架构

### 全局响应格式

**后端统一响应结构**：

```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "data": {
    /* 实际返回的 DTO 数据 */
  },
  "timestamp": "2025-12-19T03:34:55.801Z"
}
```

**前端自动解包**：API Service 自动解包响应数据，前端直接使用 `response.data`

### 类型安全架构

**完整流程**：

```
后端 Controller (DTO + @ApiResponse)
    ↓
Swagger 生成 OpenAPI 文档
    ↓
openapi-typescript 生成前端类型
    ↓
前端使用类型安全的 API
```

**类型生成命令**：

```bash
cd packages/frontend
pnpm generate:types
```

### API 端点概览

- **认证**: `/api/auth/*` - 登录、注册、刷新令牌、邮箱验证、密码重置
- **用户**: `/api/users/*` - 用户信息、个人资料更新
- **管理员**: `/api/admin/*` - 用户管理、角色管理
- **文件系统**: `/api/file-system/*` - 项目、文件夹、文件的 CRUD
- **健康检查**: `/api/health/*` - 服务状态监控
- **API 文档**: `/api/docs` - Swagger UI

## 11. MxCAD 文件上传与转换服务

### 核心功能

MxCAD 模块提供了完整的 CAD 文件上传、分片上传、断点续传和格式转换功能，完全兼容原有 MxCAD-App 前端应用的接口规范。

### 接口列表

所有接口基于 `/mxcad` 前缀：

#### 文件上传相关

- `POST /mxcad/files/chunkisExist` - 检查分片是否存在
- `POST /mxcad/files/fileisExist` - 检查文件是否存在
- `POST /mxcad/files/tz` - 检查图纸状态
- `POST /mxcad/files/uploadFiles` - 上传文件（支持分片）
- `POST /mxcad/files/testupfile` - 测试上传文件

#### 文件转换相关

- `POST /mxcad/convert` - 转换服务器文件
- `POST /mxcad/upfile` - 上传并转换文件
- `POST /mxcad/savemxweb` - 保存 MXWEB 到服务器
- `POST /mxcad/savedwg` - 保存 DWG 到服务器
- `POST /mxcad/savepdf` - 保存 PDF 到服务器
- `POST /mxcad/print_to_pdf` - 打印为 PDF
- `POST /mxcad/cut_dwg` - 裁剪 DWG
- `POST /mxcad/cut_mxweb` - 裁剪 MXWEB

#### 外部参照相关

- `POST /mxcad/up_ext_reference_dwg` - 上传外部参照 DWG
- `POST /mxcad/up_ext_reference_image` - 上传外部参照图片

#### 文件访问

- `GET /mxcad/file/:filename` - 访问转换后的文件（支持 MxCAD-App）

#### 其他功能

- `POST /mxcad/up_image` - 上传图片

### 统一上传方案

**新增功能**：MxCAD 文件上传已与文件系统完全集成

- **自动同步**：文件上传成功后自动创建 FileSystemNode 记录
- **项目上下文**：支持项目ID和父文件夹ID传递
- **原生上传实现**：前端使用 useMxCadUploadNative Hook 实现分片上传
- **MxCAD 管理器**：全局 MxCADView 实例管理，支持实例复用和永不销毁容器
- **权限集成**：上传文件自动继承项目权限设置

**核心组件**：

#### MxCadUploader 组件
- **位置**：`packages/frontend/components/MxCadUploader.tsx`
- **功能**：提供完整的 MxCAD 文件上传 UI 组件
- **特性**：支持进度显示、错误处理、成功回调
- **使用方式**：
```tsx
<MxCadUploader
  projectId="project-123"
  parentId="folder-456"
  onSuccess={(param) => console.log('上传成功:', param)}
  onError={(error) => console.error('上传失败:', error)}
/>
```

#### useMxCadUploadNative Hook
- **位置**：`packages/frontend/hooks/useMxCadUploadNative.ts`
- **功能**：原生实现的 MxCAD 文件上传逻辑
- **特性**：
  - 文件类型验证（支持 .dwg, .dxf 各种大小写组合）
  - 文件大小限制（100MB）
  - 分片上传（5MB 每片）
  - 文件哈希计算（用于去重）
  - 自动重试和错误处理
  - 秒传支持（文件已存在时）

#### MxCADManager 管理器
- **位置**：`packages/frontend/services/mxcadManager.ts`
- **功能**：全局 MxCADView 实例管理
- **特性**：
  - 单例模式确保实例唯一性
  - 永不销毁的全局容器
  - 实例复用提高性能
  - 支持显示/隐藏控制
  - 文件打开和管理功能

**核心流程**：
```
用户选择文件 → 原生分片上传 → MxCAD 转换服务 → 自动创建文件系统记录 → MxCADManager 管理
```

### 返回格式

**重要**：MxCAD 接口绕过了 NestJS 全局响应包装，直接返回原始格式：

```json
{"ret": "ok"}
{"ret": "fileAlreadyExist"}
{"ret": "chunkAlreadyExist"}
{"ret": "convertFileError"}
```

### 环境配置

```env
# MxCAD 转换服务配置（Windows 平台）
MXCAD_ASSEMBLY_PATH=D:\web\MxCADOnline\cloudcad\packages\mxcadassembly\windows\release\mxcadassembly.exe
MXCAD_UPLOAD_PATH=D:\web\MxCADOnline\cloudcad\uploads
MXCAD_TEMP_PATH=D:\web\MxCADOnline\cloudcad\temp
MXCAD_FILE_EXT=.mxweb
MXCAD_COMPRESSION=true
```

## 12. 测试架构

### 前端测试（Vitest + Testing Library）

**测试框架配置**：

- **测试框架**: Vitest 4.0.16
- **测试环境**: happy-dom 20.0.11 + jsdom 27.3.0
- **组件测试**: @testing-library/react 16.3.1
- **用户交互**: @testing-library/user-event 14.6.1
- **断言增强**: @testing-library/jest-dom 6.9.1

**已完成测试覆盖**：

- ✅ Button 组件测试（10 个用例）
- ✅ Validation 工具测试（26 个用例）
- ✅ AuthContext 测试（13 个用例）
- ✅ Login 页面测试（12 个用例）
- ✅ Register 页面测试（14 个用例）
- **总计**: 75 个测试用例，100% 通过率

**测试命令**：

```bash
pnpm test              # 运行所有测试
pnpm test:watch        # 监听模式
pnpm test:ui           # 测试 UI 界面
pnpm test:coverage     # 覆盖率报告
```

**覆盖率要求**：

- 新增代码覆盖率 ≥ 90%
- 核心模块覆盖率 ≥ 95%

### 后端测试（Jest）

**测试类型**：

- **单元测试**: 测试独立函数和类方法
- **集成测试**: 测试 API 端点和业务流程
- **E2E 测试**: 测试完整用户场景

**MxCAD 模块测试覆盖**：

- ✅ MxCadService: 15 个测试用例
- ✅ MxCadController: 30 个测试用例
- **总计**: 45 个测试用例，100% 通过率

**测试命令**：

```bash
pnpm test              # 运行所有测试
pnpm test:unit         # 仅单元测试
pnpm test:integration  # 仅集成测试
pnpm test:e2e          # E2E 测试
pnpm test:cov          # 测试覆盖率
```

**TypeScript 配置**：

- 测试文件已从类型检查中排除（`tsconfig.json` exclude 配置）
- 排除模式：`**/*.spec.ts`, `**/*.e2e-spec.ts`, `test/**/*`

## 13. 开发最佳实践

### 前端开发

1. **统一 API 调用**：不要直接使用 `fetch`，要通过统一的 API 接口层（`services/api.ts`）
2. **类型安全**：使用 `openapi-typescript` 生成的类型定义
3. **组件设计**：遵循单一职责原则，组件功能单一且可复用
4. **状态管理**：使用 React Context + useReducer 进行轻量级状态管理
5. **错误处理**：统一错误处理，提供友好的错误提示
6. **UI 组件库**：使用 Radix UI + Tailwind CSS 构建无障碍 UI
7. **测试优先**：新功能开发前先编写测试用例

### 后端开发

1. **模块化架构**：遵循 NestJS 模块化设计，每个模块负责特定功能
2. **依赖注入**：使用 NestJS 依赖注入，实现松耦合架构
3. **DTO 验证**：使用 `class-validator` 进行输入验证
4. **异常处理**：使用全局异常过滤器，统一错误格式
5. **日志记录**：记录关键操作日志，便于问题排查
6. **使用 Express**：必须使用 `@nestjs/platform-express` 而非 Fastify
7. **测试覆盖**：确保核心业务逻辑有充分的测试覆盖

### 数据库开发

1. **Prisma Client**：所有数据库操作必须通过 Prisma Client
2. **迁移管理**：使用 Prisma Migrate 管理数据库架构变更
3. **事务处理**：多表操作使用 `$transaction` 确保数据一致性
4. **索引优化**：为高频查询字段添加索引
5. **软删除**：使用状态字段标记删除，避免物理删除

### 测试开发

1. **测试优先**：新功能开发前先编写测试用例（TDD）
2. **覆盖率要求**：新增代码覆盖率 ≥ 90%，核心模块 ≥ 95%
3. **前端测试**：使用 Vitest + Testing Library
4. **后端测试**：使用 Jest
5. **测试隔离**：每个测试用例应该独立，不依赖其他测试

## 14. 故障排查

### 常见问题

1. **数据库连接失败**
   - 检查 Docker 容器是否启动：`docker ps`
   - 检查环境变量配置：`packages/backend/.env`
   - 检查端口占用：`netstat -ano | findstr :5432`

2. **Redis 连接失败**
   - 确认 Redis 容器运行正常：`docker ps | findstr redis`
   - 检查端口 6379 是否被占用

3. **MinIO 上传失败**
   - 检查 MinIO 服务状态：http://localhost:9001
   - 确认 Bucket 是否已创建
   - 检查 MinIO 访问密钥配置

4. **类型定义不同步**
   - 运行 `pnpm frontend:generate:types` 重新生成
   - 确保后端服务正在运行

5. **测试失败**
   - 确保测试数据库已初始化
   - 检查环境变量配置（`.env.test`）
   - 清理测试数据：`pnpm db:push --force-reset`

6. **前端测试失败**
   - 检查 Vite 配置：`vite.config.ts`
   - 确保所有依赖已安装
   - 查看详细错误信息：`pnpm test --reporter=verbose`

7. **TypeScript 类型错误**
   - 测试文件已从类型检查中排除
   - 运行 `pnpm type-check` 检查源代码类型
   - 确保 `tsconfig.json` 配置正确

8. **MxCAD 转换失败**
   - 检查 `MXCAD_ASSEMBLY_PATH` 是否正确
   - 确认 mxcadassembly.exe 文件存在且可执行
   - 查看服务器日志获取详细错误信息

### 调试技巧

- **后端日志**：NestJS 内置日志，级别可配置
- **数据库查询**：使用 Prisma Studio 可视化查看数据
- **API 调试**：使用 Swagger UI 或 Postman
- **前端调试**：Chrome DevTools + React DevTools
- **测试调试**：使用 `pnpm test:ui` 打开 Vitest UI 界面

## 15. 部署指南

### 开发环境

```bash
# 启动基础设施
cd packages/backend
pnpm dev:infra

# 启动后端
pnpm start:dev

# 启动前端
cd ../frontend
pnpm dev
```

### 生产环境

```bash
# 使用 Docker Compose
cd packages/backend
pnpm deploy:prod

# 或手动部署
pnpm build
NODE_ENV=production node dist/main
```

### 环境变量检查清单

- [ ] JWT_SECRET 已设置为强密码
- [ ] 数据库密码已修改
- [ ] MinIO 访问密钥已修改
- [ ] 邮件服务已配置
- [ ] CORS 白名单已配置
- [ ] 文件上传大小限制已设置
- [ ] MxCAD 转换工具路径已配置

## 16. Git 提交规范

### Commit Message 格式

```bash
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整（不影响代码运行）
- `refactor`: 代码重构（既不是新增功能，也不是修复 bug）
- `test`: 测试相关
- `chore`: 构建工具或辅助工具变动
- `perf`: 性能优化
- `ci`: CI/CD 配置变更

### 示例

```bash
feat(auth): 添加邮箱验证功能

- 添加邮箱验证 API 端点
- 实现邮件发送服务
- 添加验证码生成和校验逻辑

Closes #123
```

## 17. 文档参考

- `docs/PROJECT_OVERVIEW.md` - 项目架构概述
- `docs/DEVELOPMENT_GUIDE.md` - 开发指南（详细版）
- `docs/API.md` - API 文档
- `docs/API_UPLOAD_DOCUMENTATION.md` - MxCAD 文件上传 API 文档（完整接口规范）
- `docs/MXCAD_UPLOAD_INTEGRATION.md` - **MxCAD 上传服务集成方案（核心文档）**
- `docs/MXCAD_FILE_SYSTEM_UNIFICATION_PLAN.md` - 文件系统统一架构方案
- `docs/DEPLOYMENT.md` - 部署指南
- `docs/GIT_WORKFLOW.md` - Git 工作流
- `docs/AUTH_TROUBLESHOOTING.md` - 认证问题排查
- `docs/FAQ.md` - 常见问题解答
- `docs/CAD_EDITOR_INTEGRATION_PLAN.md` - CAD 编辑器集成计划
- `docs/CAD_FILE_PROCESSING_ARCHITECTURE.md` - CAD 文件处理架构
- `docs/USER_SYSTEM_ARCHITECTURE_BRAINSTORM.md` - 用户系统架构设计
- `packages/backend/src/mxcad/README.md` - MxCAD 模块详细文档

## 18. 最新更新记录

### 2025-12-22（项目架构与依赖优化）

#### 架构完善

- **文件系统统一模型**：FileSystemNode 树形结构完全实现，支持项目/文件夹/文件统一管理
- **MxCAD 集成优化**：前端 Vite 配置完善，支持 `/mxcad` 路由代理到后端 API
- **CADEditorDirect 组件**：实现直连模式 CAD 编辑器，支持项目上下文传递
- **权限体系完善**：三层权限体系（用户角色、项目成员、文件访问）完整实现

#### 依赖更新

- **后端依赖**：新增 Multer 2.0.2 文件上传处理，UUID 13.0.0 唯一标识符
- **前端依赖**：Tailwind CSS 升级至 4.1.18，React Hook Form 增强至 7.68.0
- **测试框架**：Vitest 4.0.16 + Testing Library 16.3.1 完整测试覆盖
- **构建工具**：Vite 6.2.0 支持，TypeScript 严格模式全面启用

#### 文件验证增强

- **扩展白名单**：新增 `.pdf`, `.png`, `.jpg`, `.jpeg` 文件类型支持
- **安全黑名单**：扩展至 `.scr`, `.vbs` 等危险文件类型
- **分片上传**：支持大文件分片上传和断点续传
- **文件去重**：基于 SHA-256 哈希值检测重复文件

#### 开发体验优化

- **命令统一**：根目录和子包命令规范化，支持 `pnpm backend:verify` 和 `pnpm frontend:verify`
- **类型安全**：前后端完全 TypeScript 严格模式，禁止 `any` 类型
- **代码质量**：ESLint + Prettier 自动化代码格式化和检查
- **测试驱动**：新增代码覆盖率 ≥ 90%，核心模块 ≥ 95%

### 2025-12-19（MxCAD 服务完整集成与测试覆盖）

#### 核心功能实现

- **完整 MxCAD 模块**：实现所有 MxCAD-App 兼容接口
- **文件上传与转换**：支持分片上传、断点续传、自动转换
- **MxCAD-App 集成**：新增 `GET /mxcad/file/:filename` 端点支持文件访问
- **返回格式统一**：绕过 NestJS 全局响应包装，确保与 MxCAD-App 完全兼容

#### 测试覆盖完善

- **MxCadService 测试**：15 个测试用例，覆盖所有核心方法
- **MxCadController 测试**：30 个测试用例，覆盖所有 API 端点
- **测试通过率**：45 个测试用例，100% 通过
- **Mock 优化**：完整的 fs 和 child_process mock，确保测试稳定性

#### 技术实现亮点

- **分片上传优化**：手动处理分片文件存储，解决目录创建问题
- **错误处理增强**：完善异常处理和日志记录
- **类型安全保证**：完整的 TypeScript 类型定义和验证
- **文档完善**：详细的接口文档和使用示例

#### 架构优化

- **Express 平台确认**：使用 Express 而非 Fastify 作为 Web 平台
- **代理配置优化**：前端 Vite 配置 `/mxcad` 路由代理到后端
- **模块化设计**：清晰的模块结构和依赖关系

#### 关键成就

- **100% 接口兼容**：与原有 MxCAD-App 完全兼容
- **生产就绪**：完整的错误处理、日志记录和监控
- **开发友好**：详细的文档、示例和故障排查指南
- **测试保障**：全面的单元测试确保代码质量

### 2025-12-23（前端组件完善与统一上传集成）

#### 前端组件体系完善

- **新增组件**：BreadcrumbNavigation、FileItem、Toolbar、ConfirmDialog、Toast 等组件
- **MxCAD 上传组件**：MxCadFileUploader 专用组件，集成百度 WebUploader
- **自定义 Hooks**：useFileSystem 和 useFileUpload 提供状态管理
- **类型定义完善**：新增 filesystem.ts 类型定义文件
- **工具函数扩展**：baiduUploader.ts 和 fileUtils.ts 提供完整文件处理能力

#### 统一上传方案实施

- **百度 WebUploader 集成**：完整集成百度 WebUploader 实现分片上传
- **MxCAD 上下文增强**：修改 MxCadContextInterceptor 支持项目上下文
- **DTO 扩展**：为 ChunkExistDto 和 FileExistDto 添加项目关联字段
- **自动同步机制**：文件上传成功后自动创建 FileSystemNode 记录
- **权限继承**：上传文件自动继承项目权限设置

#### 技术实现亮点

- **统一上传流程**：用户选择文件 → WebUploader 分片上传 → MxCAD 转换 → 文件系统记录
- **项目上下文传递**：支持项目ID和父文件夹ID传递，确保文件归属正确
- **错误处理优化**：完善的错误处理和用户反馈机制
- **类型安全保证**：完整的 TypeScript 类型定义和验证

#### 文档完善

- **新增文档**：MXCAD_UNIFIED_UPLOAD_IMPLEMENTATION.md 详细记录实施方案
- **模块文档**：MxCAD 模块 README.md 完善接口说明和使用示例
- **架构文档**：文件系统统一架构方案文档完善

### 2025-12-24（前端架构优化与文档更新）

#### 前端架构优化

- **MxCAD 上传组件重构**：新增 MxCadUploader 组件，提供完整的上传 UI 和交互
- **原生上传实现**：useMxCadUploadNative Hook 替代百度 WebUploader，实现更稳定的分片上传
- **MxCAD 管理器**：新增 MxCADManager 全局管理器，支持实例复用和永不销毁容器
- **配置管理优化**：新增 config 目录，统一管理前端配置文件

#### 技术实现亮点

- **文件验证增强**：支持各种大小写组合的文件扩展名（.dwg, .dxf, .DWG, .DXF 等）
- **智能重试机制**：分片上传失败自动重试，最终验证超时优雅处理
- **实例复用优化**：MxCADView 实例复用避免重复初始化，提升性能
- **全局容器管理**：永不销毁的 MxCAD 容器，确保编辑器状态持久化

#### 文档体系完善

- **项目结构更新**：准确反映当前前端组件和服务结构
- **新增组件文档**：详细说明 MxCadUploader、useMxCadUploadNative 和 MxCADManager
- **配置说明补充**：添加前端配置目录和文件说明
- **使用示例完善**：提供完整的组件使用示例和最佳实践

#### 代码质量提升

- **类型安全保证**：完整的 TypeScript 类型定义和接口规范
- **错误处理优化**：完善的异常捕获和用户友好的错误提示
- **日志记录增强**：详细的操作日志，便于问题排查和性能监控
- **代码注释完善**：关键逻辑添加详细注释说明

---

_v2.8 | 2025-12-24 | CloudCAD 团队_  
_更新：前端架构优化、MxCAD 上传重构、文档体系完善_