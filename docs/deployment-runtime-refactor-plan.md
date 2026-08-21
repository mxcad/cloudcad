# CloudCAD 离线部署运行时工程化重构规划

> 状态：**Step A（拆分+前台真修复+stop 定向化）已完成并验收；Step B（迁移 packages/）已否决砍掉** · 2026-08-20 · rev4
> 已拍板：**前台能力必须保留（D1=A 真前台修复，基础服务统一 PM2 托管）**；~~目标迁入 `packages/`~~ **取消（Step A 拆分后原地工程化已足够，见 D7 更新）**；**打包清单工程化（P9）已在 `scripts/pack-lib/manifest.js` 落地**；**离线开发包已砍（仅部署包 + 升级包）；升级包改为路线 B（不带 store，复用目标机既有部署包 store 离线补装）**；**测试策略：纯逻辑测试先行 + 拆分特征快照守卫 + 集成清单守护**。
> 入口语义：**`start.sh/bat` = 一键部署入口**（面向用户）；**`cloudcad.sh/bat` = 运维 CLI 入口**（面向运维，透传子命令）。
> 红线：**PM2 后台运行模式已跑通且与离线打包深度配合，重构全程零回归。**

---

## 一、目的地（Destination）

把散落在 `runtime/scripts/`（39 个文件）与 `scripts/`（26 个文件）里的部署/启动/打包体系，重组为两个职责清晰的 workspace 包：

1. **`packages/runtime-cli`** —— 目标机上运行的运维 CLI（启动/停止/迁移/备份/前台模式），CJS 零构建、可测试、可类型检查（checkJs）；
2. **`packages/packager`** —— 开发机上运行的打包工具（全量包/升级包/Linux Docker 打包/验收），manifest 单一事实源；

同时：修复前台模式为**真前台**（进程组管理 + 整树退出）；保持 PM2 生产链路行为等价；保持与打包的既有耦合契约（升级到新布局后仍满足跨版本升级）。

---

## 二、现状全景

### 2.1 启动链路

```
用户双击/执行
  start.bat / start.sh（瘦壳，~25 行，检测 .deploy 标记）
    └→ runtime node → runtime/scripts/cli.js [deploy --skip-build | start | ...]
         ├→ setup-offline.js     setupOffline()：离线包装脚本注入 + 依赖重装检测
         │                        （.deploy-lock-hash vs pnpm-lock.yaml → install --offline --prod）
         ├→ config-updater.js    .env 生成/增量合并
         ├→ drawing-version-helper.js  图纸版本部署前后检查/验证
         └→ cli.js 内部（待拆分的全部逻辑）
  stop.bat / stop.sh / cloudcad.bat / cloudcad.sh（同构瘦壳）
```

### 2.2 PM2 模式（生产基线，已验证跑通）

| 层 | 实体 | 管理方式 |
|---|---|---|
| 基础设施 | postgresql / redis / cooperate / config-service | `runtime/ecosystem.config.js` → `pm2 start --only ...`，各 manager 脚本以 **daemon 模式**常驻（interpreter = 内嵌 runtime node） |
| 应用 | backend（dist/main.js）/ frontend（serve-static.js） | CLI 动态生成 `data/pm2-deploy.config.js` → `pm2 start/restart` |
| PM2 守护 | pm2 daemon | 经根目录 `pm2.cmd`（Win）/ `node/bin/pm2`（Linux）包装脚本拉起，`PM2_HOME=data/pm2` |

**部署包在目标机的完整流程**（`deploy --skip-build`）：bootstrap → setupOffline（依赖重装检测）→ 询问运行模式 → 基础服务 → 等端口 → 图纸版本检查 → 数据库迁移（含备份/自修复）→ PM2 拉起应用 → 图纸版本验证 → 写变更记录。PM2 后台模式（生产）下，拉起应用后**自动配置开机自启**（不询问用户，失败完全静默，见 §九 已实现记录）。

### 2.3 前台模式（失修路径，已确认必须修复）

`startInfrastructure(false)` / `startAppServices('foreground')`：spawn `pg-manager.js start`、`redis-manager.js start`、`cooperate-manager.js`、`config-service/server.js`、backend、`serve-static.js` 作为子进程，注册信号处理器，等待全部退出。**缺陷清单见 §三 P2。**

### 2.4 打包 ↔ 部署耦合矩阵（重构不可破坏的契约）

