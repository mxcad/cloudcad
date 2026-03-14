# Linux 部署包打包方案设计

> 版本：1.1
> 日期：2026-03-14
> 状态：讨论中

## 一、设计目标

在 Windows 开发环境下，通过 Docker 一站式生成 Linux 部署包，并验证其离线可用性。

---

## 二、核心原则

### 2.1 复用现有脚本

已有脚本功能完整，无需在 Dockerfile 中重复实现：

| 脚本 | 功能 |
|------|------|
| `scripts/pack-offline.js --deploy --linux` | 完整的部署包构建流程 |
| `scripts/extract-linux-runtime.js` | 提取 Linux 运行时（需改造为通用脚本） |

### 2.2 验证真实场景

验证必须满足：
- **干净环境**：没有任何预装依赖
- **断网环境**：无法访问任何在线资源
- **模拟用户**：解压 → 配置 → 启动 → 验证服务正常
- **验证深度**：进程启动 + 健康检查 + 完整功能测试

### 2.3 打包与验证分离

- 打包：在 Docker 容器内完成，输出压缩包
- 验证：独立的断网容器，模拟真实用户环境

---

## 三、关键改造：extract-linux-runtime.js

### 3.1 改造目标

将 `extract-linux-runtime.js` 从"Windows 通过 Docker 提取"改造为"可在任何 Linux 环境直接运行"。

### 3.2 改造前后对比

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 运行环境 | Windows + Docker | 任何 Linux 环境（物理机、虚拟机、容器） |
| 提取方式 | `docker build` + `docker cp` | 直接使用包管理器安装到指定目录 |
| 输出目录 | 固定 `runtime/linux/` | 可指定任意目录 |
| 依赖 | Docker | 无（仅需 apt-get） |

### 3.3 改造后的使用场景

```
场景 1: Linux 物理机/虚拟机本地开发
  $ node scripts/extract-linux-runtime.js
  $ node scripts/pack-offline.js --deploy --linux

场景 2: Docker 容器内打包
  $ docker run -v ${PWD}:/app node:20-bullseye-slim \
      sh -c "cd /app && node scripts/extract-linux-runtime.js && ..."
```

### 3.4 提取逻辑（参考现有 Dockerfile）

**Node.js 提取** (参考 Dockerfile.node):
```bash
# 1. 安装 Node.js + pnpm + pm2
apt-get update && apt-get install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm@9.15.4 pm2

# 2. 收集到指定目录
mkdir -p {OUTPUT_DIR}/bin {OUTPUT_DIR}/lib {OUTPUT_DIR}/node_modules
cp /usr/local/bin/node {OUTPUT_DIR}/bin/
cp -rL /usr/local/lib/node_modules/* {OUTPUT_DIR}/node_modules/

# 3. 创建启动脚本 (npm, npx, pnpm, pm2)
# 4. 收集依赖库 (ldd)
ldd /usr/local/bin/node | grep "=> /" | awk '{print $3}' | xargs -I {} cp -L {} {OUTPUT_DIR}/lib/
```

**PostgreSQL 提取** (参考 Dockerfile.postgres):
```bash
# 1. 安装 PostgreSQL 15
apt-get update && apt-get install -y postgresql-15

# 2. 收集二进制和库文件
mkdir -p {OUTPUT_DIR}/bin {OUTPUT_DIR}/lib/postgresql
cp /usr/lib/postgresql/15/bin/* {OUTPUT_DIR}/bin/
cp -r /usr/lib/postgresql/15/lib/* {OUTPUT_DIR}/lib/postgresql/

# 3. 收集依赖库 (ldd)
# 4. 复制动态链接器
cp /lib64/ld-linux-x86-64.so.2 {OUTPUT_DIR}/lib/
```

### 3.5 改造后的脚本接口

```bash
# 提取所有组件到默认目录 (runtime/linux/)
node scripts/extract-linux-runtime.js

# 提取所有组件到指定目录
node scripts/extract-linux-runtime.js --output /path/to/output

# 仅提取特定组件
node scripts/extract-linux-runtime.js --node --output /path/to/output
node scripts/extract-linux-runtime.js --postgres --output /path/to/output
node scripts/extract-linux-runtime.js --redis --output /path/to/output
node scripts/extract-linux-runtime.js --svn --output /path/to/output
```

---

## 四、方案架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Windows 宿主机                                 │
│                                                                          │
│   node scripts/pack-linux-deploy.js                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    阶段 1: 构建打包容器                                   │
│                    Dockerfile.linux-deploy                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   基础镜像: node:20-bullseye-slim (glibc 2.31)                          │
                                                                          │
