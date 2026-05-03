# 冲刺二 Phase 5：Mxcad 外部参照与编排层模块拆分

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**相关提交**: 48d38b9, af850ff

---

## 概述

按照 `docs/sprint2-pre-analysis.md` 的方案，完成 mxcad Phase 5 的两个子模块拆分：

1. **MxcadExternalRefModule** — 外部参照处理链（ExternalRefService / ExternalReferenceHandler / ExternalReferenceUpdateService）
2. **MxcadFacadeModule** — 上传编排层（UploadOrchestrator，FileUploadManagerFacadeService 暂留）

---

## 拆分明细

### 1. MxcadExternalRefModule

**位置**: `src/mxcad/external-ref/mxcad-external-ref.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| ExternalRefService | `services/external-ref.service.ts` | `external-ref/external-ref.service.ts` | 127 |
| ExternalReferenceHandler | `services/external-reference-handler.service.ts` | `external-ref/external-reference-handler.service.ts` | 258 |
| ExternalReferenceUpdateService | `services/external-reference-update.service.ts` | `external-ref/external-reference-update.service.ts` | 378 |

**修复**: external-ref.service.ts 中 `./file-system.service` → `../infra/file-system.service`（Phase 1 遗留的断链）

**导入**: ConfigModule, DatabaseModule, CommonModule, FileSystemModule, MxcadInfraModule, MxcadNodeModule  
**导出**: ExternalRefService, ExternalReferenceHandler, ExternalReferenceUpdateService

### 2. MxcadFacadeModule

**位置**: `src/mxcad/facade/mxcad-facade.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| UploadOrchestrator | `orchestrators/upload.orchestrator.ts` | `facade/upload.orchestrator.ts` | 543 |
| FileUploadManagerFacadeService | `services/file-upload-manager-facade.service.ts` | `facade/file-upload-manager-facade.service.ts` | 116 |

**注**: FileUploadManagerFacadeService 因依赖仍在 MxCadModule 的 4 个服务（ChunkUploadManagerService, FileMergeService, UploadUtilityService, FileConversionUploadService），暂保留注册在 MxCadModule 的 providers 中。UploadOrchestrator 的所有依赖均已独立，可正确注册于 MxcadFacadeModule。

**导入**: ConfigModule, CommonModule, MxcadChunkModule, MxcadNodeModule, MxcadConversionModule  
**导出**: UploadOrchestrator

---

## MxCadModule 变更（累积）

Phase 5 完成后，MxCadModule 的 providers 精简为以下服务：

| 服务 | 行数 | 计划阶段 |
|------|------|---------|
| MxCadService | 890 | Phase 6（MxcadCoreModule） |
| FileUploadManagerFacadeService | 116 | Phase 5→6（待 MxcadUploadModule 完成后迁移） |
| ChunkUploadManagerService | 103 | Phase 6（MxcadUploadModule） |
| MxcadFileHandlerService | 174 | Phase 6（MxcadCoreModule） |
| FileMergeService | 640 | Phase 6（MxcadUploadModule） |
| UploadUtilityService | 138 | Phase 6（MxcadUploadModule） |
| FileConversionUploadService | 652 | Phase 6（MxcadUploadModule） |
| SaveAsService | 342 | Phase 7（MxcadSaveModule） |

已拆分的子模块（5 个）：
- **MxcadInfraModule** (4 服务)
- **MxcadConversionModule** (1 服务)
- **MxcadChunkModule** (2 服务)
- **MxcadNodeModule** (2 服务)
- **MxcadExternalRefModule** (3 服务)
- **MxcadFacadeModule** (1 服务 - UploadOrchestrator)

---

## 导入路径更新

| 文件 | 修改内容 |
|------|---------|
| `mxcad.module.ts` | +MxcadExternalRefModule, +MxcadFacadeModule; 移除 ExternalRefService/ExternalReferenceHandler/ExternalReferenceUpdateService/UploadOrchestrator 的 providers/imports |
| `mxcad.service.ts` | `./services/external-reference-update.service` → `./external-ref/external-reference-update.service` |
| `mxcad.service.ts` | `./services/file-upload-manager-facade.service` → `./facade/file-upload-manager-facade.service` |
| `services/file-merge.service.ts` | `./external-ref.service` → `../external-ref/external-ref.service` |
| `services/file-upload-manager-facade.service.ts` | `./external-ref.service` → `../external-ref/external-ref.service`; +4 条 `./` → `../services/` 路径 |
| `services/file-conversion-upload.service.ts` | 2 条 `./external-*` → `../external-ref/external-*` |

---

## 编译验证

```
npx tsc --noEmit → 通过（无 mxcad 相关错误）
```

---

## 统计

| 指标 | 值 |
|------|------|
| 新增模块文件 | 2 |
| 移动服务文件 | 5 |
| 更新导入的文件 | 6 |
| 修复断链 | 1 (external-ref.service.ts 中 MxFileSystemService 路径) |
| 总子模块数 | 6 |
| MxCadModule providers | 从 21 降至 8 |

---

## 下一步（建议）

1. **Phase 6: MxcadUploadModule** — 拆分 FileMergeService / FileConversionUploadService / UploadUtilityService（含 ChunkUploadManagerService 迁移）
2. **Phase 6: MxcadCoreModule** — 拆分 MxCadService / MxcadFileHandlerService / MxCadController
3. **Phase 7: MxcadSaveModule** — 拆分 SaveAsService
