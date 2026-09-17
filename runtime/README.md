# CloudCAD 离线部署指南

## 目录结构

```
runtime/
├── windows/
�?  ├── node/              # Node.js 运行�?
�?  ├── postgresql/        # PostgreSQL 数据�?
�?  ├── redis/             # Redis 缓存
�?  ├── subversion/        # SVN 版本控制
�?  └── mxcad/             # MxCAD 转换程序
├── linux/
�?  └── mxcad/             # MxCAD 转换程序
└── scripts/
    ├── start.js           # 启动脚本
    ├── stop.js            # 停止脚本
    └── ...
```

## 依赖下载

### Windows 环境

| 组件 | 版本 | 下载地址 |
|------|------|----------|
| Node.js | v20.19.5 | https://nodejs.org/dist/v20.19.5/node-v20.19.5-win-x64.zip |
| PostgreSQL | 15.x | https://get.enterprisedb.com/postgresql/postgresql-15.17-1-windows-x64-binaries.zip |
| Redis | 5.0.14.1 | https://github.com/microsoftarchive/redis/releases/download/win-5.0.14.1/Redis-x64-5.0.14.1.zip |
| Subversion | 1.14.x | https://www.visualsvn.com/server/download/ |
| MxCAD | - | https://help.mxdraw.com/?pid=107 |

### 安装步骤

#### 1. Node.js

```
下载: node-v20.19.5-win-x64.zip
解压�? runtime/windows/node/

目录结构:
runtime/windows/node/
├── node.exe
├── npm
├── npx
└── ...
```

#### 2. PostgreSQL

```
下载: postgresql-15.17-1-windows-x64-binaries.zip
解压�? runtime/windows/postgresql/

目录结构:
runtime/windows/postgresql/
└── pgsql/
    ├── bin/
    �?  ├── pg_ctl.exe
    �?  ├── initdb.exe
    �?  └── ...
    └── ...
```

#### 3. Redis

```
下载: Redis-x64-5.0.14.1.zip
解压�? runtime/windows/redis/

目录结构:
runtime/windows/redis/
├── redis-server.exe
├── redis-cli.exe
└── ...
```

#### 4. Subversion

```
下载: VisualSVN Server (https://www.visualsvn.com/server/download/)
安装后将 bin 目录复制�? runtime/windows/subversion/

目录结构:
runtime/windows/subversion/
├── svn.exe
├── svnadmin.exe
└── ...
```

#### 5. MxCAD 转换程序

```
访问: https://help.mxdraw.com/?pid=107
下载对应平台的转换程�?

Windows: 解压�?runtime/windows/mxcad/
Linux:   解压�?runtime/linux/mxcad/

目录结构:
runtime/windows/mxcad/
├── mxcadassembly.exe      # 主程�?
├── mxcad_ini.json         # 配置文件
├── fonts/                 # 字体目录
├── files/                 # 资源文件
└── *.dll                  # 依赖�?
```

### Linux 环境

Linux 环境�?MxCAD 转换程序需要额外设置权限：

```bash
# 设置可执行权�?
chmod +x runtime/linux/mxcad/mxcadassembly
chmod -R 755 runtime/linux/mxcad/mx/so

# 复制 locale 文件（需�?sudo�?
sudo cp -r runtime/linux/mxcad/mx/locale /usr/local/share/locale
```

启动脚本会自动尝试执行这些操作，如果权限不足会提示手动执行�?

## 启动服务

### Windows

```batch
# 方式1: 双击运行
runtime\scripts\start.bat

# 方式2: 命令�?
node runtime\scripts\start.js
```

### Linux

```bash
# 方式1: 脚本运行
./runtime/scripts/start.sh

# 方式2: Node.js 运行
node runtime/scripts/start.js
```

## 停止服务

### Windows

```batch
runtime\scripts\stop.bat
```

### Linux

```bash
./runtime/scripts/stop.sh
```

或按 `Ctrl+C` 停止所有服务�?

## 增量升级包

面向已部署客户端的版本更新交付物（ADR-0046）。与全量部署包的区别：不含 runtime 二进制、完整依赖 store 与配置模板，只含变更产物（各包 dist、全量 prisma migrations、runtime/scripts、条件性 `.pnpm-store-deploy` 增量），包体小、生成快。

### 打包

```powershell
pnpm pack:upgrade:win          # Windows 增量升级包
pnpm pack:linux-upgrade        # Linux 增量升级包（Docker 容器内打包，默认 CentOS 7）
# Linux 指定系统/私有版本:
#   pnpm exec node scripts/pack-linux-deploy.js --upgrade --os ubuntu22 --variant private
pnpm pack:upgrade:win:private  # Windows 闭源（含 impl-mx）
```

