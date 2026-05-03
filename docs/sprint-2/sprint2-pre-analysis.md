# 冲刺二：上帝模块拆分预分析

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**分析范围**: `src/file-system/`（14 服务, ~7,200 行） + `src/mxcad/`（21 服务, ~7,800 行）

---

## 一、file-system 模块分析

### 1.1 服务清单

| 服务 | 行数 | 职责 | 核心依赖 |
|------|------|------|---------|
| `FileSystemService` | 516 | Facade 外观，委托子服务 | 6个子服务 + DatabaseService |
| `FileOperationsService` | **1,538** | 文件移动/复制/删除/重命名/批量操作 | DB, StorageManager, VersionControl, StorageInfo, FileTree |
| `FileTreeService` | 718 | 文件树节点创建/查询/路径解析 | DB, StorageManager, StorageInfo |
| `ProjectMemberService` | 649 | 项目成员增删改查/角色管理 | DB, Permission, AuditLog |
| `FileDownloadExportService` | 593 | 下载/导出/ZIP打包/CAD转换 | DB, Storage, StorageManager, Permission, ModuleRef(→MxCad) |
| `ProjectCrudService` | 543 | 项目/文件夹 CRUD | DB, StorageManager, Permission, PersonalSpace, FileOps, FileTree |
| `FileValidationService` | 466 | 文件类型/大小/MIME 验证 | ConfigService, RuntimeConfigService |
| `SearchService` | 421 | 全文搜索（项目/文件/资源库） | DB, Permission |
| `FileSystemPermissionService` | 394 | 节点权限检查/成员角色管理 | DB, ProjectPermissionService(Roles), FileTree(forwardRef) |
| `StorageInfoService` | 285 | 配额查询/已用空间计算 | DB, ConfigService, StorageQuotaService |
| `QuotaEnforcementService` | 150 | 上传前配额检查 | StorageInfoService |
| `FileDownloadHandlerService` | 139 | HTTP 下载响应/流式传输 | FileSystemService |
| `StorageQuotaService` | 119 | 配额类型判定/上限计算 | RuntimeConfigService |
| `FileHashService` | 71 | MD5 哈希计算 | 无（纯工具） |

### 1.2 依赖关系图（服务间）

```
FileSystemService (Facade)
  ├── ProjectCrudService
  │     ├── FileOperationsService ──→ FileTreeService, StorageInfoService
  │     ├── FileTreeService ──→ StorageInfoService
  │     └── FileSystemPermissionService ──→ FileTreeService (forwardRef)
  ├── FileTreeService
  ├── FileOperationsService
  ├── FileDownloadExportService
  │     └── FileSystemPermissionService
  │     └── [ModuleRef] MxCadService (lazy)
  ├── ProjectMemberService
  │     └── FileSystemPermissionService
  └── StorageInfoService ──→ StorageQuotaService

独立服务（无模块内依赖）:
  FileHashService, FileValidationService, SearchService,
  QuotaEnforcementService, FileDownloadHandlerService
```

### 1.3 对外部模块的依赖

| 外部模块 | 被哪些服务使用 |
|---------|-------------|
| `DatabaseModule` | 几乎所有服务（通过 DatabaseService） |
| `CommonModule` | FileOps, FileTree, ProjectCrud, FileDownloadExport, NodeCreation (StorageManager, ConfigService) |
| `RolesModule` | FileSystemPermissionService (ProjectPermissionService) |
| `StorageModule` | FileDownloadExportService (LocalStorageProvider) |
| `VersionControlModule` | FileOperationsService |
| `AuditLogModule` | ProjectMemberService |
| `PersonalSpaceModule` | ProjectCrudService |
| `RuntimeConfigModule` | 多个服务 |

---

## 二、mxcad 模块分析

### 2.1 服务清单

