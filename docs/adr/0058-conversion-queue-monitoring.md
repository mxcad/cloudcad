# 0058 — 转换队列监控（Conversion Queue Monitoring）

**Status**: accepted

项目当前卡点在转换程序：转换任务排队/并发/耗时不可观测，扩容决策（加机器/加并行）只能靠猜。本 ADR 定案在管理员系统监控页激活预留的「转换队列」Tab，按 `FUNCTION_EXECUTOR` 三种形态展示实时队列/并发/耗时 + 24h 趋势，支撑扩容决策。

**与 ADR-0055 的边界**：Grafana（Prometheus 长历史）管趋势分析与告警；本方案的管理页管 24h 窗口内的运维决策（"最近几小时排队是否持续变长"）。两者互补，不互相替代。

## 决策

### 1. 覆盖形态与数据源

| 形态（FUNCTION_EXECUTOR） | 数据源 | 展示 |
|---|---|---|
| `process-pool`（默认） | 后端进程内 `RateLimiter`（ProcessPoolExecutor） | 队列深度/三级优先级/运行中/并发上限/超时阈值 + 耗时/等待 P50/P95 |
| `conversion-service` | 远端 `GET /v1/conversions/stats`（后端 30s 代理） | 任务计数/三级工作池（含自动扩容状态）/耗时 P50/P95 |
| `cloud-faas` | 无（云厂商托管调度） | 页面显示「不适用」 |

**单实例前提**：backend 与 conversion-service 在所有部署路径（compose/Helm/PM2）均为单实例，内存态数据无跨实例聚合问题。

### 2. 后端统一采样器 + 内存环形缓冲

| 项 | 决策 |
|---|---|
| 端点 | 单端点 `GET /api/v1/conversion-monitor/stats`（SYSTEM_MONITOR 权限），一次返回 `{ mode, processPool, conversionService, history }` |
| 历史存储 | backend 内存环形缓冲：30s 采样、24h 保留（~2880 点），**不建 DB 表**；重启丢失，长历史走 Grafana 兜底 |
| 采样器位置 | 统一在 backend（`ConversionMonitorService.onModuleInit` 起 30s 定时器）：process-pool 读本进程、conversion-service 每 30s fetch `:3100/v1/conversions/stats`、cloud-faas 记空样本。conversion-service 保持"无状态 stats 提供者"职责不变 |
| 远端拉取失败 | 端点仍 200，`conversionServiceError` 携带原因，前端显示"服务不可用" |
| 前端轮询 | 沿用页面既有模式：Tab active 时 30s 轮询单端点 |

**否决的备选**：DB 持久化（需 migration，24h 窗口内存足够，重启丢失可接受）；前端直连 conversion-service（跨域 + secret，破坏"前端只走 @/api-sdk"铁律）；各服务各存各的环形缓冲（两套逻辑，历史形状不一致）。

### 3. 任务耗时统计（P50/P95）

| 项 | 决策 |
|---|---|
| 样本窗口 | 最近 500 个终态任务（计数窗口，有界；低流量时窗口覆盖时间长，高流量聚焦最近） |
| conversion-service | TaskStore 记录补 `startedAt`（首次 PROCESSING）/`completedAt`（首次终态）；耗时 = completedAt − startedAt（执行耗时，不含排队） |
| process-pool | RateLimiter 补 `finishedAt` + `timedOut` 标志，完成即写入有界样本缓冲（500）；超时任务（未真正执行完）与被 clearQueue 取消的任务不计样本 |
| 等待时长 | process-pool 额外提供排队等待 P50/P95（queuedAt → startedAt） |

### 4. 任务记录有界保留（顺手修存量泄漏）

三处任务记录此前**无 TTL 无清理**（conversion-service 内存 Map + Redis Hash `fworkflow:tasks` 无限增长、重启 HGETALL 全量加载；backend ProcessPoolExecutor Map 同理）：

| 位置 | 决策 |
|---|---|
| conversion-service TaskStore | 终态记录保留最近 500 条，超出按入队顺序淘汰（内存删除 + Redis 同步 HDEL）；该有界集合同时即耗时统计样本窗口 |
| backend ProcessPoolExecutor | taskStore 终态记录保留最近 500 条（`terminalOrder` 队列驱动淘汰）；被淘汰任务 `getTaskStatus` 报 not found（活跃任务不受影响，可接受） |

**说明**：RateLimiter 的"执行超时"机制对已启动任务实际不可达（promise 在任务开始时即 resolve，`finally` 清除定时器）——存量行为，本次不修；`timedOut` 标志作为防御性守卫保留。

### 5. 前端落点

| 项 | 决策 |
|---|---|
| 页面 | 激活 `SystemMonitorPage` 预留的 `conversionQueue` Tab（权限 SYSTEM_MONITOR、路由、菜单均已就位） |
| 内容 | 状态头（执行形态 + 正常/队列积压/服务不可用）→ 当前值卡片（按模式）→ 三级工作池卡片（conversion-service，含自动扩容 currentMax/backlogSince）→ 24h 趋势图（队列深度 + 运行中，降采样至 ~300 点） |
| 收口 | 核心 Tab 的 `QueueStatsCard` 移除（standalone 模式下它显示的是后端进程内 limiter 而非真实队列，会误导）；观察统一收口到新 Tab |
| 运维端点 | 后端 `GET /api/v1/queue/stats` 保留（process-pool 运维 API），仅移除前端卡片 |

**自动扩容可见性**：conversion-service worker-pool 的自动扩容（积压 > baseline×2 持续 2s → max 翻倍至 cap 8）在三级工作池卡片展示 currentMax/baseline/是否已扩容/积压起始时间——判断"单实例是否已到极限"的关键信号。

## 影响面

- `packages/conversion-service`：task-store.js（时间戳 + 淘汰 + 耗时统计）、routes/conversions.js（stats 加 duration）
- `packages/backend`：rate-limiter.ts、process-pool.executor.ts、新增 `src/conversion-monitor/` 模块、app.module 注册
- `packages/frontend`：SystemMonitorPage（激活 Tab + ConversionQueueTab + hook + 删除 QueueStatsCard）
- `packages/api-sdk`：自动重生成（新端点 `conversionMonitorControllerGetStats`）
- 无 DB migration、无新权限点、无新环境变量
