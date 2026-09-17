# #428 转换队列地图 —— v1 决策记录

> 本文档记录 `feat/conversion-queue` 分支实现 #428 地图各分片时**自行做出的决策**，供逐一复核。
> 原则：能自行决策的就定，无法定的选最优并记录；v1 只做「不破坏现有优化、不越界改黑盒」的最小闭环，
> 涉及改黑盒契约 / 前端主 UX 重构 / 外部依赖的项一律拆 v2 并记录理由。

## 决策总览

| 分片 | 决策 | v1 范围 | 延后（v2） |
|------|------|---------|-----------|
| #473 历史版本 | 保持同步 + 文件锁路径 | 不动（filename-keyed 锁，不契合 node-scoped 队列） | 纳入 node-scoped 统一队列 |
| #474 导出/下载 | 后端异步预计算 + 前端主 UX 沿用同步 | `precomputeExport` + `convertNodeForExport` + `submitTask` 路由 | 前端「原子化下载」（轮询就绪后再下载） |
| #476 打开超时 | `waitForFileReady` 60s→120s | 已提交（bc613ff） | — |
| #477 永久失败呈现 | 全量落地 | 徽标 + 打开弹窗 + 管理页 + 后端复位端点 + 测试 | — |
| #478 监控 UI | 永久失败列表 + ETA + 进行中计数 | 列表 + ETA（P50×并发估算）+ 计数 | 逐任务明细列表（黑盒 stats 只出计数） |
| i18n | 新键入 zh-CN，其他语言中文兜底 | extract + compile | auto-translate（需外部 API） |
| 转换完成通知 | v1 保持克制的 5s 轮询 | `ConversionPanel` 仅在「有进行中任务 + 面板挂载」时轮询 | 后端推送通道（SSE）替换轮询 |
| 游客打开图纸 500（NOAUTH） | 诊断为环境 + 核心基础设施缺陷，非 #428 引入 | 记录根因 + 用户侧即时处置 | session 中间件 Redis 错误降级（单独票） |

---

## 逐条决策

### #473 历史版本转换 —— v1 保持同步 + 文件锁

**决策**：v1 不改动历史版本转换路径，保持现有「同步 + filename-keyed 文件锁」实现。

**理由**：历史版本转换的锁粒度是**文件名**（filename-keyed），而 #428 统一队列的调度单位是 **node-scoped**（按节点）。两者键空间不一致，强行纳入统一队列会引入锁语义冲突。v1 不动，避免破坏既有并发正确性。

**v2**：统一锁键空间（文件名 → 节点），再纳入 node-scoped 队列。

### #474 导出/下载接入统一队列 —— 后端异步预计算 + 前端主 UX 沿用同步

**决策**：
- **后端**：`FileDownloadExportService.precomputeExport`（预计算导出产物入缓存）+ `AsyncConversionService.convertNodeForExport` + `ConversionTaskService.submitTask` 统一路由（`type=download` → precomputeExport；缺省 open → convertNode）。
- **前端**：主下载 UX **沿用同步**（点击 → 同步等待转换 → 下载），不接入「提交任务 → 轮询就绪 → 下载」的原子化流程。

**理由**：
- 后端异步预计算让「导出」与「打开」共用同一套任务队列与负缓存，收敛转换入口。
- 前端原子化下载（提交后轮询 `getNodeConversionStatus` 就绪再触发下载）需要 `ConversionTaskItemDto` 携带 `format` 字段（当前 DTO 无此字段，补字段涉及后端 DTO + SDK 再生成 + 前端下载链路联动）。v1 前端保持同步下载，**不阻塞**后端队列收敛；原子化下载拆 v2。

**v2**：`ConversionTaskItemDto` 补 `format`；前端主下载 UX 切「原子化下载」。

### #476 打开图纸超时 —— waitForFileReady 60s→120s

**决策**：`waitForFileReady` 超时从 60s 提到 120s（慢异步转换场景）。已提交（bc613ff）。

**理由**：慢异步转换（大图纸 / 排队）在 60s 内未就绪会被误判失败；120s 覆盖典型慢转换。

### #477 永久失败前端呈现 —— 全量落地

