# 冲刺二 Phase 7：Mxcad 另存为模块拆分

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**提交**: 7391008

---

## 概述

按照 `docs/sprint2-phase5-mxcad.md` 的下一步建议，完成 mxcad Phase 7 的拆分：

**MxcadSaveModule** — CAD 另存为功能独立子模块

---

## 拆分明细

**位置**: `src/mxcad/save/mxcad-save.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| SaveAsService | `services/save-as.service.ts` | `save/save-as.service.ts` | 342 |

**内部导入检查**: 所有 `../../xxx` 和 `../xxx` 路径在同一嵌套层级，无需修改

**依赖（模块导入）**: DatabaseModule, ConfigModule, CommonModule, FileSystemModule, VersionControlModule, MxcadConversionModule, MxcadNodeModule  
**导出**: SaveAsService

---

## 导入路径更新

| 文件 | 修改内容 |
|------|---------|
| `mxcad.module.ts` | 移除 SaveAsService import 和 provider，添加 MxcadSaveModule import |
| `mxcad.controller.ts` | `./services/save-as.service` → `./save/save-as.service` |

---

## MxCadModule 变更

**imports 新增**: MxcadSaveModule  
**providers 移除**: SaveAsService

Phase 7 完成后，MxCadModule 的 providers 精简为：

| 服务 | 行数 | 计划阶段 |
|------|------|---------|
| MxCadService | 890 | Phase 6（MxcadCoreModule） |
| FileUploadManagerFacadeService | 116 | Phase 5→6（待 MxcadUploadModule 完成后迁移） |
| ChunkUploadManagerService | 103 | Phase 6（MxcadUploadModule） |
| MxcadFileHandlerService | 174 | Phase 6（MxcadCoreModule） |
| FileMergeService | 640 | Phase 6（MxcadUploadModule） |
| UploadUtilityService | 138 | Phase 6（MxcadUploadModule） |
| FileConversionUploadService | 652 | Phase 6（MxcadUploadModule） |

---

## 编译验证

```
npx tsc --noEmit → 通过（无 mxcad 相关错误）
```

---

## 统计

| 指标 | 值 |
|------|------|
| 新增模块文件 | 1 |
| 移动服务文件 | 1 |
| 更新导入的文件 | 2 |
| 总子模块数 | 7 |

---

## mxcad 子模块汇总

| 模块 | Phase | 包含服务 | 依赖 |
|------|-------|---------|------|
| MxcadInfraModule | 1 | 4 服务 | ConfigModule |
| MxcadConversionModule | 1 | 1 服务 | ConfigModule |
| MxcadChunkModule | 2 | 2 服务 | ConfigModule, CommonModule, StorageModule |
| MxcadNodeModule | 2 | 2 服务 | DatabaseModule, ConfigModule, CommonModule, FileSystemModule |
| MxcadExternalRefModule | 5 | 3 服务 | ConfigModule, DatabaseModule, CommonModule, FileSystemModule, MxcadInfraModule, MxcadNodeModule |
| MxcadFacadeModule | 5 | 1 服务 | ConfigModule, CommonModule, MxcadChunkModule, MxcadNodeModule, MxcadConversionModule |
| MxcadSaveModule | 7 | 1 服务 | DatabaseModule, ConfigModule, CommonModule, FileSystemModule, VersionControlModule, MxcadConversionModule, MxcadNodeModule |

**剩余在 MxCadModule 的 providers**: 7 项（MxCadService, FileUploadManagerFacadeService, ChunkUploadManagerService, MxcadFileHandlerService, FileMergeService, UploadUtilityService, FileConversionUploadService）

---

## 下一步（建议）

1. **Phase 6: MxcadUploadModule** — 拆分 FileMergeService / FileConversionUploadService / UploadUtilityService（含 ChunkUploadManagerService 迁移）
2. **Phase 6: MxcadCoreModule** — 拆分 MxCadService / MxcadFileHandlerService / MxCadController
3. 完成后 MxCadModule 将成为纯编排模块，仅保留对子模块的 imports 和部分 Facade 代理
