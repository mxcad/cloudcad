# 0056 — 离线部署运行时与打包工具工程化（Runtime & Packager Modularization）

**Status**: accepted

当前离线部署/启动/打包体系是"脚本堆"：`runtime/scripts/`（39 个文件，其中 `cli.js` 单文件 3530 行 / 115KB）承载运维 CLI、启动编排、前台模式、数据库备份/迁移、密码向导、PM2 编排；`scripts/` 与 `runtime/scripts/` 两目录散落打包工具（`pack-offline.js` 58KB 含全量/升级/构建/清单/store/压缩），且存在同名双份维护（已漂移）；整个 `runtime/scripts/` 又**整目录随离线包分发给客户**，开发垃圾（test-\*/upload-\*/进度 json/日志）一并发出。

前台模式长期失修（假前台：`pg-manager.js start` one-shot 拉起 daemon 后自身退出，Ctrl+C 后 PG/Redis 仍存活；Windows `shell:true` 双层进程孤儿；`stopInfrastructure` 全杀机器上所有 node/postgres/redis）。**PM2 后台模式已跑通且与离线打包深度配合，是全项目交付的生命线。**

本 ADR 定下对这套体系的工程化改造决策：**双包架构 + 两步迁移 + 分层测试策略**，红线是 PM2 生产链路全程零回归。

## 决策

### 1. 目标双包架构

| 包 | 位置 | 角色 | 关键约束 |
|---|---|---|---|
| `@cloudcad/runtime-cli` | `packages/runtime-cli` | **目标机**运维 CLI（启动/停止/迁移/备份/前台模式/PM2 编排） | CJS 源码直跑，**无 dist 概念**；JSDoc + checkJs 类型检查；零 npm 运行时依赖 |
| `@cloudcad/packager` | `packages/packager` | **开发机**打包工具（全量包/升级包/Linux Docker 打包/验收） | 不随包分发；`lib/manifest.js` 为包清单**单一事实源** |

理由（工程论证）：`packages/` 获得 workspace 标准待遇（jest 纳入 `pnpm -r test`、lint、tsc checkJs），与 backend/frontend 平级成为**正经交付物**；认知与归属清晰，长期项目可维护性最好。

### 2. 两步迁移（拆分与路径变更解耦）

**Step A**：先在 `runtime/scripts/` 内建 `lib/ + commands/ + foreground/`，把 `cli.js` 代码**原样搬移**（只允许剪切-粘贴 + 补 require/export + 显式传参替代模块级可变状态），禁止任何逻辑变更。验收：`cli.js --help` 输出与拆分前**逐字节一致**。

**Step B**：纯移动至 `packages/runtime-cli/src` + 改路径引用。

**为什么分开**：路径迁移触碰 3 条硬契约（启动脚本指向 C4、ecosystem.config 引用 C6、pnpm filter C11），与代码拆分混做则出问题无法定位是"拆分逻辑错"还是"路径错"。

### 3. 入口双 facade（语义固化）

| 脚本 | 角色 | 行为 |
|---|---|---|
| `start.sh` / `start.bat` | **一键部署入口**（面向用户） | 检测 `.deploy` → `deploy --skip-build`；否则 `start` |
| `cloudcad.sh` / `cloudcad.bat` | **运维 CLI 入口**（面向运维） | 透传全部子命令（stop/migrate/db:backup/status/logs/version:check...） |

两者都是 `runtime-cli` 的对外 facade，迁移时**成对维护**（C4）。

### 4. 前台模式真修复（不是废弃）

新增 `foreground/supervisor.js` 统一承载，四个核心设计：
1. **真前台化基础服务**：PG 直接 spawn `postgres -D`（弃 pg_ctl daemon）、Redis 直接 spawn、cooperate/config-service/backend/serve-static 直接 spawn——修复假前台；
2. **可杀进程树**：Windows 不用 `shell:true`（消灭 cmd.exe 包装层）+ `taskkill /T /F` 整树；Linux `detached:true` 建进程组 + `kill(-pgid)`；
3. **优雅关停顺序**（信号转发）：backend/frontend → cooperate → Redis → PostgreSQL smart shutdown → 超时强制 kill；
4. **部署收尾时序修正**：图纸版本验证/changelog 移到"服务就绪后、阻塞等待前"，后端失败显示 stdout+stderr 尾部。

**关键隔离**：manager 脚本（pg-manager 等）保持 daemon 语义不变（PM2 路径依赖 C6）；真前台由 supervisor 绕过 manager 直接管理进程，两套生命周期互不干扰。

### 5. stop 定向化

删除默认"全杀兜底"（P2.3 会杀机器上无关 node/postgres），改为：pm2 delete/kill + 各 manager stop 定向停止；新增显式危险命令 `cloudcad.sh kill-all` 兜底孤儿场景。

### 6. 打包工程化

- `scripts/pack-offline.js` 拆为 `packager/src/{pack-deploy,pack-upgrade,pack-linux,pack-menu}.js` + `lib/{manifest,layout,store,build,compress}.js`；
- **manifest 单一事实源**消灭全量/升级清单两处硬编码（现 `pack-offline.js:776` vs `:1390`）——条目标签化（deploy/upgrade 共享），杜绝"改一处漏一处"；
- `layout.js` 在迁移期支持双布局映射（老 `runtime/scripts/` vs 新 `packages/runtime-cli/src`）；
- pnpm filter 两处同步追加 `--filter @cloudcad/runtime-cli`（零依赖，install 幂等）。

### 7. 分层测试策略（测试先行，非一刀切 TDD）