**决策**：永久失败（内容不可转换）三处呈现 + 后端复位端点，全部落地：
- **文件列表**：`FileItemInfo` 对 `fileStatus === 'FAILED'` 的节点显示红×「转换失败」徽标。
- **打开时**：`useCadFileLoader` 在 FAILED/DELETED 终态弹「转换失败」确认框（危险型），再 `onError`。
- **管理后台**：新增「转换任务」页（`/admin/conversion-tasks`，`SYSTEM_MONITOR` 可见、`SYSTEM_ADMIN` 可复位），列出永久失败负缓存（contentKey + 原因 + 标记时间），支持逐条 / 全部复位。
- **后端**：`ConversionMonitorService.listKnownBad`/`resetKnownBad`（proxy conversion-service，非 conversion-service 模式返回空 / `unsupported`）；controller `GET known-bad`（SYSTEM_MONITOR）/ `POST known-bad/reset`（SYSTEM_ADMIN）。

**理由**：永久失败是「内容本身不可转换」的确定性信号，必须让用户（文件列表 / 打开时）和管理员（复位重试）都能感知与处置。复位端点收口在后端，前端不直连黑盒。

**测试**：后端 `conversion-monitor.service.spec` 12 全绿；前端 `ConversionTaskPage` MSW 4 全绿；`useCadFileLoader` 3 全绿。

### #478 监控 UI —— 永久失败列表 + ETA + 进行中计数

**决策**：系统监控「转换队列」Tab 增：
- **永久失败列表**：`useConversionQueue` 额外拉 `known-bad`，Tab 渲染 contentKey + 原因 + 标记时间（空态「暂无永久失败任务」）。
- **排队 ETA**：`pending ÷ max(processing,1) × p50TaskMs`，仅 `pending>0 && p50TaskMs` 时展示（秒/分/时自适应）。
- **进行中 / 排队计数**：沿用既有「转换服务任务」卡的 `tasksProcessing`/`tasksPending`。

**理由**：
- 永久失败列表复用 #477 的 `known-bad` 端点，零新增后端。
- ETA 是**估算**（P50 耗时 × 并发），给运维「还要等多久」的直觉；无样本 / 无排队时不展示，避免误导。
- **逐任务明细列表不做**（v2）：conversion-service 是黑盒，`/v1/conversions/stats` 只暴露**计数**（pending/processing/completed/failed），不暴露逐任务（task id / 节点名 / 开始时间）。要做逐任务明细须改黑盒 stats 契约，违背「黑盒不直接暴露、后端只代理」的设计约束，故拆 v2。

**测试**：`SystemMonitorPage` 增「永久失败列表 + ETA」用例（conversion-service 模式），19 全绿。

### i18n —— 新键入 zh-CN，其他语言中文兜底

**决策**：`i18n:extract` + `i18n:compile`，新键进入 `zh-CN`（默认语言，键即中文）；`en-US`/`ko-KR`/`zh-TW` 暂以中文兜底。顺带补齐 `conversion-panel`/`conversionQueueStore` 此前缺失的键。

**理由**：`i18nAutoTranslate` 需外部翻译 API（baidu/qwen），当前环境不可用；默认语言 zh-CN 正确即可保证功能可用，其他语言兜底为中文是可接受的降级。

**v2**：环境具备翻译 API 后跑 `i18nAutoTranslate` 补齐其他语言。

### 转换完成通知 —— v1 保持克制的 5s 轮询，v2 引入推送通道

**决策**：v1 保留 `ConversionPanel` 的 5s 轮询（`refreshCloud` → `GET /mxcad/conversion/tasks`），**不引入后端推送通道**。

**理由**：
- 现有轮询已是**克制范围**：`ConversionPanel.tsx:108` 的 `setInterval` 仅在「有进行中任务 + 面板挂载」时才每 5s 拉一次；无任务 / 面板关闭时**零请求**。实际负载很低（1 请求/5s，且只在任务在途时）。
- **前端无现成 WS/SSE 通道**：协同 3091 是 CAD 引擎自有的 mxcad 引擎通道，非通用前端推送通道。引入推送需新建「前端 WS/SSE 客户端 + 后端 SSE/WS 端点 + conversion-service→backend 完成回调（黑盒契约新增）」，是跨切面基础设施投入，与 v1「不越界改黑盒」约束冲突。
- **面板轮询只是 UI 状态刷新**，不是打开图纸的等待机制——真正的「打开完成」由 CAD 引擎 `openFileComplete` 事件驱动（`useCadFileLoader`/`waitForFileReady`），面板轮询只负责把「转换中 / 完成」状态显示出来。
- 推送是更优雅、更实时的长期设计（省轮询、即时通知），但 v1 的克制轮询已满足「状态可见」且成本可控。

**v2**：引入后端推送通道（推荐 **SSE**——单向 server→client、`EventSource` 自动重连、无需 WS 握手），conversion-service 完成时经 backend 广播，前端 `EventSource` 订阅替换 5s 轮询；保留短轮询作为断连兜底。

