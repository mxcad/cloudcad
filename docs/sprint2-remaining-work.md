# 冲刺二完成后的剩余工作清单

**日期**: 2026-05-02
**分支**: refactor/circular-deps
**分析范围**: `src/file-system/` + `src/mxcad/`

---

## 一、file-system 模块拆分状态

### 1.1 计划 vs 实际完成对比

| # | 计划子模块 | 计划包含服务 | 实际完成 | 实际位置 |
|---|-----------|------------|---------|---------|
| 1 | FileHashModule | FileHashService | ✅ 完成 | `file-system/file-hash/` |
| 2 | FileValidationModule | FileValidationService | ✅ 完成 | `file-system/file-validation/` |
| 3 | StorageQuotaModule | StorageQuotaService, StorageInfoService, QuotaEnforcementService | ✅ 完成 | `file-system/storage-quota/` |
| 4 | FileTreeModule | FileTreeService | ✅ 完成 | `file-system/file-tree/` |
| 5 | FilePermissionModule | FileSystemPermissionService | ✅ 完成 | `file-system/file-permission/` |
| 6 | FileOperationsModule | FileOperationsService, ProjectCrudService | ✅ 完成（外部目录） | `src/file-operations/` |
| 7 | ProjectMemberModule | ProjectMemberService | ✅ 完成 | `file-system/project-member/` |
| 8 | FileSearchModule | SearchService | ⚠️ 未完成 | 仍在 `file-system/services/search.service.ts` |
| 9 | FileDownloadModule | FileDownloadExportService, FileDownloadHandlerService | ⚠️ 未完成 | Export 在 `file-system/services/`，Handler 在 `file-system/` 根目录 |
| 10 | FileSystemFacadeModule | FileSystemService | ⚠️ 未完成（部分） | 仍在 `file-system/file-system.service.ts` |

**拆分完成率**: 7/10 = **70%**

---

### 1.2 尚未拆分的服务文件

| 服务文件 | 当前路径 | 计划归属 | 说明 |
|---------|---------|---------|------|
| `SearchService` | `file-system/services/search.service.ts` | FileSearchModule | 待拆分为独立子模块 |
| `FileDownloadExportService` | `file-system/services/file-download-export.service.ts` | FileDownloadModule | 与 handler 合并拆分 |
| `FileDownloadHandlerService` | `file-system/file-download-handler.service.ts` | FileDownloadModule | 待合并到下载子模块 |
| `FileSystemService` (Facade) | `file-system/file-system.service.ts` | FileSystemFacadeModule | 保留为向后兼容层，暂无需迁移 |

**说明**: `FileSystemService` 作为 Facade 层，按计划是最后处理的目标，当前保留在原位置符合预期。其余 3 个服务（SearchService, FileDownloadExportService, FileDownloadHandlerService）应进一步拆分。

---

### 1.3 已完成子模块汇总

```
file-system/
├── file-hash/                      ✅ Phase 1 (FileHashModule)
│   ├── file-hash.module.ts
│   └── file-hash.service.ts
├── file-validation/                 ✅ Phase 1 (FileValidationModule)
│   ├── file-validation.module.ts
│   ├── file-validation.service.ts
│   └── file-validation.service.spec.ts
├── storage-quota/                   ✅ Phase 1 (StorageQuotaModule)
│   ├── storage-quota.module.ts
│   ├── storage-quota.service.ts
│   ├── storage-info.service.ts
│   └── quota-enforcement.service.ts
├── file-tree/                       ✅ Phase 2 (FileTreeModule)
│   ├── file-tree.module.ts
│   └── file-tree.service.ts
├── file-permission/                 ✅ Phase 2 (FilePermissionModule)
│   ├── file-permission.module.ts
│   └── file-system-permission.service.ts
├── project-member/                  ✅ Phase 2 (ProjectMemberModule)
│   ├── project-member.module.ts
│   └── project-member.service.ts
├── services/                        ⚠️ 待拆分
│   ├── file-download-export.service.ts    → FileDownloadModule
│   ├── search.service.ts                   → FileSearchModule
│   └── index.ts
├── file-system.service.ts          ⚠️ Facade（最终目标）
├── file-download-handler.service.ts  ⚠️ → FileDownloadModule
└── file-system.module.ts           父模块（已挂载 5 个子模块）
```

> `FileOperationsModule` 已拆分至外部目录 `src/file-operations/`（符合计划 Phase 6 的 FileOperationsModule），父模块通过 import 使用。