| # | 契约 | 位置（证据） |
|---|---|---|
| C1 | 全量包与升级包均**整目录复制** `runtime/scripts/`（新模块文件自动进包） | `scripts/pack-offline.js:776`、`:1391` |
| C2 | 两类包均复制 `runtime/ecosystem.config.js` | `pack-offline.js:777`、`:1392` |
| C3 | 打包时写入 `.deploy` 标记 → `start.sh:20-24` / `start.bat:20-25` 据此进入 `deploy --skip-build` | `pack-offline.js:1163`、`:1604` |
| C4 | 入口脚本硬编码 `runtime/scripts/cli.js` 路径与参数。**两个 facade 成对**：`start.sh/bat`=一键部署（检测 `.deploy`→deploy；否则 start）；`cloudcad.sh/bat`=运维 CLI（透传全部子命令） | `start.sh:20-24`、`start.bat:20-25`、`cloudcad.sh:15`；两个 facade 迁移时**必须同步改** |
| C5 | `setup-offline.js` 对外接口：`setup()` + `checkPrismaClientExists()` | `cli.js:22-25` |
| C6 | `ecosystem.config.js` 引用 manager 脚本路径 + `interpreter = runtime node`；require 时执行 initdb/chmod 副作用 | `ecosystem.config.js:213/234/254/299`、`:128-210` |
| C7 | CLI 依赖根目录 `pm2.cmd`（Win）/ `node/bin/pm2`（Linux）包装脚本拉起 PM2 daemon | `cli.js:166-170`、`:465-500` |
| C8 | `data/pm2-deploy.config.js` 的生成格式（backend/frontend 两个 app 的 env/cwd/script 字段）是 PM2 重启的隐式契约 | `cli.js:2246-2257` |
| C9 | `pnpm-lock.yaml` + `.deploy-lock-hash` 触发目标机依赖重装 | `pack-offline.js:1313-1314` |
| C10 | 升级包携带完整 `runtime/scripts` + 启动脚本：**旧目标机 + 新升级包 = 覆盖式更新运行时脚本与入口**，新脚本必须兼容旧数据布局（`data/pm2`、`.env` 结构） | ADR-0046、`pack-offline.js:1397-1403` |
| C11 | 目标机 pnpm install 的 filter 白名单（backend/db/contracts/mxVersionTool/config-service[，impl-mx]）——新增 runtime-cli 包须同步两处 filter | `pack-offline.js:817-818`、`:1444-1445` |

### 2.5 文件规模清单

| 文件 | 大小 | 职责混杂度 |
|---|---|---|
| `runtime/scripts/cli.js`（3530 行） | 115KB | **极高**（≥12 类职责，见 P1） |
| `runtime/scripts/setup-offline.js` | 62KB | 高（包装脚本生成 + 依赖安装 + 检测） |
| `scripts/pack-offline.js` | 58KB | 高（全量包 + 升级包 + store 同步 + 构建 + 清单 + 压缩） |
| `runtime/scripts/drawing-version-helper.js` | 25KB | 中 |
| `runtime/scripts/verify-deploy.js` | 24KB | 中（样板与 cli.js 三处重复，见 P3） |
| `runtime/scripts/config-updater.js` | 24KB | 中 |
| `runtime/scripts/pg-manager.js` | 19KB | 中 |
| 打包族（pack-offline / pack-linux-deploy / pack-docker / pack-menu / verify-\* ×3 / extract-linux-runtime） | ~9 个文件 | 分散两目录，同一清单两处硬编码 |

---

## 三、痛点与难点梳理（按严重度排序）

### P1 【结构性】cli.js 单文件 3530 行，至少 12 类职责混杂

平台/路径配置（`cli.js:45-175`）、env 解析（`:84-140`、`:2844-2868`）、终端 UI（`:179-373`）、命令执行封装（`:377-523`）、端口/健康检查（`:228-359`）、基础设施生命周期（`:527-696`）、数据库备份恢复（`:698-1215`）、数据库迁移+自修复（`:1217-1818`）、部署编排（`:1911-2068`）、前台进程监管（`:2070-2353`）、密码向导（`:2782-3189`）、菜单/CLI 分发/帮助（`:3191-3529`）。

**难点**：函数间共享大量模块级可变状态（`PORTS`、`isFirstDeploy`、`childProcesses`），`deployMode`/`startMode`/`startAppServicesWithInfra` 相互调用形成隐式网。

### P2 【功能性】前台模式的 8 个具体缺陷（已确认必须修复）

| # | 缺陷 | 根因与证据 |
|---|---|---|
| P2.1 | **基础设施"假前台"**：Ctrl+C 后 PG/Redis 不会停 | `cli.js:575-591` spawn 的是 `pg-manager.js start`（one-shot：`pg-manager.js:690` 用 pg_ctl 拉起守护进程后即退出），`childProcesses` 跟踪的是即将退出的包装进程 |
| P2.2 | **Windows 双层进程孤儿**：杀不掉 node 子进程 | `cli.js:575/584/594/605/2272/2285` 处 `spawn(..., {shell: IS_WINDOWS})` 产生 cmd.exe→node.exe 链；`cleanupForeground` 的 `proc.kill('SIGTERM')`（`:2651-2660`）只杀 cmd.exe |
| P2.3 | **自杀式全杀**：`stopInfrastructure` 杀掉机器上所有 node.exe/postgres/redis（Linux `pkill -f node` 连 CLI 自身） | `cli.js:652-693`。PM2 部署路径不经过此函数，所以"PM2 跑通"与此 bug 并存 |
| P2.4 | **部署收尾永久延迟**：图纸版本验证与 changelog 被 `await 所有子进程退出`（`:2335-2352`）阻塞到用户 Ctrl+C 之后才执行 | 验证的是已停摆的系统 |
| P2.5 | **双实现漂移**：前台基础设施启动逻辑存在两份（`startInfrastructure(false)` vs `startAppServicesWithInfra` 前台分支） | `cli.js:555-622` vs `:2519-2583` |
| P2.6 | **陈旧假设**：注释断言 Redis 无 stop 命令，实际 `redis-manager.js:287` 支持 | `cli.js:641` |
| P2.7 | **错误信息截断**：后端启动失败只显示 stderr 最后 15 行（stdout 丢失） | `cli.js:2279-2281`、`:2105-2106` |
| P2.8 | **Linux 新窗口静默失败**（`xterm -e`，服务器无 X 环境） | `cli.js:514-522` |

