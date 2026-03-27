# CloudCAD

基于 Web 的 CAD 协作平台，支持在线编辑、版本控制和团队协作。

## 特性

- **在线 CAD 编辑** - 基于 mxcad 的 Web CAD 编辑器
- **文件系统管理** - 项目、文件夹、文件的完整管理
- **版本控制** - 集成 SVN 版本管理
- **权限管理** - 基于角色的访问控制 (RBAC)
- **实时协作** - 多用户协作支持
- **双配置中心** - 部署配置与运行时配置分离

---

## 项目预览

### 登录页面
![登录页面](documents/user-guide/imgs/01-login.png)

### 工作台仪表盘
![仪表盘](documents/user-guide/imgs/02-dashboard.png)

### CAD 编辑器
![CAD 编辑器](documents/user-guide/imgs/04-cad-editor.png)

### 协同编辑
![协同编辑](documents/user-guide/imgs/18-cad-collaborate.png)

### 项目管理
![项目管理](documents/user-guide/imgs/05-projects.png)

### 用户与权限管理
![用户管理](documents/user-guide/imgs/07-user-management.png)
![角色权限](documents/user-guide/imgs/08-role-permissions.png)

---

## 环境要求

### 基础环境

| 软件                 | 版本要求   | 说明             | 必需   |
| -------------------- | ---------- | ---------------- | ------ |
| Node.js              | >= 20.19.5 | 运行前后端代码   | 是     |
| pnpm                 | >= 9.15.9  | 包管理器         | 是     |
| PostgreSQL           | 15.x       | 数据库           | 是     |
| Redis                | 7.x        | 缓存             | 是     |
| Git                  | 任意版本   | 代码管理         | 是     |
| **Subversion (SVN)** | **1.14.x** | **版本控制工具** | **是** |

### SVN 安装说明

#### Windows 系统

**方式一：下载 VisualSVN Server（推荐）**

1. 访问 https://www.visualsvn.com/server/download/
2. 下载 VisualSVN Server 安装包
3. 安装时选择 "SVN command line tools only" 或完整安装
4. 安装完成后，将 `C:\Program Files\VisualSVN Server\bin` 添加到系统 PATH 环境变量

**方式二：下载独立 SVN 客户端**

1. 访问 https://tortoisesvn.net/downloads.html
2. 下载 TortoiseSVN（包含命令行工具）
3. 安装时勾选 "command line client tools"
4. 安装完成后，打开新的命令行窗口验证：

```powershell
svn --version
```

#### Linux 系统

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install subversion

# CentOS/RHEL
sudo yum install subversion

# 验证安装
svn --version
```

#### macOS 系统

```bash
# 使用 Homebrew
brew install subversion

# 验证安装
svn --version
```

### 检查所有环境

```powershell
# 检查 Node.js
node --version
# 预期输出: v20.19.5 或更高

# 检查 pnpm
pnpm --version
# 预期输出: 9.15.9 或更高

# 检查 Git
git --version
# 预期输出: git version 2.x.x 或更高

# 检查 SVN
svn --version
# 预期输出: svn, version 1.14.x 或更高
```

---

## 项目结构

```
cloudcad/
├── packages/
│   ├── backend/        # NestJS 后端服务 (端口 3001)
│   ├── frontend/       # React 前端应用 (端口 5173)
│   ├── config-service/ # 部署配置中心 (端口 3002)
│   └── svnVersionTool/ # SVN 版本控制工具
├── docker/             # Docker 部署配置
├── runtime/            # 运行时依赖 (Node.js、PostgreSQL、Redis、SVN、MxCAD)
│   ├── windows/        # Windows 离线运行时
│   ├── linux/          # Linux 离线运行时
│   └── scripts/         # 启动脚本
└── scripts/            # 构建与部署脚本
```

---

## 快速开始（开发环境）

### 步骤 1：安装依赖

```powershell
pnpm install
```

### 步骤 2：配置环境变量

复制环境变量模板文件：

```powershell
# 后端配置
copy packages\backend\.env.example packages\backend\.env

# 前端配置（可选，开发环境已有默认值）
copy packages\frontend\.env.example packages\frontend\.env.local
```

编辑 `packages\backend\.env`，配置以下必需项：

```env
# 数据库配置
DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/cloudcad
DB_PASSWORD=你的数据库密码

# JWT 密钥（生成方式见下文）
JWT_SECRET=你的JWT密钥
```

**生成安全的 JWT 密钥：**

```powershell
# 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 步骤 3：初始化数据库

确保 PostgreSQL 和 Redis 已启动，然后执行：

