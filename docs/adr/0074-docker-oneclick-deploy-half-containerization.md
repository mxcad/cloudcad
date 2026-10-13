# 0074 — Docker 一键部署包：半容器化（宿主 mxcad 系 + 三容器 PG/Redis/App）

**Status**: proposed（2026-10-12）—— 架构边界与全部取舍已由产品侧逐项确认（含 Q1–Q6 缺口轮），实施开始

## 背景

现有 `scripts/pack-offline.js --deploy --linux` 产出裸机部署包：node / PG / Redis / SVN 全量二进制 + PM2，目标机依赖安装与版本漂移问题（runtime-deps Release 404、preinstall 静默失败、PG/Redis 端口门禁 blocked、SystemLib 按发行版猜测）全部堆在这条链上。仓库里另有一套 `docker/docker-compose.yml`（nginx + 全容器化 + 目标机联网 build），它不是交付物。

新形态目标：**一个压缩包，解压 → `./start.sh` 即完成**；目标机没有 Docker 时用包内静态二进制自装；用户视角只有 start / stop / 升级（同目录覆盖重跑 start.sh）。

## 决策

### D1 半容器化边界（唯一形态）

- **宿主进程（不进容器，nohup + pidfile，不用 PM2）**：
  1. `mxcadAssembly` 折叠的**协同服务**（3091，`runtime/scripts/cooperate-manager.js` 以 `{"run_cooperate_server":true,"print_server":true}` 拉起同一个二进制）；
  2. **conversion-service**（3100，`packages/conversion-service/dist/server.js`）；
  3. **config-service / 运维中心**（3002，`packages/config-service/server.js`，0 外部依赖）。
  三者都用包内 `runtime/linux/node/bin/node`。PM2 是裸机形态独有的需求（全机唯一注册表 + 跨部署目录误接管门禁），本形态不需要。
- **容器（3 个）**：`pg`（postgres:15）、`redis`（redis:7）、`app`（单容器**双进程**：backend + serve-static 前端）。SVN 只作为**二进制**打进 app 镜像（沿用 `runtime/docker/Dockerfile.svn` 的静态化做法）——`svnserve` 全仓零调用，不存在 SVN 服务进程。
- **两端都不在**：`storage-service`（standalone 形态本就未接线，ADR-0062 已注明）；`MxWebDwg2Jpg.exe` / `mxcmd` / `mxcheck`（协议与 mxcadAssembly 不同，Linux 部署态不走）。
- **mxcad 系留宿主的理由**：`mxcadAssembly` 读 CPU / DMI / 磁盘序列号做机器码绑定。容器共享宿主内核与硬件，CPU / DMI / 磁盘序列号不变，但 MAC、主机名、IP、`/etc/hostname` 会变，且 mxcad 内部读了哪些字段无从得知（闭源）。留在宿主是**唯一不需要猜闭源实现**的解法。conversion-service 与之共址（spawn 引擎），协同服务就是引擎本身，两者因此同为宿主进程。
- **config-service 留宿主的理由**（2026-10-12 缺口轮确认，产品侧提议）：
  1. **零反向依赖**：已核实 backend 源码中的 `configService` 全部是 NestJS 进程内 `ConfigService`，前端无 3002 调用——容器内没有任何服务经 HTTP 依赖它，唯一消费者是浏览器（运维中心页面），放哪一侧对用户无感。
  2. **ADR-0071 的立论在宿主更强**：运维中心是「部署全程存活的唯一长任务宿主」；Docker 形态升级时 app 容器会被新镜像替换（backend/前端短暂不可用），宿主侧的 config-service 全程存活，运维中心在升级窗口内仍可用。
  3. **管理面位置正确**：运维中心的管理对象同时包含容器与宿主进程，放宿主才能直接调 `docker` CLI（`docker exec/restart/logs`），不必把 docker socket 挂进容器。
  4. **app 容器收缩为双进程**，监督逻辑更简单；`.env` 只挂一份给 app 容器。
  - 代价与边界：运维中心的**动作类**命令（部署/迁移/启停/PG·Redis 密码重置）桥接的是裸机 `runtime/scripts`（PM2 / 内嵌 PG·Redis 二进制），Docker 形态下这些目标不存在。v1 处置：包内带 `runtime/scripts`（只读能力——日志中心/配置查看/健康——直接可用），菜单按 `DEPLOY_FORM=docker` 门控隐藏裸机专属动作项；Docker 形态动作实现（重启 app 容器 = `docker compose restart app`；`db:reset-password` = `docker exec cloudcad-pg psql` 走 ADR-0073「先验证后写账本」语义）单独排票。

