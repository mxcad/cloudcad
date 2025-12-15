# CloudCAD 核心工作规则

## 项目概述

CloudCAD 是基于云的 CAD 图纸管理平台，采用 monorepo 架构，专为 B2B 私有部署设计。

**设计理念**: 开箱即用、简单实用、渐进增强、私有部署

## 核心规则（每次对话都必须提醒）

- **始终使用最新的包都需要查看 context7 找到最新的用法**
- **每次要使用 prisma 相关时先用 context7 查询最新的最佳实践**
- **不要逃避问题，或绕过问题**
- **禁止使用 npm 或 yarn，必须使用 pnpm**
- **执行命令始终使用PowerShell的正确语法，因为当前是windows系统**
- **不要启动--watch 这种报错都不会退出的命令，这样你才知道错误信息**
- **必须代码质量检查通过，不能使用any类型，不能绕过问题**
- **后端nest开发始终使用@nestjs/platform-fastify方案**
- **避免过度设计，优先实现核心功能，企业级扩展按需添加**
- **不需要启动开发服务，始终已经启动开发服务器和后端服务，如果没启动，请提醒我启动。**

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
│   │   │   ├── Layout.tsx  # 主布局组件（含存储空间显示）
│   │   │   └── ui/         # UI基础组件
│   │   ├── contexts/       # React Context
│   │   ├── pages/          # 页面组件
│   │   │   ├── AssetLibrary.tsx    # 资源库
│   │   │   ├── FileManager.tsx     # 文件管理
│   │   │   ├── Login.tsx           # 登录页
│   │   │   ├── ProjectManager.tsx  # 项目管理
│   │   │   ├── Register.tsx        # 注册页
│   │   │   ├── RoleManagement.tsx  # 角色管理
│   │   │   └── UserManagement.tsx  # 用户管理
│   │   ├── services/       # API服务
│   │   │   ├── api.ts      # Mock API
│   │   │   ├── apiService.ts  # Axios封装(含自动解包)
│   │   │   └── mockDb.ts   # Mock数据
│   │   ├── scripts/        # 构建脚本
│   │   │   └── generate-types.js  # 类型生成
│   │   ├── types/          # 类型定义
│   │   │   └── api.ts      # 自动生成的API类型
│   │   └── utils/          # 工具函数
│   └── backend/            # NestJS后端
│       ├── src/
│       │   ├── admin/      # 管理模块
│       │   ├── auth/       # 认证模块
│       │   ├── common/     # 通用模块
│       │   │   ├── dto/    # 通用DTO
│       │   │   │   └── api-response.dto.ts  # 全局响应格式
│       │   │   ├── interceptors/  # 拦截器
│       │   │   │   └── response.interceptor.ts  # 响应包装
│       │   │   ├── guards/      # 守卫
│       │   │   ├── decorators/  # 装饰器
│       │   │   ├── filters/     # 异常过滤器
│       │   │   ├── pipes/       # 管道
│       │   │   ├── schedulers/  # 调度器
│       │   │   └── services/    # 通用服务
│       │   ├── config/     # 配置模块
│       │   ├── database/   # 数据库模块
│       │   ├── file-system/# 文件系统统一管理（项目+文件）
│       │   │   ├── file-system.service.ts       # 文件系统核心服务
│       │   │   ├── file-validation.service.ts   # 文件验证服务
│       │   │   ├── file-system-permission.service.ts  # 权限服务
│       │   │   └── dto/    # DTO定义
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

# 清理缓存
cd packages/frontend
Remove-Item -Path "node_modules\.vite" -Recurse -Force  # 清除Vite缓存
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
  - `isRoot=true`: 项目根目录
  - `isFolder=true`: 文件夹
  - `isFolder=false`: 文件（包含 path, size, mimeType 等字段）
- **User** (用户): 系统用户
- **ProjectMember** (项目成员): 项目级权限
- **FileAccess** (文件权限): 文件/文件夹级权限
- **Asset** (资源): 资源库
- **Font** (字体): 字体库
- **RefreshToken** (刷新令牌): JWT刷新令牌

