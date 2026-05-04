# 冲刺二 Phase 3 执行结果连续跟踪审查

**日期**: 2026-05-02
**分支**: refactor/circular-deps

---

## 审查任务

当前冲刺二 Phase 3 正在执行：
- mxcad Phase 5：MxcadExternalRefModule、MxcadFacadeModule
- file-system：FilePermissionModule 补充拆分

---

## 审查结果

| 审查项 | 子模块 | 结果 | 问题描述 |
|--------|--------|------|---------|
| 1. 模块目录结构是否合理 | MxcadExternalRefModule | ✅ 通过 | `src/mxcad/external-ref/` 目录结构合理，包含 3 个服务和 1 个模块文件 |
| | MxcadFacadeModule | ✅ 通过 | `src/mxcad/facade/` 目录结构合理，包含编排器和门面服务 |
| | FilePermissionModule | ✅ 通过 | `src/file-system/file-permission/` 目录结构合理，包含权限服务 |
| 2. import 路径是否正确，有无断链 | 所有模块 | ✅ 通过 | 所有导入路径均已正确更新，模块间引用正确 |
| 3. 是否有循环依赖残留 | 所有模块 | ⚠️ 存在 | 存在 5 处 forwardRef 循环依赖，属于已知架构问题 |
| 4. FileTreeService 重复注册是否已修复 | FileTreeService | ✅ 已修复 | FileTreeService 仅在 FileTreeModule 中注册，FileSystemModule 通过 imports 引用 |
| 5. StorageCheckService 是否已移到正确位置 | StorageCheckService | ⚠️ 未完全修复 | StorageCheckService 仍在 MxcadChunkModule 中注册，未在 StorageModule 中注册 |

---

## 详细分析

### 1. 新建模块目录结构审查

#### MxcadExternalRefModule (`src/mxcad/external-ref/`)

```
external-ref/
├── external-ref.service.ts           # 外部参照目录名称解析、文件拷贝
├── external-reference-handler.service.ts  # 外部参照文件 HTTP 请求处理与流式传输
├── external-reference-update.service.ts   # 上传后外部参照信息更新
└── mxcad-external-ref.module.ts      # 模块定义
```

**依赖关系**：
- DatabaseModule
- CommonModule
- FileSystemModule
- MxcadInfraModule（提供 FileSystemService）
- MxcadNodeModule（提供 FileSystemNodeService）

**导出的服务**：
- ExternalRefService
- ExternalReferenceHandler
- ExternalReferenceUpdateService

**评价**：✅ 目录结构合理，职责划分清晰

---

#### MxcadFacadeModule (`src/mxcad/facade/`)

```
facade/
├── file-upload-manager-facade.service.ts  # 上传门面服务，聚合多个上传相关服务
├── upload.orchestrator.ts                 # 上传流程编排器
└── mxcad-facade.module.ts                 # 模块定义
```

**依赖关系**：
- ConfigModule
- CommonModule
- MxcadChunkModule
- MxcadNodeModule
- MxcadConversionModule

**导出的服务**：
- UploadOrchestrator

**注意**：FileUploadManagerFacadeService 仍在 MxCadModule 中注册（注释说明将在 Phase 6 迁移）

**评价**：✅ 目录结构合理，但门面服务位置待最终确认

---

#### FilePermissionModule (`src/file-system/file-permission/`)

```
file-permission/
├── file-permission.module.ts           # 模块定义
└── file-system-permission.service.ts   # 文件系统权限服务
```

**依赖关系**：
- DatabaseModule
- RolesModule（提供 ProjectPermissionService）
- FileTreeModule

**导出的服务**：
- FileSystemPermissionService

**评价**：✅ 目录结构合理，职责划分清晰

---

### 2. Import 路径审查

所有新建模块的 import 路径均正确：

| 模块文件 | 导入的依赖 | 路径是否正确 |
|----------|-----------|-------------|
| mxcad-external-ref.module.ts | DatabaseModule, CommonModule, FileSystemModule, MxcadInfraModule, MxcadNodeModule | ✅ |
| mxcad-facade.module.ts | ConfigModule, CommonModule, MxcadChunkModule, MxcadNodeModule, MxcadConversionModule | ✅ |
| file-permission.module.ts | DatabaseModule, RolesModule, FileTreeModule | ✅ |
| file-system-permission.service.ts | ProjectPermissionService, DatabaseService, FileTreeService | ✅ |