### 游客打开图纸 500（NOAUTH Authentication required）—— 根因诊断 + 决策

**现象**：未登录在 CAD 编辑器打开图纸 → `500 /api/v1/mxcad/files/uploadFiles: NOAUTH Authentication required`。

**根因（两层）**：
- **环境层（直接触发）**：`configuration.ts:217` `password: process.env.REDIS_PASSWORD || undefined`——dev 环境不设 `REDIS_PASSWORD` 时，`main.ts:163` 的 session-store Redis 客户端**不带 AUTH**。若本地 Redis 开了 `requirepass`，每个 session-store 命令都 NOAUTH。
- **代码层（为何 500 而非 4xx）**：`main.ts:222` 全局 session 中间件 `server.use((req,res,next)=>sessionMiddleware(req,res,next))` **无错误处理**——Redis 命令 NOAUTH 时，每个请求 500。且 `main.ts:195` 声称「Redis 非必需」却仍 500，自相矛盾。（`CacheManagerService` 是内存 Map 非 Redis，已排除；限流器是内存并发器，已排除。）

**决策**：
- **即时处置（用户侧）**：dev `.env` 设 `REDIS_PASSWORD` 匹配本地 Redis 密码（或本地 Redis 去掉 `requirepass`），即可消除 NOAUTH。
- **代码健壮性（单独票，非 #428 范围）**：全局 session 中间件应捕获 Redis 错误并降级（内存 session / no-op），使 Redis auth 失败不 500 每个请求，与「Redis 非必需」声明对齐。此项触及核心基础设施（`main.ts`），**不在 #428 转换队列范围内**，拆单独票，不阻塞本分支合并。

**归属**：此 500 为**既有基础设施问题**，非 #428 转换队列改动引入。

### 外部参照 DWG 文件名上传/下载不一致 —— 根因 + 修复

**现象**：外部参照 `A1.dwg` 查看 URL `/mxcad/external-ref-view/:nodeId/A1.dwg` 始终 404；`checkExists` 返回 `exists:false`；管理页外部参照列表缺失。

**根因（两层）**：
- **文件命名不一致（核心 bug）**：DWG/DXF 外部参照的磁盘文件命名在上传和查找两端不一致：
  - 上传端 `handleExternalReferenceFile`、`checkExists`、`enrichFileInfoList` 全部用 `${fileName}.mxweb`（即 `A1.dwg.mxweb`）
  - 下载端 `getExternalRefDownloadPath` 错误地剥掉 `.dwg` 扩展名，用 `${baseName}.mxweb`（即 `A1.mxweb`）——**唯一不一致的一端**
  - 结果：查找 `A1.mxweb` 找不到 `A1.dwg.mxweb`，404
- **游客/无 DB 节点场景路径错配**：`getStorageRootPath` fallback 到裸 `mxcadUploadPath`（`data/uploads/`），无 `nodeId` 子目录；`getExtRefDirName` fallback 到 `nodeId`；上传端 `handleExternalReferenceImage/File` 找不到 DB 节点直接抛 `NotFoundException`——文件从未写入 → 下载永远找不到。

**修复（4 文件 + 2 点）**：
1. `getExternalRefDownloadPath`：DWG 磁盘文件名改为 `${fileName}.mxweb`（`A1.dwg.mxweb`），与上传一致；追加 `${baseName}.mxweb` 作为降级兼容旧格式。
2. `viewExternalRef` `Content-Disposition`：用逻辑文件名 `fileName`（`A1.dwg`）而非磁盘文件名（`A1.dwg.mxweb`）。
3. `handleExternalReferenceFile` / `handleExternalReferenceImage`：无 DB 节点时写入 `mxcadUploadPath/srcDwgNodeId/`（而非抛异常），与下载端 fallback 一致。
4. 上传端点（`uploadExtReferenceDwg` / `uploadExtReferenceImage`）：移除节点不存在时的硬拦截。
5. `checkExists` / `getPreloadingData`：无 DB 节点时继续从 `mxcadUploadPath` 查找，不再提前返回 `false` / `null`。
6. `getPreloadingFilePath`：无 DB 节点时 fallback 到 `mxcadUploadPath`。

**验收**：后端 type-check 全绿。

**教训**：外部参照磁盘文件命名须以**上传端写入的文件名**为准，所有消费端（查找/统计/preloading）保持一致；命名规则应在单一位置定义而非各处重复推导。

---

## 架构约束（贯穿所有分片）