**枚举**:
- UserRole: ADMIN, USER
- UserStatus: ACTIVE, INACTIVE, SUSPENDED
- ProjectStatus: ACTIVE, ARCHIVED, DELETED
- ProjectMemberRole: OWNER, ADMIN, MEMBER, VIEWER
- FileStatus: UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED
- FileAccessRole: OWNER, EDITOR, VIEWER
- AssetStatus: ACTIVE, INACTIVE, DELETED
- FontStatus: ACTIVE, INACTIVE, DELETED

## 8. Prisma 7.x 配置

```typescript
// prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL },
});

// database.service.ts
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: configService.get('DATABASE_URL') });
super({ log: ['query', 'info', 'warn', 'error'], adapter });
```

## 9. 全局响应格式（重要）

### 后端统一响应结构

**响应拦截器** (`src/common/interceptors/response.interceptor.ts`):
```typescript
export interface Response<T> {
  code: string;      // 'SUCCESS' | 'ERROR'
  message: string;   // '操作成功'
  data: T;          // 实际数据
  timestamp: string; // ISO时间戳
}
```

**所有 API 响应都会被自动包装成**:
```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "data": { /* 实际返回的DTO数据 */ },
  "timestamp": "2025-12-12T03:34:55.801Z"
}
```

### DTO 设计模式

**基础响应 DTO** (`src/common/dto/api-response.dto.ts`):
```typescript
export class ApiResponseDto<T> {
  @ApiProperty() code: string;
  @ApiProperty() message: string;
  @ApiProperty() data: T;
  @ApiProperty() timestamp: string;
}
```

**具体业务响应 DTO**（以认证为例）:
```typescript
// 1. 定义业务数据 DTO
export class AuthResponseDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ type: () => UserDto }) user: UserDto;
}

// 2. 继承泛型响应 DTO，用于 Swagger 文档
export class AuthApiResponseDto extends ApiResponseDto<AuthResponseDto> {
  @ApiProperty({ type: () => AuthResponseDto })
  declare data: AuthResponseDto;
}
```

**Controller 中使用**:
```typescript
@Post('login')
@ApiResponse({
  status: 200,
  type: AuthApiResponseDto,  // Swagger 看到完整结构
})
async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
  return this.authService.login(dto);  // 返回实际数据，拦截器自动包装
}
```

### 前端自动解包

**API Service** (`services/apiService.ts`) 自动处理:
```typescript
// 响应拦截器自动解包
this.client.interceptors.response.use((response) => {
  // 后端返回: { code, message, data, timestamp }
  // 自动解包为: data
  if (response.data && response.data.data !== undefined) {
    response.data = response.data.data;
  }
  return response;
});
```

**前端使用时直接访问数据**:
```typescript
const response = await authApi.login({ account, password });
// response.data 直接是 AuthResponseDto，无需 response.data.data
const { accessToken, refreshToken, user } = response.data;
```

### 新增 API 的步骤

1. **定义业务数据 DTO**
2. **创建继承的响应 DTO**（用于 Swagger）
3. **Controller 返回业务数据**（拦截器自动包装）
4. **前端重新生成类型** (`pnpm generate:types`)
5. **前端直接使用解包后的数据**

## 10. 认证与权限

**JWT 双 Token 机制**:
- Access Token: 1小时 / Refresh Token: 7天

**三层权限**:
1. 用户角色 (UserRole): ADMIN, USER
2. 项目成员 (ProjectMemberRole): OWNER, ADMIN, MEMBER, VIEWER
3. 文件访问 (FileAccessRole): OWNER, EDITOR, VIEWER

**缓存优化**:
- 用户角色: 10分钟TTL / 项目权限: 5分钟TTL / 文件权限: 5分钟TTL

**企业扩展**: 需要时通过适配器模式扩展LDAP/AD（1-2周工作量）

## 11. 测试体系

**框架**: Jest 30.0.0 + ts-jest 29.2.5

**配置**: 覆盖率≥90%、超时30秒、并行50%进程

