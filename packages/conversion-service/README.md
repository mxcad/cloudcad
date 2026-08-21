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
├── server.js              # 入口：HTTP 路由 + 服务启动
├── lib/
│   ├── constants.js       # 常量配置（端口、超时等）
│   └── utils.js           # 通用工具函数
├── routes/
│   └── conversions.js     # 转换服务 API 路由
├── services/
│   ├── task-store.js      # 任务状态存储（local / redis）
│   ├── worker-pool.js     # 工作进程池 + 信号量
│   └── callback.js        # 任务回调通知引擎
├── mxcad/
│   └── runner.js          # MxCAD 转换执行器
└── package.json
```

## API 路由

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/v1/conversions/convertFile` | 同步文件转换 |
| POST | `/v1/conversions/async/convertFile` | 异步文件转换 |
| POST | `/v1/conversions/batchConvert` | 批量转换（聚合任务） |
| GET | `/v1/conversions/tasks/:taskId` | 查询任务状态 |
| GET | `/v1/conversions/tasks` | 任务列表 |
| GET | `/v1/conversions/stats` | 服务统计信息 |
| GET | `/health` | 健康检查 |

## 任务状态机

```
PENDING → PROCESSING → COMPLETED
                   ↓
                 FAILED
```

- **最终一致性** — 任务状态权威源在 Conversion Service
- **Callback 通知** — 任务完成时可回调通知后端
- **定时 Reconciler** — 扫描卡住的 `PROCESSING` 记录并恢复

## 三级优先级队列

| 级别 | 用途 | 默认并发 | 反压阈值 |
|------|------|---------|---------|
| 1 | 上传转换 | `min(CPU, 4)` | 排队 10 → 告警 |
| 2 | 导出/PDF | `min(CPU, 2)` | 排队 20 → 告警 |
| 3 | 缩略图/批量 | `min(CPU, 2)` | 排队 50 → 告警 |

## 三种部署模式

| 模式 | 说明 | 配置 |
|------|------|------|
| **Embedded** | 内嵌到后端进程 | `FUNCTION_EXECUTOR=process-pool` |
| **Standalone** | 独立 HTTP 服务 | `FUNCTION_EXECUTOR=conversion-service` + `CONVERSION_SERVICE_URL` |
| **Cloud FaaS** | 云函数执行 | `FUNCTION_EXECUTOR=cloud-faas` + `CLOUD_FAAS_PROVIDER` |

## 快速开始

```bash
# 启动服务（Standalone 模式）
pnpm start

# 服务默认运行在 http://localhost:3100
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CONVERSION_SERVICE_PORT` | 3100 | 服务端口 |
| `CONVERSION_SERVICE_SECRET` | — | 管理类路由共享密钥（与后端保持一致） |
| `QUEUE_DRIVER` | `local` | 任务队列后端：`local` / `redis` |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis 地址（`QUEUE_DRIVER=redis` 时使用） |
| `WORKER_POOL_AUTO_SCALE` | `true` | 工作池按积压自动扩容 |

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