### P3 【一致性】运行时样板代码三处复制

`cli.js:45-175` / `verify-deploy.js:19-238` / `setup-offline.js:18-41` 各自维护 `PLATFORM/PROJECT_ROOT/NODE_EXE/PM2_JS/PNPM_JS/parseEnvFile/getPorts/runPnpm/runPm2` 近似副本——验收器与被验收对象使用不同实现。

### P4 【卫生】runtime/scripts 混入开发垃圾并全部随包发货

整目录复制（C1）导致 test-\*、upload-\*、thumbnail-\*、进度 json、日志等 20+ 开发文件进入客户部署包；且 `scripts/` 与 `runtime/scripts/` 存在同名双份维护（已漂移：pack-offline.js 56.85KB vs 包内 31.85KB）。

### P5 【架构】ecosystem.config.js 含 require 副作用

`ecosystem.config.js:128-210` 被 PM2 加载时执行 initdb、chmod、chown、`su postgres`；root 环境失败仅打印警告。

### P6 【自动化】交互式 readline 阻塞无人值守场景

deployMode 每次询问 PM2/前台（`:1917-1940`）与是否重建（`:2007-2027`）；迁移备份失败 `promptConfirm`（`:1633`）等人工确认。升级包部署（ADR-0046）要求"解压 → start → 自动完成"。~~开机自启询问~~（**已消除，2026-08-20**：生产环境默认自动配置、前台不配置、失败静默，见 §九 已实现记录）。

### P7 【体验】步骤编号与文案混乱

deployMode 流程编号交错 `[1/3]→[2/6]→[4/6]→[5/6]→[5/5]→[6/6]`；两套"服务已就绪"横幅。

### P8 【运维】stop 语义不对称

`stop` 默认走"全杀兜底"（P2.3）；PM2 模式下定向停止（pm2 管的 + 各 manager stop）已足够，全杀应降级为显式危险命令。

### P9 【打包域】打包工具本身未工程化（新增）

- 全量包与升级包的**清单两处硬编码**（`pack-offline.js:776-795` vs `:1390-1403`），重叠条目无单一事实源，改一处漏一处；
- 打包 9 个文件散落 `scripts/` 与 `runtime/scripts/` 两目录（其中部分还随包发货，P4）；
- `pack-menu.js` 交互菜单与 package.json 的 pack:\* 命令并存，入口不统一；
- 打包逻辑（store 同步/构建/清单/压缩/manifest）全部内联在 58KB 单文件中，无测试。

---

## 四、方案总览：双包架构 + 两步迁移

### 4.0 为什么移入 `packages/`（工程论证）

| 维度 | 留在 `runtime/scripts/` | 移入 `packages/runtime-cli/` |
|---|---|---|
| 测试 | 需另搭 jest 配置，游离于 `pnpm -r test` 之外 | **workspace 标准成员**，jest/lint 随 monorepo 走 |
| 类型检查 | 无 | **JSDoc + checkJs**（tsconfig allowJs，tsc 检查 JS 注释类型，零构建产物） |
| 依赖边界 | 隐式"零依赖"约定 | package.json 显式声明，CI 可校验 |
| 认知与归属 | "脚本堆" | 与 backend/frontend 平级的**正经交付物**，长期项目可维护性最好 |
| 改动成本 | 零 | 启动脚本路径 / ecosystem 引用 / pack 清单 / pnpm filter 需联动（§4.4 迁移契约表） |

结论：**长期项目 + 直接面向客户交接的体验关键路径，值得 workspace 化**；但路径迁移触碰 C4/C6/C11 三条契约，必须与"代码拆分"分离为两个独立步骤——混在一起做，出问题无法定位是拆分逻辑错还是路径错。

> **rev4 否决（2026-08-20）**：Step A 拆分完成后，上表"移入 packages/"的多数收益已被原地实现——lib/commands/foreground 分层 + `tests/runtime-unit` jest 测试锚（84+ 测试）已达成"测试/类型检查/认知归属"三项，唯一剩的是"改动成本"中的搬迁成本（触 C4/C6/C11 三条契约）。此时搬家只剩纯机械高风险零收益，**取消 D7**。打包清单工程化改在 `scripts/pack-lib/manifest.js` 就地落地（见 §六 D8）。

### 4.1 终态目录结构（Step B 完成后）

