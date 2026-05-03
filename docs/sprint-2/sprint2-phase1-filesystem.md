# 冲刺二 Phase 1：文件系统上帝模块拆分（叶节点）

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**变更范围**: `apps/backend/src/file-system/`

---

## 拆分概览

Phase 1 拆分了 file-system 模块中 3 组纯叶节点服务（无模块内依赖），共 5 个服务拆分为 3 个子模块。

| # | 子模块 | 服务数 | 依赖 | 行数 |
|---|--------|--------|------|------|
| 1 | `file-hash/` | 1 (FileHashService) | 无外部模块依赖 | 71 |
| 2 | `file-validation/` | 1 (FileValidationService) | ConfigModule, RuntimeConfigModule | 467 |
| 3 | `storage-quota/` | 3 (Quota → Info → Enforcement) | DatabaseModule, ConfigModule, RuntimeConfigModule | 119+285+150 |

### 提交历史

```
846fd22 refactor(file-system): 拆分 StorageQuotaModule
de1312e refactor(file-system): 拆分 FileValidationModule
00a720a refactor(file-system): 拆分 FileHashModule
```

---

## 详细变更

### 1. FileHashModule

**新文件**:
- `file-hash/file-hash.module.ts` — 模块定义
- `file-hash/file-hash.service.ts` — 从 `file-system/` 移入

**修改文件**:
- `file-system.module.ts` — 用 `FileHashModule` 替代直接的 `FileHashService` 注册

**公开接口**: `FileHashService.calculateHash()`, `calculateHashFromStream()`

### 2. FileValidationModule

**新文件**:
- `file-validation/file-validation.module.ts` — 模块定义，声明 ConfigModule + RuntimeConfigModule 依赖
- `file-validation/file-validation.service.ts` — 从 `file-system/` 移入（更新了相对 import 路径）
- `file-validation/file-validation.service.spec.ts` — 从 `file-system/` 移入

**修改文件**:
- `file-system.module.ts` — 用 `FileValidationModule` 替代直接的 `FileValidationService` 注册

**公开接口**: `FileValidationService.validateFile()`, `validateFileType()`, `validateFileSize()`, `sanitizeFilename()`

### 3. StorageQuotaModule

**新文件**:
- `storage-quota/storage-quota.module.ts` — 模块定义，声明 DatabaseModule + ConfigModule + RuntimeConfigModule 依赖
- `storage-quota/storage-quota.service.ts` — 从 `services/` 移入
- `storage-quota/storage-info.service.ts` — 从 `services/` 移入
- `storage-quota/quota-enforcement.service.ts` — 从 `services/` 移入

**修改文件**:
- `file-system.module.ts` — 用 `StorageQuotaModule` 替代 3 个直接的服务注册
- `services/index.ts` — 移除 3 个服务导出
- `file-system.service.ts` — 更新 import 路径
- `services/file-tree.service.ts` — 更新 import 路径
- `../file-operations/file-operations.service.ts` — 更新 import 路径
- `../file-operations/file-operations.service.spec.ts` — 更新 import 路径
- `../common/interceptors/storage-quota.interceptor.ts` — 更新 import 路径

**公开接口**:
- `StorageQuotaService.determineQuotaType()`, `getStorageQuotaLimit()`
- `StorageInfoService.getStorageQuota()`, `getUserStorageInfo()`, `invalidateQuotaCache()`
- `QuotaEnforcementService.checkUploadQuota()`

---

## file-system 模块当前结构

```
file-system/
├── file-hash/                   ← Phase 1 新建
│   ├── file-hash.module.ts
│   └── file-hash.service.ts
├── file-validation/             ← Phase 1 新建
│   ├── file-validation.module.ts
│   ├── file-validation.service.ts
│   └── file-validation.service.spec.ts
├── storage-quota/               ← Phase 1 新建
│   ├── storage-quota.module.ts
│   ├── storage-quota.service.ts
│   ├── storage-info.service.ts
│   └── quota-enforcement.service.ts
├── services/                    ← 待后续 Phase 拆分
│   ├── file-tree.service.ts
│   ├── file-download-export.service.ts
│   ├── project-member.service.ts
│   ├── search.service.ts
│   └── index.ts
├── file-system.service.ts       ← Facade，待精简
├── file-system.module.ts        ← 父模块
├── file-system.controller.ts
├── file-system-permission.service.ts
├── file-download-handler.service.ts
├── dto/
└── utils/
```

---

## 编译验证

- 命令: `npx tsc --noEmit`
- 新增错误: **0**
- 所有错误均为预先存在的 `DatabaseService` Prisma 类型问题（不影响运行）

---

## 下一步（Phase 2）

按 `docs/sprint2-pre-analysis.md` 方案，Phase 2 应拆分：
- **FileTreeModule** — `file-tree.service.ts`（核心依赖，被多处引用）
- **FilePermissionModule** — `file-system-permission.service.ts`
- **FileOperationsModule** — `file-operations.service.ts` + `project-crud.service.ts`（已部分移入 `src/file-operations/`，待完善）

注意: Phase 2 中的 FileOperationsService 和 ProjectCrudService 已在外部过程中被提前移入 `src/file-operations/` 目录，但模块注册尚未完成，需要在 Phase 2 中补全。
