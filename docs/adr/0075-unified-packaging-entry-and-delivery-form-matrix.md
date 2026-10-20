# 0075 — 统一打包入口与交付形态矩阵（Unified Packaging Entry & Delivery Form Matrix）

**Status**: accepted（2026-10-16）—— 三轮 grilling 全部决策定稿；可执行路线图见 `docs/packaging-unification-plan.md`（痛点 P1-P10、契约 C1-C12、回归矩阵 V1-V8）；票据 #429（map）/ #430（v1）/ #431（v2）/ #432（v3）/ #433（v1 spec）

## 背景

打包体系分裂为两条各自漂移的线：

- **裸机线**：`pack-offline.js`（本机直打）/ `pack-linux-deploy.js`（Docker 容器构建通道），在 `pack-menu.js` 菜单里、在 CI（release.yml）里；
- **Docker 线**（ADR-0074 一键部署包）：`pack-linux-docker.js` 完全独立——不在菜单、不在 CI、命名风格不同（无日期、arch 段位置不同）、start/stop 走 `runtime/docker-runtime/` 独立 12 步编排而非统一运维 CLI、无 cloudcad 运维入口、无升级包（升级 = 重下 ~800MB 全量包）、包元数据反向不齐（裸机包缺 SHA256SUMS/VERSION/部署说明）。

另有两处结构性混淆：菜单里的「docker 通道」实为*构建通道*（用 Docker 容器打 Linux 包），与 Docker 交付形态一词两义；`pack-docker.js`（源码包，目标机现场 compose build）已被 ADR-0074 一键包取代但仍挂在 package.json。

目标：**一个打包入口 + 一个运行时入口 + 一套命名/元数据/验证/CI**，覆盖交付形态矩阵；Windows 宿主 Docker 包与 Docker 升级包按 v2/v3 分期接入同一框架。

## 决策

### D1 交付形态矩阵与分期

| 交付形态 | 宿主平台 | v1 | v2 | v3 |
|---|---|---|---|---|
| 裸机部署包 | windows | ✅（现状保留） | | 裸机升级包（已存在） |
| 裸机部署包 | linux（centos7/ubuntu22/rocky9） | ✅（现状保留） | | 裸机升级包（已存在） |
| Docker 部署包 | linux | ✅（统一入口/命名/交互/CI） | | Docker 升级包 |
| Docker 部署包 | windows | | ✅ | Docker 升级包（与 linux 共用，按架构） |

- **v1** = 三类现有包（裸机 win / 裸机 linux / docker linux）统一入口 + 命名 + 交互 + CI；
- **v2** = Docker Windows 宿主包 + private variant + 运维长尾形态感知 + 删除 `pack-docker.js`；
- **v3** = Docker 升级包（见 D9）。

### D2 单一打包入口

- `pack-menu.js` 是人类入口，问题顺序 = 打包类型 → variant → **交付形态（裸机/Docker）** → 平台/构建通道 →（裸机 Linux 容器通道：发行版）→ 汇总确认（显示将执行的完整命令）；
- **交付形态与构建通道是两个正交维度**，菜单分步呈现；旧「docker 通道」更名「构建通道」，一词两义消除；
- 底层按形态保留既有打包脚本（`pack-offline.js` / `pack-linux-deploy.js` / `pack-linux-docker.js`，各自内聚），共享 `pack-lib/`；`package.json` 的 `pack:*` 命令保留为薄别名（CI 与肌肉记忆）；
- 未实现组合在菜单置灰：Docker+private（v2）、Docker+Windows 宿主（v2）、升级包+Docker（v3）。

### D3 CLI 单一入口（深度统一）

- `start.*` / `stop.*` / `cloudcad.*` 瘦壳**全形态同构**：Docker 包的 start.sh/stop.sh 改为与裸机相同的瘦壳（→ `cli.js deploy/stop`），Docker 包新增 `cloudcad` 运维入口（v2 为 start.bat/stop.bat + cloudcad.bat）；
- 形态检测唯一出口 `detectDeployForm()`：`.deploy` 文件内容 `form=bare|docker`（bare 可空，兼容旧包），**必须兼容存量 `.deploy-docker` 标记**（存量部署升级路径，回归 V5）；新包只写 `.deploy`；
- `cli.js` 按形态分派：bare → 既有编排；docker → `runtime/docker-runtime/` 形态模块（12 步编排保留为内聚模块，CLI 是薄 adapter）——保持 ADR-0056 分层与 start/cloudcad 双 facade 成对契约；
- 运维主路径形态感知：`status`/`stop` 感知形态（docker = 容器 + 宿主进程）；长尾命令（db-backup/密码重置/infra/setup-wizard/dev）经 `menu-sections` 可见性数据在 Docker 形态**隐藏**（v1 不做适配器，v2 补齐）；运维中心（config-service）继承同一可见性数据。

**D3 实施注记（v1 Step 3 落地形态）**：

