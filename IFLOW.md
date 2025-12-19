# CloudCAD - 子智能体路由规则

## 核心规则（每次对话都必须提醒）

- **禁止使用 npm 或 yarn，必须使用 pnpm**
- **执行命令始终使用PowerShell的正确语法，因为当前是windows系统**
- **不要启动--watch 这种报错都不会退出的命令，这样你才知道错误信息**
- **必须代码质量检查通过，不能使用any类型，不能绕过问题**
- **后端nest开发始终使用@nestjs/platform-fastify方案**
- **100% 先调用子代理（无例外，主上下文只做路由）**


## 1. 环境要求

- **Node.js**: >= 20.19.5 (LTS)
- **pnpm**: >= 9.15.4 (必须使用，禁止使用 npm 或 yarn)
- **数据库**: PostgreSQL 15+ / Redis 7+ / MinIO
- **端口**: 前端 3000 / 后端 3001

## 2. 代码规范

- **语言**: TypeScript 5.0+，严格模式
- **格式化**: ESLint 8.57.0 + Prettier 3.2.0
- **命名**: camelCase (变量/函数)、PascalCase (类/接口)、UPPER_SNAKE_CASE (常量)
- **禁止使用拼音命名**
- **函数规范**: 单行≤80字符、圈复杂度≤5、参数≤5个、长度≤50行

## 3. 技术栈

**前端** (cloudcad-manager):
- React 19.2.1 + TypeScript 5.8.2 + Vite 6.2.0
- React Router DOM 7.10.1 + Axios 1.13.2
- Lucide React 0.556.0 + Recharts 3.5.1

**后端**:
- NestJS 11.0.1 + TypeScript 5.7.3 + Fastify 5.6.2
- @nestjs/platform-fastify 11.1.9 + @fastify/static 8.3.0
- @nestjs-modules/ioredis 2.0.2 + @nestjs/schedule 6.1.0
- Prisma 7.1.0 + @prisma/adapter-pg 7.1.0
- PostgreSQL 15 + Redis 7 + MinIO 8.0.6
- JWT + bcryptjs 3.0.3 + @nestjs/swagger 11.2.3

## 4. 项目结构

```
cloudcad/
├── docs/                   # 项目文档
├── packages/
│   ├── frontend/           # React前端 (cloudcad-manager)
│   │   ├── components/     # React组件
│   │   ├── contexts/       # React Context
│   │   ├── pages/          # 页面组件
│   │   ├── services/       # API服务
│   │   ├── scripts/        # 构建脚本
│   │   ├── types/          # 类型定义
│   │   └── utils/          # 工具函数
│   └── backend/            # NestJS后端
│       ├── src/
│       │   ├── admin/      # 管理模块
│       │   ├── auth/       # 认证模块
│       │   ├── common/     # 通用模块
│       │   ├── config/     # 配置模块
│       │   ├── database/   # 数据库模块
│       │   ├── file-system/# 文件系统统一管理
│       │   ├── health/     # 健康检查
│       │   ├── redis/      # Redis模块
│       │   ├── storage/    # MinIO存储模块
│       │   └── users/      # 用户管理
│       └── prisma/         # Prisma配置
├── .eslintrc.js
├── .prettierrc
└── pnpm-workspace.yaml
```

## 5. 开发命令

```bash
# 依赖管理
pnpm install

# 开发服务
pnpm dev                    # 启动所有服务
pnpm backend:dev            # 仅启动后端
cd packages/frontend && pnpm dev  # 仅启动前端

# 构建
pnpm build
pnpm backend:build

# 代码质量
pnpm check                  # 完整检查
pnpm check:fix              # 检查并修复
pnpm lint:fix               # ESLint修复
pnpm format                 # Prettier格式化

# 数据库 (Prisma 7.x)
cd packages/backend
pnpm db:generate            # 生成客户端
pnpm db:push                # 推送模式
pnpm db:migrate             # 运行迁移
pnpm db:studio              # 打开Studio
pnpm db:seed                # 种子数据

# Docker
pnpm dev:infra              # 启动基础设施
pnpm dev:infra:stop         # 停止基础设施
pnpm docker:up              # 启动容器
pnpm docker:down            # 停止容器

# 测试
pnpm test                   # 单元测试
pnpm test:cov               # 测试覆盖率
pnpm test:integration       # 集成测试
pnpm test:all               # 所有测试

# 类型生成
cd packages/frontend
pnpm generate:types         # 从Swagger生成类型
```

## 6. 环境配置

**前端** (`packages/frontend/.env.local`):
```env
GEMINI_API_KEY=your_gemini_api_key
```

