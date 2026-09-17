# 0060 — 转换并发与缓存策略（Conversion Concurrency & Caching）

**Status**: accepted

2026-08-28 线上事故：同一用户反复批量下载 22MB DWG，触发后端 3 个并发 `mxcadassembly` 转换；`child_process.exec` 超时只 SIGTERM 那个 shell 包装进程，**原生 `mxcadassembly` 未被杀掉 → 变孤儿持续吃 CPU**，孤儿累积（实测 5+ 个、各占 10-20%）叠加后端/PG/Redis 在 8 核 8G 上争抢，CPU 打满死机，仅重启恢复。本 ADR 记录止血修复 + 防复现/防体验劣化的完整并发与缓存策略。

**根因判定**：事故链条是「孤儿进程泄漏」而非「限流器没限住」。限流器只限「它跟踪的任务数」，限不住「真实进程数」——`exec` 超时杀的是 shell，不是 shell 拉起的原生转换进程。

## 决策

### 1. 进程数收口（已实施）

| 项 | 决策 |
|---|---|
| 进程组杀除 | `mxcad-exec.ts::runMxcadAssembly` 用 `spawn`（不再经 shell）+ `detached`（Linux 子进程成为进程组 leader）；超时/失败时 `process.kill(-pid, SIGTERM)` 杀整组，~2s 未退再 `SIGKILL`；Windows 用 `taskkill /PID <pid> /T /F` 杀进程树。**原生 mxcadassembly 再也杀不掉变孤儿的路径被堵死** |
| 启动清理 | `LinuxInitService.onModuleInit` 调 `pkill -f mxcadassembly`，后端（重）启动清掉上次崩溃/重启遗留的孤儿（仅 Linux，事故平台；Windows 启动清理列后续可选） |
| 并发统一收口 | `convertFile` 与两条 `convertBinToMxweb` 路径（进程池 / version-history 直连）**全部收进同一个 `conversionRateLimiter`**（cap = min(CPU核数, `upload.conversionMaxConcurrent`)，prod=3）。此前 `convertBinToMxweb` 走进程池时被独立 `RateLimiter(4)` 限、version-history 直连则**完全裸奔**，两池相加可超 CPU 核数（最坏 3+4=7）。收口后真实 mxcadassembly 进程数 ≤ 限流器 cap |
| cwd 竞态 | 删 `process.chdir` 全局改目录，改 per-spawn `cwd`，消除并发转换下的全局 cwd 竞态 |
| 超时可配 | `TIMEOUT_FILE_CONVERSION`（默认 60000ms），`file-conversion.service` 构造器读取替换硬编码 |

### 2. 批量下载路径接入结果缓存（待实施）

现有转换产物缓存（`file-download-export.service.ts` 的 `buildConversionCacheKey` + `isConversionCacheFresh`）**只覆盖同步单文件下载路径**；批量下载路径（事故主路径）完全不走缓存，缓存 key 用 `nodeId + updatedAt + 格式参数`、**不防并发**（3 格式并发时缓存文件未落盘，各自触发一次真实转换）。

**决策**：批量下载路径（`conversion-runner.convertInProcess` / `processDelegated`）复用同一套结果缓存——同 `nodeId+updatedAt+format` 命中缓存则回读、不再起 mxcadassembly。让「重文件反复重提交」从「每轮真实转换 3 次」降为「首转 3 次 + 后续秒回」。key 已含 `updatedAt`（节点更新自然失效），语义正确。

### 3. 批量路径并行度削峰（待实施）

批量 `convertMany` 现 `Promise.all` 并行转所有格式（Semaphore 默认 3）。3 个重格式并发是 CPU 饥饿源头（8 核被 3 转换 + 常驻服务抢光 → 每个都 >60s → 全超时失败 → 缓存填不上 → 失败循环）。

**决策**：批量内并行度削到 **2**（或按文件大小自适应：小文件并行、大文件串行）。8 核机器上 2 个重转换 + 常驻服务已接近打满，削到 2 让单个转换 CPU 充足、更可能 60s 内转完 → 缓存能落盘 → 破失败循环。批量非「秒出」场景，慢一点可接受。

