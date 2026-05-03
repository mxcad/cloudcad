# 冲刺二 Phase 6：Mxcad 上传核心与核心模块拆分

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**相关提交**: 9c5c763, b9613c6

---

## 概述

完成 mxcad 拆分最后阶段 Phase 6 的两个核心模块：

1. **MxcadUploadModule** — 上传核心服务链（4 服务）
2. **MxcadCoreModule** — 模块核心服务 + API 控制器（3 项）

至此 mxcad 上帝模块拆分全部完成。

---

## 拆分明细

### 1. MxcadUploadModule

**位置**: `src/mxcad/upload/mxcad-upload.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| FileMergeService | `services/file-merge.service.ts` | `upload/file-merge.service.ts` | 640 |
| FileConversionUploadService | `services/file-conversion-upload.service.ts` | `upload/file-conversion-upload.service.ts` | 652 |
| UploadUtilityService | `services/upload-utility.service.ts` | `upload/upload-utility.service.ts` | 138 |
| ChunkUploadManagerService | `services/chunk-upload-manager.service.ts` | `upload/chunk-upload-manager.service.ts` | 103 |

**导入**: ConfigModule, DatabaseModule, CommonModule, FileSystemModule, VersionControlModule, StorageModule, MxcadInfraModule, MxcadConversionModule, MxcadNodeModule, MxcadExternalRefModule  
**导出**: FileMergeService, FileConversionUploadService, ChunkUploadManagerService

**注意**: 更新了 `chunk-upload-manager.service.ts` 中 `file-upload-manager.types` 的导入路径（`./` → `../services/`）

### 2. MxcadCoreModule

**位置**: `src/mxcad/core/mxcad-core.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| MxCadService | `mxcad.service.ts` | `core/mxcad.service.ts` | 890 |
| MxcadFileHandlerService | `services/mxcad-file-handler.service.ts` | `core/mxcad-file-handler.service.ts` | 174 |
| MxCadController | `mxcad.controller.ts` | `core/mxcad.controller.ts` | 2,685 |

**导入**: ConfigModule, DatabaseModule, CommonModule, RuntimeConfigModule, FileSystemModule, StorageModule, VersionControlModule, RolesModule, JwtModule + 全部 7 个下层子模块  
**导出**: MxCadService, MxcadFileHandlerService

---

## MxCadModule 最终状态

拆分全部完成后，MxCadModule 成为纯编排模块：

```typescript
@Module({
  imports: [
    // NestJS 标准模块
    DatabaseModule, CommonModule, ConfigModule, RuntimeConfigModule,
    JwtModule, MulterModule,
    // 外部业务模块
    FileSystemModule, StorageModule, VersionControlModule, RolesModule,
    // mxcad 子模块（8个）
    MxcadInfraModule, MxcadConversionModule, MxcadChunkModule,
    MxcadNodeModule, MxcadExternalRefModule, MxcadFacadeModule,
    MxcadUploadModule, MxcadSaveModule, MxcadCoreModule,
  ],
  controllers: [],       // 已移至 MxcadCoreModule
  providers: [
    FileUploadManagerFacadeService,  // 仅在 MxCadModule 中注册的提供者
    MainFileSystemService,           // 别名
    RequireProjectPermissionGuard,
  ],
  exports: [],           // 已由各子模块导出
})
```

---

## 导入路径更新（汇总）

| 文件 | 修改内容 |
|------|---------|
| `facade/file-upload-manager-facade.service.ts` | 4 条 `../services/` → `../upload/` |
| `upload/chunk-upload-manager.service.ts` | `./file-upload-manager.types` → `../services/file-upload-manager.types` |
| `core/mxcad.service.ts` | 13 条路径更新（`./` → `../`, `../` → `../../`, `./services/` → `../infra/`） |
| `core/mxcad.controller.ts` | 20+ 条路径更新 |
| `mxcad.module.ts` | 移除旧的 import，添加 MxcadCoreModule/MxcadUploadModule |
| `library/library.controller.ts` | `../mxcad/services/` → `../mxcad/core/` |

---

## 编译验证

```
npx tsc --noEmit → 通过（无 mxcad 相关错误）
```

---

## mxcad 模块拆分总览

| # | 子模块 | Phase | 包含服务 | 文件数 |
|---|--------|-------|---------|-------|
| 1 | MxcadInfraModule | 1 | FileSystemService(mx), CacheManagerService, ThumbnailGenerationService, LinuxInitService | 5 |
| 2 | MxcadConversionModule | 1 | FileConversionService | 1 |
| 3 | MxcadChunkModule | 2 | ChunkUploadService, FileCheckService | 2 |
| 4 | MxcadNodeModule | 2 | FileSystemNodeService, NodeCreationService | 2 |
| 5 | MxcadExternalRefModule | 5 | ExternalRefService, ExternalReferenceHandler, ExternalReferenceUpdateService | 3 |
| 6 | MxcadFacadeModule | 5 | UploadOrchestrator | 1 |
| 7 | MxcadUploadModule | 6 | FileMergeService, FileConversionUploadService, UploadUtilityService, ChunkUploadManagerService | 4 |
| 8 | MxcadSaveModule | 7 | SaveAsService | 1 |
| 9 | MxcadCoreModule | 6 | MxCadService, MxcadFileHandlerService, MxCadController | 3 |
| - | **MxCadModule（编排）** | - | FileUploadManagerFacadeService（仅注册） | 0 |

**原始 MxCadModule**: 21 个服务, ~7,800 行代码, 1 个控制器  
**拆分后**: 9 个子模块, 0 个提供者（除 1 个 Facade 外全部分出）

---

## 统计

| 指标 | 值 |
|------|------|
| 新增模块文件 | 2 |
| 移动服务文件 | 7 |
| 更新导入的文件 | 6+ |
| MxCadModule providers | 21 → 1（FileUploadManagerFacadeService）+ 2 个别名/守卫 |
| 总子模块数 | 9 |