| 服务 | 行数 | 职责 | 核心依赖 |
|------|------|------|---------|
| `MxCadController` | **2,685** | 所有上传/下载/转换 API | MxCadService, UploadOrchestrator, ExternalReferenceHandler, etc. |
| `MxCadService` | 890 | CAD 文件操作主入口 | Facade(forwardRef), FileSystemNode, Conversion, ExternalRefUpdate, StorageManager, VersionControl |
| `FileSystemNodeService` | 802 | 节点创建/查找/并发控制 | DB, FileTreeService(file-system) |
| `FileConversionUploadService` | 652 | 上传+转换一体化流程 | MxFS, MainFileSystem, Conversion, NodeService, Cache, Storage, VersionControl, ExtRef, UploadUtil, Merge, Thumbnail |
| `FileMergeService` | 640 | 分片合并+最终存储 | MxFS, MainFileSystem, Conversion, NodeService, Cache, Storage, VersionControl, ExtRef, UploadUtil, Thumbnail |
| `NodeCreationService` | 601 | 文件系统节点创建 | DB, StorageManager, ConcurrencyManager, FileTreeService(file-system) |
| `UploadOrchestrator` | 543 | 上传流程编排 | ChunkUpload, FileCheck, NodeCreation, Conversion, ConcurrencyManager |
| `ChunkUploadService` | 511 | 分片上传/合并/清理 | ConfigService, FileUtils, ConcurrencyManager |
| `FileConversionService` | 510 | DWG→MxWeb 格式转换 | ConfigService, FileTypeDetector, RateLimiter |
| `ExternalReferenceUpdateService` | 378 | 外部参照信息更新 | ConfigService, NodeService, StorageManager |
| `SaveAsService` | 342 | CAD 另存为功能 | MainFileSystem, NodeService, StorageManager, Conversion, Permission, VersionControl, DB |
| `ThumbnailGenerationService` | 325 | 缩略图生成(MxWebDwg2Jpg) | ConfigService |
| `FileSystemService`(mx) | 258 | 本地文件 I/O（目录/文件读写） | ConfigService |
| `ExternalReferenceHandler` | 258 | 外部参照文件 HTTP 响应 | ConfigService, DB, MainFileSystem, NodeService |
| `LinuxInitService` | 235 | Linux 环境初始化 | ConfigService |
| `MxcadFileHandlerService` | 174 | 文件流式传输服务 | ConfigService, DB |
| `CacheManagerService` | 179 | 内存缓存 | ConfigService |
| `UploadUtilityService` | 138 | 上传辅助（非CAD节点创建等） | ConfigService, MxFS, MainFileSystem, NodeService, StorageManager |
| `ExternalRefService` | 127 | 外部参照目录/文件处理 | MxFS, NodeService, StorageManager |
| `FileUploadManagerFacadeService` | 116 | 上传门面（委托子服务） | 10+服务 |
| `ChunkUploadManagerService` | 103 | 分片上传状态管理 | ConfigService, MxFS, FileMergeService |
| `FileCheckService` | 98 | 文件存在性检查 | StorageCheckService, ConcurrencyManager |

