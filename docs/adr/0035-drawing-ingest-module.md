# 0035 — 图纸摄入深模块（Drawing Ingest deep module）
**Status**: accepted

上传/转换链长期分裂为两条并行实现：`FileConversionUploadService`（849 行 / 17 构造依赖）处理整包上传与秒传，`FileMergeService`（1151 行 / 17 构造依赖）处理分片合并与秒传预检。两个服务逐块重复同一套「把外部文件变成图纸树 FileSystemNode」的序列——父节点解析+建节点（6 处）、hash 前缀扫描改名复制（5 处）、缩略图块（3 × 50–70 行）、FileStatus 三段流转（4 处）——且 `copyFileOrDir` 顶层函数逐字重复。同概念四处写入 FileStatus（`validateTransition` 与 `updateFileStatus` 两步靠调用方自觉，`async-conversion` 直接 prisma 写绕过状态机）；`common/enums/file-status.enum.ts` 与 `@cloudcad/db` 双枚举并存，上传链以 `FileStatus.PROCESSING as any` 强转缝合。`MxcadUploadFacade` 全仓零调用。本 ADR 记录架构评审（improve-codebase-architecture，candidate「图纸摄入」）的定案，执行见 issue #196。

**Decision**

1. **引入单一深模块 `DrawingIngestService`**：作为「外部文件 → FileSystemNode」的唯一入口，取代 `FileConversionUploadService` 与 `FileMergeService` 两条并行实现。interface 收敛为两个方法：
   ```ts
   type IngestSource =
     | { kind: 'file'; filePath: string; forceUpload?: boolean }
     | { kind: 'chunks'; hash: string; chunkCount: number; skipDb?: boolean }
   interface IngestTarget { userId; parentNodeId; ownerId; srcDwgNodeId?; isImage?; conflictStrategy?; isLibrary? }
   interface IngestResult { ret: MxUploadReturn; nodeId?; tz? }
   ingest(source, target): Promise<IngestResult>
   checkExist(hash, target): Promise<IngestResult>
   ```
   分片/整包被定义为传输层差异收进 source 判别联合；秒传、格式转换、状态机流转、存储分配、缩略图生成全部收进 implementation。`MxUploadReturn` ret 码为既有线缆契约，**不变**——HTTP 端点 / DTO 不变，前端与 `@cloudcad/api-sdk` 零联动。
2. **Seam 范围**：圈住整包上传、分片合并、秒传预检三个生产入口；分片存在性检查（`chunkisExist`）留在外面（属分片传输协议，非摄入）；外部参照分支（`context.srcDwgNodeId`）保持走 `IExternalRefFacade`，作为模块内部依赖，不被摄入吞并；同步 `convertFile` 维持现有调用方式作为内部依赖，**本次不做同步→async 转换**（那是 ADR-0014/0016 的架构问题）。
3. **`NodeStatusTransitioner`**：在 `file-system/file-status/` 引入唯一方法 `transition(nodeId, from, to)`，校验 + 写入一步完成，取代「先 `validateTransition` 再 `updateFileStatus`」两步约定。它属于 Layer 2 共享原语（非 ingest 私有实现），供未来 trash / async-conversion 的绕过点接续治理；本 ADR 仅强制 ingest 链使用。
4. **FileStatus 枚举用途边界**：服务层代码统一用 `@cloudcad/db` 的 `FileStatus`（消除上传链 4 处 `as any`）；`common/enums/file-status.enum.ts` 保留但**仅用于 `@ApiProperty`/DTO**（Prisma 枚举不可直接 `@ApiProperty`，AGENTS.md 反模式表），两者显式互转。依据 ADR-0027「数据层类型唯一出口」。
5. **死代码处置**：删除生产 + 测试均零调用的 `uploadAndConvertFile`（无权限变体）、`processUploadedFile`、`createNonCadNode`、`MxcadUploadFacade`；`mergeChunksWithPermission` 生产零调用但被集成测试引用，删方法并改指向。判定标准为「生产 + 测试均无调用」，不以「看起来没用」为准。
6. **内部结构**：保留内部 seam（`FileTreeService`、`StorageManager`、`ThumbnailGenerationService`、`CacheManagerService`、`FileConversionService`、`RestrictionEngine`、`IExternalRefFacade`、`MxFileSystemService`），深度来自小 interface + 厚 implementation，不拍平内部结构；砍掉主链路从未使用的 `IVersionControl`、`UploadUtilityService` 死亡方法、重复的模块级 `copyFileOrDir`。`FileConversionService` 直接依赖，不为单一实现预造 seam（one adapter = hypothetical seam）。
7. **迁移序列**：5 步增量（清理死代码 → 提取共享块 → 组装新模块 → 切换入口 + **同一 commit 删除旧壳** → 集成测试改指向），每步独立绿（`pnpm test` + `pnpm type-check`）。第 4 步不留双实现并存，避免旧壳再养死代码。

**Guidance**

1. controller（`MxcadUploadController`、`external-ref.controller.ts`）只调 `ingest` / `checkExist`，禁止再触达模块内部服务。
2. 新增摄入逻辑一律进 `DrawingIngestService`，不另立并排服务。
3. 摄入路径的 FileStatus 写入必须走 `NodeStatusTransitioner.transition`；禁止直接 prisma 写 `fileStatus`。
4. 本地 `FileStatus` 枚举仅用于 DTO `@ApiProperty`；服务层 import 一律来自 `@cloudcad/db`。
5. 未来接入 cloud-faas 异步转换，应落在 `DrawingIngestService` 内部转换 seam 上，而不是新开第三条并行管线。
6. 活路径集成测试（`cad-upload-convert` / `workflow-1-upload-convert-open`）视为行为契约：重构只改调用目标，不改断言。

**Status**: accepted

**Cross-references**
- CONTEXT.md「图纸摄入（Drawing Ingest）」术语（本次评审落账）
- ADR-0027 共享 Prisma Client：`@cloudcad/db` 数据层类型唯一出口，本 ADR 的枚举边界依据
- ADR-0014 函数工作流服务、ADR-0016 三种部署模式：转换执行架构，本 ADR 不重开同步→async 决策
- ADR-0030 前端状态归属：唯一 writer 原则的后端对应（FileStatus 唯一 transition 入口）
- issue #196 图纸摄入重构执行（任务票，5 步序列）