### 4. 超时保持 60s 默认，仅确保可调（已实施读取，文档待补）

**决策**：`TIMEOUT_FILE_CONVERSION` 保持 60s 默认，**不调大**。重文件转不完的正解是「算一次→缓存复用」+「削峰让单转换 60s 内转完」，而非每次同步硬扛 180s（盲目调大会让卡死任务占槽更久、队列更长）。运维可经 env 调大应对个别超大文件。

## 否决的备选（核心资产：为什么不做）

- **in-flight 并发去重**（同 srcPath+format 共享 in-flight promise）：**否决**。事故里「3 并发」是 **DWG/DXF/PDF 三个不同格式** = 3 个**不同**转换（不同缓存 key），去重（按 srcPath+format）合并不了；它只能合并「同格式并发重复」（双击/两人同下），是更窄的场景，复杂度（key 正确性 + 失败传播 + 槽位计数）不成比例。靠「缓存 + 限流器」兜底即可。
- **调大 60s 超时**：**否决**。根因是 CPU 饥饿（3 并发 + 常驻服务抢 8 核）导致单转换慢，不是 60s 本身太短；调大只让卡死任务占槽更久。
- **同步→异步（重文件走 taskId+poll）**：**本轮否决**。前端从同步 fetch 改 taskId+poll 是架构级改动（前端 + 后端），风险高；先靠「削峰 + 缓存」让同步路径 60s 内转完，个别超大文件不够用时**单独立票**做异步（可复用 conversion-service 独立的 upload=120s/export=180s 超时体系）。
- **批量保持并行 3**：**否决**。加剧 CPU 饥饿，正是事故放大器。

## 实施状态

- **已实施**：进程组杀除、启动清理、并发统一收口（含 `convertBinToMxweb` 收进同一限流器 + 并发上限测试）、cwd 竞态消除、超时读取配置（§1）；批量并行度削峰 `BATCH_DOWNLOAD_MAX_CONCURRENCY` 默认 3→2（§3）；运维文档 `docs/ops/conversion-tuning.md`（§4）；批量路径接入结果缓存（§2）。
  - §2 接线（4 文件）：`FileDownloadExportService` 暴露 `getFreshConversionCachePath`/`storeConversionCache`（`buildConversionCacheKey` 参数收窄为 `{id,updatedAt}`，单文件调用点兼容）；`ConvertRequest.node` 补 `updatedAt`；`batch-download-orchestrator` 两处 node `select` 补 `updatedAt` + `tryConvert` 透传；`ConversionRunner` 注入 `FileDownloadExportService`，`convertInProcess` 转换前查缓存命中则回读、转换成功后 **copy**（非 rename，ZIP 装配仍需原文件）写缓存。单文件与批量共享同一缓存目录 + key（`nodeId+updatedAt+格式参数`），双向命中复用。
- **延后单独立票**：重文件同步→异步（§否决备选第 3 条）。

## 影响面

- `packages/backend`：`mxcad/conversion/mxcad-exec.ts`（新增）、`mxcad/conversion/file-conversion.service.ts`、`mxcad/infra/linux-init.service.ts`、`batch-download/conversion-runner.ts`（§2/§3 待实施）、`file-system/file-download/file-download-export.service.ts`（缓存复用）
- 无 DB migration、无新权限点；`TIMEOUT_FILE_CONVERSION` 已存在（`.env.example`）
- 行为变更：超时/失败时 mxcadassembly 进程组被真正杀掉（不再泄漏）；cwd 改 per-spawn；超时可配；真实 mxcadassembly 进程数被限流器 cap 住

**Cross-references**
- ADR-0058 转换队列监控：本 ADR 收口并发后，监控页「转换队列」Tab 的并发/排队/耗时观测即有稳定基线
- ADR-0043 转换频率限制：频率限制管「单位时间转换次数」（防滥用），本 ADR 管「同时跑几个转换进程」（防 CPU 打满），两者正交、叠加生效