```powershell
cd packages\backend
pnpm prisma generate   # 生成 Prisma Client
pnpm prisma db push    # 同步数据库结构
cd ..\..
```

### 步骤 4：启动开发服务

```powershell
pnpm dev
```

服务启动后访问：

| 服务     | 地址                           | 说明       |
| -------- | ------------------------------ | ---------- |
| 前端     | http://localhost:5173          | React 应用 |
| 后端 API | http://localhost:3001/api      | NestJS API |
| API 文档 | http://localhost:3001/api/docs | Swagger UI |

### 步骤 5：登录系统

首次启动时，系统会自动创建初始管理员账户：

| 配置项 | 默认值            |
| ------ | ----------------- |
| 邮箱   | admin@example.com |
| 用户名 | admin             |
| 密码   | Admin123!         |

**⚠️ 重要：生产环境请务必修改初始密码！**

---

## 部署方式

### 方式一：Docker 部署（推荐生产环境）

#### 环境要求

- Docker >= 24.0
- Docker Compose >= 2.20

#### 部署步骤

**步骤 1：配置环境变量**

```powershell
# 进入 docker 目录
cd docker

# 复制环境变量模板
copy .env.example .env

# 编辑 .env，配置以下必需项：
# - DB_PASSWORD: 数据库密码（必须设置）
# - JWT_SECRET: JWT 密钥（必须设置，至少 32 位）
```

**步骤 2：构建并启动服务**

```powershell
# 在项目根目录执行
pnpm deploy
```

首次部署会自动：

1. 构建前后端代码
2. 创建 Docker 镜像
3. 启动 PostgreSQL、Redis、应用容器
4. 运行数据库迁移
5. 创建初始管理员账户

**步骤 3：验证部署**

```powershell
# 查看服务状态
docker compose -f docker\docker-compose.yml ps

# 查看日志
pnpm deploy:logs
```

访问 http://localhost 使用系统。

#### Docker 部署管理

```powershell
# 停止服务（数据保留）
pnpm deploy:down

# 强制重新构建
pnpm deploy:rebuild
pnpm deploy

# 完全重置（删除所有数据，谨慎使用！）
pnpm deploy:reset
pnpm deploy

# 查看特定服务日志
docker compose -f docker\docker-compose.yml logs -f app
docker compose -f docker\docker-compose.yml logs -f postgres
docker compose -f docker\docker-compose.yml logs -f redis
```

#### Docker 环境变量说明

`docker/.env` 中必须配置的关键变量：

| 变量名                   | 说明           | 示例                    |
| ------------------------ | -------------- | ----------------------- |
| `DB_PASSWORD`            | 数据库密码     | `YourSecurePassword123` |
| `JWT_SECRET`             | JWT 签名密钥   | `随机生成的32位字符串`  |
| `INITIAL_ADMIN_PASSWORD` | 初始管理员密码 | `Admin123!`             |
| `MAIL_HOST`              | 邮件服务器     | `smtp.gmail.com`        |
| `MAIL_USER`              | 邮件账号       | `your-email@gmail.com`  |
| `MAIL_PASS`              | 邮件密码       | `your-app-password`     |

---

### 方式二：离线部署（Windows）

适用于无法访问外网的环境，所有依赖已打包在项目中。

#### 前置准备

**步骤 1：下载运行时依赖**

如果没有 `runtime/windows/` 下的运行时文件，需要手动下载：

| 组件       | 版本     | 下载地址                                                                                        |
| ---------- | -------- | ----------------------------------------------------------------------------------------------- |
| Node.js    | v20.19.5 | https://nodejs.org/dist/v20.19.5/node-v20.19.5-win-x64.zip                                      |
| PostgreSQL | 15.x     | https://get.enterprisedb.com/postgresql/postgresql-15.17-1-windows-x64-binaries.zip             |
| Redis      | 5.0.14.1 | https://github.com/microsoftarchive/redis/releases/download/win-5.0.14.1/Redis-x64-5.0.14.1.zip |
| Subversion | 1.14.x   | https://www.visualsvn.com/server/download/                                                      |
| MxCAD      | -        | https://help.mxdraw.com/?pid=107                                                                |

**步骤 2：配置运行时目录**

```
runtime/windows/
├── node/              # 解压 Node.js 到此目录
├── postgresql/        # 解压 PostgreSQL 到此目录
├── redis/             # 解压 Redis 到此目录
├── subversion/        # 解压 SVN 到此目录（或安装 VisualSVN Server）
└── mxcad/             # 解压 MxCAD 到此目录
```

#### 启动离线服务

