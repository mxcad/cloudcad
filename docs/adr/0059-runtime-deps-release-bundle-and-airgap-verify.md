# 0059 — runtime 依赖 Release 复用 + 发行版收敛 + 断网启动硬门禁

**Status**: accepted

## 背景

`release.yml` 的 `build-linux` 矩阵是 6 个发行版（centos7/ubuntu22/ubuntu24/rocky8/rocky9/debian）× 架构，每个格子起一个 Docker 打包容器，容器内 `apt/dnf/yum install postgresql redis subversion` + 装 node，再由 `extract-linux-runtime.js` 收集二进制 + ldd 依赖库。而 `runtime/cache/`（按发行版隔离的提取缓存）被 `.gitignore` 排除，GitHub Actions 每次都是全新 runner，**缓存恒空** → 每次 release 6 个发行版全部重新安装 + 提取，`release.yml` 里**完全没有 actions/cache**。

同时，dev 机 clone 后 `pnpm i` 的 preinstall 钩子（`scripts/ensure-runtime.js`）只自动拉 **mxcad/mxversion 产品二进制**，node/pg/redis/svn 标准组件被明确排除（`DEV_SKIP_COMPONENTS` + 注释「开发环境通常本地已有」）。导致 dev 机若本地缺 pg/redis/svn，`pnpm dev` 起不来，违背「clone → pnpm i → pnpm dev 直接启动」的目标。

本 ADR 定下三件事的决策：**① runtime 依赖提取一次、Release 复用；② 发行版收敛到最小 glibc 档位集；③ 断网启动验证成为 release 硬门禁**。红线是**不破坏现有离线部署方案**（部署包自包含、目标机纯离线、store-based 250-350MB 结构不变）。

## 决策

### 1. runtime 依赖包 = GitHub Release 资产（内容寻址）

node / postgresql / redis / svn 标准组件按 `os × arch` 提取一次，打成 `cloudcad-runtime-deps-<os>-<arch>-<version-fingerprint>.tar.gz`（如 `-node20.19.5-pg15-redis7-svn1.14`），上传 Release。CI（`release.yml`）与 dev 机（preinstall）**都只下载该资产**，不再各自提取。

- **版本指纹进资产名**（内容寻址）：组件版本不变 → 资产名不变 → 可永久复用、零重提；版本变才产生新资产。复用 `mxcad-dist/manifest.json` 的「组件×平台×架构 + hash」机制登记。
- 资产同时服务两个消费者：CI 打包机（下载替代提取）+ dev 机（preinstall 按需拉）。

**Rejected**：
- **actions/cache**：临时（90 天/容量驱逐）且 **dev 机无法访问**——只解决「CI 重复提取」一半，解决不了「clone→pnpm i 自动下载」一半，不能单独成立（可作 CI 侧额外加速的补充）。
- **提交进仓库**：违反 `ci.yml` 红线（禁止 `runtime/linux|windows|cache` 入库）+ 仓库膨胀。
- **固定 tag + 覆盖**：无法区分新旧，dev 机无法判断本地缓存是否过期。

### 2. 发行版收敛到 3 个 glibc 档位

per-distro 提取的唯一技术理由是 glibc 兼容（`NEEDS_SYSTEM_LIB=['ubuntu22','ubuntu24']`，centos7 用 glibc-2.17 的 node unofficial-builds）。6 个发行版大量重叠（rocky8/9 同属 RHEL 系、ubuntu22/24 同属 Ubuntu 系）。收敛到 **3 档代表**：

| 档位 | 代表发行版 | glibc | 覆盖 |
|---|---|---|---|
| 老 RHEL 系 | `centos7` | 2.17 | CentOS 7 / RHEL 7 系 |
| Ubuntu 系 | `ubuntu22` | 2.35 | Ubuntu 22.04/24.04 |
| 新 RHEL 系 | `rocky9` | 2.34+ | Rocky/RHEL 8/9 系 |

砍掉 `ubuntu24` / `rocky8` / `debian`（glibc 与上述三档重叠或可被代表）。`release.yml` 矩阵 6→3，CI job 数与 Release 资产数减半。