---

## 二、mxcad 模块拆分状态

### 2.1 计划 vs 实际完成对比

| # | 计划子模块 | 计划包含服务 | 实际完成 | 实际位置 |
|---|-----------|------------|---------|---------|
| 1 | MxcadInfraModule | FileSystemService(mx), CacheManagerService, ThumbnailGenerationService, LinuxInitService | ✅ 完成 | `mxcad/infra/` |
| 2 | MxcadConversionModule | FileConversionService | ✅ 完成 | `mxcad/conversion/` |
| 3 | MxcadChunkModule | ChunkUploadService, ChunkUploadManagerService, FileCheckService | ⚠️ 部分完成 | `mxcad/chunk/` (缺 ChunkUploadManagerService) |
| 4 | MxcadNodeModule | FileSystemNodeService, NodeCreationService | ✅ 完成 | `mxcad/node/` |
| 5 | MxcadExternalRefModule | ExternalRefService, ExternalReferenceHandler, ExternalReferenceUpdateService | ✅ 完成 | `mxcad/external-ref/` |
| 6 | MxcadUploadModule | FileMergeService, FileConversionUploadService, UploadUtilityService, ChunkUploadManagerService | ⚠️ 未完成 | 仍在 `mxcad/services/` |
| 7 | MxcadSaveModule | SaveAsService | ✅ 完成 | `mxcad/save/` |
| 8 | MxcadFacadeModule | FileUploadManagerFacadeService, UploadOrchestrator | ⚠️ 部分完成 | `mxcad/facade/` (缺Facade) |
| 9 | MxcadCoreModule | MxCadService, MxcadFileHandlerService, MxCadController | ⚠️ 未完成 | 仍在 `mxcad/` 根目录 |

**拆分完成率**: 6/9 = **67%**（按子模块计），或服务完成比例约 67% (14/21)

---

### 2.2 尚未拆分的服务文件

| 服务文件 | 当前路径 | 计划归属 | 说明 |
|---------|---------|---------|------|
| `ChunkUploadManagerService` | `mxcad/services/chunk-upload-manager.service.ts` | MxcadChunkModule → MxcadUploadModule | 等待 FileMergeService 拆分后迁移 |
| `FileMergeService` | `mxcad/services/file-merge.service.ts` | MxcadUploadModule | 待与 UploadUtilityService, FileConversionUploadService 一起拆分 |
| `FileConversionUploadService` | `mxcad/services/file-conversion-upload.service.ts` | MxcadUploadModule | 待拆分 |
| `UploadUtilityService` | `mxcad/services/upload-utility.service.ts` | MxcadUploadModule | 待拆分 |
| `FileUploadManagerFacadeService` | `mxcad/facade/file-upload-manager-facade.service.ts` | MxcadFacadeModule | 依赖 MxcadUploadModule，待迁移 |
| `MxCadService` | `mxcad/mxcad.service.ts` | MxcadCoreModule | 待拆分 |
| `MxcadFileHandlerService` | `mxcad/services/mxcad-file-handler.service.ts` | MxcadCoreModule | 待拆分 |
| `MxCadController` | `mxcad/mxcad.controller.ts` | MxcadCoreModule | 待拆分 |
| `FileConversionService` | `mxcad/services/file-conversion.service.spec.ts` | MxcadConversionModule | 已在 `mxcad/conversion/` 有主文件，spec 残留可清理 |

**说明**: `MxcadFacadeModule`（Phase 5）中 `UploadOrchestrator` 已正确拆分，但 `FileUploadManagerFacadeService` 因依赖仍在 MxcadUploadModule（Phase 6）而暂留。

---

### 2.3 已完成子模块汇总

