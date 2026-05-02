# 冲刺二 Phase 3：文件系统上帝模块拆分（上层服务）

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**变更范围**: `apps/backend/src/file-system/`

---

## 拆分概览

Phase 3 拆分了 file-system 模块中剩余 3 个上层服务，共 4 个服务拆分为 3 个子模块：

| # | 子模块 | 服务 | 依赖 | 行数 |
|---|--------|------|------|------|
| 1 | `project-member/` | ProjectMemberService | DB, AuditLog, FilePermission | 649 |
| 2 | `search/` | SearchService | DB, FilePermission | 421 |
| 3 | `file-download/` | FileDownloadExportService + FileDownloadHandlerService | DB, Storage, Common, FilePermission, Config | 593+139 |

### 提交历史

```
268aa18 refactor(file-system): 拆分 ProjectMemberModule
f9d18eb refactor(file-system): 拆分 SearchModule
[auto]   refactor(file-system): 拆分 FileDownloadModule
```

---

## 详细变更

### 1. ProjectMemberModule

**新建文件**:
- `project-member/project-member.module.ts` — 声明 DatabaseModule, AuditLogModule, FilePermissionModule 依赖
- `project-member/project-member.service.ts` — 从 `services/` 移入

**修改文件**:
- `services/index.ts` — 移除 ProjectMemberService 桶导出
- `file-system.module.ts` — 用 ProjectMemberModule 替代直接服务注册
- `file-system.service.ts` — 更新导入路径

**公开接口**: `ProjectMemberService.getProjectMembers()`, `addProjectMember()`, `removeProjectMember()`, `batchAddProjectMembers()`, `batchUpdateProjectMembers()`

### 2. SearchModule

**新建文件**:
- `search/search.module.ts` — 声明 DatabaseModule, FilePermissionModule 依赖
- `search/search.service.ts` — 从 `services/` 移入

**修改文件**:
- `services/index.ts` — 移除 SearchService 桶导出
- `file-system.module.ts` — 用 SearchModule 替代直接服务注册
- `file-system.controller.ts` — 更新导入路径

**公开接口**: `SearchService.search(userId, dto): Promise<NodeListResponseDto>`

### 3. FileDownloadModule

**新建文件**:
- `file-download/file-download.module.ts` — 声明 ConfigModule, DatabaseModule, StorageModule, CommonModule, FilePermissionModule 依赖
- `file-download/file-download-export.service.ts` — 从 `services/` 移入
- `file-download/file-download-handler.service.ts` — 从父目录移入

**内部路径修复**:
- `file-download-handler.service.ts`: `./file-system.service` → `../file-system.service`
- `file-download-export.service.ts`: MxCadService 类型/动态导入路径 `../../mxcad/mxcad.service` → `../../mxcad/core/mxcad.service`

**修改文件**:
- `services/index.ts` — 移除 FileDownloadExportService 桶导出（index.ts 现为空文件）
- `file-system.module.ts` — 用 FileDownloadModule 替代两个直接服务注册
- `file-system.service.ts` — 更新导入路径
- `file-system.controller.ts` — 更新导入路径
- `library/library.controller.ts` — 更新 FileDownloadHandlerService 导入路径

**公开接口**:
- `FileDownloadExportService.downloadNode()`, `exportAsZip()`, `exportAsCadFormat()`
- `FileDownloadHandlerService.handleDownload(nodeId, userId, res, options?)`

---

## file-system 模块最终结构

```
file-system/
├── file-hash/                   ← Phase 1
│   ├── file-hash.module.ts
│   └── file-hash.service.ts
├── file-validation/             ← Phase 1
│   ├── file-validation.module.ts
│   └── file-validation.service.ts
├── storage-quota/               ← Phase 1
│   ├── storage-quota.module.ts
│   ├── storage-quota.service.ts
│   ├── storage-info.service.ts
│   └── quota-enforcement.service.ts
├── file-tree/                   ← Phase 2
│   ├── file-tree.module.ts
│   └── file-tree.service.ts
├── file-permission/             ← Phase 2
│   ├── file-permission.module.ts
│   └── file-system-permission.service.ts
├── project-member/              ← Phase 3
│   ├── project-member.module.ts
│   └── project-member.service.ts
├── search/                      ← Phase 3
│   ├── search.module.ts
│   └── search.service.ts
├── file-download/               ← Phase 3
│   ├── file-download.module.ts
│   ├── file-download-export.service.ts
│   └── file-download-handler.service.ts
├── services/
│   └── index.ts                 ← 已清空（仅含空行）
├── file-system.service.ts       ← Facade
├── file-system.module.ts        ← 父模块（8 个子模块已挂载）
├── file-system.controller.ts
├── dto/
└── utils/
```

**父模块最终 imports**（8 个子模块）:
```
FileHashModule, FileValidationModule, StorageQuotaModule,
FileTreeModule, FilePermissionModule, ProjectMemberModule,
SearchModule, FileDownloadModule
```

**父模块 providers**: `FileSystemService`, `RequireProjectPermissionGuard`

---

## 编译验证

- 命令: `npx tsc --noEmit`
- 新增错误: **0**（修复了 MxCadService 指向 `mxcad/core/` 的路径）
- 所有剩余错误均为预先存在的 `DatabaseService` Prisma 类型问题

---

## 冲刺二文件系统拆分总结

| Phase | 子模块数 | 服务数 | 拆分策略 |
|-------|---------|--------|---------|
| Phase 1 | 3 | 5 | 纯叶节点（无模块内依赖） |
| Phase 2 | 2 | 2 | 核心服务（被上层依赖） |
| Phase 3 | 3 | 4 | 上层服务（依赖核心层） |

**总计**: 14 个服务拆分为 8 个子模块 + 1 个 Facade + 1 个 Controller。

`services/` 桶目录已清空，所有业务逻辑均已迁移到功能明确的子模块中。