### D2 通信：三容器全 `network_mode: host`

端口不再需要 publish / 映射，`.env` 里的 `PORT` / `FRONTEND_PORT` / `DB_PORT` / `REDIS_PORT` / `CONFIG_SERVICE_PORT` / `CONVERSION_SERVICE_PORT` / `COOPERATE_PORT` 直接生效；`DB_HOST` / `REDIS_HOST` 恒为 `localhost`（app 容器与 PG / Redis 容器共享宿主网络命名空间）。后端到 conversion-service 走 `localhost:3100`，与 `FUNCTION_EXECUTOR=conversion-service` 的进程内 spawn 语义同形，`INTERNAL_SERVICE_SECRET` / `CONVERSION_SERVICE_SECRET` 鉴权不变。宿主进程（含 config-service）天然在宿主网络上，3002 与容器内服务互访无网络差异。

顺带消灭现有 `docker/docker-compose.yml` 的两个已知缺陷：`127.0.0.1:${DB_PORT}:5432` 收口（#418）因无需 publish 而消失；`${COOPERATE_PORT:-3000}:3000` 死映射（容器内 3000 无监听者，真实协同端口 3091 从未暴露）随形态消失。

**代价**：容器无法多实例同机共存（host 网络命名空间全机唯一）。本包按「一台机器一套」定位，接受。

### D3 挂载一律「宿主绝对路径 = 容器绝对路径」

本形态最关键的一条，直接由 D1 逼出：conversion-service 在宿主上 `spawn` 引擎读 `srcPath`，而 `srcPath` 由**容器内的** backend 按 `resolvePath()`（相对 `PROJECT_ROOT=/app`）算出。若 `data/` 挂在容器 `/app/data`，两个路径字符串不同，宿主引擎必然 ENOENT。

解法：**所有 bind mount 使用同一绝对路径两端可见**——挂载形如 `-v <DEPLOY_DIR>/data:<DEPLOY_DIR>/data`，容器内该路径逐字节等同宿主。于是：

- `.env` 里凡是**宿主进程要读的路径**（`MXCAD_ASSEMBLY_PATH`、`MXCAD_FONTS_PATH`、`FILES_DATA_PATH`、`MX_REPO_PATH`、`MXCAD_UPLOAD_PATH`、`MXCAD_TEMP_PATH`、`MXCAD_DEBUG_PATH`、`LOG_DIR`、`BACKUP_DIR`）一律写**绝对路径**（`resolvePath` 对绝对路径原样透传），无需任何翻译层。
- 容器内的 `MXCAD_ASSEMBLY_PATH` 只是一个字符串，backend 原样转交给 conversion-service；它是否可读由宿主决定，容器内不需要该文件存在。
- `.env` 中所有路径以占位符 `<DEPLOY_DIR>` 交付，由 `start.sh` 首次运行时按 `cd "$(dirname "$0")"` 实测到的目录一次性替换（幂等，已替换的不再动）。
- 同一 `data/` 目录额外再挂一份到 `/app/data`，兼容容器内硬编码相对 `data/...` 的消费方（serve-static.js 的 `getMobileAccessPath`、backend 默认值回退），零代码改动。

### D4 单一 `.env`（不新增配置文件）

- 位置：部署包根 `.env`；模板 `.env.example` = `packages/backend/.env.example` 原样 + 一段 docker 形态覆盖（路径占位符 + `DB_HOST` / `REDIS_HOST` 固定 `localhost` + `MXCAD_*` 指向宿主 mxcad 目录 + `PG_DUMP_PATH` 指向镜像内 pg_dump + `DEPLOY_FORM=docker`）。
- compose 用 `env_file: ./.env` 注入 app 容器；`start.sh` 用同一份 `.env` 拉起宿主进程——**单一事实源**。
- **复用**：`fillEmptySecrets` 的密钥生成、`mergeExampleIntoEnv` 的增量合并、`parseEnvFile` / `parseEnvFileSimple`（`runtime/scripts/lib/env.js`）原样复用。但**不整文件 require `setup-offline.js`**——它的依赖闭包含 `deploy-install-filter` / PM2 / pnpm，会拖进裸机部署链。改为把 `generateSecret` / `generateStrongPassword` / `fillEmptySecrets` 抽到 `runtime/scripts/lib/secret-generator.js`（纯函数，仅依赖 `node:crypto` + 注入的 log），`setup-offline.js` 与新 docker 包同时改引用，顺带消除「同一套密钥生成逻辑两份漂移」的既有风险。
- `packages/backend/.env` 在宿主**不存在**（应用代码在镜像内），这是与裸机包唯一的目录差异。

