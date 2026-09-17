# @cloudcad/conversion-service

CloudCAD 转换服务 — CAD 转换任务队列执行。

独立 HTTP 服务，运行在端口 **3100**，负责 DWG/DXF 图纸格式转换、PDF 导出、缩略图生成等异步任务（三级优先级任务队列 + worker 池）。

## 技术栈

| 技术 | 说明 |
|------|------|
| Node.js 原生 http 模块 | 无框架 HTTP 服务 |
| MxCAD 引擎 | CAD 文件格式转换核心 |
| 信号量 + 优先级队列 | 任务并发控制 |

## 目录结构

```
packages/conversion-service/
├── server.ts              # 入口：HTTP 路由 + 服务启动
├── mxcad-exec.ts          # mxcadassembly 子进程执行（spawn + 进程组超时/清理）
├── lib/
│   ├── constants.ts       # 常量配置（端口、超时、优先级、队列驱动等）
│   ├── env.ts             # 0 依赖 .env/.env.local 预加载（不引 dotenv）
│   ├── logger.ts          # 日志（按天轮转 + 保留天数）
│   ├── redis-client.ts    # 0 依赖 Redis 客户端（队列/负缓存持久化）
│   └── utils.ts           # 通用工具函数
├── routes/
│   └── conversions.ts     # 转换服务 API 路由
├── services/
│   ├── task-store.ts      # 任务状态存储（local / redis）+ 崩溃恢复
│   ├── worker-pool.ts     # 工作进程池 + 三级优先级信号量
│   ├── negative-cache.ts  # 永久失败负缓存（#465，内容 key + TTL）
│   └── callback.ts        # 任务回调通知引擎
├── mxcad/
│   └── runner.ts          # MxCAD 转换执行器（camelCase→lowercase 参数桥接）
└── package.json
```

## API 路由

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/v1/conversions/convertFile` | 同步文件转换 |
| POST | `/v1/conversions/async/convertFile` | 异步文件转换 |
| POST | `/v1/conversions/batchConvert` | 批量转换（聚合任务，#428 导出/下载预计算） |
| GET | `/v1/conversions/tasks/:taskId` | 查询任务状态（含进度 0-100 + `permanent` 永久失败标记，#465） |
| GET | `/v1/conversions/tasks` | 任务列表（含 `permanent` 标记） |
| POST | `/v1/conversions/tasks/:taskId/cancel` | 取消任务（#431：排队中出队 / 运行中杀 mxcadassembly 进程组） |
| GET | `/v1/conversions/known-bad` | 永久失败负缓存列表（#465，内容 key + 原因 + 标记时间） |
| POST | `/v1/conversions/known-bad/reset` | 重置永久失败负缓存（管理员，清除毒化条目） |
| GET | `/v1/conversions/stats` | 服务统计信息（任务计数 + 耗时 P50/P95 + worker 水位） |
| GET | `/health` | 健康检查 |

## 任务状态机

```
PENDING ─→ PROCESSING ─→ COMPLETED
   ↓          ↓
CANCELLED   FAILED
```

- **最终一致性** — 任务状态权威源在 Conversion Service
- **Callback 通知** — 任务完成时可回调通知后端
- **崩溃恢复**（#431 门禁4）— 重启后把残留的 `PROCESSING` 任务重置为 `PENDING` 重新排队（非定时 Reconciler；跨重启的卡死恢复由 backend 的定时 Reconciler 负责）

## 三级优先级队列

每级独立信号量池，worker 按 1→3 顺序调度（level 1 最先）。优先级由 backend 按入口类型指定（`body.priority`）。

| 级别 | 用途 | 默认并发 | 执行超时 | acquire 超时 |
|------|------|---------|---------|-------------|
| 1 | 打开/预览（命脉，用户正等着打开图纸，最高优先） | `2` | 180s | 60s |
| 2 | 导出下载（用户主动触发，次于打开） | `2` | 180s | 60s |
| 3 | 后台（上传预转/缩略图/批量下载，最低优先，可容忍长排队） | `1` | 120s | 40s |

> `acquireTimeout` 是排队等待信号量许可的单次等待上限（取执行超时的 1/3）；等待超时**不丢弃任务**——`acquire` 返回 false 仅放弃本次等待，任务保持 `PENDING` 由下一轮 `_tick` 重新排队。

## 三种部署模式

| 模式 | 说明 | 配置 |
|------|------|------|
| **Embedded** | 内嵌到后端进程 | `FUNCTION_EXECUTOR=process-pool` |
| **Standalone** | 独立 HTTP 服务 | `FUNCTION_EXECUTOR=conversion-service` + `CONVERSION_SERVICE_URL` |
| **Cloud FaaS** | 云函数执行 | `FUNCTION_EXECUTOR=cloud-faas` + `CLOUD_FAAS_PROVIDER` |

## 快速开始

```bash
# 开发（tsc 构建 + 运行）
pnpm dev

# 生产（先构建 dist 再运行）
pnpm build && pnpm start

# 服务默认运行在 http://localhost:3100
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CONVERSION_SERVICE_PORT` | 3100 | 服务端口 |
| `CONVERSION_SERVICE_SECRET` | — | 管理类路由共享密钥（与后端保持一致，带 `X-Conversion-Service-Secret` 头） |
| `INTERNAL_SERVICE_SECRET` | — | #419 等保内部服务统一共享密钥（后端带 `X-Internal-Service-Secret` 头；与上者任一匹配即放行） |
| `CONVERSION_SERVICE_REQUIRE_AUTH` | 随环境 | 两密钥均未配置时是否拒绝请求：`NODE_ENV=production`→`true`（防生产裸奔），其他→`false`（本地/内网向后兼容）；显式 `true`/`false` 可覆盖 |
| `QUEUE_DRIVER` | `local` | 任务队列后端：`local` / `redis`（redis 时任务队列 + 永久失败负缓存持久化，跨重启/多节点一致） |
| `REDIS_URL` | —（未设） | Redis 连接串（`QUEUE_DRIVER=redis` 时**必填**；格式 `redis://[:密码@]host:端口/库`） |
| `MXCAD_ASSEMBLY_PATH` | 平台默认 | mxcadassembly 二进制路径（部署态须指向实际位置；缺省 `runtime/<platform>/mxcad/mxcadassembly[.exe]`） |
| `NEGATIVE_CACHE_TTL_HOURS` | `24` | 永久失败负缓存 TTL（小时）：known-bad 条目超 TTL 自动失效；`0`=永久不失效（须管理员手动 reset） |
| `WORKER_POOL_AUTO_SCALE` | `false` | 工作池按积压自动扩容（默认关，CPU 密集单进程，需按容量公式显式开） |
| `LOG_DIR` | `data/logs` | 日志根目录（相对路径基于包根解析，日志落盘 `data/logs/conversion-service/app-YYYY-MM-DD.log`） |
| `LOG_RETENTION_DAYS` | `180` | 日志保留天数（按天轮转，过期自动清理） |

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