**待确认**：3 档是暂定集，需对照**真实部署机发行版清单**精确收敛（可能更少）。

### 3. 独立提取工作流 `runtime-deps.yml`

提取与发布解耦：新增 `runtime-deps.yml`，矩阵 = 收敛后发行版×架构 + windows，每格子跑现有 `extract-linux-runtime.js` / `build-windows-runtime.js` 逻辑 → 打 tarball → 上传 Release 资产 + sha256。触发 = `workflow_dispatch`（手动，首次播种 + 版本变更）+ 可选 `schedule`（cron 周期刷新，防组件版本漂移）。`release.yml` 与 dev preinstall 都**只下载**。

**Rejected**：内联在 `release.yml` 加提取 job（把提取绑死在 release 上，release 失败连带提取失败）；纯手动脚本不进 CI（dev 机仍手动，违背「pnpm i 自动」目标）。

### 4. dev preinstall 按需拉全部标准组件（两平台对称）

dev 机 `pnpm i` 时，node / pg / redis / svn 四个标准组件**检测缺失才自动拉**（幂等零开销，已就绪跳过），Linux 与 Windows 对称（Windows 的 svn 由 mxversion 提供，无独立 subversion，不拉）。目标：**完全不懂开发的人 clone 后开箱即用**。

**技术用户三条 opt-out 路径**（互不冲突）：
1. **按需检测天然跳过**：本地已有组件（或已手动放到 `runtime/<platform>/<component>/`）→ preinstall 检测到即跳过；
2. **显式 opt-out**：环境变量 `CLOUDCAD_SKIP_STD_RUNTIME=1` 整体跳过标准组件自动拉取；
3. **手动放置**：手动把组件放到 `runtime/` 对应目录（preinstall 检测到即跳过）。

### 5. 内网镜像复用 `RUNTIME_DOWNLOAD_URL`

dev 机在内网（无公网）时，preinstall 下载源通过现有 `RUNTIME_DOWNLOAD_URL` 环境变量覆盖为内网镜像地址，runtime 依赖包资产也镜像到内网。零新增配置面。

### 6. 部署包保持自包含（红线）

runtime 依赖包**只作为打包机/CI 的复用层**，**不改变**部署包内嵌 runtime 的事实——部署包仍自包含、目标机仍纯离线（store-based 250-350MB 结构不变）。内网/外网部署体验不变。

### 7. prisma dev 链路（engine 已随 store 离线可用，零额外步骤）

`pnpm dev` 的 `predev` 已跑 `db build`（`prisma generate` + tsc）。**关键事实**：Prisma 7 的 schema/query engine 不是独立缓存目录的 binary，而是 npm 包 `@prisma/engines` 的一部分（`node_modules/@prisma/engines/` 下含全部 6 平台 binary：`schema-engine-windows.exe` / `schema-engine-debian-openssl-{1.1,3.0}.x` / `schema-engine-rhel-openssl-{1.0,3.0}.x` / `schema-engine-linux-musl`）。依赖链：`@cloudcad/db` 的 `@prisma/client`（prod）+ `backend` 的 `prisma` CLI（prod）都传递依赖 `@prisma/engines` → **engine 随 `--prod` store 离线可用**。

因此：
- **联网 dev 机**：`pnpm i` 装 `@prisma/engines`（含 6 平台 engine）→ `prisma generate` 用 node_modules 里的 engine（不联网）→ 零改动。
- **离线 dev 机**：`pnpm install`（走离线 store）→ store 已含 `@prisma/engines` → `prisma generate` 直接用 node_modules 里的 engine（不联网）→ **无需单独预下载 engine**。

**结论：prisma engine 的离线获取已由现有 store 机制天然覆盖，本 ADR 不新增任何 engine 预下载步骤**（runtime 依赖包只装 node/pg/redis/svn 标准组件，不含 engine）。`PRISMA_CLI_BINARY_TARGETS` 6 平台 target 机制仍由 `pack-offline.js prepareDeployStore` 沿用（打包机生成 client 时确保全平台 engine 落盘），dev 链路无需复用。