### D5 Docker 自装：静态二进制，无 root 即硬失败

- `docker/` 含 dockerd / containerd / containerd-shim-runc-v2 / runc / docker / docker-proxy / docker-init，版本 **20.10.24**（glibc 2.17+，兼容 CentOS 7 的 3.10 内核；25.0.x 对内核与 glibc 的要求更高）。
- **compose v2 独立静态二进制一并附带**（~30MB）：Docker 20.10 的静态 tgz 不含 compose，而 compose 文件同时充当用户可读的部署文档、`docker compose ps/logs` 是运维肌肉记忆。
- dockerd 由 `start.sh` 以 nohup 拉起，参数固定 `--iptables=false --bridge=none --data-root <DEPLOY_DIR>/docker-data`（host 网络无需网桥；`--iptables=false` 避免无 `CAP_NET_ADMIN` 时 dockerd 自退）。**不写 systemd unit**（systemd 版本差异过大）。
- **无 root / sudo 即失败并给出明确指引，不降级到裸机形态**。理由：dockerd 需要 `CAP_NET_ADMIN` / `CAP_SYS_ADMIN` 才能建命名空间与挂载，无特权环境跑不通；若为兜底再打包一份 PG / Redis / node / SVN 裸机二进制，包体翻倍且进入「双轨维护」——这正是本仓库反复收口掉的反模式。

### D6 SystemLib 改为运行时探针（取代构建期替换）

现状缺陷：`scripts/pack-linux-deploy.js:53` 的 `NEEDS_SYSTEM_LIB = ['ubuntu22']` 按**发行版**硬编码 glibc 档位，而 glibc 取决于实际链接的库（CentOS 7 手工装了 2.35+ 同样会挂）；`runtime/docker/Dockerfile.linux-deploy:175-181` 构建期 `cp -r -f SystemLib/. …` 后**立刻 `rm -rf SystemLib`**，运行期再无补救手段。

新做法：SystemLib **完整保留**在包内（`runtime/linux/mxcad/SystemLib/`），start.sh 在拉起协同服务之前跑 `mxcad-probe.js`：

1. 拿包内自带 `runtime/linux/mxcad/1.dwg`（196 KB，已在包中）做一次真实转换。判据 = 引擎 JSON stdout 的 `code` 字段 + 产物文件存在，**不按退出码**（mxcadAssembly 成败退出码恒 2123，是既有铁律）。
2. 失败 → `cp -r -f SystemLib/. <mxcad 目录>/` → 重跑探针。成功写 `data/.systemlib-applied` 标记；两次都失败则标记 + 大声报错但**不阻塞启动**（转换不可用不影响登录与协同，且 mxcad 本就要被客户用正版替换）。
3. 探针**必须**走 `@cloudcad/engine-exec` 的 `runMxcadAssembly` + `interpretEngineRun`（引擎唯一出口铁律），不得自写 spawn 与判定分支。为此包内多带一个 `packages/engine-exec/dist`（0 运行时依赖）。
4. **已知局限**（产品侧知情接受）：探针无法区分 glibc 失败与授权 / 机器码失败，SystemLib 替换是启发式；报错文案须把两种可能都说出来。

> 注：`pack-linux-deploy.js` / `Dockerfile.linux-deploy` 的现有 SystemLib 逻辑属**独立票**（影响既有裸机包），不并入本 ADR 的实施范围。

### D7 生命周期：start / stop 唯一入口

- `start.sh` 幂等：容器复用 `docker compose up -d` 语义；宿主进程按 pidfile 判存活，且沿用 `cooperate-manager.js` 的**双判据**（子进程存活 **且** 端口可连），避免「端口被别的进程占着也被误报成功」。
- `stop.sh` 顺序：`docker compose down`（**绝不带 `-v`，`data/` 永不删**）→ 按 pidfile 杀宿主进程（SIGTERM → 5s → SIGKILL，杀树）→ 若 dockerd 由本包自装则一并停。**宿主进程失败不阻塞后续步骤**。
- **升级 = 同目录覆盖**（D12）：新包解压到旧目录，重跑 `./start.sh`。
- **防并发**：`flock` 锁 `data/.start.lock`，新手连点两次 start.sh 不会双开 dockerd / 双 load 镜像。