```
packages/
├── runtime-cli/                      # @cloudcad/runtime-cli —— 目标机运维 CLI（CJS 零构建）
│   ├── package.json                  # private；scripts: test(jest)/lint/check(tsc --noEmit checkJs)
│   ├── tsconfig.json                 # allowJs + checkJs + strict（JSDoc 类型，无构建产物）
│   ├── src/
│   │   ├── cli.js                    # 入口：参数解析 + 命令分发（目标 <150 行）
│   │   ├── ecosystem.config.js       # PM2 拓扑（引用 ./managers/ 相对路径，包内自洽）
│   │   ├── lib/                      # 纯能力层（单向依赖：commands → lib）
│   │   │   ├── context.js            # ★ 单一事实源：PLATFORM/PROJECT_ROOT/RUNTIME_DIR/
│   │   │   │                         #   PLATFORM_DIR/USE_RUNTIME/NODE_EXE/PM2_JS/PM2_CMD/
│   │   │   │                         #   PNPM_JS/DATA_DIR/PM2_HOME/PORTS/getPorts()
│   │   │   ├── logger.js             # colors/log/printHeader/横幅
│   │   │   ├── proc.js               # runCommand/runCommandWithProgress/runPnpm/runPm2/
│   │   │   │                         #   killTree(pid)：Win taskkill /T /F；Linux kill(-pgid)
│   │   │   ├── health.js             # waitForPort/checkHttpHealth/openBrowser
│   │   │   ├── env.js                # parseEnvFile/updateEnvFile（委托 config-updater）
│   │   │   └── prompt.js             # prompt/promptConfirm/promptPassword*
│   │   ├── commands/                 # 编排层（每命令一文件：流程编排 + UI）
│   │   │   ├── dev.js / deploy.js / start.js / stop.js
│   │   │   ├── infra.js              # startInfrastructure 的 PM2 分支（唯一实现）
│   │   │   ├── migrate.js / db-backup.js / status.js / logs.js / init.js
│   │   │   ├── setup-wizard.js       # 首次部署向导 + 密码生成展示
│   │   │   └── help.js
│   │   ├── foreground/
│   │   │   └── supervisor.js         # ★ 真前台：见 §4.3
│   │   ├── managers/                 # pg-manager.js / redis-manager.js /
│   │   │                             #   cooperate-manager.js / serve-static.js
│   │   └── core/                     # setup-offline.js / config-updater.js /
│   │                                 #   drawing-version-helper.js / verify-deploy.js
│   └── test/                         # jest 单测（lib 纯函数 + commands mock spawn/fs）
│
└── packager/                         # @cloudcad/packager —— 开发机打包工具（不进部署包）
    ├── package.json
    ├── src/
    │   ├── pack-deploy.js            # 全量包主流程（现 pack-offline.js 拆出）
    │   ├── pack-upgrade.js           # 升级包主流程
    │   ├── pack-linux.js             # Docker 内 Linux 打包入口（现 pack-linux-deploy.js）
    │   ├── pack-menu.js              # 统一交互菜单
    │   └── lib/
    │       ├── manifest.js           # ★ 包清单单一事实源：条目标签化（deploy/upgrade 共享，
    │       │                         #   升级包 = deploy 条目的正子集 + 差异标签）
    │       ├── layout.js             # 源码路径 → 包内路径映射（迁移期兼容双布局）
    │       ├── store.js              # pnpm store 生命周期（ensureOffline/syncDeploy/prepareDeploy）
    │       ├── build.js              # 构建编排（buildProject/buildImplMx）
    │       └── compress.js           # 7z / tar.gz 封装 + CRC/哈希
    └── test/                         # manifest 生成 / 路径映射单测
```

仓库根变化：
- `start.sh / start.bat / stop.* / cloudcad.*`：指向改为 `packages/runtime-cli/src/cli.js`（随升级包自动覆盖传播，C10）；
- `runtime/`：只保留 `windows/`、`linux/`、`docker/`、`cache/`（二进制与平台物料，gitignore），`scripts/` 目录消失；
- `scripts/`：仅剩真正的一次性开发杂项，逐步清理归属；
- `package.json` 的 `pack:*` scripts 统一委托 `packager` 包入口。

### 4.2 状态归属（拆分最难的部分，先立规矩）

| 现状模块级状态 | 归属方案 |
|---|---|
| `PORTS`（启动时读 .env） | `lib/context.js` 模块级只读导出 |
| `isFirstDeploy` | 显式参数传递，消灭隐式全局 |
| `childProcesses`（前台进程表） | 仅 `foreground/supervisor.js` 内部持有 |
| `USE_RUNTIME` 等路径常量 | `lib/context.js` 唯一导出 |

**依赖方向铁律**：`cli.js → commands/* → lib/*`；lib 不得 require commands；commands 之间不互相 require。

### 4.3 前台模式真修复设计（D1=A 已拍板）

> **⚠️ 已更新（Q0 决策，2026-08-20）**：原设计"真前台化基础服务（第 1 点 `postgres -D`/`redis-server` 前台直跑 + 第 3 点优雅关停含 PG/Redis）"已由 **Q0 决策取代**——基础服务（PG/Redis/协同/配置中心）**统一由 PM2 托管**，前台模式仅**应用层**走 supervisor spawn，Ctrl+C 只停应用层，基础服务保持常驻（停全部用 `cloudcad.sh stop`）。
> 本节的 supervisor 设计**仅对应用层生效**（backend/frontend 的可杀进程树 + 优雅关停）；第 1、3 点中涉及基础服务前台化的内容已过时。对应验收同步更新见 `deployment-golden-path-checklist.md` V4。

`foreground/supervisor.js` 统一承载，四个核心设计：

1. **真前台化基础服务**：不再经 `pg-manager.js start`（one-shot + daemon），改为 supervisor 直接 spawn：
   - PostgreSQL：`postgres -D <data>` 前台直跑（弃 pg_ctl daemon 模式）；
   - Redis：`redis-server <conf>`（确认非 daemonize 配置）；
   - cooperate（mxcadassembly）、config-service、backend、serve-static：直接 spawn。
   修复 P2.1（假前台）。
2. **可杀进程树**：
   - Windows：spawn 不用 `shell:true`（改绝对路径直 spawn，消灭 cmd.exe 包装层）；兜底 `taskkill /PID <pid> /T /F` 整树；修复 P2.2。
   - Linux：`detached: true` 建进程组，`process.kill(-pgid, 'SIGTERM')` 整组。