**分类**:
- `pnpm test:unit` - 单元测试
- `pnpm test:integration` - 集成测试
- `pnpm test:cov` - 覆盖率
- `pnpm test:all` - 所有测试

**测试状态**: ✅ 所有测试用例全部通过，整体覆盖率≥90%

## 12. 文件系统架构

### 统一树形模型设计

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

**树形结构**:
```
项目根目录 (isRoot=true, isFolder=true)
  ├── 设计图文件夹 (isFolder=true)
  │   ├── 建筑图.dwg (isFolder=false)
  │   └── 结构图.dxf (isFolder=false)
  └── 施工图文件夹 (isFolder=true)
      └── 平面图.dwg (isFolder=false)
```

**自引用关联**:
```typescript
model FileSystemNode {
  parentId    String?
  parent      FileSystemNode?  @relation("NodeHierarchy", fields: [parentId])
  children    FileSystemNode[] @relation("NodeHierarchy")
}
```

**权限继承**:
- 项目级权限 (ProjectMember) → 应用于根节点及其所有子节点
- 文件/文件夹级权限 (FileAccess) → 精细化控制特定节点

### 模块重构状态

**已完成重构**:
- ✅ ProjectsModule → 功能迁移到 FileSystemModule
- ✅ FilesModule → 功能迁移到 FileSystemModule  
- ✅ 统一文件系统服务 (FileSystemModule)
- ✅ 权限管理服务 (FileSystemPermissionService)
- ✅ 文件验证服务 (FileValidationService)

**当前状态**: 项目完全基于统一文件系统架构运行

## 13. 用户界面功能

### 左下角菜单栏

**用户信息显示**:
- 用户头像（无头像时显示名称首字母）
- 用户名称（优先显示昵称，其次用户名，最后邮箱）
- 用户角色

**存储空间显示**:
- 已用空间和总空间对比（如：1.2 GB / 5 GB）
- 存储使用率进度条（绿色<70%，黄色70-90%，红色>90%）
- 剩余可用空间显示

**API 端点**: `/file-system/storage` - 获取用户存储空间信息

## 14. 安全规范

- JWT双Token + RBAC + 项目级ACL + 文件级权限
- bcryptjs加密 (12轮盐值)
- 输入验证、XSS/CSRF防护
- 文件类型/大小检查
- HTTPS强制、SQL注入防护

## 15. Docker基础设施

**开发环境** (docker-compose.dev.yml):
- PostgreSQL 15 (5432) / Redis 7 (6379)
- MinIO (9000/9001) / PgAdmin (5050) / Redis Commander (8081)

**生产环境** (docker-compose.yml):
- 完整应用栈 + 健康检查 + 自动重启 + 数据持久化

## 16. CI/CD

**GitHub Actions**:
- test.yml: PR自动测试 + 覆盖率上传Codecov
- ci.yml: 构建 + 测试 + 矩阵构建

**触发**: push到main/develop或创建PR

## 17. Git工作流