```powershell
# 方式 1：双击运行
runtime\scripts\start.bat

# 方式 2：命令行运行
node runtime\scripts\start.js
```

启动流程：

1. 检查运行环境（Node.js、PostgreSQL、Redis、SVN、MxCAD）
2. 启动基础服务（PostgreSQL、Redis）
3. 初始化数据库
4. 启动后端 API（端口 3001）
5. 启动协同服务（端口 3091）

#### 停止离线服务

```powershell
# 方式 1：双击运行
runtime\scripts\stop.bat

# 方式 2：命令行
node runtime\scripts\stop.js
```

---

### 方式三：离线部署（Linux）

#### 前置准备

**步骤 1：下载运行时依赖**

| 组件       | 版本     | 下载/安装方式                    |
| ---------- | -------- | -------------------------------- |
| Node.js    | v20.19.5 | 官网下载或 nvm 安装              |
| PostgreSQL | 15.x     | `apt install postgresql-15`      |
| Redis      | 7.x      | `apt install redis-server`       |
| Subversion | 1.14.x   | `apt install subversion`         |
| MxCAD      | -        | https://help.mxdraw.com/?pid=107 |

**步骤 2：安装 MxCAD**

```bash
# 解压到 runtime/linux/mxcad/
tar -xzf mxcad-linux.tar.gz -C runtime/linux/

# 设置可执行权限
chmod +x runtime/linux/mxcad/mxcadassembly
chmod -R 755 runtime/linux/mxcad/mx/so

# 复制 locale 文件（需要 sudo）
sudo cp -r runtime/linux/mxcad/mx/locale /usr/local/share/locale
```

#### 启动离线服务

```bash
# 方式 1：脚本运行
chmod +x runtime/scripts/start.sh
./runtime/scripts/start.sh

# 方式 2：Node.js 运行
node runtime/scripts/start.js
```

---

## 环境变量详解

### 后端配置（packages/backend/.env）

#### 应用配置

| 变量           | 默认值                | 说明         |
| -------------- | --------------------- | ------------ |
| `PORT`         | 3001                  | 后端服务端口 |
| `NODE_ENV`     | development           | 运行环境     |
| `FRONTEND_URL` | http://localhost:3000 | 前端地址     |

#### 数据库配置

| 变量           | 默认值    | 说明                              |
| -------------- | --------- | --------------------------------- |
| `DATABASE_URL` | -         | Prisma 连接字符串（**必须配置**） |
| `DB_HOST`      | localhost | 数据库主机                        |
| `DB_PORT`      | 5432      | 数据库端口                        |
| `DB_USERNAME`  | postgres  | 数据库用户名                      |
| `DB_PASSWORD`  | -         | 数据库密码（**必须配置**）        |
| `DB_DATABASE`  | cloudcad  | 数据库名称                        |

#### Redis 配置

| 变量             | 默认值    | 说明       |
| ---------------- | --------- | ---------- |
| `REDIS_HOST`     | localhost | Redis 主机 |
| `REDIS_PORT`     | 6379      | Redis 端口 |
| `REDIS_PASSWORD` | -         | Redis 密码 |

#### JWT 配置

| 变量                     | 默认值 | 说明                         |
| ------------------------ | ------ | ---------------------------- |
| `JWT_SECRET`             | -      | JWT 签名密钥（**必须配置**） |
| `JWT_EXPIRES_IN`         | 1h     | Access Token 有效期          |
| `JWT_REFRESH_EXPIRES_IN` | 7d     | Refresh Token 有效期         |

#### 存储路径配置

| 变量               | 默认值    | 说明             |
| ------------------ | --------- | ---------------- |
| `FILES_DATA_PATH`  | filesData | 文件数据目录     |
| `SVN_REPO_PATH`    | svn-repo  | SVN 仓库目录     |
| `FILES_NODE_LIMIT` | 300000    | 单目录最大节点数 |

**⚠️ 重要：路径建议使用绝对路径**

- Windows 示例：`D:/web/MxCADOnline/cloudcad/filesData`
- Linux 示例：`/var/www/cloudcad/filesData`

#### MxCAD 配置

| 变量                  | 默认值 | 说明                               |
| --------------------- | ------ | ---------------------------------- |
| `MXCAD_ASSEMBLY_PATH` | -      | MxCAD 转换程序路径（**必须配置**） |
| `MXCAD_FONTS_PATH`    | -      | 字体目录                           |
| `FRONTEND_FONTS_PATH` | -      | 前端字体目录                       |

#### 初始管理员