- 分派位置 = `cli.js` 前置分派（prelude）：文件头部 `detectDeployForm()` 判 docker 形态即委托 `runtime/scripts/docker-form-adapter.js` 并置 `IS_DOCKER_FORM` 标志，文件尾部的裸机 `bootstrap()` 调用被该标志短路。cli.js 顶层其余模块（commands/*、setup-offline 等）仍会加载——其顶层均为纯路径计算/工厂函数（已逐一核查），在 Docker 包环境（无 `packages/backend`）下安全，仅**不执行**；
- `docker-form-adapter.js` 只做命令映射（`resolveCommand` 纯函数）与最小交互菜单，编排唯一出口仍是 `runtime/docker-runtime/index.js`——后者已加 `require.main` 守卫并导出 `cmdStart/cmdStop/cmdVerify`，直调（`node index.js start`）与 adapter 两条路径共用同一份 12 步编排；
- Docker 包 start.sh/stop.sh/cloudcad.sh 直接复用 `scripts/pack-lib/templates/` 共享模板（与裸机包逐字节同构）；`runtime/docker-runtime/start.sh|stop.sh` 退役删除；
- 共享 start.sh 模板新增 flock 并发守卫（原为 Docker 包独有，`data/.start.lock`）——裸机包自此也获得「同一部署目录只允许一个 start」保护，stop.sh 模板本就有该守卫，两形态完全对齐；
- 新 Docker 包写 `.deploy`（内容 `form=docker`），不再写 `.deploy-docker`（只读兼容存量）；裸机包继续写空内容 `.deploy`（`detectDeployForm` 判 bare）。

### D4 命名（最小改动：裸机不动，Docker 向裸机风格对齐）

- 裸机（不变）：`cloudcad-{deploy|upgrade}[-private]-{V}-{DATE}-{platform}.{7z|tar.gz}`（windows=.7z，linux={os}-{arch}.tar.gz）；
- Docker 全量：`cloudcad-deploy[-private]-{V}-{DATE}-docker-{hostPlatform}-{arch}.tar.gz`（例 `cloudcad-deploy-1.0.0-20261016-docker-linux-x86_64.tar.gz`；v2 Windows 宿主 = .7z）；
- Docker 升级（v3）：`cloudcad-upgrade[-private]-{V}-{DATE}-docker-{arch}.tar.gz`——**无平台段**，因跨宿主平台通用（见 D9）；
- 「挑最新包」正则按形态过滤：裸机验证排除含 `-docker-` 的包，Docker 验证只匹配含 `-docker-` 的包（命名统一后不修此处必误挑）。

### D5 .env 分平台生成

.env 恒在目标机首次 start 时生成（不在打包期烘焙）；宿主服务地址按宿主平台写值：linux 保持 `--network=host`（ADR-0074 D2 不动）→ `localhost:<port>`；Windows 宿主（v2）→ `host.docker.internal:<port>`（Docker Desktop 容器无法经 localhost 达宿主）。**镜像本身跨宿主平台完全相同**，差异只落在目标机生成的 .env。

### D6 包元数据统一

四类包统一含 `SHA256SUMS`（包内顶层文件清单）+ `VERSION` + `部署说明.txt`（裸机包补齐，对齐 Docker 包现状）；部署说明格式统一（部署/停止/升级/引擎替换/运维中心入口）。

### D7 CI 统一

- v1：release.yml 增 `build-linux-docker` job（ubuntu-latest x86_64；复用打包机零假设自举 + pnpm store 缓存；`pack-linux-docker.js --verify` 断网验证通过才上传）；aarch64 保持本地打包机（mxcad-stable 无 ARM 资产，阻塞与裸机一致）；
- v2：增 `build-windows-docker` job（windows-latest，自带 Docker Desktop）；
- Docker 构建在 GH runner 上慢（镜像 build + save，30-60 分钟级），job 超时预算放宽。

### D8 Windows 宿主 Docker 运行时（v2）

**检测 + 指引，不捆绑 Docker Desktop 安装器**：start.bat 检测 docker CLI（Docker Desktop 或任意），缺失时给清晰指引 + 官方下载链接，已装则继续。理由：Docker Desktop 对大型企业是付费授权（TOB 交付许可风险）+ 安装器 ~500MB 包体膨胀；「把用户当新手」原则由清晰指引 + 一键链接满足；断网验证（`docker run --network none`）在 Docker Desktop 上同样成立。

### D9 v3 Docker 升级包（跨宿主平台通用、按架构分）

- **内容** = 新 app 镜像 tar（前后端代码、依赖、migrations 全烤在镜像内）+ `runtime/scripts` + `runtime/docker-runtime` + `.env.example` + VERSION/SHA256SUMS/部署说明 + **基线清单**（pg/redis 镜像 tag、宿主 node/mxcad 版本、docker 最低版本）；**不含** pg/redis 镜像、Docker 运行时与宿主二进制（依赖不变 ⇒ 这些不动）；
- **流程** = 解压覆盖部署根 → 重跑 start → VERSION 变化检测 → `docker load` 新镜像 → 重建 app 容器 → 幂等 migrate → 健康检查（与裸机升级包「覆盖即升级」语义一致）；
- **通用性**：app 镜像是 Linux 镜像 ⇒ 同一架构下 linux/windows 两种宿主通用——每版本 2 个升级包（x86_64 + aarch64）同时服务 4 种全量包形态；
- **护栏**：start 时校验既有部署基线（已加载镜像 tag、宿主二进制版本）与清单匹配，不匹配 → 中止并提示「请使用全量部署包」；
- CI 与全量 Docker 包同一 job 一次产出（共享 app 镜像构建，save 出的 tar 两用）。

### D10 源码包退役

`pack-docker.js`（源码包，目标机现场 `compose up --build`）已被 ADR-0074 一键包取代：v1 标注 deprecated（JSDoc + 从菜单移除 + 已登记 #429），v2 删除脚本与 `pack:docker` 命令。

### D11 Docker 形态完全无 root（取代 ADR-0074 D5 三级权限门禁）

用户铁律（2026-10-19）：部署**始终不依赖 root**——不弹 sudo 密码、部署目录不归 root 独占。

- **普通用户优先复用系统 Docker，不可用才 rootless**（2026-10-19 修订）：`step1Permission` 按 euid + 系统 Docker 可用性定案——euid==0 → root dockerd 路径；普通用户且系统 Docker 无需 sudo 即可用（`docker version` 有 Server 端返回，如用户在 docker 组）→ 直接复用系统 Docker（零安装、不碰包内静态 Docker）；普通用户且系统 Docker 不可用（未安装 / 需 root）→ rootless（用户命名空间 + 包内静态 dockerd + 静态 slirp4netns）。全程**不探测 sudo、不请求任何密码**；rootless 路径下 `data/`、`docker-data/`、日志全部归当前用户；
- **零管理员前置**：rootless-ns 的**单段 0→euid 映射**（无 newuidmap 时自写，go=2 降级路径）即够的前提是**包内镜像全部层的所有文件属主均为 0:0**——容器运行时 uid 0 只是其中一半（pg 定制镜像数据目录 uid 0 + 跳过 gosu / redis `user: root` / app 无 USER）；官方基础层含非零属主文件（alpine `/etc/shadow` root:shadow gid=42、nginx 100/101、node 1000/1000 等），无 newuidmap 的目标机 `docker load` ApplyLayer 会 lchown 到层内记录属主，内核对未映射 id 返回 EINVAL（`lchown /etc/shadow: invalid argument`，mx@ubuntu 无 root 机器实测，2026-10-20）。故打包时由 `scripts/pack-lib/normalize-image-ownership.js` 把三镜像全部层重写为 0:0（容器内均以 uid 0 运行，属主无运行时意义），同步更新 config `diff_ids`（层目录不重命名：docker load 按 diff_ids 校验、不看目录名，且 docker save 对同内容层用符号链接去重），断言全层 0:0 后才允许进包 → **无需 uidmap 包、无需 subuid/subgid 配置**（有则用多段，兼容非 0:0 属主镜像）；
- **root 仅当用户自愿以 root 运行 `./start.sh` 时出现**（root dockerd 路径，root 本就不需要密码）——是用户选择，不是部署依赖；
- **root 残留预检**：`checkDeployDirOwnership()` 在 12 步入口快速失败——部署目录/data 不可写（此前 root 部署或以 root 解压）时给出 `chown -R` / 重新解压指引，而非中途 EACCES 难懂报错；
- 代价：目标机内核须支持非特权用户命名空间（CentOS 7 / Ubuntu 均默认支持）；断网验证（DinD 容器内 root 运行）仍走 root 路径，不受影响。

## 后果与代价

- Docker 形态长尾运维命令 v1 隐藏（v2 补齐适配器）——运维中心在 Docker 形态的可见菜单相应收窄，属已知取舍；
- 存量 Docker 部署（`.deploy-docker`）必须可升级新包，`detectDeployForm()` 双标记兼容是硬回归项（V5）；
- `runtime/docker-runtime/` 用户可见前缀硬编码（`[CloudCAD]`/`[MxCloudCAD]`）违反品牌单一事实源，v1 一并修正走 `branding.js`；
- 裸机包补元数据后包体略增（KB 级），无行为变化；
- 三层一致性（前端/SDK/后端/DB）零改动，本 ADR 纯打包 + 部署运行时工程。

## 相关

- ADR-0074（Docker 一键部署包：半容器化）——本 ADR 的 Docker 线基础，D5 的 `--network=host` 与 rootless 网络语义沿用其 D2
- ADR-0056（运行时与打包工具工程化）——双 facade（start=一键部署 / cloudcad=运维 CLI）与分层，D3 的分派保持其契约
- ADR-0059（离线验证门禁 / 多源下载 / 打包机自举）——D7 的 CI job 复用其断网验证与自举兜底
- ADR-0046（增量升级包，路线 B 不带 store）——D9 的「覆盖即升级」语义与之同构
- 计划文档：`docs/packaging-unification-plan.md`；spec：Gitea #433