### D8 验证是 start.sh 末尾的硬门禁

失败不静默：非 0 退出 + 逐项定位指引 + 对应日志位置。

**包级断网验证**（`scripts/verify-linux-docker-deploy.js`，Release 上传前硬门禁，ADR-0059 模式）：DinD 断网——外层容器 = `debian:bookworm-slim`（**glibc 用户态**：包内自带 node/mxcad 是 glibc 二进制，alpine 用户态跑不起来；外层只当「一台断网的 glibc 服务器」）+ `--privileged`（内层 dockerd 需建命名空间/挂载）+ `--network none`（外层 netns 无外网；内层 dockerd 以 `--bridge=none --iptables=false` 启动，内层容器全部 host 网络 = 外层 netns → 整个部署完全离线）。容器内跑包内 `start.sh`（完整 12 步 + 包内 13 项验证），退出码落文件轮询取回；退出码 0 后再做独立二次探针（`docker exec` curl 各健康端点，端口读包内 `.env`），不信任单一出口。

### D9 Redis 策略与裸机对齐（修掉旧 compose 的 LRU 驱逐缺陷）

旧 `docker/docker-compose.yml` 的 `--maxmemory 256mb --maxmemory-policy allkeys-lru` 与裸机形态（`redis-manager.js`：仅 `--appendonly yes` + requirepass 走配置文件，**不设 maxmemory**）漂移。conversion-service 的任务队列（`task-store`，`QUEUE_DRIVER=redis`）与缓存共用同一 Redis 库——256MB 打满后 LRU 会**静默驱逐进行中的转换任务键**，表现为转换卡死 / 凭空消失。新 compose 与裸机对齐：`appendonly yes` + requirepass（密码走 `--requirepass` 或配置文件，不落进程列表），**不设 maxmemory**；`.env` 留 `REDIS_MAXMEMORY` 空值可配（客户机器内存紧张时手动设 `noeviction` 或上限）。

### D10 备份通道：app 镜像装 postgresql-client

`backup.service.ts` 按 `PG_DUMP_PATH` 找 `pg_dump`，找不到即报错——裸机形态指向内嵌 PG 的 pg_dump，而 alpine 基底的 app 镜像里没有。处置：app 镜像安装 `postgresql-client`（pg_dump / psql / pg_restore），`.env` 覆盖段写 `PG_DUMP_PATH=/usr/bin/pg_dump`。每日备份 + 备份演练（`BACKUP_DRILL`）在 Docker 形态保持可用——备份是 TOB 客户最在意的能力，不做降级。

### D11 运维中心 = 宿主进程（见 D1 第 3 条）

v1 范围：包内带 `runtime/scripts`（日志中心 / 配置查看 / 健康等只读能力直接可用）+ 菜单按 `DEPLOY_FORM=docker` 门控隐藏裸机专属动作项（部署 / 迁移 / 启停 / PG·Redis 密码重置 / TOTP 解绑）。Docker 形态动作实现（`docker compose restart app`、`docker exec cloudcad-pg psql` 走 ADR-0073 语义的 `db:reset-password`）单独排票。

### D12 升级 = 同目录覆盖 + start.sh 自动识别

新包解压到**旧目录**（tar 覆盖解压不删 `data/` 中新包没有的文件，天然安全）。start.sh 检测到 `.deploy-docker` 标记 + 已有 `.env` / `data/` → 走升级路径：`mergeExampleIntoEnv` 合并 `.env`（保留用户值）、`data/` 原样保留、load 新镜像、`docker compose up -d` 只替换有变化的容器（PG / Redis 镜像 digest 不变则复用）、app 容器入口按**镜像版本变化**执行 `prisma migrate deploy`（幂等），迁移失败则不启动 backend 并打印 `docker logs cloudcad-app` 指引。不新增 upgrade.sh 入口——新手不该多记一个脚本。

### D13 目标 OS 兼容：自动探测 + 自动兜底

「什么发行版都可能有」意味着要碰两个经典雷，start.sh 自动探测并兜底、大声说明做了什么：

