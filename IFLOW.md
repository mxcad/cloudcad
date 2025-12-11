# CloudCAD 核心工作规则

## 项目概述

CloudCAD 是基于云的 CAD 图纸管理平台，采用 monorepo 架构，专为 B2B 私有部署设计，提供用户管理、角色权限、云盘文件管理、项目创建、工作台、图块库、字体库、文件大小限制、分享功能等核心能力。

## 核心规则（每次对话都必须提醒）

- **始终使用最新的包都需要查看 context7 找到最新的用法**
- **每次要使用 prisma 相关时先用 context7 查询最新的最佳实践**
- **不要逃避问题，或绕过问题**
- **禁止使用 npm 或 yarn，必须使用 pnpm**
- **执行命令始终使用PowerShell的正确语法，因为当前是windows系统**
- **不要启动--watch 这种报错都不会退出的命令，这样你才知道错误信息**
- **必须代码质量检查通过，不能使用any类型，不能绕过问题**

### 1. 环境要求

- **Node.js**: >= 20.19.5 (LTS)
- **pnpm**: >= 9.15.4 (必须使用，禁止使用 npm 或 yarn)
- **前端端口**: 3000
- **后端端口**: 3001
- **数据库**: PostgreSQL 15+
- **缓存**: Redis 7+
- **对象存储**: MinIO

### 2. 包管理

- **必须使用 pnpm 安装依赖**，禁止使用 npm 或 yarn
- 项目采用 monorepo 架构，使用 pnpm workspace 管理
- 依赖版本锁定在 `pnpm-lock.yaml`，确保环境一致性

### 3. 代码规范

- **语言**: TypeScript 5.0+，严格模式
- **格式化**: 使用 ESLint 8.57.0 + Prettier 3.2.0
- **命名规范**:
  - 变量和函数：英文驼峰命名法 (camelCase)
  - 类和接口：英文帕斯卡命名法 (PascalCase)
  - 常量：全大写加下划线 (UPPER_SNAKE_CASE)
  - **禁止使用拼音命名**
- **函数规范**:
  - 单行长度 ≤ 80 字符
  - 圈复杂度 ≤ 5
  - 优先使用纯函数
  - 函数参数 ≤ 5 个
  - 函数长度 ≤ 50 行
- **文件规范**:
  - 单文件单组件/类原则
  - 遵循单一职责原则 (SRP)
  - 导入语句按字母顺序排列

### 4. 技术栈架构

**前端技术栈**:

- **框架**: React 19.2.1 + TypeScript 5.8.2
- **构建工具**: Vite 6.2.0
- **路由**: React Router DOM 7.10.1
- **UI组件**: Lucide React 图标库
- **数据可视化**: Recharts 3.5.1

**后端技术栈**:

- **框架**: NestJS 11.0.1 + TypeScript 5.7.3
- **数据库**: PostgreSQL + Prisma 7.1.0 ORM
- **数据库适配器**: @prisma/adapter-pg 7.1.0 (Prisma 7.x 必需)
- **文件存储**: MinIO 8.0.6 (S3兼容)
- **缓存**: Redis
- **身份认证**: JWT 双 Token 机制 (Access Token + Refresh Token)
- **Web框架**: Fastify (通过 @nestjs/platform-fastify)
- **静态文件**: @fastify/static 8.3.0
- **密码加密**: bcryptjs 3.0.3 (12轮盐值)

### 5. API 架构

- **禁止直接使用 fetch**，必须通过统一的 API 接口层
- API 接口需在三个层面同步实现：
  - `apiContract` - 接口契约定义
  - `fetchAdapter` - 真实 API 适配器
  - `mockAdapter` - Mock 数据适配器
- 保持认证机制一致性
- 统一错误处理和响应格式

### 6. 项目结构