| 变量                     | 默认值            | 说明         |
| ------------------------ | ----------------- | ------------ |
| `INITIAL_ADMIN_EMAIL`    | admin@example.com | 管理员邮箱   |
| `INITIAL_ADMIN_USERNAME` | admin             | 管理员用户名 |
| `INITIAL_ADMIN_PASSWORD` | Admin123!         | 管理员密码   |

### 前端配置（packages/frontend/.env.local）

| 变量                     | 默认值                  | 说明         |
| ------------------------ | ----------------------- | ------------ |
| `VITE_APP_NAME`          | 梦想网页CAD实时协同平台 | 应用名称     |
| `VITE_API_BASE_URL`      | /api                    | API 基础路径 |
| `VITE_APP_COOPERATE_URL` | http://localhost:3091   | 协同服务地址 |

---

## 常用命令

### 开发

```powershell
pnpm dev          # 启动开发服务
pnpm build        # 构建所有包
pnpm check        # 代码检查（lint + format + type-check）
pnpm check:fix    # 自动修复代码问题
```

### 数据库

```powershell
cd packages/backend
pnpm prisma generate   # 生成 Prisma Client
pnpm prisma db push     # 同步数据库结构
pnpm prisma db migrate  # 运行迁移
pnpm prisma db studio   # 打开 Prisma Studio
```

### 生成器

```powershell
pnpm generate:api-types           # 生成 API 类型定义
pnpm generate:frontend-permissions # 生成前端权限常量
```

### 部署

```powershell
pnpm deploy           # Docker 部署
pnpm deploy:down      # 停止部署
pnpm deploy:logs      # 查看日志
pnpm deploy:rebuild   # 强制重新构建
pnpm deploy:reset     # 删除所有数据
```

### 离线打包

```powershell
pnpm pack:offline:win     # Windows 离线包
pnpm pack:offline:linux   # Linux 离线包
pnpm pack:offline:all     # 所有平台
```

---

## 常见问题

### 1. 端口被占用

```powershell
# 查看端口占用
netstat -ano | findstr :5432
netstat -ano | findstr :6379
netstat -ano | findstr :3001

# 修改 .env 中的端口配置
DB_PORT=5433
REDIS_PORT=6380
```

### 2. 数据库连接失败

```powershell
# 检查 PostgreSQL 是否运行
# Windows: 检查服务
services.msc

# Linux
sudo systemctl status postgresql

# 查看数据库日志
docker compose -f docker\docker-compose.yml logs postgres
```

### 3. SVN 命令找不到

```powershell
# Windows: 确认 SVN 已安装并添加到 PATH
svn --version

# 如果使用 VisualSVN Server，手动添加 PATH
# C:\Program Files\VisualSVN Server\bin
```

### 4. MxCAD 转换失败

```powershell
# 检查 MxCAD 程序路径是否正确
# Windows: 确认 mxcadassembly.exe 存在
dir runtime\windows\mxcad\mxcadassembly.exe

# 检查字体目录
dir runtime\windows\mxcad\fonts
```

### 5. 内存不足

```powershell
# 增加 Node.js 内存限制
set NODE_OPTIONS=--max-old-space-size=4096
pnpm dev
```

---

## 数据备份与恢复

### Docker 环境

```powershell
# 备份数据库
docker compose -f docker\docker-compose.yml exec postgres pg_dump -U postgres cloudcad > backup.sql

# 恢复数据库
docker compose -f docker\docker-compose.yml exec -T postgres psql -U postgres cloudcad < backup.sql

# 备份上传文件
docker compose -f docker\docker-compose.yml cp app:/app/uploads ./backup_uploads
```

### 数据卷

| 卷名            | 用途         |
| --------------- | ------------ |
| `postgres_data` | 数据库数据   |
| `redis_data`    | Redis 持久化 |
| `files_data`    | 用户文件     |
| `uploads`       | 上传文件     |
| `logs`          | 日志文件     |

---

## 文档

- [部署说明](DEPLOYMENT.md) - 详细的 Docker 部署指南
- [离线部署说明](runtime/README.md) - 离线环境部署指南

---

## 许可证

**本软件采用自定义开源许可证。非商业使用需遵守以下要求：**

- ✅ 允许个人学习、研究、测试
- ⚠️ **修改源代码后必须贡献回原项目**
- ⚠️ **再分发时必须公开完整源代码**
- ❌ 禁止商业使用（需单独授权）

详见 [LICENSE](./LICENSE) 文件。商业授权请联系：710714273@qq.com

---

**公司**: 成都梦想凯德科技有限公司
**网站**: https://www.mxdraw.com/
**邮箱**: 710714273@qq.com
