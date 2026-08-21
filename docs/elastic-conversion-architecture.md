# 弹性转换架构 — 快速上手指南

> PRD: #125 | Tickets: #145-#152

## 三种模式

```
嵌入式 (embedded) ────→ 独立服务 (standalone) ────→ 云 FaaS (cloud-faas)
   单进程                    3 进程                      云函数
```

## 快速试用

### 模式 1: 嵌入式（当前默认，零配置）

```bash
pnpm dev
# 一切照旧，转换在后台进程内执行
```

新增端点：
```
POST /mxcad/conversion/nodes/:nodeId/convert    # 触发异步转换
GET  /mxcad/conversion/nodes/:nodeId/status      # 查转换状态 {fileStatus, taskId, taskStatus}
GET  /file-system/nodes/:nodeId/history          # 版本历史
POST /file-system/download/batch-zip             # 跨节点批量 ZIP
```

### 模式 2: 独立服务

```bash
# 终端 1 — 存储服务 (port 3200)
cd packages/storage-service
FILES_DATA_PATH=../data/files BACKEND_JWT_SECRET=dev-secret node server.js

# 终端 2 — 转换服务 (port 3100)
cd packages/conversion-service
node server.js

# 终端 3 — 后端 (port 3001)
cd packages/backend
STORAGE_MODE=standalone STORAGE_SERVICE_URL=http://localhost:3200 `
FUNCTION_EXECUTOR=conversion-service CONVERSION_SERVICE_URL=http://localhost:3100 `
pnpm dev
```

检验：
```bash
curl http://localhost:3200/health     # storage-service
curl http://localhost:3100/health     # conversion-service
curl http://localhost:3001/api/health/live  # backend
```

Docker 一键启动：
```bash
docker compose -f deploy/docker-compose.standalone.yml up -d
```

### 模式 3: 云 FaaS

```bash
# 打包函数 → 部署 → 配置
cd packages/backend
FUNCTION_EXECUTOR=cloud-faas CLOUD_FAAS_PROVIDER=huawei  `
HUAWEI_FUNCTIONGRAPH_ENDPOINT=https://xxx.functiongraph.com `
HUAWEI_AK=xxx HUAWEI_SK=xxx `
pnpm dev
```

详见 `deploy/faas/deploy-huawei.sh` / `deploy-aliyun.sh` / `deploy-aws.sh`

## 代码结构速查

| 你想做什么 | 看哪里 |
|-----------|--------|
| 换转换实现方式 | `src/function-executor/` — 4 种 executor |
| 换文件存储方式 | `src/storage/` — 2 种 provider（STORAGE_MODE 分发 Flydrive/Http） |
| 改独立存储服务 | `packages/storage-service/` — 纯 JS，0 依赖 |
| 改独立转换服务 | `packages/conversion-service/` — 纯 JS，0 依赖 |
| 改云函数适配器 | `src/function-executor/cloud-faas/providers/` |
| 改异步转换端点 | `src/mxcad/conversion/async-conversion.service.ts` |
| 改下载/历史端点 | `src/file-system/file-history/` + `controllers/` |
| 看部署配置 | `deploy/` — Docker Compose, Helm, Nginx, FaaS scripts |
| 看完整迁移路书 | `deploy/MIGRATION-GUIDE.md` |

## 接口契约

### 后端 ↔ conversion-service

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/conversions/convertFile` | 同步转换（等待完成） |
| POST | `/v1/conversions/async/convertFile` | 异步转换（返回 taskId） |
| GET | `/v1/conversions/tasks/:taskId` | 查任务状态 |
| GET | `/v1/conversions/stats` | 工作池统计 |

### 后端 ↔ storage-service

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT/DELETE | `/v1/files/:path` | 文件 CRUD |
| POST | `/v1/files/upload` | 带 JWT 令牌上传 |
| POST | `/v1/svn/commit` | SVN 提交 |
| GET | `/v1/svn/history?path=` | SVN 历史 |
| GET | `/v1/svn/cat?path=&revision=` | 历史版本内容 |
| GET | `/v1/cache/stats` | 缓存命中率指标 |
| DELETE | `/v1/cache` | 清空缓存 |

## 容量规划与资源模型（决策依据）

> 以下为 mxcad 转换二进制（mxcmd）的资源画像。转换通过 `child_process.exec` 拉起独立进程执行（`src/mxcad/conversion/file-conversion.service.ts`），**一个转换进程 = 单线程、占用一个物理内核**，与多线程无关。核数/内存直接决定可同时跑的转换数。

### 单转换资源画像

| 指标 | 值 | 说明 |
|------|-----|------|
| 并发模型 | 单进程 = 1 物理内核 | 32核/64线程 CPU → 最多 **32 个并行转换**（按物理核计，超线程不增加转换并发） |
| 内存 | 最坏 ~4GB / 张（20MB 图纸） | 并非每张都吃满，因图纸而异；按最坏情况做容量预估 |
| 耗时 | ~15s / 张（20MB 图纸） | 转换结果缓存后显著更快 |
| 队列 | 先来先转，超出并行度的排队等待 | 实现为三级优先级信号量池（upload/export/thumbnail），非纯 FIFO |

### 容量估算公式

```
并行转换数上限 = 物理核数
内存需求(最坏) = 并行转换数 × 4GB
```

例：32 核 CPU 同时转 32 张 20MB 图纸，需 `32 × 4GB = 128GB` 内存。100 张并发时，32 张先转、其余排队。

### 并发控制配置（保守默认值，需按硬件调优）

| 部署模式 | 位置 | 默认并发 |
|---------|------|---------|
| embedded（单进程） | `src/function-executor/process-pool.executor.ts:31` — `RateLimiter(4)` | 4 |
| standalone（独立服务） | `packages/conversion-service/lib/constants.js:8` — `PRIORITY_CONFIG` | upload 2 / export 2 / thumbnail 1 |

调优时应使「各优先级并发之和 ≤ 物理核数」，并满足内存上限（见上方公式）。

### 预览并发（读路径，与转换无关）

多少人可同时预览一张图纸，取决于网络带宽与服务器 Web 上行性能，**不消耗转换内核**。理论上一台服务器可支撑 10W–20W 台设备并发预览。

### 决策速查

- 并发转换量大 → 提高 `maxConcurrent`（先算物理核数 × 4GB 内存是否吃得住），或切 standalone 多实例横向扩容 / 云 FaaS。
- 单实例 embedded 模式受 `RateLimiter(4)` 限制，只适合低并发/内部环境。
- 内存比核数更先成为瓶颈时（大图多），优先减并发而不是加核。

## 关键设计决策

1. **`?t=&v=` 替代 PURGE** — 文件 URL 带时间戳，Nginx/CDN/browser 视为新 URL，无需缓存失效逻辑
2. **0 外部依赖** — 两个独立服务均用纯 Node.js http 模块，无需 npm install，`node server.js` 直接运行
3. **独立信号量池** — 3 级优先级每级独立 SemaphorePool，上传不被导出阻塞
4. **`forwardRef` 消循环依赖** — `FunctionExecutorModule` ↔ `MxcadConversionModule` 双向依赖用 `@Inject(MXCAD_CONVERSION_SERVICE)` token + `forwardRef` 解决
