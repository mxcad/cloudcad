# CloudCAD Docker 部署指南

## 目录

- [架构概述](#架构概述)
- [环境要求](#环境要求)
- [开发环境](#开发环境)
- [生产部署](#生产部署)
- [命令速查表](#命令速查表)
- [常见问题](#常见问题)

---

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                      生产环境 (Docker)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  PostgreSQL │  │    Redis    │  │   App Container     │  │
│  │    :5432    │  │   :6379     │  │  Nginx + Backend    │  │
│  │   数据库    │  │    缓存     │  │  :80 (前端)         │  │
│  │             │  │             │  │  :3001 (API)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 环境要求

### 开发环境

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | >= 20.19.5 | 运行前后端代码 |
| pnpm | >= 9.15.4 | 包管理器 |
| PostgreSQL | 15.x | 数据库 |
| Redis | 7.x | 缓存 |
| Git | 任意版本 | 代码管理 |

### 生产环境

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| Docker | >= 24.0 | 容器运行时 |
| Docker Compose | >= 2.20 | 容器编排 |

### 检查环境

```powershell
# 检查 Node.js
node --version

# 检查 pnpm
pnpm --version

# 检查 Docker
docker --version

# 检查 Docker Compose
docker compose version
```

---

## 开发环境

### 启动步骤

```powershell
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
# 编辑 packages/backend/.env 配置数据库连接

# 3. 初始化数据库
cd packages/backend
pnpm prisma generate
pnpm prisma db push
cd ../..

# 4. 启动前后端开发服务器
pnpm dev
```

### 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 | http://localhost:5173 | Vite 开发服务器 |
| 后端 API | http://localhost:3001/api | NestJS 开发服务器 |
| API 文档 | http://localhost:3001/api/docs | Swagger UI |

---

## 生产部署

### 一键部署

```powershell
# 构建并启动所有服务
pnpm deploy
```

首次部署会：
1. 构建前后端代码
2. 创建 Docker 镜像
3. 启动 PostgreSQL、Redis、应用容器
4. 运行数据库迁移

### 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost |
| 后端 API | http://localhost/api |
| 健康检查 | http://localhost/health |

### 环境变量配置

**必须配置** (生产环境)：

```powershell
# 复制模板文件
copy .env.example .env

# 编辑 .env，修改以下必须配置项:
# - DB_PASSWORD: 数据库密码
# - JWT_SECRET: JWT 密钥 (至少 32 位)
```

**生成安全的 JWT 密钥：**
```powershell
# 方式1: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 方式2: 使用 OpenSSL (如果已安装)
openssl rand -base64 32
```

**配置优先级：**
```
容器环境变量 > .env 文件 > 默认值
```

**注意：**
- `packages/backend/.env` 是本地开发用的，Docker 部署不会读取
- 项目根目录的 `.env` 是 Docker Compose 读取的
- 生产环境没有默认密码，必须显式配置

### 部署管理

```powershell
# 查看服务状态
docker compose ps

# 查看日志
pnpm deploy:logs

# 查看特定服务日志
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f redis

# 停止服务 (数据保留)
pnpm deploy:down

# 强制重新构建镜像
pnpm deploy:rebuild
pnpm deploy

# 完全重置 (删除所有数据，谨慎使用!)
pnpm deploy:reset
pnpm deploy
```

### 数据持久化

生产环境使用 Docker 命名卷存储数据：

| 卷名 | 用途 |
|------|------|
| postgres_data | 数据库数据 |
| redis_data | Redis 持久化 |
| files_data | 用户文件 |
| uploads | 上传文件 |
| logs | 日志文件 |

### 备份与恢复

```powershell
# 备份数据库
docker compose exec postgres pg_dump -U postgres cloudcad > backup.sql

# 恢复数据库
docker compose exec -T postgres psql -U postgres cloudcad < backup.sql

# 备份上传文件
docker compose cp app:/app/uploads ./backup_uploads
```

---

## 命令速查表

### 开发环境

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动前后端开发服务器 |
| `pnpm build` | 构建前后端 |
| `pnpm lint` | 代码检查 |
| `pnpm format` | 代码格式化 |

### 生产部署

| 命令 | 说明 |
|------|------|
| `pnpm deploy` | 构建并启动生产服务 |
| `pnpm deploy:down` | 停止生产服务 |
| `pnpm deploy:reset` | 删除所有数据卷 |
| `pnpm deploy:logs` | 查看生产服务日志 |
| `pnpm deploy:rebuild` | 强制重新构建镜像 |

---

## 常见问题

### 1. 端口被占用

```
Error: port is already allocated
```

**解决方案：**
```powershell
# 查看端口占用
netstat -ano | findstr :5432
netstat -ano | findstr :6379
netstat -ano | findstr :3001

# 修改 .env 中的端口配置
DB_PORT=5433
REDIS_PORT=6380
HTTP_PORT=8080
```

### 2. 数据库连接失败

```
Error: Can't reach database server
```

**解决方案：**
```powershell
# 检查数据库容器状态
docker compose ps

# 重启数据库
docker compose restart postgres

# 查看数据库日志
docker compose logs postgres
```

### 3. 镜像构建失败

```
Error: build failed
```

**解决方案：**
```powershell
# 清理 Docker 缓存
docker system prune -a

# 强制重新构建
pnpm deploy:rebuild
pnpm deploy
```

### 4. 内存不足

```
Error: JavaScript heap out of memory
```

**解决方案：**
```powershell
# 增加 Node.js 内存限制 (package.json)
"scripts": {
  "build": "NODE_OPTIONS='--max-old-space-size=4096' pnpm -r build"
}
```

### 5. Windows 下 pnpm 找不到

```
'pnpm' 不是内部或外部命令
```

**解决方案：**
```powershell
# 安装 pnpm
npm install -g pnpm

# 或使用 corepack
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

### 6. 数据库迁移失败

```
Error: P1001: Can't reach database server
```

**解决方案：**
```powershell
# 确保数据库服务正在运行
# 检查 packages/backend/.env 中的数据库连接配置

# 生产环境会自动等待数据库就绪
pnpm deploy
```

---

## 附录

### 文件结构

```
cloudcad/
├── docker-compose.yml        # 生产环境配置
├── Dockerfile                # 镜像构建文件
├── docker-entrypoint.sh      # 容器启动脚本
├── nginx/
│   └── nginx.conf           # Nginx 配置
├── packages/
│   ├── backend/             # 后端代码
│   └── frontend/            # 前端代码
└── .env                     # 环境变量 (不提交到 Git)
```

### 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | React + Vite + TypeScript |
| 后端 | NestJS + Express + TypeScript |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |
| 反向代理 | Nginx |
| 容器 | Docker + Docker Compose |