1. **conversion-service 是黑盒**：前端 / 其他服务**绝不**直连，一律经后端 `conversion-monitor` 代理（`INTERNAL_SERVICE_SECRET` 鉴权）。#477/#478 的 known-bad 列表 / 复位、stats 拉取均走代理。
2. **三层一致性**：改后端 DTO / 端点后重新生成 API SDK + MSW handler（`nest build` → `generate:swagger` → `generate:msw`），前端一律走 `@/api-sdk` 生成函数（禁 `fetch`）。
3. **不破坏既有优化**：v1 只增量（新增端点 / 新增 UI / 新增队列路由），不改既有同步路径的判定逻辑（#473 锁、#474 同步下载 UX）。

## 验证状态（提交前全绿）

- 后端：`type-check` 绿；触及 spec（conversion-monitor 12 + conversion-task 11 + file-download-export 6 + async-conversion 2）全绿。
- 前端：`type-check` 绿；触及 spec（ConversionTaskPage 4 + SystemMonitorPage 19 + conversionQueueStore 9 + useCadFileLoader 3）全绿。
- conversion-service：`node --test` 106 全绿。

## 提交清单（feat/conversion-queue，develop 之上 6 个新提交）

| 提交 | 内容 |
|------|------|
| `ca2dfc6` | conversion-service：#465/#477 永久失败负缓存（deterministic 判定 + known-bad 端点） |
| `a7a95ef` | backend：#477 转换监控代理 known-bad 列表/复位端点 |
| `a381669` | backend：#474 导出/下载接入统一队列 + #463 取消任务基础设施 |
| `6bc926a` | frontend：转换队列面板 + #477 呈现 + #478 监控 Tab 永久失败列表与 ETA |
| `1efcabc` | api-sdk：重新生成 SDK + MSW handler |
| `54b160c` | frontend：i18n extract + compile |

---

## 合并到 develop 结果（2026-09-03）

**合并方式**：`feat/conversion-queue` → `develop` **无冲突自动合并**（merge commit `437fae8`）。develop 分叉后并行走了一轮移动端 #447（M1–M9）+ #488 + #228（10 提交），与 conversion-queue（22 提交）真 merge，87 文件自动合并，api-sdk 取并集（8 个 conversion 符号）。

**合并后重新生成 SDK + MSW**（`2495526`）：`nest build`（含 `generate:swagger`）→ `@hey-api/openapi-ts` 重生成 api-sdk（conversion 8 符号 + 移动端 shareController/usersController 完整）→ `generate:msw` 重生成 handler。重生成净删 854 行——merge 并集含冗余，重生成以合并后 backend 实际 Swagger 为准修正，**证明重生成必要**（merge 并集 ≠ 合并后 backend 重生成）。

**合并后验证（全绿）**：
- backend `type-check` 绿（conversion-queue + 移动端无类型冲突）。
- frontend `type-check` 绿（api-sdk 满足前端）。
- 后端 conversion spec 103 全绿；前端触及 spec 70 全绿（ConversionTaskPage 4 + SystemMonitorPage 19 + conversionQueueStore 9 + useCadFileLoader 3 + 其余）。
- conversion-service `node --test` 106 全绿。

**并行会话协调**：合并前主空间 develop 工作区有 4 个未提交生成文件（api-sdk 3 + components.d.ts，属并行会话基于旧 backend 的倒退态 SDK 重生成），已 `git stash` 无损暂存（非丢弃，合并后重生成覆盖）；合并期间并行会话新增分享功能文件（events.ts / sessionEvents.ts / shareCommand.ts / cmd/index.ts）未提交，**未纳入本次提交**（归属并行会话）。垃圾文件 `nul` / `totp-demo.html` 已删。

**遗留项（不阻塞合并）**：
1. **游客打开图纸 500（NOAUTH）**：既有基础设施问题。**代码层已修复（#490，方案 A）**：session 中间件 wrap 降级（`common/session/degrade-session-middleware.ts` 的 `withSessionRedisFallback`——Redis 故障 skip session 不 500，4 用例全绿 + type-check 绿）；**环境层** dev 设 `REDIS_PASSWORD` 规避 NOAUTH 直接触发（代码降级是兜底）。
2. **api-sdk 移出 git**：拆单独票 **#489**（.gitignore `.gen.ts` 生成部分 + clone 后一键生成 + CI type-check 前生成 + MSW 联动，assignee wudexiong）。db 的 generated client 已 `.gitignore`（`packages/db/.gitignore` 含 `src/generated`），无需动。
3. **转换完成通知 v2（SSE 推送）**：见上文决策。