- **CentOS 7 xfs `ftype`**：xfs 未开 `ftype=1` 时 overlay2 不可用 → 自动改 `--storage-driver=vfs`（慢但能跑，「能起来」优先）。
- **SELinux enforcing**（RHEL 系）：bind mount 进容器会被拒 → `data/` 挂载加 `:z` 标签（对宿主侧 unconfined 进程无副作用），并提示可 `setenforce 0`。
- **磁盘预检**：`docker load` 前三态检查（`statfs`，探测失败报「无法确定」而非默认 0——批量下载假阳性教训），剩余 <10GB 拒绝加载并说明。
- **架构**：**架构感知**——在对应架构的机器上打对应架构的包：x86_64 机器出 x86_64 包，arm64 机器出 aarch64 包（mxcad 两种架构都有转换器，不存在「只做 x86_64」的限制；容器镜像全多架构，`docker build` 在打包机上直接产出本机架构镜像）。打包脚本按 `process.arch` 选择各物料来源（Docker 静态二进制 URL 布局、compose 资产名、node 回退源、mxcad registry 键、Prisma 引擎 target），包名 `cloudcad-docker-linux-<arch>-<版本>`；其余架构（armv7l 等）明确报错，继续走裸机包。

### D14 打包与运行细节

- **时区**：宿主 `TZ` 注入三个容器（备份 cron 与日志时间戳跟宿主走）。
- **宿主日志轮转**：cooperate / conversion / config-service / dockerd 四个 nohup 日志做 50MB×3 大小轮转（nohup 重定向本身不轮转）。
- **发布物**：Release 附 `SHA256SUMS`；README 加防火墙说明（host 网络下端口与裸机形态完全一致，3000 / 3001 按需放行）。
- **迁移执行**：`schema-engine-linux-musl` 二进制（alpine 基底匹配）烘焙进镜像，app 入口（`docker/app-entrypoint.js`）以 `PRISMA_SCHEMA_ENGINE_BINARY` 指向它、经 **prisma CLI**（钉 `prisma@7.8.0` + `tsx@4.22.4` 加载 `prisma.config.ts`，与旧镜像同口径）跑 `migrate deploy`。实测裸 schema-engine 的 `cli` 子命令只有 can-connect/create-database/drop-database，**不支持 migrate deploy**——「不走 prisma CLI」的初稿方案不成立，CLI 必须进镜像。
- **app 镜像新写 `docker/Dockerfile.app`**（旧 `docker/Dockerfile` 原样保留给旧全容器化形态，勿混改）：复用其多阶段结构（`node:20.19.5-alpine` 基底），差异 = 双进程入口 `app-entrypoint.js`（backend + `serve-static.js` 前端，无 nginx/dumb-init）、不烘焙 mxcadAssembly（宿主 `runtime/` 同路径挂载进容器）、前端 dist 落 `/app/packages/frontend/dist`（`serve-static.js` 默认目录）、烘焙 schema-engine（musl 变体）。
- **PG 端口**：host 网络下官方 postgres 镜像恒绑 5432（无 `POSTGRES_PORT` 环境变量）→ compose 用 `command: docker-entrypoint.sh postgres -p ${DB_PORT}` 透传启动参数，`.env` 的 `DB_PORT`（如 5433 绕开系统 PG）在 Docker 形态同样生效。
- **打包/验证脚本**：`scripts/pack-linux-docker.js`（**架构感知**：x86_64/arm64 打包机均可，**Linux 或 Windows+Docker 均可**，按打包机架构出对应架构包：docker build app 镜像 → pg/redis 打 `cloudcad/*` tag → `docker save` 三镜像 → 下载 Docker 静态二进制 **20.10.24**（glibc 2.17/CentOS 7 兼容的最后稳定线）+ compose v2 独立二进制 **v2.29.7**（20.10 tgz 不含 compose）→ 组装包树 → SHA256SUMS + 归档）。Linux 运行时物料按序解析：`runtime/linux/node` → `runtime/cache` 的本架构 node 资产 tarball（x64 = glibc-217 资产，CentOS 7+ 通用；arm64 = 官方构建）→ `runtime/cache/linux-extract/<tier>/node`（ADR-0059 提取产物）；mxcad 同理。Windows 宿主归档在 Linux 容器内执行（bsdtar 写不出 Unix exec 位：容器内 chmod 可执行清单 + tar 保证 `start.sh`/docker 二进制的 exec 位）。`scripts/verify-linux-docker-deploy.js`（D8 断网验证，DinD 只在 Linux 可靠——Windows 打包后交 Linux CI 验证）。`.env.example` 由打包脚本从 `packages/backend/.env.example` 生成：路径键重写为 `<DEPLOY_DIR>` 绝对值（data/ 与 runtime/ 同路径挂载，宿主与容器同一份路径都可见）、host 键钉 `localhost`、追加 `DEPLOY_FORM=docker` / `APP_VERSION` 段。
- **WORKDIR 相对路径 COPY 目的地陷阱（Dockerfile.app 实测，曾误诊为 buildkit 丢文件 bug）**：frontend-builder 阶段 PC 构建后 `WORKDIR` 停在 `/app/packages/frontend`，其后 `COPY packages/frontend_mobile ./packages/frontend_mobile` 的**相对目的地**解析到嵌套的 `/app/packages/frontend/packages/frontend_mobile`（空目录），而移动端构建的 `WORKDIR /app/packages/frontend_mobile` 指向 base 阶段目录（只有 pnpm 装的 node_modules+package.json）→ vite 报 `Could not resolve entry module "index.html"`。症状酷似「buildkit 静默丢文件」（探针一度显示：同序列 COPY 到全新目录文件齐全、移动端目录只剩 node_modules+package.json、可复现），但真根因是 WORKDIR 相对路径解析——探针矩阵全部可用它解释，无 buildkit 缺陷。修法：移动端源码 `COPY packages/frontend_mobile /tmp/fm_src`（绝对目的地）+ `cp -a /tmp/fm_src/. /app/packages/frontend_mobile/`（绝对路径，保留 base 阶段 node_modules）+ `test -f` 断言防上下文缺文件。**规则：Dockerfile 中切换 WORKDIR 之后，所有 COPY 目的地一律写绝对路径**。
- **打包机零假设自举（2026-10-13 定案）**：打包机只要求 **x86_64/arm64 + Docker + node ≥20.19.5 + 网络（或预置物料）**，其余全部由脚本兜底，「只要运行打包，最终一定出正确的包」：
  - **step0**：node 版本门禁；pnpm 解析 = PATH `pnpm` → node 自带 `corepack pnpm`（Windows 上两者都是 `.CMD` shim，`spawnSync` 无 shell 报 EINVAL/ENOENT，统一走 `runPnpm` 在 win32 加 `shell:true`）；`node_modules` 缺失自动 `pnpm install --frozen-lockfile`（顺带触发 preinstall 的 runtime 资产下载，ADR-0059）。
  - **node 兜底**：本地三源全 miss 时按架构下载——x64 从 `unofficial-builds.nodejs.org` 取 glibc-217 构建（CentOS 7 兼容），arm64 从官方 `nodejs.org/dist` 取（unofficial-builds 无 arm64 构建；ARM 目标机一般 glibc 2.28+，官方构建够用），落 `runtime/cache/` 复用。
  - **schema-engine 兜底**：`runtime/prisma-engines/schema-engine-linux-musl`（逻辑名，内容按打包机架构）缺失时，commit 读自仓库安装的 `@prisma/engines-version` 的 `enginesVersion` 导出（`node_modules/.pnpm` 下，版本跟随 lockfile，不手写漂移；**不是包版本号字符串**），从 `binaries.prisma.sh/all_commits/<commit>/<target>/schema-engine.gz` 获取（**`.gz` 后缀必须**，缺则 404；target 按架构：`linux-musl` / `linux-musl-arm64-openssl-3.0.x`——无后缀的 `linux-musl-arm64` 404；`PRISMA_ENGINES_MIRROR` 可换源），gunzip 后 ELF 魔数 + 体积校验。
  - **mxcad 兜底**：`mxcad-registry.json` 的本架构条目（`mxcad-linux-x86_64` / `mxcad-linux-aarch64`）从 `github.com/<RUNTIME_RELEASE_REPO>/releases/download/<RUNTIME_RELEASE_TAG>/<asset>` 下载（与 ensure-runtime.js 同仓库/标签约定）；registry 缺条目时走 GitHub API 按前缀解析（同 ensure-runtime.js 策略）；解压后做 `.tmp-*/` 嵌套层扁平化（与 ensure-runtime.js `flattenExtracted` 对齐），校验 `mxcadassembly` 存在。⚠️ 前提：对应架构的 mxcad 资产须已发布到 Release（`upload-mxcad.js` 生成 registry）——ARM 资产未发布前 ARM 包打不出。
  - **conversion-service dist 兜底**：`dist/` 是 gitignore 的构建产物，干净克隆/工作区重置后不存在；缺失时 `pnpm --filter '@cloudcad/conversion-service...' run build`（`...` = 含全部 workspace 依赖，拓扑序：@cloudcad/db（prisma generate + tsc）→ contracts → engine-exec → conversion-service，四者 dist 均进包）。
  - **swagger_json.json 兜底**：backend 构建产物（`generate:swagger` 生成，gitignore），Dockerfile.app 的 frontend-builder 阶段 COPY 它（前端 MSW/API 类型源）；缺失时 `pnpm --filter backend run build`，且 **IMPL 恒注入空串**（dotenv 不覆盖已存在变量，挡住打包机 `.env` 里 `IMPL=1` 的劫持——否则会 require 不存在的 `impl-mx/dist` 崩溃，与 bd90de5 变体修复同机制；Docker 包是 OSS 形态，IMPL 不影响 swagger 文档内容）。
  - **下载源**：全部走 `scripts/lib/download-sources.js` 多源回退（用户源 `RUNTIME_DOWNLOAD_URLS` → 官方直链 → **base 重写镜像**（`download.docker.com` → TUNA `mirrors.tuna.tsinghua.edu.cn/docker-ce`——官方源已删 20.10 静态二进制（EOL 清理，直链恒 404），TUNA 仍完整保留；**两架构 TUNA 均为扁平布局** `<arch>/docker-<ver>.tgz`（实测 x86_64 版本子目录布局 404、扁平 200），故 canonical URL 统一扁平——与官方 23.0+ 布局一致，升版本不改布局；node 构建 `unofficial-builds.nodejs.org/download/release` / `nodejs.org/dist` → npmmirror `registry.npmmirror.com/-/binary/node-unofficial-builds` / `/-/binary/node`——node 官方源是 GitHub 基础设施，国内直连实测 60s 超时，npmmirror 0.5s 可达；两镜像路径结构与官方不同，重写前缀须含完整段）→ GitHub prefix 代理（`ghfast.top` 实测可用居首，ghproxy 系已失效降末位）；**超时语义两阶段**：连接+首字节 60s（切源判据，抓「TCP 能连但卡死」的慢速死源）+ 正文 30min 安全上限（慢速活源读完不中途换源——总时长超时会让 67MB 级大文件在慢链路必失败，2026-10-13 实跑暴露））。受限网络另可 `NPM_REGISTRY` build-arg 指定镜像内 pnpm 的 registry（Dockerfile.app base 与 production 两阶段各设一次——production 是全新 FROM 不继承 base 的 `/root/.npmrc`）。
  - **容器内重活**：node tarball 的 xz 解压与 Windows 宿主归档统一在 `WORK_IMAGE = node:20.19.5-alpine` 容器内做（busybox tar 自带 xz；**debian:bookworm-slim 缺 xz 不可用**——实测 `tar (child): xz: Cannot exec`；该镜像 app 构建时已拉取，零额外拉取）。**`docker exec` 要求容器 running 态**：`docker create` 后必须 `docker start` 再 exec（初稿 create+exec 模式从未实跑过，属潜伏 bug）。Windows 宿主侧 tar 用 `C:\Windows\System32\tar.exe`（PATH 上的 Git GNU tar 把 `D:\...` 当 host:path 远程语法解析，报 "Cannot connect to D: resolve failed"）。**node 发行包 `bin/` 下的符号链接**（npm/npx/corepack）在 `docker cp` 回 Windows 宿主时因缺 SeCreateSymbolicLink 特权失败（"A required privilege is not held by the client"）→ 容器内解压后立即解引用为实体文件副本（链接目标都是带 shebang 的 JS 文件，Linux 目标机以普通文件执行行为一致）。
  - **部署侧任何环境保证**：包内零运行时下载（镜像 tar + Docker 静态二进制 + 离线 node + mxcad 全在包内），断网/内网/外网部署行为一致；上传 Release 前必须过 `verify-linux-docker-deploy.js` 的 DinD `--network none` 断网验证硬门禁（D8）。

