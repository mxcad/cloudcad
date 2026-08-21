# 批量下载模块（batch-download）

## 概述

批量下载模块支持用户一次性选择多个文件/文件夹（可指定原始、mxweb、pdf、dwg、dxf 等输出格式），后端异步生成 ZIP 压缩包并提供下载。核心能力：

- **异步任务**：创建任务后立即返回 `taskId`，后台执行文件收集与格式转换，不阻塞 HTTP 请求。
- **进度推送**：通过 SSE（Server-Sent Events）实时推送进度，同时支持普通 JSON 轮询。
- **格式转换**：DWG→PDF/DWG/DXF 转换支持「委托 conversion-service 批量转换」与「进程内 mxcad 转换」双模式，带熔断回退与信号量限流。
- **文件夹展开**：任务中可包含文件夹节点，递归展开为文件清单，ZIP 内保留目录结构。
- **自动清理**：定时任务清理过期 ZIP 文件与 DB 记录。

模块入口 `file-system/batch-download`，受全局 JWT 认证保护，且创建任务需运行时配置 `batchDownloadEnabled` 开启。

## 目录结构

```
src/batch-download/
├── batch-download.module.ts          # 模块定义（依赖 13 个外部模块）
├── batch-download.controller.ts      # 控制器：6 个 HTTP 端点
├── batch-download.service.ts         # 服务：任务创建/进度/取消/下载/任务列表
├── batch-download-job.ts             # 任务生命周期深模块（ADR-0038）：状态机 + 终态仲裁
├── batch-download-orchestrator.ts    # 编排器：逐项处理文件（原样入包 / 提交转换）
├── conversion-runner.ts              # 转换执行器：委托 workflow + 进程内转换双路径
├── folder-expander.service.ts        # 文件夹递归展开 + 权限校验
├── progress-tracker.service.ts       # 进度事件发射（EventEmitter2）+ 计数落库
├── sse-manager.ts                    # SSE 流式进度推送（事件订阅 + 5s 轮询兜底）
├── archive-writer.ts                 # ZIP 打包（archiver，tmp 文件 + 原子 rename）
├── job-context.ts                    # 任务运行期上下文（状态/计数/归档条目/错误收集）
├── batch-download.types.ts           # 进度事件类型 BatchProgressEvent
├── batch-download-cleanup.service.ts # 定时清理（过期 ZIP / 过期 DB 记录）
├── dto/
│   └── create-batch-download.dto.ts  # 创建任务 DTO 及响应/进度 DTO
└── *.spec.ts                         # 10 个单元测试文件（含委托模式集成测试）
```

> 注：委托 conversion-service 的逻辑直接内置于 `conversion-runner.ts`（开关 `delegateWorkflow`），不存在独立的 `conversion-runner.delegate.ts` 生产文件；`conversion-runner.delegate.spec.ts` 是用真实 HTTP server 测试委托路径的测试文件。

## 核心组件详解

### 1. BatchDownloadModule（batch-download.module.ts）

依赖注入 `ConfigModule`、`DatabaseModule`、`StorageModule`、`CommonModule`、`PermissionModule`、`StorageManagementModule`、`FileSystemModule`、`AuthModule.forRoot()`、`MxCadModule`、`AuditLogModule`、`RuntimeConfigModule`、`AlertModule`、`TaskRunModule`。注册控制器与 9 个 provider；导出 `BatchDownloadService`、`FolderExpanderService`、`ProgressTrackerService` 供其他模块使用。

### 2. BatchDownloadController（batch-download.controller.ts）

路由前缀 `file-system/batch-download`，全部端点要求认证（`req.user.id`，缺失抛 401）。

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/file-system/batch-download` | 创建批量下载任务（需 `batchDownloadEnabled` 开关，关闭抛 403） |
| GET | `/file-system/batch-download/:taskId/progress` | 任务进度：`Accept: text/event-stream` 时走 SSE 流，否则返回 JSON |
| GET | `/file-system/batch-download/:taskId/download` | 下载 ZIP（仅 COMPLETED 且文件存在，流式传输） |
| POST | `/file-system/batch-download/:taskId/cancel` | 取消任务（返回 200 + `{ message }`） |
| GET | `/file-system/batch-download/tasks` | 当前用户最近 20 个任务（按创建时间倒序） |
| GET | `/file-system/batch-download/folder/:nodeId/files` | 递归返回文件夹下全部文件节点树（供前端勾选） |

### 3. BatchDownloadService（batch-download.service.ts）

- **createTask**：校验 fileList 非空 → 权限校验（`libraryType=drawing/block` 时校验 `LIBRARY_DRAWING_MANAGE`/`LIBRARY_BLOCK_MANAGE` 系统权限并解析公共库根节点；普通模式校验所有文件同属一个项目）→ 磁盘空间检查（`minDiskSpace`，默认 500MB，不足抛 503）→ 建 PENDING 任务（`totalCount = Σ formats.length`）→ 异步 `batchDownloadJob.start()` → 返回 `{ taskId }`。
- **getProgress / getUserTasks**：校验任务归属（非本人抛 403），返回 `BatchProgressEvent`。
- **cancelTask**：终态任务不可取消；调用 `BatchDownloadJob.cancel()`（AbortController 中止 + CANCELLED 状态转换）。
- **getDownloadPath**：仅 COMPLETED 任务返回 ZIP 绝对路径，校验文件未过期/删除。
- **getProgressForSse**：委托 `SseManager.streamProgress`。

### 4. BatchDownloadJob（batch-download-job.ts）— 生命周期深模块

任务状态机（Prisma 枚举 `BatchJobStatus`）：

```
PENDING ──> PROCESSING ──> COMPLETED
                    │          ├──> FAILED（全部失败）
                    │          └──> CANCELLED（用户取消/中止）