```
mxcad/
├── infra/                          ✅ Phase 1 (MxcadInfraModule)
│   ├── mxcad-infra.module.ts
│   ├── file-system.service.ts      (本地文件I/O)
│   ├── cache-manager.service.ts
│   ├── thumbnail-generation.service.ts
│   ├── linux-init.service.ts
│   └── thumbnail-utils.ts
├── conversion/                     ✅ Phase 1 (MxcadConversionModule)
│   ├── mxcad-conversion.module.ts
│   └── file-conversion.service.ts
├── chunk/                         ⚠️ Phase 2 (MxcadChunkModule) - 部分完成
│   ├── mxcad-chunk.module.ts
│   ├── chunk-upload.service.ts
│   ├── file-check.service.ts
│   └── (ChunkUploadManagerService 暂在 mxcad/services/)
├── node/                          ✅ Phase 2 (MxcadNodeModule)
│   ├── mxcad-node.module.ts
│   ├── filesystem-node.service.ts
│   └── node-creation.service.ts
├── external-ref/                  ✅ Phase 5 (MxcadExternalRefModule)
│   ├── mxcad-external-ref.module.ts
│   ├── external-ref.service.ts
│   ├── external-reference-handler.service.ts
│   └── external-reference-update.service.ts
├── facade/                        ⚠️ Phase 5 (MxcadFacadeModule) - 部分完成
│   ├── mxcad-facade.module.ts
│   ├── upload.orchestrator.ts
│   └── (file-upload-manager-facade.service.ts 暂在 mxcad/services/)
├── save/                          ✅ Phase 7 (MxcadSaveModule)
│   ├── mxcad-save.module.ts
│   └── save-as.service.ts
├── services/                      ⚠️ 待拆分
│   ├── chunk-upload-manager.service.ts      → MxcadUploadModule
│   ├── file-merge.service.ts                → MxcadUploadModule
│   ├── file-conversion-upload.service.ts   → MxcadUploadModule
│   ├── upload-utility.service.ts            → MxcadUploadModule
│   ├── mxcad-file-handler.service.ts       → MxcadCoreModule
│   └── file-upload-manager.types.ts
├── mxcad.service.ts               ⚠️ → MxcadCoreModule
├── mxcad.controller.ts             ⚠️ → MxcadCoreModule
└── mxcad.module.ts                父模块（已挂载 7 个子模块）
```

---

## 三、拆分完成率汇总

| 模块 | 计划子模块数 | 已完成子模块数 | 完成率 |
|------|------------|--------------|--------|
| file-system | 10 | 7 | **70%** |
| mxcad | 9 | 6 (部分) | **67%** |
| **合计** | **19** | **13** | **68%** |

---

## 四、剩余工作清单（按优先级）

### 4.1 file-system 剩余工作（3 项）

| 优先级 | 子模块 | 待拆分服务 | 工作内容 |
|--------|--------|-----------|---------|
| P2 | FileSearchModule | `SearchService` | 新建 `file-system/search/` 子模块，迁移服务，更新导入路径 |
| P2 | FileDownloadModule | `FileDownloadExportService`, `FileDownloadHandlerService` | 新建 `file-system/file-download/` 子模块，合并两个服务 |
| P1 | FileSystemFacadeModule | `FileSystemService` | 精简 facade 方法，逐步废弃（可最后处理） |

### 4.2 mxcad 剩余工作（3 项）

| 优先级 | 子模块 | 待拆分服务 | 工作内容 |
|--------|--------|-----------|---------|
| P1 | MxcadUploadModule | `FileMergeService`, `FileConversionUploadService`, `UploadUtilityService`, `ChunkUploadManagerService` | 新建 `mxcad/upload/` 子模块，合并 4 个服务；将 `FileUploadManagerFacadeService` 从 facade 迁移至此 |
| P2 | MxcadCoreModule | `MxCadService`, `MxcadFileHandlerService`, `MxCadController` | 新建 `mxcad/core/` 子模块，迁移 2 个服务 + 控制器 |
| P3 | MxcadFacadeModule 完善 | `FileUploadManagerFacadeService` | 等 MxcadUploadModule 完成后，将 Facade 迁移至 facade/ |

---

## 五、遗留问题（来自 Phase 3 审查）

| 问题 | 来源 | 状态 |
|------|------|------|
| StorageCheckService 在 MxcadChunkModule 中重复注册 | Phase 2-3 审查 | ⚠️ 未修复 |
| forwardRef 循环依赖残留（5 处） | 整体架构 | ⚠️ 已知问题，需持续监控 |

---

## 六、总结

- **file-system**: 7/10 子模块已完成，剩余 3 个子模块（FileSearchModule, FileDownloadModule, FileSystemFacadeModule）可通过 1-2 个 Phase 完成
- **mxcad**: 6/9 子模块已完成（含部分完成），剩余 3 个子模块（MxcadUploadModule, MxcadCoreModule, 完善 MxcadFacadeModule）是冲刺二最后的工作
- **整体进度**: 约 68% 完成，剩余工作集中在上传流程（UploadModule）和核心服务（CoreModule）