## 包内布局

```
<DEPLOY_DIR>/                            # 解压即得的部署目录（建议 /opt/cloudcad）
├── start.sh  stop.sh  部署说明.txt       # 用户唯一接触的东西（首次部署另生成 DEPLOY-PASSWORDS.txt）
├── .env  .env.example                   # 单一配置（D4）
├── docker-compose.yml                   # 3 services，全 host 网络（D2）
├── docker/                              # Docker 静态二进制 + compose v2 独立二进制（D5）
├── images/*.tar                         # docker save 产物（cloudcad/* 前缀 tag）
├── runtime/
│   ├── linux/node/                      # 离线 node（宿主进程 + start.sh 自身用）
│   ├── linux/mxcad/                     # mxcadAssembly + mx/so + fonts + SystemLib + 1.dwg
│   │                                    #   （同路径挂载进 app 容器，容器内引擎 spawn 走它）
│   ├── scripts/                         # 运维中心桥接层（D11）+ 复用纯函数（env/secret-generator/mxcad-path/branding）
│   └── docker-runtime/                  # 宿主侧主控（node 由 runtime/linux/node 提供）
│       ├── index.js                     #   start/stop/verify 主逻辑（start.sh 只 exec 它）
│       ├── docker-compose.yml           #   compose 模板源（打包时复制到包根）
│       └── lib/{docker-bootstrap,mxcad-probe,host-process,verify}.js
├── node_modules/                        # 扁平根 node_modules（实体目录，宿主进程运行时依赖闭包）
│   ├── @cloudcad/{contracts,engine-exec,db}   # package.json + dist（workspace 包，无自身 node_modules）
│   └── @prisma/client (+client-runtime-utils) # 实体拷贝（generated client 只 require runtime/*，
│                                              #   WASM query compiler，不加载引擎二进制）
├── packages/
│   ├── engine-exec/                     # 引擎唯一出口（D6 第 3 条，宿主探针用 dist）
│   ├── contracts/                       # 引擎参数翻译/输出解析纯函数（宿主探针用 dist）
│   ├── conversion-service/              # 宿主进程：dist + package.json（运行时依赖走根 node_modules）
│   └── config-service/                  # 宿主进程：0 依赖（D11）
└── data/                                # 全部可外挂数据，唯一用户数据出口（D3）
```