**分支**: main (生产) / develop (开发) / feature/* / fix/* / hotfix/*

**提交规范** (Conventional Commits):
```
<类型>: <描述>
```
类型: feat, fix, docs, style, refactor, test, chore

示例: `feat(auth): 添加用户登录功能`

详见 `docs/GIT_WORKFLOW.md`

## 18. 类型安全架构

### 完整流程

```
后端 Controller (DTO + @ApiResponse)
    ↓
Swagger 生成 OpenAPI 文档
    ↓
openapi-typescript 生成前端类型
    ↓
前端使用类型安全的 API
```

### 后端配置

**1. 定义响应 DTO**:
```typescript
// 业务数据
export class UserDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
}

// 完整响应（继承泛型基类）
export class UserApiResponseDto extends ApiResponseDto<UserDto> {
  @ApiProperty({ type: () => UserDto })
  declare data: UserDto;
}
```

**2. Controller 声明**:
```typescript
@Get(':id')
@ApiResponse({ status: 200, type: UserApiResponseDto })
async findOne(@Param('id') id: string): Promise<UserDto> {
  return this.userService.findOne(id);
}
```

### 前端使用

**1. 生成类型**:
```bash
cd packages/frontend
pnpm generate:types  # 后端启动后执行
```

**2. 使用类型**:
```typescript
import { components } from '../types/api';

type UserDto = components['schemas']['UserDto'];
type UserApiResponse = components['schemas']['UserApiResponseDto'];

// API 调用（自动解包）
const user: UserDto = (await usersApi.findOne('123')).data;
```

### 注意事项

- ✅ 所有 DTO 必须使用 `@ApiProperty` 装饰器
- ✅ 响应 DTO 继承 `ApiResponseDto<T>`
- ✅ Controller 使用具体的响应 DTO（如 `AuthApiResponseDto`）
- ✅ Service 返回业务数据（如 `AuthResponseDto`）
- ❌ 不要在 Swagger 中使用泛型 `ApiResponseDto<T>`（无法生成）
- ❌ 不要手动编写前端类型（使用自动生成）

## 19. 文档参考

- `docs/PROJECT_OVERVIEW.md` - 项目架构
- `docs/DEVELOPMENT_GUIDE.md` - 开发指南
- `docs/API.md` - API文档
- `docs/DEPLOYMENT.md` - 部署指南
- `docs/GIT_WORKFLOW.md` - Git规范

## 20. 快速开始

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

## 21. 常见问题

### 1. 测试失败
**原因**: 基础设施未启动  
**解决**: `cd packages/backend && pnpm dev:infra`

### 2. 数据库连接失败
**原因**: PostgreSQL/Redis未运行  
**解决**: 检查 Docker 容器状态 `docker ps`

### 3. 依赖问题
**原因**: 使用了 npm/yarn  
**解决**: 删除 `node_modules`，使用 `pnpm install`

### 4. 类型生成失败
**原因**: 后端服务未启动或 Swagger 配置错误  
**解决**: 
- 确保后端运行 `http://localhost:3001/api-docs`
- 检查 DTO 是否都有 `@ApiProperty`
- 检查响应 DTO 是否正确继承 `ApiResponseDto<T>`

### 5. 前端登录后立即跳回登录页
**原因**: 响应数据结构不匹配，localStorage 存储了 `undefined`  
**解决**:
```bash
# 1. 清除浏览器 localStorage
localStorage.clear();
# 2. 硬刷新页面 Ctrl+Shift+R
# 3. 检查后端响应格式是否正确
```

### 6. Vite 热重载失效/缓存问题
**原因**: Vite 缓存了旧代码  
**解决**:
```powershell
# 停止前端服务
cd packages/frontend
# 清除缓存
Remove-Item -Path "node_modules\.vite" -Recurse -Force
# 重启服务
pnpm dev
# 浏览器硬刷新 Ctrl+Shift+R
```

### 7. API 响应格式错误
**症状**: `response.data.accessToken is undefined`  
**原因**: 前端期待 `{ accessToken }` 但后端返回 `{ code, message, data: { accessToken } }`  
**解决**: 前端 `apiService.ts` 自动解包已实现，检查是否正确导入

### 8. 端口冲突
**原因**: 端口被占用  
**检查**: `netstat -ano | findstr :3001`  
**解决**: 修改 `.env` 中的端口或杀掉占用进程

### 9. TypeScript 类型错误
**原因**: 前端类型与后端不同步  
**解决**:
```bash
# 1. 确保后端服务运行
# 2. 重新生成类型
cd packages/frontend && pnpm generate:types
# 3. 重启前端开发服务器
```

### 10. Swagger 无法生成嵌套类型
**症状**: `openapi-typescript` 报错 `Can't resolve $ref`  
**原因**: 使用了复杂的 `allOf` 或 `$ref` 组合  
**解决**: 使用具体的继承类而非内联 schema：
```typescript
// ❌ 错误：内联 schema
@ApiResponse({
  schema: {
    allOf: [
      { $ref: getSchemaPath(ApiResponseDto) },
      { properties: { data: { $ref: getSchemaPath(AuthResponseDto) } } }
    ]
  }
})

// ✅ 正确：使用继承类
export class AuthApiResponseDto extends ApiResponseDto<AuthResponseDto> {
  @ApiProperty({ type: () => AuthResponseDto })
  declare data: AuthResponseDto;
}

@ApiResponse({ type: AuthApiResponseDto })
```

### 11. 文件系统相关问题

**症状**: 文件上传失败或无法创建文件夹  
**原因**: FileSystemNode 节点类型混淆或父节点不存在  
**解决**:
- 确保根节点 `isRoot=true, isFolder=true`
- 文件夹节点 `isFolder=true`，文件节点 `isFolder=false`
- 创建子节点前检查父节点存在性
- 检查权限：用户是否有父节点的写入权限

**症状**: 无法删除文件夹  
**原因**: 级联删除配置或子节点未清理  
**解决**:
```prisma
// schema.prisma 中已配置级联删除
parent FileSystemNode? @relation(..., onDelete: Cascade)
```
- 删除会自动级联到所有子节点
- 检查数据库约束是否正确

### 12. 存储空间显示问题

**症状**: 存储空间信息不显示或显示错误  
**原因**: API调用失败或数据格式不正确  
**解决**:
- 检查浏览器控制台是否有错误信息
- 确认后端 `/file-system/storage` 端点正常响应
- 检查用户是否已登录
- 验证前端 `projectsApi.getStorageInfo()` 调用是否正确

## 22. 开发理念

### KISS原则
- 优先核心功能，避免过度设计
- 90%客户只需简单登录，不需复杂企业认证
- 按需扩展，有需求再添加
- 代码简单易维护

### 技术选型
- 零外部依赖优先 (内置JWT)
- 渐进增强 (简单→复杂)
- 客户导向 (实际需求优先)
- 可维护性 (可读性优先)

### 避免陷阱
- ❌ 无需求不引入Authentik/Keycloak
- ❌ 不过度设计微服务
- ❌ 不实现所有可能功能
- ✅ 保持简单，快速迭代
- ✅ 解决实际问题

### 类型安全原则
- ✅ 后端优先：DTO 定义是唯一真相源
- ✅ 自动化：类型生成自动化，避免手动同步
- ✅ 分层清晰：业务 DTO vs 响应 DTO
- ✅ 前后端一致：通过 Swagger 保证类型同步
- ❌ 不要绕过类型系统（如 `any`）
- ❌ 不要手动编写重复的类型定义

### 文件系统架构原则
- ✅ 统一模型：项目、文件夹、文件使用同一个 FileSystemNode 模型
- ✅ 树形结构：通过自引用实现灵活的层级管理
- ✅ 权限继承：项目权限自动应用于所有子节点
- ✅ 按需扩展：根据实际需求添加字段（如项目描述、文件元数据）
- ❌ 不要为了"清晰"而拆分成多个表（增加复杂度）
- ❌ 不要在应用层实现权限继承（使用数据库级联）

## 23. 最新更新 (2025-12-15)

### 版本变更
- **前端包名**: 从 `cloudcad` 重命名为 `cloudcad-manager`
- **后端版本**: 稳定在 v0.0.1，依赖包版本全面升级
- **测试状态**: 所有测试用例通过，覆盖率≥90%

### 架构优化
- **模块整合**: ProjectsModule 和 FilesModule 功能完全迁移到 FileSystemModule
- **统一服务**: 基于 FileSystemNode 的统一文件系统架构
- **API完善**: Swagger文档和类型生成系统完全就绪

### 新增功能
- **用户存储空间显示**: 在左下角菜单栏显示用户存储使用情况
- **头像首字母功能**: 用户无头像时显示名称首字母
- **存储空间进度条**: 可视化显示存储使用率，根据使用率显示不同颜色
- **存储空间API**: 后端新增 `/file-system/storage` 端点获取用户存储信息

### 开发工具
- **Biome配置**: 添加了 `biome.json` 代码检查配置
- **测试报告**: 生成详细的测试覆盖率报告
- **Docker支持**: 完善的基础设施容器化配置

---

*v1.4 | 2025-12-15 | CloudCAD团队*  
*更新：用户界面优化、存储空间显示功能、文件系统架构完善*