### 8. 断网启动验证 = release 硬门禁

把现有 `scripts/verify-linux-deploy.js`（`docker run --rm --network none` 断网容器 + 解压包 + 装依赖 + 启 PostgreSQL/Redis/后端/前端 + 健康检查）接进 `release.yml` 作**自动门禁**：

- **验证前置到上传前**：每个 build job 产出包后立即跑 `verify-linux-deploy.js --os <os>`（断网），**验证通过才上传** draft Release；**任一包验证失败 → 整个 release 失败**（全量硬门禁）。
- **Windows 对称**：新增 `verify-windows-deploy.js` + `Dockerfile.windows-deploy-verify`（`docker run --network none mcr.microsoft.com/windows/servercore:ltsc2022` + 解压 .7z + 跑 Windows 版 verify 脚本）。
- **判定标准 = 全服务健康检查通过**：postgresql（`pg_isready`）、redis（`redis-cli ping`）、backend（API 健康端点 200）、frontend（HTTP 200）、cooperate + config-service（进程存活 + 端口监听）全部通过 = 验证通过。

**风险**：GitHub windows-latest runner 跑 Windows 容器可能慢/不稳，若实测不可行降级为「Linux 硬门禁 + Windows 后续补」。

### 9. 下载源多源有序回退（双形态 + 内置公开镜像 + 未来自己服务器）

国内访问 GitHub 不稳定，且未来需支持自定义下载地址（自己服务器快速下载）。下载源设计为**多源有序回退**：

- **双形态**：下载助手支持两种镜像形态——① **基地址替换**（`<base>/<asset>`，自己服务器/rsync 镜像用，现有 `RUNTIME_DOWNLOAD_URL` 语义）；② **前缀代理**（`<mirror>/https://github.com/...`，ghproxy 类公开加速用，把完整 GitHub URL 拼在镜像后）。
- **内置公开加速镜像**：集中定义在 `scripts/lib/download-sources.js`（单一事实源），内置 3 个左右当前较活跃的 ghproxy 类公开服务（如 `ghproxy.com` / `mirror.ghproxy.com` / `gh-proxy.com`），作为**默认回退兜底**。清单易腐（社区服务无 SLA、随时可能挂），集中一处便于维护——镜像失效改一行即可。
- **可配置覆盖**：`RUNTIME_DOWNLOAD_URLS`（有序列表，逗号/空格分隔）优先级最高，用户可覆盖/扩展默认清单；**未来自己服务器就绪 = 往列表前插一项**（即自己服务器优先）。保留 `RUNTIME_DOWNLOAD_URL`（单地址，向后兼容，等价列表长度 1）。
- **回退顺序**：默认 `[GitHub 主源, ...内置公开镜像]`；用户配 `RUNTIME_DOWNLOAD_URLS` 则以用户列表为准（自己服务器放最前=优先）。
- **回退判定 = 超时 + 状态码双判**：每源设连接超时（~10s）+ 读取超时（~60s，可配 `RUNTIME_DOWNLOAD_TIMEOUT_MS`），超时或 HTTP 非 2xx 即切下一源；全部失败才报错（提示手动放置 / 设镜像）。**必须判超时**——国内 GitHub 典型症状是「TCP 能连但传输极慢/卡死」，仅判状态码会卡在慢速源上。
- **覆盖范围 = 全链路统一**：dev preinstall（产品二进制 + 标准组件）+ CI（runtime 依赖包 + mxcad 二进制）+ 终端用户部署包下载文档，全部走同一下载助手（单一事实源、行为一致）。
- **终端用户加速**：文档（Release 说明 / `git-workflow.md`）提供「加速下载」章节——加速 URL 模板 + 自建镜像步骤（rsync Release 资产到自己服务器）+ 怎么指向镜像。

**Rejected**：硬编码不可变镜像清单（镜像会变/会挂，必须可配置）；仅前缀代理（丢掉现有 `RUNTIME_DOWNLOAD_URL` 基地址替换语义，无法支持自己服务器）；仅基地址替换（不内置公开加速，国内用户得自己找镜像地址填）。