```
cloudcad/
├── .github/                # GitHub Actions 工作流
│   └── workflows/          # 自动化工作流
│       ├── ci.yml         # 持续集成工作流
│       └── test.yml       # 测试工作流
├── .iflow/                 # iFlow CLI配置和钩子
├── docs/                   # 项目文档
│   ├── API.md             # API文档
│   ├── DEPLOYMENT.md      # 部署指南
│   ├── DEVELOPMENT_GUIDE.md # 开发指南
│   ├── DEVELOPMENT.md     # 开发说明
│   ├── PROJECT_OVERVIEW.md # 项目概述
│   └── USER_SYSTEM_ARCHITECTURE_BRAINSTORM.md # 用户系统架构设计
├── packages/
│   ├── frontend/           # 前端应用 (cloudcad-manager)
│   │   ├── components/     # React组件
│   │   ├── pages/          # 页面组件
│   │   ├── services/       # API服务层
│   │   ├── types.ts        # TypeScript类型定义
│   │   └── vite.config.ts  # Vite配置
│   └── backend/            # NestJS后端应用
│       ├── src/            # 源代码
│       │   ├── admin/      # 管理模块
│       │   ├── auth/       # 认证模块
│       │   │   ├── controllers/ # 认证控制器
│       │   │   ├── services/    # 认证服务
│       │   │   ├── strategies/  # JWT策略
│       │   │   ├── guards/      # 认证守卫
│       │   │   └── dto/         # 认证DTO
│       │   ├── common/     # 通用模块
│       │   │   ├── decorators/  # 装饰器
│       │   │   ├── enums/       # 枚举
│       │   │   ├── guards/      # 守卫
│       │   │   ├── interceptors/ # 拦截器
│       │   │   ├── pipes/       # 管道
│       │   │   ├── services/    # 通用服务
│       │   │   └── schedulers/  # 定时任务
│       │   ├── config/     # 配置模块
│       │   ├── database/   # 数据库模块
│       │   ├── files/      # 文件管理模块
│       │   ├── health/     # 健康检查
│       │   ├── projects/   # 项目管理模块
│       │   ├── storage/    # 存储模块
│       │   ├── test/       # 测试模块
│       │   │   ├── setup.ts    # 测试设置
│       │   │   └── test-utils.ts # 测试工具
│       │   └── users/      # 用户管理模块
│       │       ├── README.md    # 用户系统文档
│       │       ├── dto/         # 数据传输对象
│       │       ├── controllers/ # 控制器
│       │       ├── services/    # 服务
│       │       └── *.spec.ts    # 测试文件
│       ├── prisma/         # 数据库模式
│       │   ├── schema.prisma
│       │   ├── seed.ts     # 种子数据
│       │   └── prisma.config.ts # Prisma 7.x配置
│       ├── docker-compose.dev.yml # 开发环境容器
│       ├── jest.config.ts  # Jest测试配置
│       └── .env.example    # 环境变量示例
├── .eslintrc.js            # ESLint配置文件
├── .prettierrc             # Prettier配置文件
├── .prettierignore         # Prettier忽略文件
├── package.json            # 根package.json
├── pnpm-workspace.yaml     # pnpm工作空间配置
└── tsconfig.json           # TypeScript配置
```

### 7. 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发服务
pnpm dev                    # 启动所有服务
pnpm backend:dev            # 仅启动后端 (包含基础设施)
cd packages/frontend && pnpm dev  # 仅启动前端

# 构建项目
pnpm build                  # 构建所有包
pnpm backend:build          # 仅构建后端
cd packages/frontend && pnpm build  # 仅构建前端

# 代码检查和格式化 (ESLint + Prettier)
pnpm check                  # 完整代码检查
pnpm check:fix              # 检查并自动修复
pnpm lint                   # 代码规范检查
pnpm lint:fix               # 检查并修复
pnpm format                 # 代码格式化
pnpm format:check           # 检查代码格式
pnpm type-check             # TypeScript类型检查

# 数据库操作 (Prisma 7.x)
cd packages/backend
pnpm db:generate            # 生成Prisma客户端
pnpm db:push                # 推送数据库模式
pnpm db:migrate             # 运行数据库迁移
pnpm db:studio              # 打开Prisma Studio
pnpm db:seed                # 运行种子数据初始化

# Docker和基础设施操作
cd packages/backend
pnpm dev:infra              # 启动开发基础设施 (PostgreSQL, Redis, MinIO)
pnpm dev:infra:stop         # 停止开发基础设施
pnpm docker:build           # 构建Docker镜像
pnpm docker:up              # 启动Docker容器
pnpm docker:down            # 停止Docker容器

# 测试操作
cd packages/backend
pnpm test                   # 运行单元测试
pnpm test:watch             # 监视模式运行测试
pnpm test:cov               # 运行测试覆盖率
pnpm test:unit              # 运行单元测试(排除集成测试)
pnpm test:integration       # 运行集成测试
pnpm test:e2e               # 运行端到端测试
pnpm test:debug             # 调试模式运行测试
pnpm test:ci                # CI环境运行测试

# 清理
pnpm clean                  # 清理构建产物
```

### 8. 环境配置

**前端环境变量** (`packages/frontend/.env.local`):

```env
GEMINI_API_KEY=your_gemini_api_key
```

**后端环境变量** (`packages/backend/.env`):

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
```