| 层 | 对象 | 时机 |
|---|---|---|
| **L1 纯逻辑测试先行** | 命令分发表、`.env`/getPorts 解析、**manifest 清单生成**、迁移失败重试/自修复的错误串判定、health mock | 拆/改前先写测试钉住行为 |
| **L2 特征快照守卫** | 拆分/迁移前后 CLI 行为逐字节不变（`--help` diff、子命令 dispatch） | 每次提交自动门槛 |
| **L3 集成清单守护** | PM2 黄金路径 V1-V8、前台整树退出、verify-deploy 7 步 | 每阶段结尾 |

`packages/runtime-cli` 的 jest 纳入 `pnpm -r test`。

### 8. 清理随包卫生

开发专用脚本（test-\*/upload-\*/thumbnail-\*/batch-import/export-\*/add-copyright/generate-permissions/clean-tsc/pack-docker/pack-linux-deploy/extract-linux-runtime/verify-\*/svn-history-repair 等）迁出 `runtime/scripts/`，随包只留运行时必需；消除 `scripts/` 与 `runtime/scripts/` 同名双份维护。

## 分阶段路线

| 阶段 | 内容 | 验收 |
|---|---|---|
| Phase 0 | git 基线 commit + PM2 checklist 固化 + jest 基建 + L1 基线测试 | commit 完成、L1 测试绿 |
| Step A-1 | 机械拆分（无行为变更） | `--help` 逐字节 diff 一致、子命令冒烟、打包 dry-run |
| Step A-2 | 前台 supervisor 真修复 + stop 定向化 + 上下文统一 | Ctrl+C 整树退出无孤儿；PM2 回归不受影响 |
| Step B | 迁移 packages 双包 + manifest 单一化 + 双 facade 指向 | `pnpm -r test` 含新包；升级包跨布局切换（V8） |
| Phase 5 | 回归矩阵 + CI 化 | V1-V8 全绿 |

## 关键契约（重构不可破坏）

| # | 契约 | 变化 |
|---|---|---|
| C1 | 全量/升级包整目录复制 `runtime/scripts/` | Step B 改复制 `packages/runtime-cli/src`，packager manifest 单点维护 |
| C4 | 启动脚本硬编码 cli.js 路径（**双 facade 成对**） | Step B 改指新路径，随升级包覆盖传播 |
| C5 | `setup-offline.js` 接口 `setup()` + `checkPrismaClientExists()` | 保持不变 |
| C6 | `ecosystem.config.js` 引用 manager 路径 + interpreter=runtime node + require 副作用 | Step A 不动；Step B 改相对引用 |
| C8 | `data/pm2-deploy.config.js` 生成格式 | 保持不变 |
| C11 | pnpm filter 白名单 | Step B 两处追加 runtime-cli |
| C10 | 升级包跨版本覆盖运行时脚本 | 新布局下老 `runtime/scripts/` 成死代码无害；V8 专项 |

## Rejected options

- **留在 `runtime/scripts/` 只做拆分（不迁 packages）**：改动成本低，但游离于 monorepo 测试/lint/类型体系之外，与 backend/frontend 不属同级交付物，长期可维护性差。故迁入 packages。
- **一步到位直接迁 packages + 拆分一起做**：路径迁移与逻辑拆分耦合，出问题无法定位归属；违背"避免破坏性变更"仓库铁律。故分两步。
- **废弃前台模式（只留 PM2）**：toB/toC 均有"无守护进程、终端直跑、Ctrl+C 即停"的轻量运行诉求，且是调试/演示/受限环境的刚需。故真修复而非废弃。
- **引入 TypeScript 编译 / ESM / bundler**：目标机离线无编译环境，runtime node 直跑 CJS 零依赖是已验证事实；TS 会把运行时脚本变成"需构建产物"，破坏 C1 整目录复制契约。故 CJS + JSDoc(checkJs) 兼顾类型安全与零构建。
- **一刀切 TDD 全驱动**：本段代码无测试基建（纯 CJS 脚本、jest 未覆盖），直接裸写 TDD 会卡壳；纯逻辑层值得 TDD，生命周期行为需集成清单，拆分需特征快照。故分层。

## 与既有 ADR 关系

- **ADR-0046**（离线增量升级包）：本 ADR 是其"升级包携带完整 `runtime/scripts` + 启动脚本覆盖"契约的承接方——迁移后该契约指向新布局（C10），V8 专项验证跨布局升级。
- **ADR-0048**（文档治理）：本 ADR 遵循其"ADR 记录决策 + 与代码保持节奏"原则，先固化决策再实施。
- **ADR-0033**（前端巨型文件拆分契约，400 行上限）：与 `cli.js` 3530 行拆分同源精神，但 ADR-0033 针对 React 组件、本 ADR 针对运行时 CLI，二者机制独立。

## 实施映射

| 决策 | 落地 |
|---|---|
| 1-2 双包 + 两步迁移 | 规划文档 `docs/deployment-runtime-refactor-plan.md`（rev3），分 Phase 0 → Step A-1/A-2 → Step B → Phase 5 实施 |
| 3 双 facade | start.\* / cloudcad.\* 脚本成对维护 |
| 4 前台真修复 | `foreground/supervisor.js` |
| 5 stop 定向化 | `commands/stop.js` + `cloudcad.sh kill-all` |
| 6 打包工程化 | `packages/packager` + manifest 单一事实源 |
| 7 测试分层 | jest 基建 + L1/L2/L3 三层 |
| 8 卫生清理 | 开发脚本迁出 runtime/scripts |

**Status**: accepted

**Cross-references**
- `docs/deployment-runtime-refactor-plan.md`（rev3，本 ADR 的可执行路线图与痛点清单）
- ADR-0046 离线增量升级包（C10 契约承接）
- ADR-0033 前端巨型文件拆分契约（同源精神）
- `.codebuddy/plans/`（历史运维 issue 规划，若与本 ADR 有出入以本 ADR 为准）
