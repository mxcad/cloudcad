# 打包入口与交付形态统一规划

> 状态：**决策已定稿（2026-10-16，三轮 grilling），待实施** · v1/v2/v3 分期
> 票据（Gitea `qjx/cloudcad`）：总票 [#429](http://10.66.66.1:5656/qjx/cloudcad/issues/429)（wayfinder:map）· v1 [#430](http://10.66.66.1:5656/qjx/cloudcad/issues/430) · v2 [#431](http://10.66.66.1:5656/qjx/cloudcad/issues/431) · v3 [#432](http://10.66.66.1:5656/qjx/cloudcad/issues/432) · spec [#433](http://10.66.66.1:5656/qjx/cloudcad/issues/433)
>
> 实施子票（2026-10-19 发布，均带 `ready-for-agent` 标签；阻塞边见各票「Blocked by」）：
>
> | 票 | 内容 | 父票 | Blocked by |
> |---|---|---|---|
> | [#434](http://10.66.66.1:5656/qjx/cloudcad/issues/434) | v1：docker 形态 status 命令 | #430 | — |
> | [#435](http://10.66.66.1:5656/qjx/cloudcad/issues/435) | v1：裸机包元数据补齐（C7） | #430 | — |
> | [#436](http://10.66.66.1:5656/qjx/cloudcad/issues/436) | v1：docker-runtime 品牌修正（C10） | #430 | — |
> | [#437](http://10.66.66.1:5656/qjx/cloudcad/issues/437) | v1：打包菜单改造（C1/C11） | #430 | — |
> | [#438](http://10.66.66.1:5656/qjx/cloudcad/issues/438) | v1：运维长尾可见性（C5） | #430 | #434 |
> | [#439](http://10.66.66.1:5656/qjx/cloudcad/issues/439) | v1：CI build-linux-docker job（C9） | #430 | #435、#436 |
> | [#440](http://10.66.66.1:5656/qjx/cloudcad/issues/440) | v2：docker windows 宿主包（入口+检测+C6） | #431 | #434、#438 |
> | [#441](http://10.66.66.1:5656/qjx/cloudcad/issues/441) | v2：docker private variant | #431 | #437 |
> | [#442](http://10.66.66.1:5656/qjx/cloudcad/issues/442) | v2：运维长尾形态感知（docker exec） | #431 | #438 |
> | [#443](http://10.66.66.1:5656/qjx/cloudcad/issues/443) | v2：删除 pack-docker.js 与 pack:docker | #431 | #437 |
> | [#444](http://10.66.66.1:5656/qjx/cloudcad/issues/444) | v2：docker windows 宿主包（verify+CI） | #431 | #440、#439 |
> | [#445](http://10.66.66.1:5656/qjx/cloudcad/issues/445) | v3：docker 升级包打包 + 基线清单（C12） | #432 | #435 |
> | [#446](http://10.66.66.1:5656/qjx/cloudcad/issues/446) | v3：docker 升级流程 + 启动基线校验 | #432 | #445 |
> | [#447](http://10.66.66.1:5656/qjx/cloudcad/issues/447) | v3：CI 同 job 双产出 + 跨宿主覆盖 | #432 | #446、#444 |
> 已拍板：统一打包入口 = `pnpm pack:menu`（package.json 命令保留为薄别名）；runtime CLI 成为**所有交付形态的唯一入口**（深度统一）；命名取最小改动（裸机不动、docker 向裸机风格对齐）；docker 包进 CI；Windows 宿主不捆绑 Docker Desktop（检测+指引）；v1 = 裸机 win / 裸机 linux / docker linux 三类，v2 = docker windows 宿主包 + private，v3 = docker 升级包（跨宿主通用、按架构分）。
> 不涉及三层一致性（前端/SDK/后端/DB 零改动），纯打包 + 部署运行时工程。

---

## 一、目的地（Destination）

把当前「裸机包一条打包线、Docker 包另一条独立打包线」收敛为**一个打包入口 + 一张交付形态矩阵**：

1. **一个打包入口**：`pnpm pack:menu` 交互菜单覆盖全部交付形态（类型 × variant × 形态 × 平台）；`package.json` 的 `pack:*` 命令保留为薄别名（CI 与肌肉记忆用），全部指向同一组底层脚本与共享 `pack-lib`。
2. **一个运行时入口**：目标机上 `start.*` / `stop.*` / `cloudcad.*` 对所有形态同构——runtime CLI（`cli.js`）是唯一入口，按部署形态分派；Docker 形态的 12 步编排成为 CLI 的形态分支（实现仍留在 `runtime/docker-runtime/` 模块，CLI 是薄 adapter，保持 ADR-0056 分层）。
3. **一套命名 / 元数据 / 验证 / CI**：四类包同一命名风格、同一包元数据（SHA256SUMS + VERSION + 部署说明）、同一断网验证门禁、同一 CI 流水线。

### 交付形态矩阵（目标态）

| 交付形态 | 宿主平台 | v1 | v2 | v3 |
|---|---|---|---|---|
| 裸机部署包 | windows | ✅（现状保留） | | 裸机升级包（已存在） |
| 裸机部署包 | linux（centos7/ubuntu22/rocky9） | ✅（现状保留） | | 裸机升级包（已存在） |
| Docker 部署包 | linux | ✅（统一入口/命名/交互） | | Docker 升级包 |
| Docker 部署包 | windows | | ✅ | Docker 升级包（与 linux 共用，按架构） |

---

## 二、现状全景与痛点

### 2.1 现状矩阵（2026-10-16 代码勘察）

| 维度 | 裸机包（win/linux） | Docker 包（仅 linux） |
|---|---|---|
| 打包入口 | `pack-offline.js`（本机直打）/ `pack-linux-deploy.js`（容器构建通道） | `pack-linux-docker.js`（完全独立） |
| 打包菜单 | `pack-menu.js` 已存在，但只有裸机选项——菜单里的「docker 通道」指*用 Docker 容器打 Linux 包*的**构建通道**，不是 docker 交付形态（混淆根源） | 不在菜单里 |
| 命名 | `cloudcad-{deploy\|upgrade}[-private]-{V}-{DATE}-{platform}.7z/tar.gz` | `cloudcad-docker-linux-{arch}-{V}.tar.gz`（无日期、风格不同） |
| start/stop | `start.bat/sh` → runtime CLI（`cli.js deploy`）+ `cloudcad.bat/sh` 运维入口 | `start.sh` → `docker-runtime/index.js` 12 步独立编排，**无 cloudcad 运维入口**（包内已含完整 `runtime/scripts` 但未接线） |
| 升级 | 专用升级包（`cloudcad-upgrade-*`，路线 B 不含 store） | **无升级包**，全量包覆盖 + 重跑 start.sh |
| 断网验证 | `verify-linux/windows-deploy.js` | `verify-linux-docker-deploy.js`（独立脚本） |
| CI | release.yml 两类都有 job | **不在 CI**，打包机本地手打 |
| 包元数据 | 无 SHA256SUMS / VERSION / 部署说明.txt | 三者齐全（裸机包反而缺） |

### 2.2 痛点清单

| # | 痛点 | 证据 |
|---|---|---|
| P1 | docker 包分离打包：独立脚本、不在菜单、不在 CI，与裸机线各自漂移 | `package.json` `pack:linux-docker` 与 `pack:offline:*` 并列；release.yml 无 docker job |
| P2 | 菜单「docker 通道」= 构建通道，与 docker 交付形态一词两义，用户必然混淆 | `pack-menu.js:100-126`（channel=docker → `pack-linux-deploy.js`） |
| P3 | 命名风格分裂：docker 包无日期、arch 位置不同、`docker` 段位置不同 | `pack-linux-docker.js:1300` vs `pack-offline.js:2042` |
| P4 | 交互分裂：docker 形态无运维 CLI 入口、无运维中心可见性、start/stop 独立编排 | `pack-linux-docker.js:1182-1185`（start.sh 直连 index.js） |
| P5 | docker 形态无升级包，升级 = 重新下载全量包（~800MB） | `pack-linux-docker.js` 无 upgrade 分支 |
| P6 | 验证脚本四分裂（verify-linux/windows/linux-docker + runtime 共享核） | `scripts/verify-*.js` |
| P7 | 包元数据分裂：裸机包缺 SHA256SUMS/VERSION/部署说明 | `pack-offline.js` 无对应逻辑 |
| P8 | 品牌违规：docker-runtime 硬编码 `[CloudCAD]`/`[MxCloudCAD]` 前缀，未走 `branding.js` 单一事实源 | `docker-runtime/index.js:61-67`、`start.sh:14` |
| P9 | 「挑最新包」正则 `^cloudcad-deploy(-private)?-` 在命名统一后会误挑 docker 包 | `pack-linux-deploy.js:324-326` |
| P10 | CONTEXT.md「增量升级包」词条停留在路线 A（含 store），与现行代码（路线 B）矛盾 | 已修正（2026-10-16） |

---

## 三、决策记录（2026-10-16 三轮 grilling 定案）

| # | 决策 | 结论 |
|---|---|---|
| Q1 | Windows 宿主的 docker 运行时 | **检测 + 指引，不捆绑安装器**：start.bat 检测 docker CLI（Docker Desktop 或任意），缺失给清晰指引 + 官方下载链接，已装则继续。规避 Docker Desktop 企业授权风险与 ~500MB 包体膨胀 |
| Q2 | 分期 | **v1** = 三类统一（裸机 win / 裸机 linux / docker linux）；**v2** = docker windows 宿主包；**v3** = docker 升级包 |
| Q3 | docker 包进 CI | **进**：release.yml 增加 docker job，同一断网验证门禁，通过才上传（GH ubuntu/windows runner 均自带 docker） |
| Q4 | 交互统一深度 | **深度统一**：runtime CLI 成为所有形态唯一入口，docker 12 步编排成为 CLI 形态分支，docker 包获得 cloudcad 运维入口，运维中心形态感知 |
| Q5 | 命名统一深度 | **最小改动**：裸机命名不动，docker 包向裸机风格对齐（补日期、统一段序） |
| Q6 | 遗留 `pack-docker.js`（源码包，现场 compose build） | **v1 标注 deprecated + 登记 issue，v2 删除**（ADR-0074 一键包已取代其交付角色） |
| Q7 | v3 docker 升级包 | 内容 = 新 app 镜像 tar + `runtime/scripts` + `runtime/docker-runtime` + `.env.example` + VERSION/SHA256SUMS/部署说明 + **基线清单**（pg/redis 镜像 tag、宿主 node/mxcad 版本）；流程 = 覆盖 + 重跑 start（load 新镜像 → 重建 app 容器 → 幂等迁移）；**跨宿主平台通用、按架构分**（每版本 2 个包服务 4 种全量形态）；基线不匹配 → 中止并指引全量包 |
| Q8 | v1 运维命令形态感知范围 | **主路径**：start/stop/status/日志 + 升级检测（启动自动 migrate 已在 12 步内）；长尾命令（db-backup/密码重置/infra/setup-wizard/dev）在 docker 形态菜单与运维中心**隐藏**（`menu-sections.js` 可见性标记），v2 补齐 |
| Q9 | docker 包 private variant | **v1 仅 oss**，菜单 docker+private 组合置灰，v2 接入（impl-mx → backend dist → 镜像构建链路） |

---

## 四、统一契约（实施不可偏离）

| # | 契约 | 说明 |
|---|---|---|
| C1 | 单一打包入口 | `pack-menu.js` = 人类入口（交互菜单）；底层按形态保留 `pack-offline.js` / `pack-linux-deploy.js` / `pack-linux-docker.js` 三个脚本（各自内聚），共享 `pack-lib/`；`package.json` 命令 = 薄别名。菜单术语澄清：**交付形态**（裸机/Docker）与**构建通道**（本机直打/Docker 容器构建）是两个正交维度，菜单分步呈现，「docker 通道」旧称废弃 |
| C2 | 命名 | 裸机不变：`cloudcad-{type}[-private]-{V}-{DATE}-{platform}.{ext}`（windows=.7z，linux={os}-{arch}.tar.gz）。Docker 全量：`cloudcad-deploy[-private]-{V}-{DATE}-docker-{hostPlatform}-{arch}.{ext}`（例 `cloudcad-deploy-1.0.0-20261016-docker-linux-x86_64.tar.gz`；v2 windows 宿主 = .7z）。Docker 升级（v3）：`cloudcad-upgrade[-private]-{V}-{DATE}-docker-{arch}.tar.gz`（**无平台段** = 跨宿主通用） |
| C3 | 形态标记 | `.deploy` 文件内容 `form=bare\|docker`（bare 可空，兼容旧包）；检测唯一出口 `detectDeployForm()`（`runtime/scripts/lib/`），兼容存量 `.deploy-docker` 标记；新包只写 `.deploy` |
| C4 | CLI 单一入口 | `start.*`/`stop.*`/`cloudcad.*` 全形态同构瘦壳 → `cli.js`；`cli.js` 按 `detectDeployForm()` 分派：bare → 现有编排；docker → `runtime/docker-runtime/` 模块（12 步编排保留为形态模块，CLI 薄 adapter）。两 facade（start/cloudcad）必须成对同步（ADR-0056 C4） |
| C5 | 运维长尾可见性 | v1 docker 形态：`menu-sections.js` 对 db-backup/密码重置/infra/setup-wizard/dev 置不可见；运维中心（config-service）继承同一可见性数据 |
| C6 | .env 分平台生成 | .env 恒在目标机首次 start 时生成；宿主服务地址按宿主平台写值：linux（`--network=host`，ADR-0074 保持不动）→ `localhost:3100/3091`；windows（bridge + `host.docker.internal`）→ `host.docker.internal:3100/3091`。镜像本身跨平台相同，差异只落在目标机生成的 .env |
| C7 | 包元数据 | 四类包统一含 SHA256SUMS + VERSION + 部署说明.txt（裸机包补齐，对齐 docker 包现状） |
| C8 | 验证 | 按形态保留 verify 脚本（docker 有 DinD/`--network none` 特有逻辑，不强行合并）；统一打包入口按形态分派调用；「挑最新包」正则改为按形态过滤（bare 排除 `-docker-`，docker 只匹配 `-docker-`） |
| C9 | CI | v1：release.yml 增 `build-linux-docker` job（ubuntu-latest x86_64，`pack-linux-docker.js --verify`，通过才上传）；aarch64 保持本地打包机（mxcad-stable 无 ARM 资产，阻塞与裸机一致）。v2：增 `build-windows-docker` job（windows-latest，自带 Docker Desktop） |
| C10 | 品牌 | docker-runtime 全部用户可见前缀走 `branding.js` `PRODUCT_NAME`，`pnpm brand:check` 门禁覆盖 |
| C11 | 源码包退役 | `pack-docker.js` v1 标注 deprecated（JSDoc + 登记 issue），从菜单移除，v2 删除脚本与 `pack:docker` 命令 |
| C12 | v3 升级包护栏 | 包内基线清单（pg/redis 镜像 tag、宿主 node/mxcad 版本、docker 最低版本）；start 时校验既有部署基线，不匹配 → 中止并提示「请使用全量部署包」 |

---

## 五、分期路线图

### v1（本轮）：三类包统一入口 + 命名 + 交互 + CI

| Step | 内容 | 验证 |
|---|---|---|
| 1 | ADR-0075（统一打包入口与交付形态矩阵）+ CONTEXT.md 词条（升级包已修正；新增宿主平台/Docker 升级包） | 文档评审 |
| 2 | 命名统一：`pack-linux-docker.js` 产物名改 C2 模式；`pack-linux-deploy.js:324-326` 与 docker verify 的挑包正则按形态过滤；部署说明同步 | V3 |
| 3 | 形态标记与入口统一：`detectDeployForm()` 唯一出口；docker 包 start.sh/stop.sh 改与裸机同构瘦壳（→ `cli.js deploy/stop`）；`cli.js` 按形态分派（docker → docker-runtime 编排）；docker 包增 `cloudcad.sh` 入口；兼容存量 `.deploy-docker` | V3/V5/V6 |
| 4 | 运维主路径形态感知：`cli.js status/stop` 形态感知（容器 + 宿主进程）；`menu-sections.js` 长尾可见性（C5）；运维中心形态感知 | V6 |
| 5 | 包元数据统一：裸机包补 SHA256SUMS + VERSION + 部署说明.txt（C7） | V1/V2 |
| 6 | 品牌修正：docker-runtime 硬编码前缀 → `PRODUCT_NAME`（C10） | `pnpm brand:check` + V3 |
| 7 | CI：release.yml 增 `build-linux-docker` job（C9） | V7 |
| 8 | 菜单改造：`pack-menu.js` 增交付形态维度；「docker 通道」更名「构建通道」；置灰组合（docker+private、docker+windows、upgrade+docker）；`pack-docker.js` 标注 deprecated（C11） | V4 |

### v2：Docker Windows 宿主包 + private + 运维长尾

- **docker windows 宿主包**：`start.bat/stop.bat`（包内 windows node → `cli.js`，与裸机 win 同构）；Docker Desktop 检测 + 安装指引（Q1，不捆绑）；app 容器 bridge 网络 + `host.docker.internal` 访问宿主 conversion-service/cooperate（C6）；宿主侧物料 = `runtime/windows/{node,mxcad}` + 协同服务 windows 二进制（复用 mxcad-stable windows-x64 资产与 `pack-offline.js` 的物料解析逻辑）；`verify-windows-docker`（Docker Desktop 下 `docker run --network none` 同样成立）；CI `build-windows-docker` job
- **docker private variant**：impl-mx → backend dist → app 镜像构建链路接线（打包机需 `packages/impl-mx`），菜单解除置灰
- **运维长尾形态感知**：db-backup（`docker exec pg psql pg_dump`）、密码重置（`docker exec`）、infra（容器健康）
- **删除 `pack-docker.js`** 与 `pack:docker` 命令（v1 已 deprecated；#443 已完成）

### v3：Docker 升级包

- `pack-linux-docker.js --upgrade`（或新脚本）：产物 = app 镜像 tar + `runtime/scripts` + `runtime/docker-runtime` + `.env.example` + VERSION/SHA256SUMS/部署说明 + 基线清单（C12）；命名 `cloudcad-upgrade-{V}-{DATE}-docker-{arch}.tar.gz`
- 升级流程：解压覆盖部署根 → 重跑 start → VERSION 变化检测 → `docker load` 新 app 镜像 → 重建 app 容器 → 幂等 migrate → 健康检查（与裸机升级包「覆盖即升级」语义一致）
- CI：与全量 docker 包同一 job 一次产出（共享 app 镜像构建，save 出的 tar 两用）
- 每版本 2 个升级包（x86_64 + aarch64）同时服务 linux/windows 两种宿主

---

## 六、回归矩阵（v1 验收）

| # | 场景 | 命令 | 通过判据 |
|---|---|---|---|
| V1 | 裸机 win 全量包 | `pnpm pack:offline:win` → `pnpm verify:windows`（对应脚本） | 断网验证全绿；包内含新增 SHA256SUMS/VERSION/部署说明；行为与现状零差异 |
| V2 | 裸机 linux 全量包 | `node scripts/pack-linux-deploy.js --os ubuntu22` → `verify-linux-deploy.js --os ubuntu22` | 断网验证全绿；挑包正则不误挑 docker 包 |
| V3 | docker linux 全量包 | `node scripts/pack-linux-docker.js --verify` | 新命名产物；断网 DinD 验证全绿；start/stop 经 cli.js 分派行为等价（12 步不变）；品牌前缀为 PRODUCT_NAME |
| V4 | 菜单路由 | `pnpm pack:menu` 逐组合 | win 打包机：裸机 win / 裸机 linux（容器通道+发行版）/ docker linux 均路由正确；置灰组合（docker+private、docker+windows、upgrade+docker）不可选 |
| V5 | 存量兼容 | 旧 docker 部署（`.deploy-docker` + 旧 start.sh）→ 覆盖新包 → 重跑 start | 新 start.sh 识别旧标记进入 docker 形态；`.env`/`data/` 保留；服务正常 |
| V6 | 运维入口 | docker 部署上 `./cloudcad.sh status/stop`；运维中心菜单 | status 显示容器 + 宿主进程；stop 全停；长尾命令在菜单/运维中心不可见 |
| V7 | CI | release.yml 三 job（build-linux / build-windows / build-linux-docker） | 全绿、断网门禁通过才上传；docker 包命名符合 C2 |
| V8 | 品牌 | `pnpm brand:check` | docker-runtime 无硬编码产品名 |

---

## 七、风险与开放项

| # | 项 | 说明 / 处置 |
|---|---|---|
| R1 | GH ubuntu runner 上 docker 构建慢（镜像 build + save，实测 30-60 分钟级） | job 超时预算放宽；镜像层缓存（actions/cache 缓存 docker data-root 或 pre-pull 基础镜像） |
| R2 | mxcad-stable 无 ARM 资产 | aarch64（裸机与 docker 一致）阻塞，保持本地打包机出包；资产补齐后 CI 再扩 arch 矩阵 |
| R3 | Docker Desktop 授权（大型企业付费） | v2 已定检测+指引路线（Q1），不捆绑安装器 |
| R4 | app 镜像烤入 node_modules | v3 升级包天然免 store（比裸机升级包更通用）；代价是依赖变更也走新镜像（无额外成本） |
| R5 | 存量 docker 部署升级 | V5 覆盖；`detectDeployForm()` 必须双标记兼容，回归必测 |
| R6 | 运维中心在 docker 形态为宿主进程（ADR-0074 半容器化） | 其调用的 CLI 命令形态感知后自动继承；v1 长尾命令隐藏期间运维中心同步隐藏 |
