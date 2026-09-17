# 转换引擎调优（超时 / 批量并发）

**背景**：2026-08-28 事故——同一用户批量下载 22MB DWG，触发多个 `mxcadassembly` 转换并发，8 核 8G 机器上「转换 + 后端 + PG + Redis」抢光 CPU，单个转换 >60s 被超时杀掉 → 任务失败 → 用户反复重提交。详见 [ADR-0060](../adr/0060-conversion-concurrency-and-caching.md)。

**核心结论**：重文件转换失败的根因通常是 **CPU 饥饿**（多转换并发 + 常驻服务争抢），而非超时值本身太短。调优方向是「**降并发**让单转换拿到足够 CPU」+「**按需调超时**覆盖个别超大文件」，二者配合。

## 可调项

| 环境变量 | 默认 | 作用 | 调优建议 |
|---|---|---|---|
| `TIMEOUT_FILE_CONVERSION` | `60000`（60s） | 单个 `mxcadassembly` 子进程超时（毫秒），超时即杀进程组 | 个别超大文件同步转不完时调大（如 `180000`）。**不要盲目调大**：卡死任务会占槽更久、队列更长。默认 60s 足够常规文件 |
| `BATCH_DOWNLOAD_MAX_CONCURRENCY` | `2` | 批量下载进程内转换的并行度（Semaphore） | 8 核机器保持 `2`（或 `1`）；核数多（16+）可调 `3-4`。削并发是让单转换 60s 内转完、结果缓存能落盘的关键 |

## 与限流器的关系

- 单文件/打开方向转换（`convertFile`）+ 保存方向（`convertBinToMxweb`）全部收进同一个 `conversionRateLimiter`（cap = min(CPU核数, `upload.conversionMaxConcurrent`)），**真实 mxcadassembly 进程数被 cap 住**，不会再出现孤儿进程累积打满 CPU。
- 批量下载的进程内转换另受 `BATCH_DOWNLOAD_MAX_CONCURRENCY` 的 Semaphore 门控。
- 两者叠加：批量场景下同时受「限流器 cap」+「批量 Semaphore」约束。

## 观测

调优效果（并发/排队/耗时 P50/P95）在管理员系统监控页「转换队列」Tab 观察（[ADR-0058](../adr/0058-conversion-queue-monitoring.md)）：看队列深度是否持续变长、单转换耗时是否 > 超时阈值。若耗时普遍逼近超时，优先降 `BATCH_DOWNLOAD_MAX_CONCURRENCY`，其次再考虑调大 `TIMEOUT_FILE_CONVERSION`。

## 不要做的事

- **不要**为「让大文件转完」而把 `TIMEOUT_FILE_CONVERSION` 调到很大（如 600s）——会让卡死任务长期占槽，队列雪崩。正解是降并发 + 结果缓存。
- **不要**把 `BATCH_DOWNLOAD_MAX_CONCURRENCY` 调到 ≥ CPU 核数——会复现事故（多转换抢光 CPU）。