## 目标体验

- **dev 机**：clone → `pnpm i`（preinstall 自动拉产品二进制 + 缺失的标准组件，下载走多源有序回退：GitHub 主源 → 内置公开镜像 → 用户自定义源）→ `pnpm dev`（predev 跑 prisma generate）→ 直接启动。内网/国内 dev 机设 `RUNTIME_DOWNLOAD_URLS` 指向镜像/自己服务器。
- **CI**：`runtime-deps.yml` 提取一次上传 Release；`release.yml` 下载 runtime 依赖包（不再重复提取）+ 矩阵收敛 3 档 + 每包断网验证通过才上传。
- **部署机**：不变（部署包自包含、纯离线）。
- **终端用户**：部署包下载走加速 URL（文档提供模板 + 自建镜像步骤），国内用户可指向自己服务器/镜像快速下载。

## 与既有 ADR 关系

- **ADR-0056**（部署运行时与打包工具工程化）：本 ADR 是其「store-based 部署包结构 + 离线纯净」红线的延伸——runtime 依赖包只作复用层，不动部署包结构（C1 整目录复制契约不变）。
- **ADR-0046**（离线增量升级包）：升级包链路不受影响（仍走 `syncDeployStore` 增量）。
- **ADR-0027**（共享 Prisma Client）：prisma engine 随 `@prisma/engines` npm 包（prod 传递依赖）落进 store，dev/部署链路离线可用；本 ADR 不改变该机制，仅澄清「engine 不属 runtime 依赖包、无需单独预下载」。

## 实施映射

| 决策 | 落地 |
|---|---|
| 1 runtime 依赖包 | 新增 `scripts/pack-runtime-deps.js`（提取 + 打 tarball + 内容寻址命名）+ `mxcad-dist/manifest.json` 登记 runtime 依赖条目 |
| 2 发行版收敛 | `release.yml` 矩阵 6→3（centos7/ubuntu22/rocky9）+ `pack-linux-deploy.js` `OS_BASE_IMAGES` 同步收敛 |
| 3 独立提取 workflow | 新增 `.github/workflows/runtime-deps.yml`（workflow_dispatch + 可选 schedule） |
| 4 dev preinstall | 改 `scripts/ensure-runtime.js`：拉标准组件（node/pg/redis/svn，两平台对称）+ `CLOUDCAD_SKIP_STD_RUNTIME` opt-out |
| 5 内网镜像 | 复用 `RUNTIME_DOWNLOAD_URL`（零改动，文档补充） |
| 6 部署包自包含 | 不动 `pack-offline.js` 部署包结构（红线） |
| 7 prisma dev | **零代码改动**：engine 是 `@prisma/engines` npm 包（prod 传递依赖），已随 `--prod` store 离线可用；`prisma generate` 用 node_modules 里的 engine 不联网。runtime 依赖包只装标准组件，不含 engine |
| 8 断网验证门禁 | `release.yml` 每 build job 加 `verify-linux-deploy.js --os <os>`（验证通过才上传）+ 新增 `verify-windows-deploy.js` + `Dockerfile.windows-deploy-verify` + 补 `verify-deploy.js` 全服务健康检查 |
| 9 下载源多源回退 | 新增 `scripts/lib/download-sources.js`（双形态 + 内置公开镜像清单 + 有序回退 + 超时判定）+ `ensure-runtime.js`/`release.yml`/`build-windows-runtime.js` 各下载点接入 + `RUNTIME_DOWNLOAD_URLS`/`RUNTIME_DOWNLOAD_TIMEOUT_MS` 环境变量 |
| 文档 | 更新 `docs/git-workflow.md` 5.6 节（dev runtime 获取 + 加速下载章节）+ `AGENTS.md` 关键陷阱表（runtime 依赖包复用 + 断网验证门禁 + 下载源多源回退） |

**Cross-references**
- `docs/git-workflow.md`（5.6 节 dev 环境 runtime 获取，待更新）
- ADR-0056 部署运行时与打包工具工程化（store-based 红线）
- ADR-0046 离线增量升级包
- ADR-0027 共享 Prisma Client