3. **优雅关停顺序**（Ctrl+C 信号转发）：backend/frontend → cooperate → Redis（save+shutdown）→ PostgreSQL（smart shutdown）→ 超时强制 kill。
4. **部署收尾时序修正**：图纸版本验证/changelog 移到"服务就绪后、阻塞等待前"执行，修复 P2.4；后端启动失败显示 stdout+stderr 尾部（修 P2.7）。

> manager 脚本（pg-manager 等）**保持 daemon 语义不变**——PM2 路径依赖它（C6）；真前台由 supervisor 绕过 manager 直接管理进程。两套生命周期互不干扰。

### 4.4 迁移契约变化表（~~Step B 触碰的契约~~ rev4 已取消搬家）

> **rev4（2026-08-20）**：D7 取消迁 packages/，下表 C4/C6/C11 不再触碰（入口路径 / ecosystem 引用 / pnpm filter 全部保持不变）。rev4 实际落地的是**升级包形态**与**清单收敛**：

| 变更 | 内容 |
|---|---|
| C1 整目录复制 | 保持不变：`runtime/scripts` 整目录复制（`pack-lib/manifest.js` 单点维护清单，但复制目标不变） |
| 升级包 store | `packUpgrade` 去掉 `.pnpm-store-deploy` 打包，只推业务产物全集；目标机复用既有部署包 store 离线补装（D11） |
| 离线包 | `packOffline` 及专属函数/常量已删，`main()` 无参数运行报错，`pack:source*` scripts 与 `pack-menu.js` 离线项已删（D10） |
| manifest 单一事实源 | `scripts/pack-lib/manifest.js`：`getSharedEntries`（共享 25 条）+ `getDeployIncludeList`/`getUpgradeIncludeList` 组装，`pack-offline.js` 两处硬编码清单收敛为委托（P9/D8） |

### 4.5 设计红线（全程有效）

1. PM2 路径行为等价：命令集、参数、输出文案、交互顺序、退出码；
2. 不改 `setup-offline.js` 对外接口（C5）；
3. 不改 `data/pm2-deploy.config.js` 生成格式（C8）；
4. Step A 期间不动 `ecosystem.config.js` 与 manager 脚本语义（C6）；
5. 不动目标机零编译约束：runtime-cli 为 CJS 源码直跑，**无 dist 概念**（checkJs 只在开发机检查，不产出构建物）；
6. 不引入 npm 运行时依赖；
7. 打包脚本改造（packager 化）与运行时改造（runtime-cli 化）**分开提交、分开验收**。

### 4.6 测试策略（测试先行，分层落地）

本段代码当前无测试基建（纯 Node CJS 脚本，jest 未覆盖）。测试不是一刀切 TDD，而是按可测性分层：

| 层级 | 对象 | 方法 | 时机 |
|---|---|---|---|
| **L1 纯逻辑测试先行**（TDD） | `cli.js` 命令分发表；`lib/env.js` 的 parseEnvFile/getPorts；`packager/lib/manifest.js` 清单生成（断言条目数/关键文件存在，**直接消灭 P9 两处硬编码漂移**）；迁移失败重试/自修复的错误串匹配分支（喂模拟 stderr → 断言 resolve 动作，回归价值最高）；`lib/health.js`（mock net/http） | jest 单测，纯函数零 IO | **先写测试再拆/再改**——这些模块是重构的锚点 |
| **L2 特征快照守卫**（characterization test） | 拆分/迁移前后 CLI 行为逐字节不变：`--help` 输出 diff、子命令 dispatch 结果 | 快照 diff（命令输出比对） | Step A-1 / B 每次提交的自动门槛 |
| **L3 集成清单守护**（非单测） | PM2 黄金路径（V1-V8）、前台整树退出、verify-deploy 7 步 | 可重复执行清单脚本；前台真起真杀在 CI（Linux）/ 人工 job（Windows） | 每阶段结尾 |

**落地顺序**：Step A-1 之前先搭好 jest + 冒烟基建（L1 的解析/分发/manifest 测试先跑起来），确保拆分有测试锚；拆分过程用 L2 快照防漂移；生命周期行为用 L3 守护。

> 与仓库既有精神一致：`testing-strategy`（mock 规范）、`diagnosing-bugs`（回归守卫）；纯 CJS 测试直接由 `packages/runtime-cli` 的 jest 承载，纳入 `pnpm -r test`。

#### Phase 0 落地记录（2026-08-19）

- **测试基建**：新建 `tests/runtime-unit/`（jest 29.7，node 环境，无 transform），纳入 `pnpm-workspace.yaml` 的 `tests/*`。运行：`pnpm --filter runtime-unit-tests test`。
- **L1 基线**：为 `runtime/scripts/config-updater.js` 的纯函数（`parseEnvContent`/`serializeEnvContent`/`parseEnvToBlocks`/`serializeBlocks`/`mergeExampleIntoEnv`）建 21 个基线测试，全绿。**这些测试是 Step A-1 拆分的锚点。**
- **行为发现（文档注释与实现不符）**：`config-updater.js:652` 注释声称 `mergeExampleIntoEnv`"空行压缩：区块间最多保留一个空行"，但**真实实现原样保留 example 的空行**（探针确认 `# ====块1====\nA=1\n\n\n\n# ====块2====\nB=b`）。L1 按真实行为锁定（不纠正）；此注释修正记入 Step A-1 顺带清理项。
- **技术债（不阻塞本次重构）**：`pnpm -r test` 时 frontend 有 9 个既有测试失败（`vipCommandGuard.spec.ts` 等，属本次基线提交前工作区状态，与部署重构无关）。单独排期处理，不纳入本项目。

