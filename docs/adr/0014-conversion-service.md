# Extract conversion engine into standalone conversion service
**Status**: accepted

Supersedes ADR-0001 which merged conversion-engine into the backend. In production we face high-concurrency drawing conversions that need elastic scaling independent of the main API server — something a subprocess within the backend cannot provide.

We are extracting `src/conversion/` into an independent service (`packages/conversion-service/`) with a single `convertFile(source, targetFormat)` entry point, multi-level priority queues, and three deployment modes:

- **Embedded** — bundled back into the backend as a NestJS module for single-server TOB customers (no extra process or dependency)
- **Standalone** — independent HTTP service with Redis queue + Docker worker pool for on-prem multi-node deployments
- **Cloud FaaS** — delegates execution to Huawei FunctionGraph / Alibaba FC / AWS Lambda via an `IFunctionExecutor` adapter, triggered by APIGateway HTTP (not OBS/S3)

**Considered Options**

- **Keep subprocesses in backend (ADR-0001).** Pro: simplest for small customers. Con: no elastic scaling, max concurrency locked to `min(CPU,4)`, `convertFileAsync` remained a stub for years.
- **Extract as standalone microservice only.** Pro: clean architecture. Con: every small TOB customer must deploy an extra process; adoption friction.
- **Three-mode extraction (selected).** Pro: small customers get zero-dependency single-binary, large customers get elastic scalability, cloud customers pay-per-use with no infra management. Con: three code paths to maintain — mitigated by sharing 90%+ logic behind `IFunctionExecutor`.

**Consequences**
- `IConversionService` / `I_CONVERSION_SERVICE` DI token evolves into `IFunctionExecutor` with multiple implementations
- Task state authority lives in the conversion service, not in the backend DB or storage service
- ADR-0001's `src/conversion/` source is fully migrated out; the embedded mode re-imports it as a dependency
- **Unified conversion path.** The old `mxcad/conversion/` (child_process.exec, no retry) is retired. All conversion goes through `conversion/` (child_process.spawn + semaphore + timeout + retry). The `IFunctionExecutor` wraps only the unified path.

### IFunctionExecutor 接口设计

```typescript
interface IFunctionExecutor {
  invoke(task: ConversionTask): Promise<ConversionResult>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
}
```

所有部署模式（embedded/standalone/cloud-faas）共享此接口。实现类：
- `ProcessPoolExecutor` — embedded，子进程池 + semaphore
- `HttpConversionExecutor` — standalone，HTTP 客户端调 conversion-service 服务
- `CloudFaaSExecutor` — cloud，HTTP 客户端调 FaaS 端点

### API 契约（Standalone 模式）

Conversion Service 暴露的 HTTP API：

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/v1/conversions/convertFile` | 同步转换 |
| POST | `/v1/conversions/async/convertFile` | 异步转换，返回 taskId |
| GET | `/v1/conversions/tasks/{taskId}` | 任务状态查询 |
| POST | `/v1/conversions/batchConvert` | 批量转换 |

### 任务状态与一致性模型

**最终一致性（Final consistency）**。任务状态的权威源在 Conversion Service，不在后端 DB：

```
PENDING → PROCESSING → COMPLETED / FAILED
```

- Backend 提交任务后通过回调或轮询获知结果
- `FileSystemNode` 新增可选 `taskId` 字段记录正在处理中的转换任务
- 定时 reconciler 扫描 stuck `PROCESSING` 记录并恢复

### 三级优先级队列

三个独立信号量池，由环境变量配置：

| 级别 | 用途 | 默认并发 | 反压阈值 | 超载行为 |
|------|------|---------|---------|---------|
| 1 | 上传转换 | `min(CPU, 4)` | 排队 10 → 告警 | 阻塞等待 |
| 2 | 导出/PDF | `min(CPU, 2)` | 排队 20 → 告警 | 自动降级为异步 |
| 3 | 缩略图/批量 | `min(CPU, 2)` | 排队 50 → 告警 | 丢弃最旧任务 |

### Configuration

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `FUNCTION_EXECUTOR` | `process-pool` | 执行模式：`process-pool` / `conversion-service` / `cloud-faas` |
| `CONVERSION_SERVICE_URL` | — | Conversion Service 地址（standalone 模式） |
| `CLOUD_FAAS_PROVIDER` | — | 云 FaaS 提供商：`huawei` / `aliyun` / `aws` |
| `QUEUE_DRIVER` | `local` | 任务队列后端：`local` / `redis` |

---

## Amendment 1 (2026-08-03)：统一转换路径落地修正

**背景**：本 ADR 的 "Unified conversion path" 段落规划 `src/conversion/`（`IConversionService`/`ProcessRunnerService`，spawn + semaphore + retry）为 embedded 模式统一转换路径，`mxcad/conversion/`（child_process.exec）退役。但该规划从未落地：

- `src/conversion/` 模块（`FormatConverterService`）使用 `-i/-o/-f` 短参风格调用 mxcadassembly，与真实二进制契约（JSON 单参：`mxcadassembly.exe "{json}"`）不一致，且因无消费方从未被验证；实际转换链路始终绑定 `mxcad/conversion/`（`FileConversionService`）。
- `config/conversion.*` 配置键（binPath/outputRoot/maxConcurrency/defaultTimeoutMs）与生产消费方 `FileConversionService` 期望的 `mxcad.*` 键名不一致，导致环境变量（`MXCAD_ASSEMBLY_PATH` 等）实际从未生效。

**决策**：
1. **`mxcad/conversion/`（`FileConversionService`，JSON 契约）确认为统一转换路径**，`IFunctionExecutor` 的 embedded 实现（`ProcessPoolExecutor`）继续委托它。
2. **删除 `src/conversion/` 模块**（含 `IConversionService`/`ProcessRunnerService`/`OutputPathResolverService` 及 test mock）。`I_CONVERSION_SERVICE` token 的演进方向（→ `IFunctionExecutor`）维持不变。
3. **配置键对齐**：`config/conversion.*` 重命名为 `config/mxcad.*`（`assemblyPath`/`fileExt`/`compression`），修复 `MXCAD_ASSEMBLY_PATH`/`MXCAD_FILE_EXT`/`MXCAD_COMPRESSION` 环境变量从未被生产路径消费的问题；删除无人消费的 `outputRoot`/`maxConcurrency`/`defaultTimeoutMs` 键。
4. **执行层升级（未来可选）**：`FileConversionService` 的 `exec` 内核（`maxBuffer` 溢出风险、无超时强杀/重试）可在不改变接口的前提下渐进替换为 spawn + SIGTERM/SIGKILL + retry 实现，无需恢复 `src/conversion/` 模块。