│   容器内执行:                                                            │
│   1. node scripts/extract-linux-runtime.js --output /app/runtime/linux  │
│   2. node scripts/pack-offline.js --deploy --linux                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    阶段 2: 导出压缩包                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   docker cp {container}:/app/release/cloudcad-deploy-*.tar.gz ./release/│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    阶段 3: 断网验证 (独立步骤)                            │
│                    Dockerfile.linux-deploy-verify                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   基础镜像: debian:bullseye-slim (干净环境)                              │
│   网络模式: --network none (断网)                                        │
│                                                                          │
│   验证步骤：                                                              │
│   1. 解压部署包                                                          │
│   2. 配置 .env 文件                                                      │
│   3. 启动 PostgreSQL + Redis (容器内预装)                                │
│   4. 运行 start.sh                                                       │
│   5. 等待服务启动                                                        │
│   6. 健康检查 (GET /health)                                              │
│   7. 功能测试 (数据库连接、Redis 连接、前端访问)                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 五、文件结构

```
runtime/docker/
├── Dockerfile.linux-deploy          # 打包镜像
├── Dockerfile.linux-deploy-verify   # 验证镜像
└── docker-compose.linux-deploy.yml  # 编排文件（可选）

scripts/
├── pack-offline.js                  # 现有打包脚本（复用）
├── extract-linux-runtime.js         # 提取脚本（需改造）
└── pack-linux-deploy.js             # Docker 打包入口脚本（新建）
```

---

## 六、Dockerfile 设计

### 6.1 打包镜像 (Dockerfile.linux-deploy)

```dockerfile
# CloudCAD Linux 部署包打包镜像
# 用于在容器内执行打包脚本，生成 Linux 部署包
#
# 使用方式：
#   docker build -f Dockerfile.linux-deploy -t cloudcad-pack-linux .
#   docker run --rm -v ${PWD}:/app cloudcad-pack-linux

FROM node:20-bullseye-slim

# 安装系统依赖（extract-linux-runtime.js 需要这些来提取一级依赖）
# 参考：Dockerfile.node, Dockerfile.postgres, Dockerfile.redis, Dockerfile.svn
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    lsb-release \
    binutils \
    subversion \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

# 安装 PostgreSQL 15（需要添加官方源）
RUN curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y postgresql-15 && \
    rm -rf /var/lib/apt/lists/*

# 安装 pnpm 和 pm2（与 Dockerfile.node 保持一致）
RUN npm install -g pnpm@9.15.4 pm2

# 设置工作目录
WORKDIR /app

# 默认命令：提取运行时 + 打包
CMD ["sh", "-c", "node scripts/extract-linux-runtime.js --output runtime/linux && node scripts/pack-offline.js --deploy --linux"]
```

**依赖来源对照表：**

| 组件 | Dockerfile | 需要安装 |
|------|------------|----------|
| Node.js | Dockerfile.node | `node:20-bullseye-slim` 基础镜像 + `pnpm@9.15.4`, `pm2` |
| PostgreSQL | Dockerfile.postgres | `postgresql-15` (pgdg 源) |
| Redis | Dockerfile.redis | `redis-server` |
| SVN | Dockerfile.svn | `subversion` |
| 通用 | - | `binutils` (提供 ldd), `curl`, `gnupg2`, `lsb-release` |

### 6.2 验证镜像 (Dockerfile.linux-deploy-verify)

```dockerfile
# CloudCAD Linux 部署包验证镜像
# 在干净、断网环境中验证部署包可用性
#
# 使用方式：
#   docker build -f Dockerfile.linux-deploy-verify \
#       --build-arg PACKAGE=cloudcad-deploy-*.tar.gz \
#       -t cloudcad-verify .
#   docker run --rm --network none cloudcad-verify

FROM debian:bullseye-slim

# 安装最小依赖（PostgreSQL + Redis + 测试工具）
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    postgresql \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 构建参数：部署包文件名
ARG PACKAGE=cloudcad-deploy-linux.tar.gz

# 复制并解压部署包
COPY release/${PACKAGE} /tmp/
RUN tar -xzf /tmp/${PACKAGE} -C /app && rm /tmp/${PACKAGE}

# 创建验证脚本
COPY scripts/verify-deploy-package.sh /verify.sh
RUN chmod +x /verify.sh

# 断网运行验证
CMD ["/verify.sh"]
```

### 6.3 验证脚本 (verify-deploy-package.sh)

