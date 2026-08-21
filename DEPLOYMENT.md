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
│  │  PostgreSQL │  │    Redis    │  │    API Server       │  │
│  │    :5432    │  │   :6379     │  │  :3001 (NestJS)     │  │
│  │   数据库    │  │    缓存     │  └─────────────────────┘  │
│  │             │  │             │  ┌─────────────────────┐  │
│  └─────────────┘  └─────────────┘  │  Config Center      │  │
│  ┌─────────────────────────────┐   │  :3002 (配置面板)   │  │
│  │        Storage Service      │   └─────────────────────┘  │
│  │        :3200 (文件/版本)    │   ┌─────────────────────┐  │
│  └─────────────────────────────┘   │ Function Workflow  │  │
│  ┌─────────────────────────────┐   │ :3100 (转换引擎)   │  │
│  │  Web (Nginx) :80/:443       │   └─────────────────────┘  │
│  │  前端 SPA + API 反向代理    │   ┌─────────────────────┐  │
│  └─────────────────────────────┘   │  Frontend Mobile   │  │
│                                    │  (H5, 可选)        │  │
│  compose 文件：docker/docker-compose.yml                  │  │
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

# 3. 初始化数据库（schema 单一源在 packages/db，见 ADR-0027）
cd packages/backend
pnpm db:migrate    # 执行 migration（禁止仅 db push）
pnpm db:seed       # 种子数据（如需）
cd ../..

# 4. 启动前后端开发服务器
pnpm dev
```

### 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端 | http://localhost:3000 | Vite 开发服务器 |
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
3. 启动 PostgreSQL、Redis、API Server、Config Center、Storage Service、Function Workflow 等全部容器
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
# 复制模板文件（compose 环境变量在 docker/ 下）
copy docker\.env.example docker\.env

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
- `docker/.env` 是 Docker Compose 读取的
- 生产环境没有默认密码，必须显式配置

**Session Cookie Secure（会话 Cookie 安全标志）：**
- 默认 `SESSION_COOKIE_SECURE=auto`，后端按请求协议自适应：
  - **http 请求**（局域网 IP 直连 / 未挂 HTTPS）→ cookie 不带 `Secure`，浏览器正常存储，登录/协同功能正常
  - **https 请求**（已挂 HTTPS 反代）→ cookie 带 `Secure`
- 需强制开启/关闭时，显式设置 `SESSION_COOKIE_SECURE=true` 或 `SESSION_COOKIE_SECURE=false` 即可覆盖协议判断。
- 若在反向代理后挂 HTTPS，需保证代理转发 `X-Forwarded-Proto: https`（后端已启用 `trust proxy`），否则会被误判为 http 而不带 Secure。

### 部署管理

```powershell
# 查看服务状态（compose 文件在 docker/ 目录）
docker compose -f docker/docker-compose.yml ps

# 查看日志
pnpm deploy:logs

# 查看特定服务日志
docker compose -f docker/docker-compose.yml logs -f app
docker compose -f docker/docker-compose.yml logs -f postgres
docker compose -f docker/docker-compose.yml logs -f redis

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
corepack prepare pnpm@9.15.9 --activate
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

## 管理员登录 IP 白名单运维

系统管理员使用**独立登录入口** `/admin-login`（对应后端 `POST /admin/auth/login`），
登录受 **IP 白名单** 双重保护：

- **仅系统管理员角色（ADMIN）** 可通过该入口；系统管理员也无法通过普通登录
  `POST /auth/login` 拿到 token（普通入口对 ADMIN 返回统一"账号或密码错误"，防枚举）。
- **IP 白名单**（fail-close）：只有白名单内的 IP 才能登录成功。白名单有**双通道**，
  取并集生效。

### 1. 白名单双通道