```

- **终态仲裁（首达终态者胜）**：每个 job 持有内存权威状态（`activeJobs: Map<jobId, JobRuntime>`），所有状态写入一律经 `transition()`——内存或 DB 已终态则拒绝转换（不落库、不发事件）。
- **start**：创建 `AbortController` + `JobContext`，异步执行 `processJob`。
- **processJob 流程**：`ctx.load()`（展开文件夹、计算 `realTotalCount`、transition→PROCESSING）→ 若 `conversionRunner.isDelegated()` 走 `orchestrator.processDelegated`（原文件即时入包、需转换项收集后一次批量提交），否则逐项 `orchestrator.processItem` → 检查中止（`ctx.handleAbort()`）→ `addEmptyDirectories` + `cleanupConvertedFiles` → **全失败判定**（`errorCount > 0` 且 `completedCount === errorCount`）则 `finalizeFailed`（FAILED，不产 ZIP）→ 否则 `addErrorLog`（有错误时 ZIP 内附 `error.json`）→ `createArchive` 成功则 `finalizeCompleted`（COMPLETED + zipPath/zipSize/expiresAt=24h，若终态仲裁拒绝则删除孤儿 ZIP），无归档条目则 `finalizeFailed`；异常兜底 `ctx.fail()`（FAILED）。

### 5. BatchDownloadOrchestrator（batch-download-orchestrator.ts）

- 每个节点查询 `fileSystemNode`（非 FILE 或缺失 path 记入错误）；`getFormats` 决定输出格式。
- `original` / `mxweb` 格式直接以流方式加入 `archiveEntries`（ZIP 内保留 `relativePath` 目录前缀）；文件名经 `sanitizeZipName` 清洗（控制字符/超长/重名 `(n)` 后缀）。
- 转换格式：PDF 默认 `width/height=2000`、`colorPolicy=mono`；DWG/DXF 可带 `dwgVersion`。
- 委托路径：`convertMany` 一次提交全部转换任务，结果按序回填 `archiveEntries` / `errors`，每项 `completedCount++` 并 `emitProgress`。

### 6. ConversionRunner（conversion-runner.ts）— 转换执行与委托机制

由配置 `delegateWorkflow`（默认 false）决定转换路径：

- **委托 conversion-service 模式**：一次性 `POST /v1/conversions/batchConvert` 提交任务列表（每个任务 id = `nodeId:format`），轮询 `GET /v1/conversions/tasks/:taskId`（轮询间隔默认 1500ms、总超时默认 10min、单次 HTTP 超时 min(10min, 60s)），终态后按任务 id 回填结果；携带 `X-Conversion-Service-Secret` 头认证。workflow 不可达（HTTP 错误/超时/无结果）时**熔断 60s**（`workflowCooldownUntil`）并逐任务回退进程内转换。
- **进程内模式**：通过 `MXCAD_CONVERSION_SERVICE` DI token 调用 mxcad `convertServerFile`，Semaphore 限流（`maxConcurrency`，默认 3），输出写回源文件同目录，再校验产物存在。
- **转换频率限制（ADR-0043）**：每个转换任务经 `RestrictionEngine.reserveConversionCountOrThrow` 占位一次，超限（QuotaExceededException）返回失败结果不中断其余任务；失败任务释放占位。
- `cleanupConvertedFile`：任务结束后删除转换产物。

### 7. FolderExpanderService（folder-expander.service.ts）

- **expandFolderItems**：遍历 fileList，FILE 节点原样保留；文件夹节点 BFS 递归收集子文件（继承格式），记录目录路径 `dirPaths`（ZIP 中保留空目录），子文件带 `relativePath`。
- **getFolderFilesRecursive**：供前端展示，项目内节点校验 `FILE_OPEN` 项目权限，返回 `{ nodeId, fileName, isFolder, children }` 递归树。

### 8. ProgressTrackerService + SseManager（进度推送机制）

- 转换计数定期落库（`syncCounts`），进度事件通过 EventEmitter2 发到频道 `batch-download.progress.{taskId}`（`emitProgress`）。
- **SseManager.streamProgress**：认证支持 `req.user` 或 URL `?token=<JWT>`（无效返回 401）→ 设置 SSE 头（`text/event-stream`、`X-Accel-Buffering: no`）→ 先发初始状态 → 订阅事件频道（终态事件即 `res.end()`）→ **5s 轮询兜底**（防事件丢失，检测到终态主动结束）→ 请求关闭时清理订阅与定时器。双通道保证进度不丢。

### 9. ArchiveWriter（archive-writer.ts）

archiver 打 ZIP：写入 `${archiveName}.zip.tmp`，`close` 后原子 `rename` 为最终文件；出错清理 tmp。压缩级别取 `fileLimits.zipCompressionLevel`（默认 1）。

### 10. JobContext（job-context.ts）

任务运行期上下文：`completedCount/errorCount/realTotalCount`、`archiveEntries`、`convertedFiles`、`errors`、`dirSet`、`userId`（转换频率限制按发起用户计数）。提供 `load/transition/handleAbort/syncCounts/emitProgress/recordError/getFormats/sanitizeZipName/addEmptyDirectories/addErrorLog/createArchive/finalizeCompleted/finalizeFailed/fail/cleanupConvertedFiles`。`finalizeFailed` 的特殊规则：`completedCount === errorCount`（全部失败）时置 FAILED，否则仍 COMPLETED（部分失败允许下载）。

### 11. BatchDownloadCleanupService（batch-download-cleanup.service.ts）

| 定时任务 | 频率 | 行为 |
|---------|------|------|
| `cleanupExpiredZips` | 每小时（`EVERY_HOUR`） | 删除 COMPLETED 且 `completedAt` 超过 `zipRetentionHours`（默认 24h）的 ZIP 文件 |
| `cleanupExpiredDbRecords` | 每天零点（`EVERY_DAY_AT_MIDNIGHT`） | 删除 `createdAt` 超过 `dbRetentionDays`（默认 7d）的任务记录 |

- 开关：运行时配置 `TASK_ENABLED_KEYS.BATCH_DOWNLOAD`（默认 true）。
- 两个裸执行方法注册到 `TaskRunService`（#210 手动触发）。
- 失败时经 `AlertService` 上报 `task_run_failed` 告警（`source=scheduler:batch-download`，CRITICAL）。

## 数据模型

表 `batch_download_jobs`（模型 `BatchDownloadJob`，schema 单一源在 `packages/db`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String cuid | 主键（即 taskId） |
| userId | String | 发起用户 |
| projectId | String? | 所属项目（库下载时为库根） |
| status | BatchJobStatus | PENDING / PROCESSING / COMPLETED / FAILED / CANCELLED |
| fileList | Json | 请求的文件清单（展开前的 BatchFileItem[]） |
| totalCount / completedCount / errorCount | Int | 进度计数（totalCount 在展开后更新为 realTotalCount） |
| zipPath / zipSize | String? / Int? | 打包产物（相对 exportDir） |
| errors | Json? | 错误明细 `{ nodeId, fileName, error }[]` |
| createdAt / completedAt / expiresAt | DateTime | 生命周期时间（expiresAt = completedAt + 24h） |

索引：`userId`、`status`、`createdAt`、`expiresAt`。

## 配置项（`batchDownload` 块）

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `BATCH_DOWNLOAD_EXPORT_DIR` | `data/exports` | ZIP 输出目录 |
| `BATCH_DOWNLOAD_MIN_DISK_SPACE` | 524288000（500MB） | 创建任务最小剩余磁盘 |
| `BATCH_DOWNLOAD_ZIP_RETENTION_HOURS` | 24 | ZIP 保留时长 |
| `BATCH_DOWNLOAD_DB_RETENTION_DAYS` | 7 | DB 记录保留天数 |
| `BATCH_DOWNLOAD_MAX_CONCURRENCY` | 3 | 进程内转换并发上限 |
| `BATCH_DOWNLOAD_DELEGATE_WORKFLOW` | false | 是否委托 conversion-service 批量转换 |
| `CONVERSION_SERVICE_URL` | `http://localhost:3100` | conversion-service 地址 |
| `BATCH_DOWNLOAD_WORKFLOW_POLL_INTERVAL_MS` | 1500 | workflow 轮询间隔 |
| `BATCH_DOWNLOAD_WORKFLOW_TIMEOUT_MS` | 600000 | workflow 总超时 |

运行时配置：`batchDownloadEnabled`（创建任务开关，默认 false）、`TASK_ENABLED_KEYS.BATCH_DOWNLOAD`（清理任务开关，默认 true）。

## 测试

10 个 spec 文件：`batch-download.controller.spec.ts`、`batch-download.service.spec.ts`、`batch-download-job.spec.ts`、`batch-download-orchestrator`（无独立 spec，覆盖在 job/service 内）、`conversion-runner.spec.ts`、`conversion-runner.delegate.spec.ts`（真实 HTTP server 验证委托 + 熔断回退）、`folder-expander.service.spec.ts`、`progress-tracker.service.spec.ts`、`archive-writer.spec.ts`、`sse-manager.spec.ts`、`batch-download-cleanup.service.spec.ts`。运行：

```bash
pnpm test -- --testPathPattern="batch-download"
```
