# 冲刺二 Phase 2：文件系统上帝模块拆分（核心服务）

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**变更范围**: `packages/backend/src/file-system/`

---

## 拆分概览

Phase 2 拆分了 file-system 模块中的 2 个核心服务：

| # | 子模块 | 服务 | 依赖 | 行数 |
|---|--------|------|------|------|
| 1 | `file-tree/` | FileTreeService | DatabaseModule, CommonModule, StorageQuotaModule | 718 |
| 2 | `file-permission/` | FileSystemPermissionService | DatabaseModule, RolesModule, FileTreeModule | 394 |

### 提交历史

```
e279c29 refactor(file-system): 拆分 FilePermissionModule
73cc552 refactor(file-system): 拆分 FileTreeModule
```

---

## 详细变更

### 1. FileTreeModule

**说明**: FileTreeService 在前一轮外部重构中已被预移到 `file-tree/` 目录，且模块文件已创建，但未正确挂载到父模块。

**修改文件**:
- `services/index.ts` — 移除已失效的 `FileTreeService` 桶重导出
- `file-system.module.ts` — 将 `FileTreeService` 替换为 `FileTreeModule`（imports + exports）
- 所有外部引用（mxcad/node, file-operations, library, guards）路径已在预移时更新到 `file-tree/file-tree.service`

**模块依赖**: `DatabaseModule`, `CommonModule`, `StorageQuotaModule`（因为 FileTreeService 依赖 StorageInfoService）

### 2. FilePermissionModule

**新建文件**:
- `file-permission/file-permission.module.ts` — 声明 DatabaseModule, RolesModule, FileTreeModule 依赖
- `file-permission/file-system-permission.service.ts` — 从父目录移入

**内部 import 路径更新**（加深一层后需调整）:
- `../common/enums/permissions.enum` → `../../common/enums/permissions.enum`
- `../roles/project-permission.service` → `../../roles/project-permission.service`
- `../database/database.service` → `../../database/database.service`
- `./file-tree/file-tree.service` → `../file-tree/file-tree.service`

**外部引用路径更新 6 处**:
| 文件 | 旧路径 | 新路径 |
|------|--------|--------|
| `services/file-download-export.service.ts` | `../file-system-permission.service` | `../file-permission/file-system-permission.service` |
| `services/project-member.service.ts` | `../file-system-permission.service` | `../file-permission/file-system-permission.service` |
| `services/search.service.ts` | `../file-system-permission.service` | `../file-permission/file-system-permission.service` |
| `file-operations/project-crud.service.ts` | `../file-system/file-system-permission.service` | `../file-system/file-permission/file-system-permission.service` |
| `mxcad/mxcad.controller.ts` | `../file-system/file-system-permission.service` | `../file-system/file-permission/file-system-permission.service` |
| `mxcad/services/save-as.service.ts` | `../../file-system/file-system-permission.service` | `../../file-system/file-permission/file-system-permission.service` |

---

## file-system 模块当前结构

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
├── services/                    ← 待后续 Phase 拆分
│   ├── file-download-export.service.ts
│   ├── project-member.service.ts
│   ├── search.service.ts
│   └── index.ts
├── file-system.service.ts       ← Facade，待精简
├── file-system.module.ts        ← 父模块（5 个子模块已挂载）
├── file-system.controller.ts
├── file-download-handler.service.ts
├── dto/
└── utils/
```

**父模块当前 imports**:
```
FileHashModule, FileValidationModule, StorageQuotaModule,
FileTreeModule, FilePermissionModule
```

**待拆分服务** (仍在 services/ 中):
- `file-download-export.service.ts` — 下载/导出/CAD 格式转换
- `project-member.service.ts` — 项目成员管理
- `search.service.ts` — 搜索
- `file-download-handler.service.ts` — HTTP 下载响应
- `file-system.service.ts` — Facade

---

## 编译验证

- 命令: `npx tsc --noEmit`
- 新增错误: **0**
- 所有错误均为预先存在的 `DatabaseService` Prisma 类型问题

---

## 下一步（Phase 3）

按 `docs/sprint2-pre-analysis.md` 方案，Phase 3 应拆分上层服务：
- **FileDownloadModule** — `file-download-export.service.ts` + `file-download-handler.service.ts`
- **ProjectMemberModule** — `project-member.service.ts`
- **FileSearchModule** — `search.service.ts`