> 源位置：包内 `runtime/docker-runtime/` 与 `docker/app-entrypoint.js`、`docker/Dockerfile.app` 在仓库中同名同构（打包脚本原样复制）；schema-engine 二进制**不进包**（烘焙在 app 镜像里，D14）。
> **包树 node_modules 布局（2026-10-13 定案）**：pnpm 的 node_modules 全是符号链接，Windows 打包机无法复制（EPERM，缺 SeCreateSymbolicLink 特权）→ 包内不用 pnpm 布局，改**扁平根 node_modules（实体目录）**：运行时依赖闭包（dependencies 并集，不含 devDeps）= @cloudcad/{contracts,engine-exec,db}（package.json+dist）+ @prisma/client（store 虚拟层实体拷贝，client-runtime-utils 随包）；`packages/*` 各包只带 package.json+dist，Node 从 `packages/*/dist` 向上解析必然命中根 node_modules。该布局**只存在于 Docker 一键包 tarball 内**——仓库保持 pnpm 原布局，裸机包/全容器化包/CI/开发环境均不受影响；`runtime/docker-runtime` 宿主进程启动器对 node_modules 布局零假设（generic spawn，靠 Node 向上解析）。

## 后果

- 目标机零依赖安装（除 Docker，而 Docker 也在包内）；PG / Redis / SVN 全部容器化，客户改库改缓存不碰二进制。
- 宿主只剩「3 容器 + 4 进程」（协同 / 转换 / 运维中心 + dockerd），排障面从裸机形态的 14 个 PM2 app 显著收窄；且不再有 PM2 全机唯一注册表带来的跨部署目录误接管问题（`assertNoForeignAppConflict` 那一整层门禁在本形态下不需要）。
- 运维中心在升级窗口内全程存活（D1 第 3 条），管理面位置正确。
- 包体**实测 782.8 MB**（x86_64 v1.0.0，2026-10-13 Windows 打包机端到端实跑；镜像 tar + node + mxcad + SystemLib + docker 静态二进制 + compose + 根 node_modules ~80MB，其中 @prisma/client runtime 占大头——WASM query compiler base64，gzip 压缩比高）；接受。
- **明确不做**：多实例同机共存、`docker compose pull` 在线升级、systemd unit、无 root 兜底裸机形态、x86_64/aarch64 之外的架构（走裸机包）。

## 与既有资产的关系

- `scripts/pack-docker.js` / `docker/docker-compose.yml`（nginx + 目标机 build）是另一条路线，本 ADR 不修改也不取代它们，交付形态上并存。
- `runtime/scripts/*` 的裸机部署工具链（cli.js / infra.js / verify-deploy.js / pg-manager.js / redis-manager.js / cooperate-manager.js）**不**在本形态下运行，但其纯函数层（`lib/env.js`、抽出的 `lib/secret-generator.js`、`lib/mxcad-path.js`、`lib/branding.js`）被复用；`runtime/scripts` 整体随包分发供运维中心桥接（D11）。