```bash
#!/bin/bash
set -e

echo "=== 部署包验证 (断网环境) ==="
echo ""

# 1. 检查目录结构
echo "[1/6] 检查目录结构..."
ls -la /app/
test -f /app/packages/backend/dist/main.js
test -f /app/packages/frontend/dist/index.html
test -f /app/start.sh
echo "✓ 文件结构完整"

# 2. 配置环境
echo "[2/6] 配置环境..."
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cloudcad"
export REDIS_URL="redis://localhost:6379"
export NODE_ENV="production"
echo "✓ 环境变量已设置"

# 3. 启动 PostgreSQL
echo "[3/6] 启动 PostgreSQL..."
service postgresql start
su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
su - postgres -c "createdb cloudcad 2>/dev/null || true"
echo "✓ PostgreSQL 已启动"

# 4. 启动 Redis
echo "[4/6] 启动 Redis..."
redis-server --daemonize yes
echo "✓ Redis 已启动"

# 5. 启动应用
echo "[5/6] 启动应用..."
cd /app
chmod +x start.sh
./start.sh &
sleep 30  # 等待服务启动

# 6. 健康检查
echo "[6/6] 健康检查..."
curl -f http://localhost:3000/health || exit 1
echo "✓ 后端服务正常"

curl -f http://localhost:3000/ || exit 1
echo "✓ 前端服务正常"

echo ""
echo "=== 验证通过! ==="
```

---

## 七、入口脚本设计 (pack-linux-deploy.js)

```javascript
/**
 * CloudCAD Linux 部署包打包入口
 * 
 * 功能：
 * 1. 构建 Docker 打包镜像
 * 2. 在容器内执行打包脚本
 * 3. 导出压缩包到 release/
 * 
 * 使用方式：
 *   node scripts/pack-linux-deploy.js              # 仅打包
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ... 实现细节待定
```

---

## 八、执行流程

### 8.1 打包

```bash
# 方式 1: 使用入口脚本（推荐）
node scripts/pack-linux-deploy.js

# 方式 2: 直接使用 Docker
docker build -f runtime/docker/Dockerfile.linux-deploy -t cloudcad-pack-linux .
docker run --rm -v ${PWD}:/app cloudcad-pack-linux

# 方式 3: 在 Linux 物理机上直接运行（无需 Docker）
node scripts/extract-linux-runtime.js
node scripts/pack-offline.js --deploy --linux
```

### 8.2 验证（独立步骤）

```bash
# 断网验证
docker build -f runtime/docker/Dockerfile.linux-deploy-verify \
    --build-arg PACKAGE=cloudcad-deploy-1.0.0-20260314-linux.tar.gz \
    -t cloudcad-verify .
docker run --rm --network none cloudcad-verify
```

---

## 九、与现有方案对比

| 维度 | 现有方案 | 新方案 |
|------|---------|--------|
| 执行环境 | Windows 本地 | Docker 容器 / Linux 物理机 |
| 一类依赖提取 | Windows + Docker 提取到本地 | 脚本直接在 Linux 环境提取 |
| 构建产物 | 可能混入 Windows 特性 | 纯 Linux 风格 |
| 验证方式 | 本地验证 | 断网容器验证 |
| 兼容性 | 可能有差异 | 完全一致 |
| 脚本复用 | 部分复用 | 完全复用现有脚本 |

---

## 十、改造清单

### 10.1 extract-linux-runtime.js 改造

- [ ] 检测运行环境（Linux vs Windows）
- [ ] Linux 环境：直接使用 apt-get 安装组件到指定目录
- [ ] Windows 环境：保持现有 Docker 提取逻辑（兼容本地开发）
- [ ] 支持 `--output` 参数指定输出目录
- [ ] 参考 Dockerfile.node/postgres/redis/svn 的提取逻辑

### 10.2 新建文件

- [ ] `runtime/docker/Dockerfile.linux-deploy`
- [ ] `runtime/docker/Dockerfile.linux-deploy-verify`
- [ ] `scripts/verify-deploy-package.sh`
- [ ] `scripts/pack-linux-deploy.js`（可选，简化入口）

### 10.3 测试计划

- [ ] 在 Linux 物理机测试 `extract-linux-runtime.js`
- [ ] 在 Docker 容器测试 `extract-linux-runtime.js`
- [ ] 测试完整打包流程
- [ ] 测试断网验证流程

---

## 十一、待讨论问题

### 11.1 extract-linux-runtime.js 改造细节

Q: 是否需要保留 Windows 环境的 Docker 提取逻辑？

- A: 是，保留兼容性。Windows 用户仍可在本地开发时提取。

Q: 如何处理不同 Linux 发行版？

- A: 目前只支持 Debian/Ubuntu (apt-get)。如需支持其他发行版，后续扩展。

### 11.2 验证镜像的 PostgreSQL/Redis

Q: 验证镜像内预装的 PostgreSQL/Redis 版本是否需要与提取的一致？

- A: 验证镜像的 PG/Redis 用于启动服务测试，不使用提取的版本。这是模拟用户环境，用户通常会自己安装数据库。

### 11.3 输出格式

- tar.gz（Linux 原生，推荐）
- 7z（需要安装 p7zip）

---

## 十二、参考文档

- [linux-offline-packaging-plan.md](./linux-offline-packaging-plan.md) - 原有离线打包方案
- [Dockerfile.node](../runtime/docker/Dockerfile.node) - Node.js 提取逻辑
- [Dockerfile.postgres](../runtime/docker/Dockerfile.postgres) - PostgreSQL 提取逻辑