#### Step A-1 落地记录（2026-08-19，前序会话已完成机械拆分）

- **拆分产物**：`runtime/scripts/cli.js`（3530 行）已拆为分发壳（347 行）+ `lib/{context,env,logger,proc,health,prompt,state}.js` + `commands/{deploy,dev,start,stop,infra,migrate,db-backup,setup-wizard,init,status,help}.js` + `foreground/registry.js`。全模块 require 冒烟通过，无循环依赖。
- **依赖方向铁律核查**：lib 仅 require 其他 lib + 独立模块（`config-updater`），不 require commands ✅。`commands → lib` 方向正确。
- **config-updater 注释修正**（P3 顺带项）：`config-updater.js:652` 注释改为"区块间空行原样保留"。

#### Step A-2 落地记录（2026-08-20 本会话）

- **L1 测试锚扩展**（`pnpm --filter runtime-unit-tests test` 现 52 个全绿）：
  - `lib-env.test.js`（13）：`parseEnvFileSimple`/`parseEnvFile` 行为锁定；
  - `lib-proc-killtree.test.js`（9）：`killTree` Win taskkill / Linux -pgid 双分支；
  - `foreground-registry.test.js`（5）：`cleanupForeground` SIGTERM→延时→killTree 整树流程；
  - `lib-health.test.js`（4）：`waitForPort`/`checkHttpHealth`（真实 TCP/HTTP server）。
- **`lib/proc.js` 新增 `killTree(pid)`**（P2.2 原语）：Win `taskkill /PID /T /F`；Linux `process.kill(-pgid)`（配合 `detached: IS_LINUX` spawn 建独立进程组）。
- **前台真修复**（P2.1/2.2/2.4/2.7，均在 `commands/infra.js`、`commands/start.js`、`foreground/registry.js`）：
  - P2.1：前台 PG 改用 `pg-manager.js daemon` 常驻模式（原 `start` 为 one-shot，Ctrl+C 停不了 PG）；
  - P2.2：所有前台 spawn 去 `shell:IS_WINDOWS`（绝对路径直 spawn），Linux 加 `detached:IS_LINUX`，`cleanupForeground` 用 `killTree` 整树兜底；
  - P2.4：`startAppServices(mode, onReady)` 新增 onReady 回调，`deploy.js` 把图纸版本验证/changelog 移入，前台在"阻塞等待前"执行（验证运行中的系统）；
  - P2.7：前台后端改捕获 stdout+stderr 尾部（原仅 stderr 15 行）。
- **stop 定向化 + kill-all**（P2.3/P2.6/P8）：`commands/stop.js` 移除"按进程名全杀 node/postgres/redis"兜底，改为定向（pg stop + redis stop + pm2 delete/kill）；新增显式危险命令 `killAllInfrastructure`，经 `cli.js` 分发为 `cloudcad.sh kill-all`。
- **P2.5 双实现合一**：`commands/start.js:startAppServicesWithInfra` 前台分支改为委托 `infra.js:startInfrastructure(false)`，消除前台基础设施两份 spawn 逻辑。

> **延迟项（需部署机集成验证，勿在无 V5/V4 环境下盲改）**：
> - P3 公共上下文统一：`verify-deploy.js` 的 `parseEnvFileSimple/getPorts/runPnpm` 与 `lib/*` 存在行为差异（verifier 的 `runPnpm` 设置 `PRISMA_CLI_BINARY_TARGETS`、`log(level)` 签名不同），D5 要求验收器独立 → **不混用**，仅可统一纯路径常量，待 V5 集成可验证时处理。
> - P2.1 的"直接 spawn `postgres -D`"与 supervisor 完整版（§4.3）：本会话采用"pg-manager daemon + 进程组"低风险路径达成 P2.1/P2.2 目标。**基础服务 supervisor 直跑版本已由 Q0 决策取代**（基础服务统一 PM2 托管，前台仅应用层 supervisor spawn），不再落地；supervisor 仅收敛应用层。
> - Step A-1 验收的"打包 dry-run 确认子目录进包"（C1）与 PM2 黄金路径实测：需打包机 + 部署机执行（V1-V8）。

---

## 五、分阶段实施路线图

> 原则：**每阶段独立可提交、可回滚、可验收**。PM2 黄金路径（§七）是每阶段回归门槛。

### Phase 0 — 基线与安全网（1 天）

| 项 | 内容 |
|---|---|
| 做什么 | ① `git commit` 全部现有代码（含 monitoring 新增文件，建立回滚锚点）；② 固化"PM2 黄金路径验收 checklist"（§七）为文本文件；③ require 冒烟脚本（逐模块 `node -e "require(...)"` 验证）；④ **搭 jest 测试基建**：为 `lib/context`、`lib/env`（parseEnvFile/getPorts）、命令分发表、迁移判定逻辑建立**首个特征测试基线**（L1）——拆分前先用测试把当前行为钉住 |
| 验收 | commit 完成；checklist 评审通过；L1 基线测试绿 |

### Step A-1 — 机械拆分（无行为变更）（1-2 天）★核心

