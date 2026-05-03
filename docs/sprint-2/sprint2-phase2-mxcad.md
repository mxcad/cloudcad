# 冲刺二 Phase 2：Mxcad 分片上传与节点模块拆分

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**相关提交**: 30cf21e, 9c51fc5

---

## 概述

按照 `docs/sprint2-pre-analysis.md` 的方案，完成 mxcad Phase 2 的两个子模块拆分：

1. **MxcadChunkModule** — 分片上传基础设施（ChunkUploadService / FileCheckService）
2. **MxcadNodeModule** — 文件系统节点服务（FileSystemNodeService / NodeCreationService）

---

## 拆分明细

### 1. MxcadChunkModule

**位置**: `src/mxcad/chunk/mxcad-chunk.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| ChunkUploadService | `services/chunk-upload.service.ts` | `chunk/chunk-upload.service.ts` | 511 |
| FileCheckService | `services/file-check.service.ts` | `chunk/file-check.service.ts` | 98 |

**注**: ChunkUploadManagerService 暂保留在 MxCadModule 中，因其依赖 FileMergeService（计划在 Phase 4 独立为 MxcadUploadModule），需等 FileMergeService 拆分后方可迁移。

**导入**: ConfigModule, CommonModule, StorageModule  
**额外提供者**: StorageCheckService（来自 storage-check.service，FileCheckService 所需）  
**导出**: ChunkUploadService, FileCheckService

### 2. MxcadNodeModule

**位置**: `src/mxcad/node/mxcad-node.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| FileSystemNodeService | `services/filesystem-node.service.ts` | `node/filesystem-node.service.ts` | 802 |
| NodeCreationService | `services/node-creation.service.ts` | `node/node-creation.service.ts` | 601 |

**依赖**: DatabaseModule, ConfigModule, CommonModule, FileSystemModule（forwardRef，因 FileTreeService）  
**导出**: FileSystemNodeService, NodeCreationService

---

## 导入路径更新

由于服务文件从 `services/` 移至 `chunk/` 和 `node/`，以下文件的 import 路径已相应更新：

| 文件 | 修改内容 |
|------|---------|
| `mxcad.module.ts` | +MxcadChunkModule, +MxcadNodeModule imports; 从 providers 移除 ChunkUploadService, FileCheckService, FileSystemNodeService, NodeCreationService, StorageCheckService |
| `mxcad.service.ts` | `./services/filesystem-node.service` → `./node/filesystem-node.service` |
| `orchestrators/upload.orchestrator.ts` | 3 条路径更新（chunk-upload, file-check, node-creation） |
| `services/file-merge.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/file-conversion-upload.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/file-upload-manager-facade.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/save-as.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/upload-utility.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/external-ref.service.ts` | 2 条路径更新 |
| `services/external-reference-handler.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/external-reference-update.service.ts` | `./filesystem-node.service` → `../node/filesystem-node.service` |
| `services/file-upload-manager.types.ts` | 3 条动态 import() 路径更新 |

---

## 编译验证

```
npx tsc --noEmit → 通过（无 mxcad 相关错误）
```

---

## 剩余在 MxCadModule 的服务

拆分两个阶段后，MxCadModule 的 providers 仍保留以下服务（计划在后续阶段拆分）：

| 服务 | 计划阶段 |
|------|---------|
| ChunkUploadManagerService | Phase 4（MxcadUploadModule，与 FileMergeService 同批） |
| FileMergeService | Phase 4（MxcadUploadModule） |
| FileConversionUploadService | Phase 4（MxcadUploadModule） |
| UploadUtilityService | Phase 4（MxcadUploadModule） |
| SaveAsService | Phase 7（MxcadSaveModule） |
| ExternalRefService | Phase 5（MxcadExternalRefModule） |
| ExternalReferenceHandler | Phase 5（MxcadExternalRefModule） |
| ExternalReferenceUpdateService | Phase 5（MxcadExternalRefModule） |
| MxcadFileHandlerService | Phase 6（MxcadCoreModule） |
| FileUploadManagerFacadeService | Phase 5（MxcadFacadeModule） |
| UploadOrchestrator | Phase 5（MxcadFacadeModule） |
| MxCadService | Phase 6（MxcadCoreModule） |

---

## 统计

| 指标 | 值 |
|------|------|
| 新增模块文件 | 2 |
| 移动服务文件 | 4 |
| 更新导入的文件 | 12 |
| 模块精简 | providers 减少 5 项 |

---

## 下一步（建议）

按 `docs/sprint2-pre-analysis.md` 的规划，后续可拆分：
1. **MxcadExternalRefModule** — ExternalRefService / ExternalReferenceHandler / ExternalReferenceUpdateService（需 FileSystemNodeService 已独立）
2. **MxcadUploadModule** — FileMergeService / FileConversionUploadService / UploadUtilityService + ChunkUploadManagerService
