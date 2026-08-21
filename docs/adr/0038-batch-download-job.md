# 0038 — 批量下载任务生命周期（Batch Download Job）
**Status**: accepted

批量下载任务的状态机知识散在 4 个文件且互相独立：终态集合 `SseManager.isActive`（`['PENDING','PROCESSING']`，sse-manager.ts L109-111）与 `cancelTask`（`['COMPLETED','CANCELLED','FAILED']`，batch-download.service.ts L140）各自硬编码；状态写入有 5+ 处（`JobContext.load` 写 PROCESSING、`finalizeCompleted` 写 COMPLETED、`finalizeFailed` 写 FAILED/COMPLETED、`handleAbort` 写 CANCELLED、`cancelTask` 直写 CANCELLED、orchestrator catch 写 FAILED）。存在取消竞态：`cancelTask` 直写 CANCELLED 后，in-flight 的 `processJob` 若已越过 abort 检查点，稍后 `finalizeCompleted` 会把 CANCELLED 覆盖成 COMPLETED——无集中终态仲裁。`JobContext` 是手工 `new` 的 9 参可变状态袋，承担状态迁移、ZIP 条目、错误日志、清理、进度发射，调用方必须按严格顺序调用（load→处理→目录→错误日志→清理→归档→finalize），且 `batch-download.service.spec` 因构造时 `fsPromises.mkdir` 被迫模块级 mock fs。`batch-download.types.ts` 的 `BatchJobStatus` 字符串联合与 Prisma 枚举（`@cloudcad/db`）重复。本 ADR 记录架构评审（improve-codebase-architecture，candidate「批量下载任务」）定案，执行见 issue。

**Decision**

1. **引入 `BatchDownloadJob` 深模块（落 `batch-download/`）拥有整个任务生命周期**：
   ```ts
   start(jobId): Promise<void>              // 内部创建 JobContext（不再手工 new 9 参）
   cancel(jobId): Promise<void>             // abort + transition(CANCELLED) 一步完成
   transition(to, payload?): Promise<void>  // 校验 + 写库 + 发事件，唯一状态写入权威
   isTerminal(status) / isActive(status)    // 终态集合单一来源
   ```
   `JobContext` 收进 implementation（调用顺序契约变为模块内部序列）；处理循环查 `job.isTerminated()` 取代 `ctx.isAborted()`；AbortController 为内部细节。转换/归档处理逻辑保留在 orchestrator / conversion-runner，模块只驱动生命周期。
2. **终态仲裁：首达终态者胜**。模块为每个 job 持有内存权威状态；`transition(to)` 先查内存，已终态则拒绝（不落库、不发事件）；`cancel(jobId)` = 设内存 CANCELLED + abort + 落库一步。JS 单线程保证「查内存 → 落库」原子序，先到的终态写库、后到的在同一检查点被拒，消除取消竞态。所有状态写入一律经 `transition`，禁止直接 `batchDownloadJob.status` 更新。
3. **枚举来源**：删除 `batch-download.types.ts` 的 `BatchJobStatus` 字符串联合，全模块改用 `@cloudcad/db` 的 `BatchJobStatus`（无 `@ApiProperty` 消费，不需本地枚举例外）；`job.status as BatchJobStatus` 强转一并消失。依据 ADR-0027。
4. **scope**：seam 只圈任务生命周期。转换执行（conversion-runner）、ZIP 归档（archive-writer）、权限（FolderExpander/FileSystemPermissionService）不并入。
5. **旧同步实现隔离**：`CrossNodeDownloadService`（file-system）不在本 ADR 范围——`source-audit-2026-08-03` 判定其为活跃 WIP（权限增强 ForbiddenException + IPROJECT_PERMISSION_SERVICE 注入 + 新增 spec），不清理、不并线，避免与并行开发冲突。

**Guidance**

1. 批量下载任务状态一律经 `BatchDownloadJob.transition` 写入；禁止在 service/orchestrator 内直接 `prisma.batchDownloadJob.update({ status })`。
2. 终态/活跃判定从模块取（`isActive` / `isTerminal`），禁止在消费方重现状态集合。
3. 新增任务生命周期消费方（如定时清理、过期扫描）走模块 interface。
4. `BatchJobStatus` 类型一律来自 `@cloudcad/db`，禁止新造本地联合。
5. 处理循环 finalize 前必须查 `job.isTerminated()`，不得直接依赖 AbortController 信号。

**Status**: accepted

**Cross-references**
- CONTEXT.md「批量下载任务（Batch Download Job）」术语（本次评审落账）
- ADR-0027 共享 Prisma Client：`@cloudcad/db` 枚举来源依据
- `source-audit-2026-08-03`：`CrossNodeDownloadService` 活跃 WIP 判定，本 ADR 隔离依据
- 执行任务票：issue #199 批量下载任务生命周期执行（6 步序列）