| 项 | 内容 |
|---|---|
| 做什么 | 在 `runtime/scripts/` 内按 §4.1 结构建 `lib/ + commands/ + foreground/`，cli.js 代码**原样搬移**成分发壳。只允许"剪切-粘贴 + 补 require/export + 显式传参"，**禁止逻辑改写**。顺带消除 P2.5 双实现（前台基础设施两份合一）。顺序：logger → context → env → proc → health → prompt → db-backup → migrate → setup-wizard → help → stop/status/logs/init → infra → start → dev → deploy |
| 验收 | ① `cli.js --help` 输出与拆分前逐字节一致（diff）；② 全部子命令冒烟；③ 打包 dry-run 确认子目录进包（C1 自动覆盖）；④ 现有部署环境实测一次 PM2 路径 |
| 回滚 | 单 commit revert |

### Step A-2 — 公共上下文统一 + 前台真修复（2-3 天）

| 项 | 内容 |
|---|---|
| 做什么 | ① `verify-deploy.js` / `config-updater.js` / `drawing-version-helper.js` 改 require `lib/context|proc|env`（P3，只统一基础设施，业务步骤保持独立）；② **`foreground/supervisor.js` 按 §4.3 实现真前台**（修 P2.1/2.2/2.4/2.7）；③ `stop.js` 定向化：pm2 delete/kill + 各 manager stop，**删除全杀兜底**（P2.3/P2.6/P8），新增显式 `cloudcad.sh kill-all` 危险命令；④ 步骤编号与横幅统一（P7） |
| 验收 | 前台模式：Ctrl+C 后 `tasklist`/`ps` 确认整树退出、无孤儿；PM2 模式回归不受影响；verify-deploy 7 步全绿 |
| 回滚 | 前台修复 / stop 改造 / 上下文统一 = 三个独立 commit |

### Step B — ~~迁移 packages/ + packager 工程化~~（rev4 取消，改为就地 P9 + 产物收敛）

> **rev4（2026-08-20）**：D7 取消迁 packages/，Step B 范围重构为**就地完成 P9 + 砍离线包 + 升级包路线 B**，已落地：

| 项 | 内容 |
|---|---|
| 做什么 | ① ~~建 `packages/runtime-cli`~~（取消，保持 `runtime/scripts/` 原地）；② **P9 就地落地**：新增 `scripts/pack-lib/manifest.js` 清单单一事实源（`getSharedEntries` 共享 + deploy/upgrade 组装），`pack-offline.js` 的 `getDeployIncludeList`/`getUpgradeIncludeList` 两处硬编码清单已收敛为委托 manifest；③ **砍离线开发包**：删 `packOffline`/`ensureOfflinePnpmStore`/`createOfflineArchive`/`OFFLINE_EXCLUDES`/`ensureStoreHashMatch`/`readCachedHash`，`main()` 无参数运行改为报错提示，`pack:source*` scripts 与 `pack-menu.js` 离线项已删；④ **升级包路线 B**：`packUpgrade` 去掉 store 打包，只推业务产物全集，manifest.json `store:'none'`；⑤ 开发垃圾脚本（P4）后续清理 |
| 验收 | ① `pnpm --filter runtime-unit-tests test` 93 个全绿（含新增 `pack-manifest.test.js`）；② 升级包 dry-run 确认不含 store；③ 全量包首装（V1）+ stop/start（V2）部署机实测 |
| 回滚 | manifest 收敛与离线包删除分 commit |

### Phase 5 — 端到端回归矩阵 + CI 化（1-2 天）

按 §七全量执行；把冒烟集（require + --help diff + verify-deploy）脚本化进 CI。可选：packager manifest 测试、runtime-cli lib 单测纳入 `pnpm check`。

---

## 六、决策点状态

| # | 问题 | 结论 |
|---|---|---|
| ~~D1~~ | 前台模式修还是废 | **已拍板：A 真前台修复**（supervisor 设计 §4.3）｜**Q0 补充（2026-08-20）：基础服务统一 PM2 托管，前台仅应用层 supervisor spawn**（取代 §4.3 中基础服务前台化部分，见 §4.3 标注） |
| ~~D7~~ | 是否移入 packages/ | **已拍板：是**，双包结构（runtime-cli + packager），分两步迁移（Step A 拆分 → Step B 移动）｜**rev4 取消（2026-08-20）**：Step A 拆分后原地工程化已足够（lib/commands/foreground 分层 + jest 测试锚），Step B 只剩物理搬家 + 改 C4/C6/C11 契约，纯机械高风险零收益，**砍掉**；runtime-cli 保持 `runtime/scripts/` 原地 |
| ~~D8~~ | 打包是否工程化 | **已拍板：是**，packager 包 + manifest 单一事实源｜**rev4 落地方式调整（2026-08-20）**：不搬 `packages/packager`，改为在 `scripts/pack-lib/manifest.js` 落地清单单一事实源（`getSharedEntries` 共享 + deploy/upgrade 组装），`pack-offline.js` 两处硬编码清单已收敛 |
| ~~D9~~ | 是否测试先行 | **已拍板：分层测试策略**（§4.6）——纯逻辑 L1 测试先行、拆分 L2 特征快照守卫、生命周期 L3 集成清单 |
| D10 | 离线开发包（offline）去留 | **rev4 已拍板：砍（2026-08-20）**——无合法交付场景（全源码+dev 依赖+开发垃圾进客户环境），与部署包严重重叠；`packOffline`/`ensureOfflinePnpmStore`/`createOfflineArchive`/`OFFLINE_EXCLUDES` 等已删，`main()` 无参数运行改为报错提示，`pack:source*` scripts 已删，`pack-menu.js` 移除离线项 |
| D11 | 升级包形态 | **rev4 已拍板：路线 B（2026-08-20）**——升级包只推业务产物全集（dist/migrations/scripts/ecosystem + pnpm-lock.yaml），**不带 .pnpm-store-deploy**；依赖复用目标机既有部署包 store 离线补装（首次部署必须用部署包打底，已确认）；升级包从 ~700MB 降到 ~100MB；`store:'none'` 写入 manifest.json |
| D2 | lib 拆分粒度 | 建议：首版 7 文件足矣，后续按需细分 |
| D3 | 是否引入 TS/ESM | **维持否决**：CJS + JSDoc(checkJs) 兼顾类型安全与零构建 |
| D4 | 交互询问参数化/记忆化 | 建议：`--mode pm2\|foreground` 参数 + `data/.startup-mode` 记忆（服务无人值守升级包场景，P6）；放 Step A-2 后独立工单 |
| D5 | verify-deploy 复用深度 | 只复用 context/proc，7 步业务流程保持独立（验收器独立性） |
| D6 | monitoring/ 随包分发 | 建议是，纳入 Phase 0 基线；与 CLI 的集成（`cloudcad.sh monitoring` 子命令）随 ADR-0055 落地再定 |