| 通道 | 维护方式 | 特点 |
|------|---------|------|
| **DB 通道** | 管理界面 `/admin/ip-whitelist`（需 `SYSTEM_IP_WHITELIST_MANAGE` 权限） | 增删即时生效；可设限期 |
| **本地文件通道（兜底）** | 服务器上直接编辑白名单文件 | 编辑即生效（mtime 检测热加载），无需重启后端；**界面误删白名单后的自救通道** |

> 本机环回地址 `127.0.0.1` / `::1` **恒放行**，作为服务器本机自救通道。

### 2. 本地文件路径与环境变量

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `ADMIN_IP_WHITELIST_FILE` | 本地白名单文件路径（相对路径基于项目根，也可用绝对路径） | `config/admin-ip-whitelist.json` |
| `ADMIN_TRUSTED_PROXY_IPS` | 可信反向代理地址段（逗号分隔，支持精确 IP/CIDR），用于 XFF 安全判定 | `127.0.0.1,::1` |

**文件格式**（二选一，按内容自动识别）：

```json
{ "ips": ["203.0.113.0/24", "198.51.100.7"] }
```

或纯文本（每行一个 IP/CIDR，`#` 开头为注释）：

```text
# 管理员白名单（可在服务器上直接编辑）
203.0.113.0/24
198.51.100.7
```

### 3. 界面误删白名单后的自救流程（重要）

管理员在管理界面把自己的 IP 从 DB 白名单删除、且未通过本地文件加白时，会立即被锁死
（白名单 fail-close，仅环回地址可用）。恢复步骤：

1. SSH 登录服务器；
2. 编辑白名单文件（默认 `config/admin-ip-whitelist.json`，或 `ADMIN_IP_WHITELIST_FILE` 指定路径），
   把自己的 IP 写入 `ips` 数组；
3. 保存文件 —— 后端 **mtime 检测自动重载**，立即生效，无需重启；
4. 重新访问 `/admin-login` 登录。

> 若服务器与浏览器不在同一出口，也可先在服务器本机用 `127.0.0.1` 登录恢复，再从界面调整。

### 4. 安全说明（X-Forwarded-For 伪造防护）

管理员 IP 白名单判定基于**不可伪造的真实连接地址**（`req.socket.remoteAddress`），
客户端伪造 `X-Forwarded-For` 头**无法绕过**白名单：

- **直连部署**（无反向代理）：直接取真实对端地址，无需额外配置；
- **反向代理部署**（Nginx 等）：需在 `ADMIN_TRUSTED_PROXY_IPS` 配置代理的地址段，
  后端才会信任由代理转发的 `X-Forwarded-For` **最右侧**地址（该地址由可信代理追加，
  客户端注入在最左侧的伪造项不影响）。

> 生产建议：在反向代理（Nginx）层剥离并重写外部传入的 `X-Forwarded-For` 头，
> 仅追加真实客户端 IP，实现纵深防御。

### 5. 权限与迁移

- 新权限 `SYSTEM_IP_WHITELIST_MANAGE`：控制 IP 白名单管理界面的访问。
- 需执行 migration `20260821000001_admin_ip_whitelist`（创建 `ip_whitelist_entries` 表、
  新增权限与审计枚举，并自动为 ADMIN 角色补授该权限）。执行：`pnpm db:migrate`。

---

## 附录

### 文件结构

```
cloudcad/
├── docker/
│   ├── docker-compose.yml        # 生产环境配置
│   ├── Dockerfile                # 镜像构建文件
│   ├── docker-entrypoint.sh      # 容器启动脚本
│   ├── nginx/
│   │   └── nginx.conf           # Nginx 配置
│   └── .env                      # 环境变量 (不提交到 Git)
└── packages/
    ├── backend/                 # 后端 API (3001)
    ├── frontend/                # 前端 SPA (3000)
    ├── frontend_mobile/         # 移动端 H5
    ├── config-service/          # 配置中心 (3002)
    ├── storage-service/         # 文件/版本服务 (3200)
    └── conversion-service/       # 转换引擎 (3100)
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