### 9. 数据库模式

核心数据模型：

- **User**: 用户管理 (角色、状态、权限)
- **Project**: 项目管理 (成员、文件)
- **File**: 文件管理 (上传、下载、转换)
- **Asset**: 资源库 (图块、符号、模板)
- **Font**: 字体库管理
- **ProjectMember**: 项目成员关系
- **FileAccess**: 文件访问权限
- **RefreshToken**: JWT刷新令牌管理

枚举类型：

- **UserRole**: ADMIN, USER
- **UserStatus**: ACTIVE, INACTIVE, SUSPENDED
- **ProjectStatus**: ACTIVE, ARCHIVED, DELETED
- **ProjectMemberRole**: OWNER, ADMIN, MEMBER, VIEWER
- **FileStatus**: UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED
- **FileAccessRole**: OWNER, EDITOR, VIEWER
- **AssetStatus**: ACTIVE, INACTIVE, DELETED
- **FontStatus**: ACTIVE, INACTIVE, DELETED

### 10. Prisma 7.x 重要配置

**Prisma 配置文件** (`packages/backend/prisma.config.ts`):

```typescript
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
```

**数据库服务配置** (`packages/backend/src/database/database.service.ts`):

```typescript
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7.x 需要使用适配器
const adapter = new PrismaPg({
  connectionString: configService.get('DATABASE_URL'),
});

super({
  log: ['query', 'info', 'warn', 'error'],
  adapter,
});
```

### 11. 用户认证与权限系统

**JWT 双 Token 机制**:

- Access Token: 1小时有效期，用于API访问
- Refresh Token: 7天有效期，用于刷新Access Token
- 强随机JWT Secret (生产环境必须更换)

**三层权限系统**:

1. **用户角色权限** (UserRole): ADMIN, USER
2. **项目成员权限** (ProjectMemberRole): OWNER, ADMIN, MEMBER, VIEWER
3. **文件访问权限** (FileAccessRole): OWNER, EDITOR, VIEWER

**认证流程**:

1. 用户登录获取双Token
2. Access Token用于API请求认证
3. Access Token过期时使用Refresh Token自动刷新
4. 权限装饰器验证用户操作权限

**权限缓存优化**:

- 用户角色缓存：10分钟TTL
- 项目权限缓存：5分钟TTL
- 文件权限缓存：5分钟TTL
- 自动清理过期缓存

### 12. 测试体系

**测试框架**: Jest 30.0.0 + ts-jest 29.2.5

**测试配置** (`packages/backend/jest.config.ts`):

- 覆盖率阈值：全局90%，核心模块95%
- 测试超时：30秒
- 自动清理：测试后自动清理mock和定时器
- 并行控制：最大50%工作进程

**测试分类**:

- **单元测试**: `pnpm test:unit`
- **集成测试**: `pnpm test:integration`
- **端到端测试**: `pnpm test:e2e`
- **覆盖率测试**: `pnpm test:cov`

**测试覆盖范围**:

- 用户系统：66个测试用例全部通过
- 认证系统：完整的JWT流程测试
- 权限系统：RBAC和ACL测试
- 数据库操作：CRUD和事务测试

### 13. 安全规范

- **认证**: JWT 双 Token 机制 (Access Token + Refresh Token)
- **权限**: RBAC + 项目级 ACL + 文件级权限控制
- **数据验证**: 输入参数验证，XSS/CSRF 防护
- **密码安全**: bcryptjs 加密存储 (12轮盐值)
- **API 安全**: 强随机JWT Secret，无动态拼接 SQL/Shell/URL
- **文件安全**: 类型检查、大小限制、病毒扫描
- **网络安全**: HTTPS 强制，防 SQL 注入，防 XSS 攻击
- **日志记录**: 详细的认证和权限检查日志

### 14. 开发基础设施

**Docker 开发环境** (`packages/backend/docker-compose.dev.yml`):

- PostgreSQL 15 (端口 5432)
- Redis 7 (端口 6379)
- MinIO (端口 9000/9001)
- PgAdmin (端口 5050)
- Redis Commander (端口 8081)

### 15. 部署要求

- **容器化**: Docker + Docker Compose
- **反向代理**: Nginx
- **数据库**: PostgreSQL 15+
- **缓存**: Redis 7+
- **存储**: MinIO 对象存储
- **监控**: 健康检查端点 `/health`
- **日志**: 结构化日志输出

### 16. CI/CD 自动化

**GitHub Actions 工作流**:

