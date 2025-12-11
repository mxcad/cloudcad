# CloudCAD 图纸管理平台

一个基于 NestJS + React 的现代化图纸管理平台，支持图纸转换、云存储、用户权限管理等核心功能。

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- Git

### 项目结构

```
cloudcad/
├── packages/
│   ├── backend/          # NestJS 后端服务
│   └── frontend/         # React 前端应用
├── docker-compose.yml           # 生产环境配置
├── docker-compose.dev.yml       # 开发环境配置
├── package.json                 # 根目录配置
└── README.md                    # 项目文档
```

### 一键启动开发环境

```bash
# 克隆项目
git clone https://github.com/your-org/cloucad.git
cd cloudcad

# 安装依赖
pnpm install

# 启动开发环境
cd packages/backend
pnpm run dev

# 启动前端开发服务器
cd ../frontend
pnpm run dev
```

## 📋 开发指南

### 后端开发

#### 环境配置

1. 复制环境变量文件：

```bash
cd packages/backend
cp .env.example .env
```

2. 启动开发环境：

```bash
pnpm run dev          # 启动数据库、Redis、MinIO
pnpm run start:dev    # 启动后端开发服务器
```

#### 可用命令

```bash
# 开发环境
pnpm run dev          # 启动开发环境服务
pnpm run dev:stop     # 停止开发环境
pnpm run dev:logs     # 查看服务日志
pnpm run dev:status   # 查看服务状态

# 后端开发
pnpm run start:dev    # 启动后端开发服务器
pnpm run build        # 构建项目
pnpm run test         # 运行测试

# 数据库
pnpm run prisma:studio    # 打开数据库管理界面
pnpm run prisma:migrate   # 运行数据库迁移
pnpm run prisma:generate  # 生成 Prisma 客户端
```

#### 服务地址

- **后端 API**: http://localhost:3001
- **API 文档**: http://localhost:3001/api/docs
- **数据库**: localhost:5432 (postgres/password)
- **Redis**: localhost:6379
- **MinIO**: http://localhost:9000 (minioadmin/minioadmin)
- **PgAdmin**: http://localhost:5050 (admin@cloucad.com/admin123)

### 前端开发

#### 环境配置

1. 安装依赖：

```bash
cd packages/frontend
pnpm install
```

2. 启动开发服务器：

```bash
pnpm run dev
```

#### 可用命令

```bash
pnpm run dev          # 启动开发服务器
pnpm run build        # 构建生产版本
pnpm run preview      # 预览生产版本
pnpm run test         # 运行测试
pnpm run lint         # 代码检查
```

## 🏗️ 技术栈

### 后端技术栈

- **框架**: NestJS 11 + Fastify
- **语言**: TypeScript
- **数据库**: PostgreSQL 15 + Prisma ORM
- **缓存**: Redis 7
- **存储**: MinIO (S3兼容)
- **认证**: JWT + RBAC权限
- **文档**: Swagger/OpenAPI
- **容器化**: Docker + Docker Compose

### 前端技术栈

- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI组件**: Bootstrap + Material Design
- **状态管理**: React Context / Zustand
- **HTTP客户端**: Axios
- **路由**: React Router
- **表单**: React Hook Form

## 🔧 开发规范

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint + Prettier 配置
- 组件使用 PascalCase 命名
- 文件使用 camelCase 命名
- 常量使用 UPPER_SNAKE_CASE

### Git 规范

```bash
git commit -m "feat: 添加用户管理功能"
git commit -m "fix: 修复文件上传bug"
git commit -m "docs: 更新API文档"
git commit -m "style: 代码格式调整"
git commit -m "refactor: 重构认证模块"
git commit -m "test: 添加单元测试"
```

### 分支策略

- `main`: 生产环境分支
- `develop`: 开发环境分支
- `feature/*`: 功能开发分支
- `hotfix/*`: 紧急修复分支

## 📦 部署指南

### 开发环境部署

```bash
cd packages/backend
pnpm run dev
```

### 生产环境部署

```bash
cd packages/backend
pnpm run prod
```

### Docker 部署

```bash
# 构建镜像
pnpm run docker:build

# 启动服务
pnpm run docker:up

# 查看日志
pnpm run docker:logs
```

## 🔐 环境变量

### 后端环境变量

```env
# 应用配置
PORT=3001
NODE_ENV=development

# JWT配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=cloucad

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379

# MinIO配置
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### 前端环境变量

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_APP_NAME=CloudCAD
```

## 🧪 测试

### 后端测试

```bash
cd packages/backend
pnpm run test              # 运行单元测试
pnpm run test:e2e          # 运行端到端测试
pnpm run test:cov          # 查看测试覆盖率
```

### 前端测试

```bash
cd packages/frontend
pnpm run test              # 运行单元测试
pnpm run test:e2e          # 运行端到端测试
```

## 📊 监控与日志

### 健康检查

- 后端健康检查: http://localhost:3001/api/health
- 数据库健康检查: http://localhost:3001/api/health/db
- 存储健康检查: http://localhost:3001/api/health/storage

### 日志查看

```bash
# 开发环境日志
pnpm run dev:logs

# 生产环境日志
pnpm run prod:logs

# Docker日志
docker-compose logs -f
```

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到问题或有建议，请：

1. 查看 [FAQ](docs/FAQ.md)
2. 搜索 [Issues](https://github.com/your-org/cloucad/issues)
3. 创建新的 Issue

## 🎯 路线图

- [x] 基础架构搭建
- [x] 用户认证系统
- [x] 文件上传下载
- [ ] 图纸转换功能
- [ ] 项目管理
- [ ] 权限管理
- [ ] 图块库
- [ ] 字体库
- [ ] 分享功能
- [ ] 移动端适配

## 📞 联系我们

- 项目主页: https://github.com/your-org/cloucad
- 问题反馈: https://github.com/your-org/cloucad/issues
- 邮箱: dev@cloucad.com

---

⭐ 如果这个项目对您有帮助，请给我们一个 Star！