### 2.2 依赖层次

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Facade & Orchestrator                              │
│  MxCadService  FileUploadManagerFacade  UploadOrchestrator   │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Business Logic                                     │
│  FileMergeService  FileConversionUploadService  SaveAsService│
│  ExternalRefService  UploadUtilityService                   │
│  ExternalReferenceUpdateService  ExternalReferenceHandler     │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Domain Services                                    │
│  FileSystemNodeService  NodeCreationService                  │
│  FileConversionService  ChunkUploadService                   │
│  ThumbnailGenerationService  ChunkUploadManagerService       │
│  FileCheckService  MxcadFileHandlerService                   │
├─────────────────────────────────────────────────────────────┤
│ Layer 0: Infrastructure                                     │
│  FileSystemService(mx)  CacheManagerService  LinuxInitService│
└─────────────────────────────────────────────────────────────┘
```

### 2.3 依赖 file-system 模块的关键点

mxcad 模块通过以下服务依赖 file-system 模块：

| mxcad 服务 | 依赖的 file-system 服务 | 用途 |
|-----------|----------------------|------|
| `FileSystemNodeService` | `FileTreeService` | 创建文件节点 |
| `NodeCreationService` | `FileTreeService` | 创建文件节点 |
| `FileMergeService` | `FileSystemService`(Facade) | 获取/操作项目文件 |
| `FileConversionUploadService` | `FileSystemService`(Facade) | 获取/操作项目文件 |
| `SaveAsService` | `FileSystemService`(Facade), `FileSystemPermissionService` | 另存为到项目 |
| `UploadUtilityService` | `FileSystemService`(Facade) | 创建非CAD节点 |
| `ExternalReferenceHandler` | `FileSystemService`(Facade) | 读取外部参照文件 |

> **关键发现**: mxcad → file-system 的依赖全部通过 FileTreeService 和 FileSystemService(Facade) 两个入口，没有直接依赖其他 file-system 内部服务。这是天然的接口边界。

---

## 三、拆分方案

### 3.1 file-system 拆分建议

#### 拆分优先级（从叶到根）

```
Phase 1 ──── 两个纯工具服务，无模块内依赖，零风险
  │
  ├── #1 FileHashModule
  │     └── FileHashService
  │
  ├── #2 FileValidationModule
  │     └── FileValidationService
  │
Phase 2 ──── 存储配额链（3个服务形成内部链，与其余服务松耦合）
  │
  ├── #3 StorageQuotaModule ─── 合并为一个模块
  │     ├── StorageQuotaService (最底层)
  │     ├── StorageInfoService (依赖 Quota)
  │     └── QuotaEnforcementService (依赖 Info)
  │
Phase 3 ──── 核心服务（被上层广泛依赖）
  │
  ├── #4 FileTreeModule ─── 被 FileOps/FilePerm/Crud 依赖
  │     └── FileTreeService
  │
Phase 4 ──── 中层层服务
  │
  ├── #5 FilePermissionModule ─── 依赖 FileTree
  │     └── FileSystemPermissionService
  │
  ├── #6 FileOperationsModule ─── 依赖 FileTree + StorageQuota
  │     ├── FileOperationsService (最大，1538行)
  │     └── ProjectCrudService (依赖 FileOps)
  │
Phase 5 ──── 上层服务
  │
  ├── #7 ProjectMemberModule ─── 依赖 FilePermission + AuditLog
  │     └── ProjectMemberService
  │
  ├── #8 FileSearchModule ─── 依赖 FilePermission
  │     └── SearchService
  │
  ├── #9 FileDownloadModule ─── 依赖 FilePermission + [MxCad lazy]
  │     ├── FileDownloadExportService
  │     └── FileDownloadHandlerService
  │
Phase 6 ──── Facade 层（最终目标：逐步废弃）
  │
  └── #10 FileSystemFacadeModule ─── 仅保留 FileSystemService Facade
        └── FileSystemService (向后兼容层)
```

#### 每个子模块的最小公开接口

```typescript
// #1 FileHashModule
export class FileHashModule {}
export class FileHashService {
  calculateHash(buffer: Buffer): Promise<string>;
  calculateHashFromStream(stream: ReadableStream): Promise<string>;
}

// #2 FileValidationModule
export class FileValidationModule {}
export class FileValidationService {
  validateFile(file: Express.Multer.File): Promise<FileValidationResult>;
  validateFileType(filename: string, mimetype: string): boolean;
  getMaxFileSize(): Promise<number>;
}

// #3 StorageQuotaModule
export class StorageQuotaModule {}
export { StorageQuotaService, StorageQuotaType };
export class StorageInfoService {
  getStorageQuota(userId, nodeId?, node?): Promise<StorageQuotaInfo>;
  getStorageQuotaLimit(node?): Promise<number>;
  determineQuotaType(node): StorageQuotaType;
}
export class QuotaEnforcementService {
  checkUploadQuota(userId, nodeId, fileSize): Promise<QuotaCheckResult>;
}