**注意**：FileSystemPermissionService 使用 `@Inject(forwardRef(() => FileTreeService))` 注入 FileTreeService，表明存在循环依赖。

---

### 3. 循环依赖残留检查

当前存在的 forwardRef 使用情况：

| 模块 | 循环依赖路径 | 状态 |
|------|-------------|------|
| MxCadModule | MxCadModule ↔ FileSystemModule（通过 forwardRef） | ⚠️ 已知问题 |
| MxCadModule | MxCadModule ↔ StorageModule（通过 forwardRef） | ⚠️ 已知问题 |
| MxcadNodeModule | MxcadNodeModule ↔ FileSystemModule（通过 forwardRef） | ⚠️ 已知问题 |
| FileSystemPermissionService | FileSystemPermissionService ↔ FileTreeService（通过 forwardRef） | ⚠️ 已知问题 |
| UsersModule | UsersModule ↔ AuthModule（通过 forwardRef） | ⚠️ 已知问题 |
| VersionControlModule | VersionControlModule ↔ RolesModule/FileSystemModule（通过 forwardRef） | ⚠️ 已知问题 |

**分析**：这些都是由于模块间的双向依赖造成的循环引用，属于 NestJS 中使用 forwardRef 的正常场景。暂时没有发现新的循环依赖。

---

### 4. FileTreeService 重复注册检查

**Phase 2 发现的问题**：
- FileTreeService 同时在 FileSystemModule 和 FileTreeModule 的 providers 中注册

**Phase 3 状态**：
- ✅ 已修复
- FileTreeService 仅在 `src/file-system/file-tree/file-tree.module.ts` 中注册
- FileSystemModule 通过 `imports: [FileTreeModule]` 引用
- FileTreeModule 在 FileSystemModule 的 imports 数组中

**验证**：
```typescript
// file-tree.module.ts
providers: [FileTreeService],
exports: [FileTreeService],

// file-system.module.ts
imports: [
  ...
  FileTreeModule,  // ✅ 正确导入
  ...
],
```

---

### 5. StorageCheckService 位置检查

**Phase 2 发现的问题**：
- StorageCheckService 在 MxcadChunkModule 中注册，但该服务属于 Storage 模块范畴

**Phase 3 状态**：
- ⚠️ 未完全修复
- StorageCheckService 仍在 `src/mxcad/chunk/mxcad-chunk.module.ts` 中注册
- StorageCheckService 位于 `src/storage/storage-check.service.ts`（位置正确）
- MxcadChunkModule 导入 StorageModule，但不使用 StorageModule 导出的 StorageCheckService

**当前代码**：
```typescript
// mxcad-chunk.module.ts
imports: [ConfigModule, CommonModule, StorageModule],
providers: [ChunkUploadService, FileCheckService, StorageCheckService],  // ⚠️ 重复注册
exports: [ChunkUploadService, FileCheckService],
```

**建议修复**：
1. 在 StorageModule 中导出 StorageCheckService
2. 从 MxcadChunkModule 的 providers 中移除 StorageCheckService
3. 通过 StorageModule 导入使用

---

## 待处理问题汇总

| 问题 | 优先级 | 建议 |
|------|--------|------|
| StorageCheckService 位置不当 | 中 | 将 StorageCheckService 的注册移到 StorageModule，从 MxcadChunkModule 移除 |
| 循环依赖（forwardRef） | 低 | 属于架构设计问题，可接受但需监控 |

---

## 总结

- ✅ 新建模块目录结构合理
- ✅ import 路径正确，无断链
- ✅ FileTreeService 重复注册问题已修复
- ⚠️ StorageCheckService 位置问题未完全修复
- ⚠️ 循环依赖残留存在但属于已知架构问题

---

## Git 提交记录（Phase 3 相关）

| Commit | 说明 |
|--------|------|
| (待确认) | Phase 3 相关提交 |

---

**审查人**: AI Assistant
**审查时间**: 2026-05-02