# 开发指南

CloudCAD 项目开发指南，包含开发环境配置、编码规范、测试指南等内容。

## 📋 目录

- [环境要求](#-环境要求)
- [开发环境配置](#-开发环境配置)
- [项目结构](#-项目结构)
- [编码规范](#-编码规范)
- [开发流程](#-开发流程)
- [测试指南](#-测试指南)
- [调试指南](#-调试指南)
- [常见问题](#-常见问题)

## 🔧 环境要求

### 必需环境

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 20.19.5 | LTS 版本 |
| pnpm | >= 9.15.9 | 包管理器 |
| PostgreSQL | 15+ | 关系数据库 |
| Redis | 7+ | 缓存系统 |
| Git | 最新 | 版本控制 |

### 推荐工具

| 工具 | 说明 |
|------|------|
| VS Code | 推荐编辑器 |
| PowerShell | Windows 终端 |
| DBeaver | 数据库管理工具 |
| RedisInsight | Redis 可视化工具 |
| Postman | API 测试工具 |

## 🚀 开发环境配置

### 1. 克隆项目

```bash
git clone <repository-url>
cd cloudcad
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

#### 后端环境配置

```bash
cd packages/backend
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务器配置
PORT=3001
NODE_ENV=development

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/cloudcad

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT 配置
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# 文件存储配置
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=1073741824
```

#### 前端环境配置

```bash
cd packages/frontend
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 应用配置
VITE_APP_NAME=梦想网页 CAD 实时协同平台
VITE_APP_LOGO=/logo.png
VITE_API_BASE_URL=/api
VITE_APP_COOPERATE_URL=http://localhost:3091
```

### 4. 启动基础设施

```bash
# 启动 PostgreSQL 和 Redis（使用 Docker）
docker-compose up -d postgres redis

# 或使用本地服务
# 确保 PostgreSQL 和 Redis 已安装并运行
```

### 5. 数据库初始化

```bash
cd packages/backend

# 生成 Prisma Client
pnpm db:generate

# 推送数据库结构
pnpm db:push

# 运行种子数据
pnpm db:seed
```

### 6. 启动开发服务

```bash
# 方式一：使用根目录脚本（推荐）
pnpm dev

# 方式二：分别启动
# 终端 1 - 后端
cd packages/backend
pnpm dev

# 终端 2 - 前端
cd packages/frontend
pnpm dev
```

### 7. 验证服务

- 前端：http://localhost:3000
- 后端：http://localhost:3001
- API 文档：http://localhost:3001/api/docs

## 📁 项目结构

### Monorepo 结构

```
cloudcad/
├── packages/
│   ├── frontend/           # 前端应用
│   ├── backend/            # 后端服务
│   ├── config-service/     # 配置中心
│   └── svnVersionTool/     # SVN 工具
├── docker/                 # Docker 部署
├── runtime/                # 运行时配置
├── scripts/                # 构建脚本
└── documents/              # 项目文档
```

### 后端结构

```
packages/backend/
├── src/
│   ├── main.ts            # 应用入口
│   ├── app.module.ts      # 根模块
│   ├── modules/           # 业务模块
│   │   ├── auth/          # 认证模块
│   │   ├── users/         # 用户模块
│   │   ├── file-system/   # 文件系统模块
│   │   └── ...
│   ├── common/            # 公共模块
│   │   ├── decorators/    # 装饰器
│   │   ├── filters/       # 过滤器
│   │   ├── guards/        # 守卫
│   │   ├── interceptors/  # 拦截器
│   │   └── pipes/         # 管道
│   └── config/            # 配置文件
├── prisma/
│   ├── schema.prisma      # 数据库模型
│   └── seed.ts            # 种子数据
└── test/                  # 测试文件
```

### 前端结构

```
packages/frontend/
├── src/
│   ├── main.tsx           # 应用入口
│   ├── App.tsx            # 根组件
│   ├── pages/             # 页面组件
│   │   ├── Home/
│   │   ├── Login/
│   │   └── ...
│   ├── components/        # UI 组件
│   │   ├── common/
│   │   ├── layout/
│   │   └── ...
│   ├── hooks/             # 自定义 Hooks
│   ├── services/          # API 服务
│   ├── stores/            # 状态管理
│   ├── contexts/          # Contexts
│   ├── utils/             # 工具函数
│   └── assets/            # 资源文件
├── public/                # 静态资源
└── tests/                 # 测试文件
```

## 📝 编码规范

### 元约束

| 约束 | 说明 |
|------|------|
| 100% 中文 | zh-CN 简体，技术术语可保留英文 |
| 100% pnpm | 禁止 npm/yarn |
| 100% PowerShell | Windows 环境 |
| 100% Express | NestJS 后端必须使用 Express |
| 100% 禁止 any | TypeScript 严格模式 |

### TypeScript 规范

#### 禁止使用 any

```typescript
// ❌ 错误
function processData(data: any) {
  return data.value;
}

// ✅ 正确
interface Data {
  value: string;
}

function processData(data: Data): string {
  return data.value;
}
```

#### 使用明确类型

```typescript
// ❌ 错误 - Prisma 模糊类型
const user = await prisma.user.findUnique({
  where: { id: userId },
});

// ✅ 正确 - 明确类型
const user: User | null = await prisma.user.findUnique({
  where: { id: userId },
});
```

### 命名规范

| 类型 | 命名风格 | 示例 |
|------|---------|------|
| 组件/类 | PascalCase | `UserProfile`, `AuthService` |
| 函数/变量 | camelCase | `getUserData`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL`, `MAX_COUNT` |
| 类型/接口 | PascalCase | `User`, `ApiResponse` |
| 文件 | 与内容一致 | `user.service.ts`, `UserProfile.tsx` |

### 代码风格

#### 函数长度

- 函数长度 ≤ 50 行
- 圈复杂度 ≤ 5

#### 注释规范

```typescript
/**
 * 用户服务
 * 处理用户相关的业务逻辑
 */
@Injectable()
export class UserService {
  /**
   * 根据 ID 查找用户
   * @param userId - 用户 ID
   * @returns 用户对象，不存在返回 null
   */
  async findById(userId: string): Promise<User | null> {
    // 实现代码
  }
}
```

### 前端规范

#### 组件内禁止定义组件

```typescript
// ❌ 错误
function Parent() {
  function Child() {
    return <div>Child</div>;
  }
  return <Child />;
}

// ✅ 正确
function Child() {
  return <div>Child</div>;
}

function Parent() {
  return <Child />;
}
```

#### 使用 CSS 变量

```typescript
// ❌ 错误
const button = styled.button`
  background-color: #3b82f6;
`;

// ✅ 正确
const button = styled.button`
  background-color: var(--color-primary);
`;

```

### 后端规范

#### DTO 验证

```typescript
import { IsString, IsEmail, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

#### 统一响应格式

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
```

## 🔄 开发流程

### 1. 创建功能分支

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### 2. 开发功能

```bash
# 编写代码
# 添加测试
# 运行检查
pnpm check
```

### 3. 提交代码

```bash
git add .
git commit -m "feat: 添加新功能描述"
```

### 4. 推送分支

```bash
git push origin feature/your-feature-name
```

### 5. 创建 Pull Request

- 在 GitHub/GitLab 上创建 PR
- 填写 PR 描述
- 请求代码审查

### 6. 代码审查

- 等待审查
- 根据反馈修改
- 审查通过后合并

## 🧪 测试指南

### 测试类型

| 类型 | 说明 | 位置 |
|------|------|------|
| 单元测试 | 函数、组件测试 | `*.spec.ts` |
| 集成测试 | 模块间交互 | `*.integration.spec.ts` |
| E2E 测试 | 完整流程测试 | `test/e2e/` |

### 运行测试

```bash
# 后端测试
cd packages/backend

# 所有测试
pnpm test

# 单元测试
pnpm test:unit

# 集成测试
pnpm test:integration

# 覆盖率
pnpm test:cov

# 权限测试
pnpm test:permission

# E2E 测试
pnpm test:e2e
```

```bash
# 前端测试
cd packages/frontend

# 所有测试
pnpm test

# UI 模式
pnpm test:ui

# 监听模式
pnpm test:watch

# 覆盖率
pnpm test:coverage
```

### 编写测试

#### 单元测试示例

```typescript
// user.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  it('应该创建用户', async () => {
    const userData = { username: 'test', email: 'test@example.com' };
    const user = await service.create(userData);
    expect(user.username).toBe('test');
  });
});
```

## 🐛 调试指南

### 后端调试

#### 日志查看

```bash
# 查看后端日志
docker logs cloudcad-backend -f

# 或查看日志文件
tail -f logs/backend.log
```

#### 数据库调试

```bash
# 打开 Prisma Studio
cd packages/backend
pnpm db:studio

# 查看数据库连接
psql -U user -d cloudcad
```

### 前端调试

#### 开发工具

- Chrome DevTools - 浏览器调试
- React Developer Tools - React 组件调试
- Redux DevTools - 状态调试

#### 网络请求调试

```typescript
// Axios 请求拦截器
axios.interceptors.request.use((config) => {
  console.log('请求:', config);
  return config;
});

axios.interceptors.response.use(
  (response) => {
    console.log('响应:', response);
    return response;
  },
  (error) => {
    console.error('错误:', error);
    throw error;
  },
);
```

## ❓ 常见问题

### 依赖安装失败

```bash
# 清理缓存
pnpm store prune

# 重新安装
rm -rf node_modules
pnpm install
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
docker ps | grep postgres

# 检查连接字符串
# 确保 DATABASE_URL 正确配置
```

### 端口被占用

```bash
# 查看端口占用
netstat -ano | findstr :3001

# 修改端口
# 编辑 .env 文件中的 PORT 配置
```

### 构建失败

```bash
# 增加 Node.js 内存
node --max-old-space-size=8192 node_modules/vite/bin/vite.js build
```

## 📚 相关资源

- [Git 工作流指南](./GIT_WORKFLOW.md)
- [项目概述](./PROJECT_OVERVIEW.md)
- [API 文档](./API.md)
- [架构概览](./documents/lcd/shared/architecture.md)
- [开发规范](./documents/lcd/shared/guidelines.md)

---

_最后更新：2026 年 3 月 27 日_
