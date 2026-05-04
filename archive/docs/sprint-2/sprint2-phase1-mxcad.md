# 冲刺二 Phase 1：Mxcad 基础设施与转换模块拆分

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**提交**: bd16bcc

---

## 概述

按照 `docs/sprint2-pre-analysis.md` 的方案，完成 mxcad Phase 1 的两个子模块拆分：

1. **MxcadInfraModule** — 合并 4 个基础设施服务
2. **MxcadConversionModule** — 独立 FileConversionService

---

## 拆分明细

### 1. MxcadInfraModule

**位置**: `src/mxcad/infra/mxcad-infra.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| FileSystemService | `services/file-system.service.ts` | `infra/file-system.service.ts` | 258 |
| CacheManagerService | `services/cache-manager.service.ts` | `infra/cache-manager.service.ts` | 179 |
| ThumbnailGenerationService | `services/thumbnail-generation.service.ts` | `infra/thumbnail-generation.service.ts` | 325 |
| LinuxInitService | `services/linux-init.service.ts` | `infra/linux-init.service.ts` | 235 |
| thumbnail-utils | `services/thumbnail-utils.ts` | `infra/thumbnail-utils.ts` | (工具文件) |

**依赖**: 仅 `ConfigModule`（无业务模块依赖）  
**导出**: `FileSystemService`, `ThumbnailGenerationService`

### 2. MxcadConversionModule

**位置**: `src/mxcad/conversion/mxcad-conversion.module.ts`

**清单**:

| 服务 | 原路径 | 新路径 | 行数 |
|------|--------|--------|------|
| FileConversionService | `services/file-conversion.service.ts` | `conversion/file-conversion.service.ts` | 510 |

**依赖**: 仅 `ConfigModule`（无业务模块依赖）  
**导出**: `FileConversionService`

---

## 导入路径更新

由于服务文件从 `services/` 移至 `infra/` 和 `conversion/`，以下文件的 import 路径已相应更新：

| 文件 | 修改内容 |
|------|---------|
| `mxcad.module.ts` | 移除直接 provider 注册，改导入 `MxcadInfraModule` + `MxcadConversionModule` |
| `mxcad.controller.ts` | `./services/thumbnail-utils` → `./infra/thumbnail-utils`; `./services/file-conversion.service` → `./conversion/file-conversion.service` |
| `mxcad.service.ts` | `./services/file-conversion.service` → `./conversion/file-conversion.service` |
| `orchestrators/upload.orchestrator.ts` | `../services/file-conversion.service` → `../conversion/file-conversion.service` |
| `services/file-merge.service.ts` | 4 条 infra/conversion 导入路径更新 |
| `services/file-conversion-upload.service.ts` | 4 条 infra/conversion 导入路径更新 |
| `services/file-upload-manager-facade.service.ts` | 3 条 infra/conversion 导入路径更新 |
| `services/save-as.service.ts` | `./file-conversion.service` → `../conversion/file-conversion.service` |
| `services/file-conversion.service.spec.ts` | `./file-conversion.service` → `../conversion/file-conversion.service` |
| `public-file/services/public-file-upload.service.ts` | 2 条 mxcad 导入路径更新 |
| `public-file/public-file.service.ts` | `../mxcad/services/file-conversion.service` → `../mxcad/conversion/file-conversion.service` |

---

## MxCadModule 变更

从 `providers` 数组移除的条目（已移至子模块）:
- `FileConversionService`
- `FileSystemService`
- `CacheManagerService`
- `ThumbnailGenerationService`
- `LinuxInitService`

从 `exports` 数组移除的条目（由子模块导出）:
- `FileConversionService` → 由 `MxcadConversionModule` 导出
- `FileSystemService` → 由 `MxcadInfraModule` 导出
- `ThumbnailGenerationService` → 由 `MxcadInfraModule` 导出

新增 `imports`:
- `MxcadInfraModule`
- `MxcadConversionModule`

---

## 编译验证

```
npx tsc --noEmit → 通过
```

仅 `src/library/library.controller.ts` 存在预编译错误（与本变更无关）。

---

## 统计

| 指标 | 值 |
|------|------|
| 新增模块文件 | 2 |
| 移动服务文件 | 6 |
| 更新导入的文件 | 11 |
| 总变更文件 | 19 |
| 新增代码行 | 106 |
| 删除代码行 | 39 |
| 重命名检测率 | 95-100% |

---

## 下一步（建议）

按 `docs/sprint2-pre-analysis.md` 的规划，后续可依次拆分：
1. **MxcadChunkModule** — ChunkUploadService / ChunkUploadManagerService / FileCheckService
2. **MxcadNodeModule** — FileSystemNodeService / NodeCreationService
3. **MxcadExternalRefModule** — ExternalRefService / ExternalReferenceHandler / ExternalReferenceUpdateService