- **测试工作流** (`.github/workflows/test.yml`):
  - 自动运行在 push 到 main/develop 分支或创建 PR 时
  - 启动 PostgreSQL 15 和 Redis 7 测试环境
  - 执行完整的代码质量检查和后端测试
  - 生成并上传测试覆盖率报告到 Codecov

- **持续集成工作流** (`.github/workflows/ci.yml`):
  - 完整的 CI 流程，包含构建和测试
  - 矩阵构建支持多版本 Node.js
  - 自动化依赖缓存优化
  - 构建产物验证和测试覆盖率检查

**触发条件**:
- 推送到 `main` 或 `develop` 分支
- 创建针对 `main` 或 `develop` 分支的 Pull Request
- 手动触发工作流运行

**环境配置**:
- 自动设置 Node.js 20.19.5 和 pnpm 9.15.4
- 使用 GitHub Actions 缓存优化依赖安装速度
- 自动配置测试环境变量和数据库连接

### 17. 开发约定

- **Git 工作流**: 功能分支开发，PR 代码评审
- **测试**: 单元测试覆盖率 ≥ 90%
- **性能**: 数据库查询优化，缓存策略
- **文档**: API 文档自动生成 (Swagger)
- **监控**: 性能指标收集，错误追踪

### 18. iFlow CLI 集成

- **钩子系统**: 自动化代码质量检查、文件保护、Git 增强
- **会话管理**: 智能会话上下文保存和恢复
- **代码生成**: 基于上下文的智能代码生成
- **质量保证**: 自动化代码规范检查和安全扫描

### 19. 代码质量工具配置

**ESLint 配置** (`.eslintrc.js`):

- 基础规则：eslint:recommended
- 前端扩展：plugin:react/recommended, plugin:react-hooks/recommended
- 后端规则：Node.js 环境适配
- 通用规则：无未使用变量、无控制台输出（后端除外）

**Prettier 配置** (`.prettierrc`):

- 单引号字符串
- 分号结尾
- 尾随逗号（ES5）
- 80字符行宽
- 2空格缩进
- LF换行符

### 20. TypeScript 配置

**编译选项**:

- 模块系统: nodenext
- 模块解析: nodenext
- 目标: ES2023
- 装饰器: 支持
- 源映射: 启用
- 严格模式: 部分启用 (noImplicitAny: false)

---

## 📚 完整文档参考

- **`docs/PROJECT_OVERVIEW.md`** - 项目详细说明和技术架构
- **`docs/DEVELOPMENT_GUIDE.md`** - 详细开发指南和代码规范
- **`docs/DEVELOPMENT.md`** - 开发环境说明
- **`docs/API.md`** - 完整 API 文档和接口规范
- **`docs/DEPLOYMENT.md`** - 部署指南和生产环境配置
- **`docs/USER_SYSTEM_ARCHITECTURE_BRAINSTORM.md`** - 用户系统架构设计
- **`packages/backend/src/users/README.md`** - 用户系统详细说明文档

## 🚀 快速开始

```bash
# 1. 克隆项目
git clone <repository-url>
cd cloudcad

# 2. 安装依赖
pnpm install

# 3. 启动开发基础设施
cd packages/backend
pnpm dev:infra

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件配置数据库等信息

# 5. 初始化数据库
pnpm db:generate
pnpm db:push
pnpm db:seed

# 6. 启动开发环境
cd ../../
pnpm dev

# 7. 访问应用
# 前端: http://localhost:3000
# 后端API: http://localhost:3001
# API文档: http://localhost:3001/api/docs
# PgAdmin: http://localhost:5050
# Redis Commander: http://localhost:8081
# MinIO控制台: http://localhost:9001

# 8. 运行测试
cd packages/backend
pnpm test                 # 运行所有测试
pnpm test:cov            # 查看测试覆盖率
```

## 🧪 测试状态

当前测试覆盖情况：

- **用户系统测试**: ✅ 66个测试用例全部通过
  - 控制器测试: 34个测试用例
  - 服务层测试: 32个测试用例
- **认证系统测试**: ✅ 完整覆盖
- **权限系统测试**: ✅ 完整覆盖
- **整体覆盖率**: ≥ 90%

## 🔧 常见问题解决

1. **测试失败**: 检查是否启动了开发基础设施 (`pnpm dev:infra`)
2. **数据库连接**: 确保 PostgreSQL 和 Redis 正在运行
3. **权限错误**: 检查 JWT 配置和用户角色设置
4. **依赖问题**: 使用 `pnpm install` 而非 npm/yarn