// #4 FileTreeModule
export class FileTreeModule {}
export class FileTreeService {
  createFileNode(options): Promise<PrismaFileSystemNode>;
  getNodePath(nodeId: string): Promise<string>;
  getProjectId(nodeId: string): Promise<string | null>;
  getLibraryKey(nodeId: string): Promise<string | null>;
  // ...其他树操作
}

// #5 FilePermissionModule
export class FilePermissionModule {}
export class FileSystemPermissionService {
  checkNodePermission(userId, nodeId, permission): Promise<boolean>;
  getNodeAccessRole(userId, nodeId): Promise<string | null>;
  // ...成员管理方法
}

// #6 FileOperationsModule
export class FileOperationsModule {}
export class FileOperationsService {
  moveNode(...), copyNode(...), deleteNode(...), renameNode(...);
}
export class ProjectCrudService {
  createNode(...), updateNode(...), getProject(...);
}

// #7 ProjectMemberModule
export class ProjectMemberModule {}
export class ProjectMemberService {
  getProjectMembers(...), addProjectMember(...), removeProjectMember(...);
}

// #8 FileSearchModule
export class FileSearchModule {}
export class SearchService {
  search(userId, dto): Promise<NodeListResponseDto>;
}

// #9 FileDownloadModule
export class FileDownloadModule {}
export class FileDownloadExportService {
  downloadNode(...), exportAsZip(...), exportAsCadFormat(...);
}
export class FileDownloadHandlerService {
  handleDownload(nodeId, userId, res, options?): Promise<void>;
}

// #10 FileSystemFacadeModule (deprecated target)
export class FileSystemFacadeModule {}
export class FileSystemService {
  // 所有原有方法，内部委托给子模块服务
}
```

### 3.2 mxcad 拆分建议

#### 拆分优先级

```
Phase 1 ──── 基础设施层（零或极少内部依赖）
  │
  ├── #1 MxcadInfraModule
  │     ├── FileSystemService (mx, 本地文件I/O)
  │     ├── CacheManagerService
  │     ├── ThumbnailGenerationService
  │     └── LinuxInitService
  │
  ├── #2 MxcadConversionModule ─── 文件转换
  │     └── FileConversionService
  │
Phase 2 ──── 上传基础设施
  │
  ├── #3 MxcadChunkModule ─── 分片上传
  │     ├── ChunkUploadService
  │     ├── ChunkUploadManagerService
  │     └── FileCheckService
  │
Phase 3 ──── 节点/参照服务
  │
  ├── #4 MxcadNodeModule ─── 文件系统节点
  │     ├── FileSystemNodeService
  │     └── NodeCreationService
  │     ⚠️ 依赖 file-system 的 FileTreeService
  │
  ├── #5 MxcadExternalRefModule ─── 外部参照
  │     ├── ExternalRefService
  │     ├── ExternalReferenceHandler
  │     └── ExternalReferenceUpdateService
  │     ⚠️ 依赖 FileSystemNodeService + file-system 的 FileSystemService
  │
Phase 4 ──── 复杂业务逻辑
  │
  ├── #6 MxcadUploadModule ─── 上传核心
  │     ├── FileMergeService
  │     ├── FileConversionUploadService
  │     └── UploadUtilityService
  │     ⚠️ 依赖几乎所有下层服务
  │
  ├── #7 MxcadSaveModule ─── 另存为
  │     └── SaveAsService
  │
Phase 5 ──── 编排层
  │
  ├── #8 MxcadFacadeModule
  │     ├── FileUploadManagerFacadeService
  │     └── UploadOrchestrator
  │
Phase 6 ──── 主服务 + 控制器
  │
  └── #9 MxcadCoreModule
        ├── MxCadService
        ├── MxcadFileHandlerService
        └── MxCadController (可随主模块保留)