---

## 七、回归验证矩阵（PM2 为核心红线）

| # | 场景 | 平台 | 验证点 |
|---|---|---|---|
| V1 | 全量包**首次部署**（PM2） | Win + Linux | setupOffline → 密码生成 → 基础服务 → 迁移 → 应用就绪 → 图纸版本验证 |
| V2 | **stop → start**（日常运维） | Win + Linux | stop 后进程清点（pm2 空、端口释放）；start 恢复 |
| V3 | **升级包部署**（同布局） | Win + Linux | 依赖重装检测正确 → 迁移幂等 → .env 只增不覆盖 → 服务恢复 |
| V4 | **前台模式** | Win + Linux | Ctrl+C 整树退出、无孤儿；收尾验证在服务运行期执行 |
| V5 | verify-deploy.js 全流程 | Win + Linux | 7 步全绿 |
| V6 | 打包侧 | 打包机 | 全量/升级/Linux 包产物清单审计（manifest 单一事实源正确、.deploy、ecosystem 完整、无开发垃圾）；**升级包不含 store** |
| V7 | CLI 冒烟 | 双平台 | --help 与基线 diff 一致；子命令 dispatch 正常 |
| ~~V8~~ | ~~升级包跨布局迁移~~（Step B 专项） | — | **已随 D7 取消（rev4）**：不再迁 packages/，无跨布局迁移场景 |

---

## 八、风险清单与规避

| 风险 | 概率 | 影响 | 规避 |
|---|---|---|---|
| 拆分引入 require 错误，目标机启动即崩 | 中 | 高 | 逐模块冒烟 + verify-deploy + 升级包 CRC 重解压恢复 |
| "顺手修 bug"混入机械拆分，行为漂移 | 高 | 高 | Step A-1 铁律禁止逻辑变更；行为修复集中 A-2 独立 commit |
| Windows shell:true 行为差异被无意改变 | 中 | 高 | runPnpm/runPm2 原样搬移，A-1 不动 |
| **布局迁移后老升级包/全量包混装** | 中 | 高 | layout.js 迁移期双布局映射；V8 专项；发布说明明确"自 vX.Y 起布局变更" |
| pnpm filter 漏加 runtime-cli，目标机依赖解析失败 | 低 | 中 | C11 两处同步 + 全量包首装验收（V1）覆盖 |
| 全杀兜底移除后孤儿进程无人处理 | 中 | 中 | 显式 `kill-all` 危险命令替代 |
| 真前台 PG smart shutdown 慢/挂起 | 低 | 中 | 关停顺序带超时强制 kill；仅前台模式受影响，PM2 不走此路径 |
| 打包 manifest 重构漏条目 | 中 | 高 | manifest 单测（条目数/关键文件断言）+ V6 审计输出 |

---

## 九、Not yet specified（雾区）

- `ecosystem.config.js` 的 initdb/chmod 副作用治理（触 C6，排 Step B 后独立工单）；
- `setup-offline.js`（62KB）自身内部拆分（契约接口 C5 不变前提下，二期）；
- ~~PM2 `save/resurrect` 开机自启~~（**已实现，2026-08-20**：`setupPm2Startup` 原生自启——Linux `pm2 startup systemd` 用内嵌 PM2；Windows 用 HKCU Run 键 + `pm2 resurrect`，无第三方包）。**交互收敛（2026-08-20）**：部署时不再询问"是否配置开机自启"——PM2 后台模式（生产）默认自动配置，前台模式不配置；`setupPm2Startup` 全程静默，失败仅返回 `false`、不报错、不中断部署（P6 自启询问项已消除）；systemd/monitoring（ADR-0055）统一设计仍待评估；
- Docker 路径（docker-entrypoint.sh）与前台 supervisor 进程模型统一（容器 PID1 场景）；
- D4 询问记忆化的具体交互与升级包无人值守组合语义。

## 十、Out of scope（明确不做）

- 后端/前端业务代码、Prisma schema 改动；
- docker/ 生产编排链路重构；
- 引入 TS 编译/ESM/bundler（D3）；
- PM2 之外的进程管理器（属 ADR-0055 方向）。