**平台约束（重要）**：`.pnpm-store-deploy` 的原生依赖（esbuild/swc/prisma engine 等）与打包环境平台强相关。Windows 升级包在本机打包；**Linux 升级包必须在 Linux 容器内打包**（`pack:linux-upgrade`，复用 `Dockerfile.linux-deploy` 镜像层缓存的 Linux 生产依赖 store）——在本机执行 `pack:upgrade:linux` 会被拒绝并提示。

前置条件：先产出一次同平台/variant 的全量部署包（`pnpm pack:offline:*`），以生成本次发布的构建产物与 store 基线。升级包命名：`cloudcad-upgrade[-private]-<版本>-<日期>-<平台>.7z`（Linux 为 `.tar.gz`）。

### 升级步骤

1. 解压升级包到目标部署根目录（覆盖现有文件，不删除任何已有文件）
2. 运行 `start.bat`（Windows）或 `./start.sh`（Linux）
3. 启动流程自动完成：
   - 依赖重装检测（对比 `pnpm-lock.yaml` 与 `.deploy-lock-hash`，lockfile 变化时自动 `pnpm install --offline --prod`）
   - prisma 数据库迁移（migrate deploy，幂等）
   - 配置增量合并（.env 与前端配置只新增配置项，不覆盖已有配置）

### 注意事项

- 升级包不会携带、也不会覆盖：runtime 二进制、`.env`、前端自定义配置（`ini/*.json`、brand 资源）、用户数据（`data/`、SVN 仓库、uploads）
- 升级包**始终携带完整依赖 store**（含 devDependencies 超集，目标机离线安装只解析生产依赖；7z 后约 150MB 级），任何旧版本/任意跳版本均可直接升级；打包时依赖同步为幂等操作（无依赖变化时秒级跳过）
- 升级失败（如升级包损坏、覆盖中断）：7z 解压自带 CRC 校验；如启动异常，重新解压全量部署包或升级包覆盖即可恢复
- 不支持版本回退（降级）——如确需回退，请使用对应旧版本的全量部署包

## 启动流程

```
1. 检查运行环�?
   ├── Node.js (必须)
   ├── PostgreSQL (必须)
   ├── Redis (必须)
   ├── SVN (可选，失败不阻止启�?
   └── mxcad (可选，失败不阻止启�?

2. Linux 环境初始�?(�?Linux)
   └── 设置权限、复�?locale

3. 启动基础服务
   ├── PostgreSQL
   └── Redis

4. 初始化数据库
   └── 运行 Prisma 迁移

5. 启动应用服务
   ├── 后端 API (端口 3001)
   └── 协同服务 (端口 3091)
```

## 错误处理

| 组件 | 失败行为 | 解决方案 |
|------|----------|----------|
| Node.js | 启动终止 | 检�?Node.js 是否正确安装 |
| PostgreSQL | 启动终止 | 检查数据目录权限或端口占用 |
| Redis | 启动终止 | 检查端�?6379 是否被占�?|
| SVN | 警告继续 | 手动安装 SVN 后重新启�?|
| mxcad 权限 | 警告继续 | 按提示手动执行命令后重新启动 |

## 环境变量

启动脚本使用以下默认配置�?

```env
# 数据�?
DATABASE_URL=postgresql://postgres@localhost:5432/cloudcad

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 服务端口
PORT=3001

# JWT (生产环境请修�?
JWT_SECRET=offline-deployment-secret-key
```

## 常见问题

### Q: 端口被占用怎么办？

```bash
# Windows - 查看端口占用
netstat -ano | findstr :3001
netstat -ano | findstr :5432
netstat -ano | findstr :6379

# Linux - 查看端口占用
lsof -i :3001
lsof -i :5432
lsof -i :6379
```

### Q: 数据库初始化失败�?

删除数据目录重新初始化：

```bash
# 删除数据目录
rm -rf data/postgres

# 重新启动
node runtime/scripts/start.js
```

### Q: Linux �?mxcad 无法执行�?

```bash
# 手动设置权限
sudo chmod -R 755 runtime/linux/mxcad
sudo chmod +x runtime/linux/mxcad/mxcadassembly
```

### Q: 如何使用系统已安装的服务�?

如果系统已安�?PostgreSQL、Redis 等服务，删除 `runtime/windows/` �?`runtime/linux/` 目录，启动脚本会自动使用系统服务�?

## 技术支�?

如有问题，请联系技术支持团队�?