```

#### 每个子模块的最小公开接口

```typescript
// #1 MxcadInfraModule
export class FileSystemService {        // 本地文件操作
  exists(path), createDirectory(dir), getFileSize(path),
  getChunkTempDirPath(hash), mergeChunks(...), deleteDirectory(dir);
}
export class CacheManagerService {      // 内存缓存
  get<T>(name, key, ttl?), set<T>(name, key, data),
  delete(name, key), clear(name);
}
export class ThumbnailGenerationService { // 缩略图
  generateThumbnail(mxwebPath, outputDir): Promise<ThumbnailGenerationResult>;
}
export class LinuxInitService {         // 初始化（无需导出）

// #2 MxcadConversionModule
export class FileConversionService {    // DWG→MxWeb
  convertToMxweb(inputPath, outputPath, options?): Promise<ConversionResult>;
}

// #3 MxcadChunkModule
export class ChunkUploadService {       // 分片上传
  handleChunkUpload(options): Promise<void>;
  mergeChunks(options): Promise<string>;
}
export class ChunkUploadManagerService { // 分片状态管理
  checkChunkExist(options), uploadChunk(options);
}
export class FileCheckService {         // 文件检查
  checkFileExists(hash, filename), checkFileInStorage(hash, filename);
}

// #4 MxcadNodeModule
export class FileSystemNodeService {    // 节点创建查询
  createNode(options), findById(id), findByHash(hash);
}
export class NodeCreationService {      // 节点创建
  createFileNode(options): Promise<NodeCreationResult>;
}

// #5 MxcadExternalRefModule
export class ExternalRefService {       // 外部参照处理
  getExternalRefDirName(srcDwgNodeId),
  handleExternalReferenceFile(...);
}
export class ExternalReferenceHandler {  // HTTP响应
  handleExternalReferenceRequest(nodeId, fileName, res, ...);
}
export class ExternalReferenceUpdateService { // 上传后更新
  updateAfterUpload(nodeId);
}

// #6 MxcadUploadModule
export class FileMergeService {         // 合并+存储
  mergeConvertFile(options): Promise<MergeResult>;
}
export class FileConversionUploadService { // 上传+转换
  uploadAndConvertFile(options), checkFileExist(...);
}
export class UploadUtilityService {     // 上传辅助
  createNonCadNode(...);
}

// #7 MxcadSaveModule
export class SaveAsService {            // 另存为
  saveMxwebAs(options): Promise<SaveMxwebAsResult>;
}

// #8 MxcadFacadeModule
export class FileUploadManagerFacadeService {
  checkChunkExist, uploadChunk, mergeConvertFile,
  uploadAndConvertFile, checkFileExist;
}
export class UploadOrchestrator {
  handleChunkUpload, handleFileUpload, handleMergeRequest;
}

// #9 MxcadCoreModule
export class MxCadService {             // 主服务
  checkChunkExist, uploadChunk, mergeUploadedFile,
  getPreloadingData, handleThumbnailRequest, ...;
}
export class MxcadFileHandlerService {  // 文件流服务
  serveFile(filename, res);
}
```

---

## 四、循环依赖风险分析

### 4.1 已知风险点

| # | 风险 | 涉及服务 | 风险等级 | 说明 |
|---|------|---------|---------|------|
| R1 | `FileOps ↔ FileTree` | FileOperationsService, FileTreeService | **中** | 两者已互相引用。拆分时必须同批或使用接口解耦 |
| R2 | `FilePerm ↔ FileTree` | FileSystemPermissionService, FileTreeService | **低** | 已有 forwardRef，拆分后可通过接口消除 |
| R3 | `FileDownloadExport → MxCad` | FileDownloadExportService, MxCadService | **中** | 已用 ModuleRef 懒加载。拆分后 mxcad 子模块导入 file-system 子模块时注意方向 |
| R4 | `MxCadService ↔ FileUploadManagerFacade` | MxCadService, FileUploadManagerFacadeService | **低** | 已有 forwardRef，拆分到同一层可消除 |
| R5 | `FileMerge ↔ FileConversionUpload` | FileMergeService, FileConversionUploadService | **高** | 共享大量依赖且互相调用。建议合并到一个模块 |
| R6 | `ExternalRefUpdate ↔ FileSystemNode` | ExternalReferenceUpdateService, FileSystemNodeService | **中** | 单向依赖，拆分到不同模块后注意导入方向 |
| R7 | `SaveAs → 多服务` | SaveAsService → FileSystemService, Permission, Conversion, VersionControl | **中** | 跨模块依赖多，适合最后拆分 |

### 4.2 新循环依赖预防规则

1. **禁止下层模块导入上层模块**：严格遵守 Phase 1→6 的层级顺序
2. **file-system 子模块间只允许单向导入**：如 FileOps → FileTree 允许，FileTree → FileOps 禁止
3. **mxcad 子模块导入 file-system 子模块的接口而非实现**：优先使用冲刺一建立的 `USER_SERVICE` 模式
4. **共享类型/DTO 提取到 `common/interfaces/`**：避免模块间因类型定义产生循环 import
5. **每个拆分完成后立即运行 `npx tsc --noEmit` 验证**

### 4.3 跨模块依赖矩阵（拆分后）

拆分后 mxcad 子模块与 file-system 子模块的预期依赖：

```
MxcadNodeModule ────────→ FileTreeModule (FileTreeService)
MxcadExternalRefModule ──→ FileTreeModule (FileSystemService Facade)
MxcadUploadModule ──────→ FileTreeModule + FileSystemFacade
MxcadSaveModule ────────→ FileTreeModule + FilePermissionModule + FileSystemFacade
```

> 所有 mxcad → file-system 的依赖都应通过 file-system 的 Facade 或明确的公共接口，禁止直接依赖 file-system 的内部实现服务。

---

## 五、拆分顺序总览

```
               file-system                      mxcad
               ────────────                     ──────
Week 1:  #1 FileHash              │  #1 MxcadInfra
         #2 FileValidation        │  #2 MxcadConversion
         #3 StorageQuota          │
         ─────────────────────────────────────────
Week 2:  #4 FileTree              │  #3 MxcadChunk
         #5 FilePermission        │  #4 MxcadNode
         #6 FileOperations        │
         ─────────────────────────────────────────
Week 3:  #7 ProjectMember         │  #5 MxcadExternalRef
         #8 FileSearch            │  #6 MxcadUpload
         #9 FileDownload          │  #7 MxcadSave
         ─────────────────────────────────────────
Week 4:  #10 FileSystemFacade     │  #8 MxcadFacade
         (含向后兼容验证)           │  #9 MxcadCore
         ─────────────────────────────────────────
```

### 推荐执行顺序（交错进行以降低风险）

1. **file-system #1 (FileHash)** + **file-system #2 (FileValidation)** — 两个纯叶节点，同时进行
2. **mxcad #1 (MxcadInfra)** + **mxcad #2 (MxcadConversion)** — 与 file-system 无交叉依赖
3. **file-system #3 (StorageQuota)** — 独立的配额链
4. **file-system #4 (FileTree)** — 核心依赖，拆分后立即验证上层
5. **file-system #5 (FilePermission)** + **#6 (FileOperations)** — 依赖 FileTree
6. **mxcad #3 (MxcadChunk)** + **#4 (MxcadNode)** — Node 依赖 FileTree，此时 FileTree 已独立
7. **file-system #7 (ProjectMember)** + **#8 (FileSearch)** + **#9 (FileDownload)**
8. **mxcad #5 (MxcadExternalRef)** + **#6 (MxcadUpload)** + **#7 (MxcadSave)**
9. **mxcad #8 (Facade)** + **#9 (Core)** + **file-system #10 (Facade)**

---

## 六、关键指标

| 指标 | 当前 | 拆分后目标 |
|------|------|-----------|
| file-system 模块服务数 | 14 | 每子模块 ≤3 服务 |
| mxcad 模块服务数 | 21 | 每子模块 ≤3 服务 |
| file-system 最大文件行数 | 1,538 (FileOperations) | 保持，但隔离到专用模块 |
| mxcad 最大文件行数 | 2,685 (Controller) | Controller 随 Core 保留 |
| 跨模块 forwardRef | 7 处 | → 0 处（通过接口消除） |
| 新增子模块数 | - | file-system: 10, mxcad: 9 |