**后端** (`packages/backend/.env`):
```env
# 应用
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=cloucad
DB_MAX_CONNECTIONS=20

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=cloucad

# 文件上传
UPLOAD_MAX_SIZE=104857600
UPLOAD_ALLOWED_TYPES=.dwg,.dxf,.pdf,.png,.jpg,.jpeg
```

## 7. 数据库模式

**核心架构**: 采用统一的树形文件系统模型（FileSystemNode）

**核心模型**:
- **FileSystemNode** (文件系统节点): 统一管理项目、文件夹、文件的树形结构
- **User** (用户): 系统用户
- **ProjectMember** (项目成员): 项目级权限
- **FileAccess** (文件权限): 文件/文件夹级权限
- **Asset** (资源): 资源库
- **Font** (字体): 字体库
- **RefreshToken** (刷新令牌): JWT刷新令牌

## 8. 认证与权限

**JWT 双 Token 机制**:
- Access Token: 1小时 / Refresh Token: 7天
- Token黑名单: 登出时将Token加入黑名单，防止重复使用

**三层权限**:
1. 用户角色 (UserRole): ADMIN, USER
2. 项目成员 (ProjectMemberRole): OWNER, ADMIN, MEMBER, VIEWER
3. 文件访问 (FileAccessRole): OWNER, EDITOR, VIEWER

**邮箱验证流程**:
- 注册时发送验证邮件
- 用户点击验证链接或输入验证码
- 验证成功后账号激活，方可正常登录

**密码重置流程**:
- 用户申请密码重置，系统发送验证邮件
- 用户输入验证码和新密码
- 验证通过后密码更新成功

## 9. 文件系统架构

CloudCAD 采用 **FileSystemNode 统一模型** 替代传统的 Project + File 分离架构：

**核心优势**:
- ✅ 统一的树形结构：项目、文件夹、文件使用同一个模型
- ✅ 灵活的层级管理：支持无限嵌套文件夹
- ✅ 简化的权限控制：统一的权限管理逻辑
- ✅ 高效的查询性能：通过自引用实现递归查询

**节点类型**:

| 类型 | isRoot | isFolder | 字段特点 |
|------|--------|----------|---------|
| 项目根目录 | true | true | 包含 projectStatus, description |
| 文件夹 | false | true | 仅包含基础字段（name, owner, parent） |
| 文件 | false | false | 包含 path, size, mimeType, fileStatus 等 |

## 10. 全局响应格式

**后端统一响应结构**:
```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "data": { /* 实际返回的DTO数据 */ },
  "timestamp": "2025-12-12T03:34:55.801Z"
}
```

**前端自动解包**: API Service 自动解包响应数据，前端直接使用 `response.data`

## 11. 类型安全架构

**完整流程**:
```
后端 Controller (DTO + @ApiResponse)
    ↓
Swagger 生成 OpenAPI 文档
    ↓
openapi-typescript 生成前端类型
    ↓
前端使用类型安全的 API
```

**类型生成**: `cd packages/frontend && pnpm generate:types`

## 12. 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施
cd packages/backend && pnpm dev:infra

# 3. 配置环境
cp .env.example .env

# 4. 初始化数据库
pnpm db:generate && pnpm db:push && pnpm db:seed

# 5. 启动开发
cd ../../ && pnpm dev

# 6. 生成类型
cd packages/frontend && pnpm generate:types
```

**访问地址**:
- 前端: http://localhost:3000
- 后端API: http://localhost:3001
- API文档: http://localhost:3001/api-docs
- MinIO: http://localhost:9001

## 13. 文档参考

- `docs/PROJECT_OVERVIEW.md` - 项目架构
- `docs/DEVELOPMENT_GUIDE.md` - 开发指南
- `docs/API.md` - API文档
- `docs/DEPLOYMENT.md` - 部署指南
- `docs/GIT_WORKFLOW.md` - Git规范
- `docs/AUTH_TROUBLESHOOTING.md` - 认证问题排查
- `docs/FAQ.md` - 常见问题解答

## 14. 最新更新 (2025-12-16)

### 新增认证页面
- 邮箱验证页面 (EmailVerification.tsx)
- 忘记密码页面 (ForgotPassword.tsx)
- 重置密码页面 (ResetPassword.tsx)
- 用户资料页面 (Profile.tsx)

### 认证功能完善
- 邮箱验证机制: 完整的邮箱验证流程
- 密码重置功能: 安全的密码重置流程
- Token黑名单: 登出时将Token加入黑名单
- 自动Token刷新: 前端自动处理Token过期

### 问题修复
- 401错误处理: 完善了Token过期和刷新机制
- 端口冲突: 添加了端口占用检查和解决方案
- 认证流程: 优化了登录、注册、验证的完整流程

---

*v1.5 | 2025-12-16 | CloudCAD团队*  
*更新：认证系统完善、新墘认证页面、401错误修复、依赖版本升级*