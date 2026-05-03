# 权限检查审计报告

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**分析范围**: `apps/backend/src/` 下全部 17 个 Controller + 81 个 Service  
**审计方法**: 静态代码扫描，枚举每个方法上的装饰器和内联权限调用

---

## 一、六种权限检查机制

| # | 机制 | 类型 | 判定方 | 覆盖范围 |
|---|------|------|--------|---------|
| A | `@RequireProjectPermission` + `RequireProjectPermissionGuard` | 装饰器 + Guard | 项目操作权限 | 文件系统、MxCAD、版本控制 |
| B | `@RequirePermissions` + `PermissionsGuard` | 装饰器 + Guard | 系统级权限 | 角色、用户、运行时配置等管理后台 |
| C | `RolesGuard` | Guard | 角色判断 | 配合 B 一起使用 |
| D | `FileSystemPermissionService.checkNodePermission()` | Service 方法 | 文件/节点级 | SearchService, MxCadController 内联调用 |
| E | `PermissionService.checkSystemPermission()` | Service 方法 | 系统级 | Controller 内联 + Guard 内部 |
| F | `ProjectPermissionService.checkPermission()` | Service 方法 | 项目级 | Guard 内部 + Controller 内联 |

---

## 二、Controller 审计清单

### 2.1 auth.controller.ts (19 个路由)

| 方法 | Guard | `@RequirePermission` | 内联权限检查 | 备注 |
|------|-------|---------------------|-------------|------|
| 全部 19 个 | 无 (`@Public()` 19处) | 无 | 无 | 认证端点全部公开，通过 `@Public()` 跳过 JwtAuthGuard |

**结论**: ✅ 一致。认证端点不应有权限检查。

### 2.2 file-system.controller.ts (22+ 个路由)

| 方法 | Guard | `@RequirePermission` | 内联权限检查 |
|------|-------|---------------------|-------------|
| 创建项目 | JwtAuthGuard, RequireProjectPermissionGuard, **PermissionsGuard** | `SYSTEM_PERMISSION` 相关 | 无 |
| 查询项目 | RequireProjectPermissionGuard | `FILE_OPEN` | 无 |
| 更新项目 | RequireProjectPermissionGuard | `PROJECT_UPDATE` | 无 |
| 删除项目 | RequireProjectPermissionGuard | `PROJECT_DELETE` | 无 |
| 获取节点树 | RequireProjectPermissionGuard | `FILE_OPEN` | 无 |
| 回收站管理(2) | RequireProjectPermissionGuard | `FILE_TRASH_MANAGE` | 无 |
| 创建文件夹 | RequireProjectPermissionGuard | `FILE_CREATE` | 无 |
| 获取节点(3) | RequireProjectPermissionGuard | `FILE_OPEN` | 无 |
| 更新节点 | RequireProjectPermissionGuard | `FILE_EDIT` | 无 |
| 删除节点 | RequireProjectPermissionGuard | `FILE_DELETE` | 无 |
| 移动节点 | RequireProjectPermissionGuard | `FILE_MOVE` | 无 |
| 复制节点 | RequireProjectPermissionGuard | `FILE_COPY` | 无 |
| 上传文件 | RequireProjectPermissionGuard | `FILE_UPLOAD` | 无 |
| 存储配额 | 无 Guard | `STORAGE_QUOTA` | 无 |
| 下载节点 | RequireProjectPermissionGuard | `FILE_DOWNLOAD` | 无 |
| 缩略图 | 无 Guard | 无 | **内联**: `systemPermissionService.checkSystemPermission` + `fileSystemService.checkFileAccess` |
| 项目权限检查 | RequireProjectPermissionGuard | `FILE_OPEN` | **内联**: `projectPermissionService.checkPermission` |
| 用户角色 | RequireProjectPermissionGuard | `FILE_OPEN` | 无 |
| 成员管理(4) | RequireProjectPermissionGuard | `PROJECT_MEMBER_*` | 无 |

**发现的问题**:
1. **缩略图端点 (line ~800)**: 没有 `@RequireProjectPermission` 装饰器，也没有 Guard，但在方法体内对已登录用户做 `systemPermissionService.checkSystemPermission` 和 `fileSystemService.checkFileAccess` 内联检查。**这是唯一一个完全没有装饰器 Guard、全靠 Service 内联检查的路由。**
2. **存储配额端点 (line ~571)**: 使用 `@RequirePermissions`（系统级），`@RequireProjectPermissionGuard` 没有被使用但 `PermissionsGuard` 被 class-level 包含。这是整个 Controller 中唯一使用 `PermissionsGuard` 项目权限之外的端点。
3. `checkProjectPermission` (line 1154): 已有 `@RequireProjectPermission(FILE_OPEN)` Guard 但仍在内联调用 `projectPermissionService.checkPermission` — **双重检查**。

### 2.3 mxcad.controller.ts (12+ 个路由)

| 方法 | Guard | `@RequireProjectPermission` | 内联权限检查 |
|------|-------|---------------------------|-------------|
| chunkisExist | JwtAuthGuard, RequireProjectPermissionGuard | `FILE_OPEN` | 无 |
| fileisExist | **JwtAuthGuard 仅** | 无 | **内联**: `buildContextFromRequest` 内调用 `projectPermissionService.checkPermission` / `systemPermissionService.checkSystemPermission` |
| checkDuplicate | **JwtAuthGuard 仅** | 无 | **内联**: (同上) |
| preloading  | JwtAuthGuard, RequireProjectPermissionGuard | `FILE_OPEN` | 无 |
| check-reference | 无 Guard | 无 | 无 |
| refresh-external-refs | 无 Guard | 无 | 无 |
| uploadFiles | **JwtAuthGuard 仅** | 无 | **内联**: `buildContextFromRequest` 内调用权限检查 |
| savemxweb | JwtAuthGuard, RequireProjectPermissionGuard | `CAD_SAVE` | 无 |
| save-as | **JwtAuthGuard 仅** | 无 | **内联**: `permissionService.checkNodePermission` (line 627) |
| up_ext_reference_dwg | JwtAuthGuard, RequireProjectPermissionGuard | `CAD_EXTERNAL_REFERENCE` | **内联**: `checkFileAccessPermission` |
| up_ext_reference_image | 无 Guard | 无 | **内联**: `checkFileAccessPermission` |
| checkThumbnail | 无 Guard | 无 | **内联**: `checkFileAccessPermission` |
| uploadThumbnail | 无 Guard | 无 | 无 |
| getNonCadFile | 无 Guard | 无 | **内联**: `checkFileAccessPermission` |
| getFilesDataFile | JwtAuthGuard | 无 | **内联**: `checkFileAccessPermission` |
| getFile | 无 Guard | 无 | **内联**: `checkFileAccessPermission` |

**发现的问题**:
1. **`check-reference`, `refresh-external-refs`, `checkThumbnail`, `uploadThumbnail`, `getFile`, `up_ext_reference_image`**: 全部没有 Guard。部分通过 `buildContextFromRequest` 或 `checkFileAccessPermission` 做内联检查，部分（如 `checkThumbnail` 无任何保护）直接暴露。
2. **save-as (line 550)**: 只有 `JwtAuthGuard`，但在方法体内做了详细的 `permissionService.checkNodePermission` 内联权限检查。这是混合模式的典型例子。
3. **fileisExist, checkDuplicate, uploadFiles (line 174, 208, 379)**: 只有 `JwtAuthGuard`，权限检查完全依赖 `buildContextFromRequest` 内联方法。

### 2.4 roles.controller.ts (18 个路由)

| 方法 | Guard | `@RequirePermissions` |
|------|-------|----------------------|
| 全部 18 个 | JwtAuthGuard, RolesGuard, **PermissionsGuard** | `SYSTEM_ROLE_*` |

**结论**: ✅ 一致。全部使用标准系统权限检查模式。`PermissionsGuard` 配合 `@RequirePermissions` 装饰器，无内联检查。

### 2.5 users.controller.ts (9 个路由)

| 方法 | Guard | `@RequirePermissions` |
|------|-------|----------------------|
| 全部 9 个 | JwtAuthGuard, RolesGuard, **PermissionsGuard** | `SYSTEM_USER_*` |

**结论**: ✅ 一致。全部使用标准系统权限检查模式。

### 2.6 version-control.controller.ts (2 个路由)

| 方法 | Guard | `@RequireProjectPermission` |
|------|-------|----------------------------|
| getFileHistory | JwtAuthGuard, RequireProjectPermissionGuard | `VERSION_READ` |
| getFileAtRevision | JwtAuthGuard, RequireProjectPermissionGuard | `VERSION_READ` |

**结论**: ✅ 一致。项目级版本控制权限。

### 2.7 library.controller.ts (2 个受保护路由)

| 方法 | Guard | `@RequirePermissions` |
|------|-------|----------------------|
| createDrawingFolder | JwtAuthGuard, PermissionsGuard | `LIBRARY_DRAWING_MANAGE` |
| uploadDrawing | JwtAuthGuard, PermissionsGuard | `LIBRARY_BLOCK_MANAGE` |

**注意**: 两个路由体内还调用了 `fileSystemService.checkFileAccess` 做额外的节点级校验。

### 2.8 runtime-config.controller.ts (5 个路由)

| 方法 | Guard | `@RequirePermissions` |
|------|-------|----------------------|
| 全部 5 个 | JwtAuthGuard | `SYSTEM_CONFIG_READ` 或 `SYSTEM_CONFIG_WRITE` |

**注意**: 只有 `JwtAuthGuard` + `@RequirePermissions`，没有 `PermissionsGuard`（但 `@RequirePermissions` 的设计本身就包含 Guard 逻辑，在 NestJS 中它是通过 custom decorator 实现的）。

### 2.9 auth.controller.ts (19 个路由)

全部 `@Public()` — 不需要权限检查。✅

### 2.10 其他 Controller

| Controller | Guard | 模式 | 评价 |
|-----------|-------|------|------|
| **admin** (1路由) | JwtAuthGuard, RolesGuard, PermissionsGuard | `SYSTEM_ADMIN` | ✅ 一致 |
| **audit-log** (1路由) | JwtAuthGuard, PermissionsGuard | `SYSTEM_ADMIN` | ✅ 一致 |
| **user-cleanup** (1路由) | JwtAuthGuard, PermissionsGuard | `SYSTEM_USER_DELETE` | ✅ 一致 |
| **fonts** (4路由) | JwtAuthGuard, PermissionsGuard | `SYSTEM_FONT_*` | ✅ 一致 |
| **health** (3路由+1@Public) | JwtAuthGuard, PermissionsGuard | `SYSTEM_MONITOR` | ✅ — 健康检查端点标记为 `@Public` |
| **policy-config** (7路由) | JwtAuthGuard | `SYSTEM_ROLE_*` | ✅ 标准管理模式 |
| **public-file** (9路由) | 全部 `@Public()` | 公开访问 | ✅ — 公开文件访问无需认证 |
| **cache-monitor** (0守卫) | **无任何 Guard** | — | ⚠️ **无任何保护** |

---

## 三、Service 层内联权限检查审计

### 3.1 有内联权限检查的 Service

| Service | 方法 | 调用的权限方法 | 对应的 Controller Guard |
|---------|------|---------------|----------------------|
| **SearchService** | `search()` → `searchProjectFiles()` | `permissionService.checkNodePermission()` | 无直接 Controller（通过 `file-system.controller.ts` 的搜索路由调用） |
| **FileDownloadExportService** | `downloadNode()` | `permissionService.getNodeAccessRole()` (line 114) | Controller 有 `@RequireProjectPermission(FILE_DOWNLOAD)` |
| **FileDownloadExportService** | `downloadNodeWithFormat()` | `permissionService.getNodeAccessRole()` (line 187) | Controller 有 Guard |
| **FileDownloadExportService** | `checkFileAccess()` | `permissionService.getNodeAccessRole()` | 被 Controller 和 Library Controller 内联调用 |
| **LibraryService** | (某些方法) | `permissionService.checkSystemPermission()` (line 146) | Controller 有 `@RequirePermissions` |
| **FileSystemService** | `checkFileAccess()` | 委托给 `FileDownloadExportService.checkFileAccess()` | 被多处内联调用 |

### 3.2 无任何权限检查的公共 Service

以下 Service 的所有 public 方法均**不做任何权限检查**（职责纯粹为业务逻辑）：

- `FileTreeService`, `FileOperationsService`, `ProjectCrudService` — 纯文件系统操作，由 Controller Guard 保护
- `FileConversionService`, `FileMergeService`, `ChunkUploadService`, `ChunkUploadManagerService` — 纯文件处理
- `FileSystemNodeService`, `NodeCreationService` — 纯节点管理
- `MxCadService`, `SaveAsService`, `UploadOrchestrator` — 纯业务编排
- `RolesService`, `ProjectRolesService` — 由 Controller 保护
- `UsersService`, `AuthService` (各子服务) — 身份认证/用户管理
- `VersionControlService` — 纯 SVN 操作
- `CacheManagerService`, `ThumbnailGenerationService`, `StorageCheckService` 等基础设施服务
- `PolicyEngineService`, `PolicyConfigService`, `RuntimeConfigService` — 由 Controller 保护
- `PersonalSpaceService` — 委派给其他服务

---

## 四、关键发现汇总

### ⚠️ 问题 1: MxcadController 权限模式不统一

该 Controller 存在三种权限模式混用：

```
模式 1 (标准 Guard):  chunkisExist, savemxweb, preloading
   → @UseGuards + @RequireProjectPermission

模式 2 (混合):  fileisExist, checkDuplicate, uploadFiles
   → 只有 JwtAuthGuard，权限检查在 buildContextFromRequest 内联

模式 3 (无保护):  check-reference, refresh-external-refs, checkThumbnail,
                  uploadThumbnail, getFile (not HEAD), up_ext_reference_image
   → 无任何 Guard，部分有内联检查部分没有
```

### ⚠️ 问题 2: Service 层双重检查

`SearchService.searchProjectFiles()` 调用 `permissionService.checkNodePermission()` 但在 `file-system.controller.ts` 的搜索路由上已经有 `@RequireProjectPermission(FILE_OPEN)` Guard。服务层和 Guard 层**重复了同一权限检查**。

`FileDownloadExportService.downloadNode()` 调用 `getNodeAccessRole()` 但对应的 Controller 路由已有 `@RequireProjectPermission(FILE_DOWNLOAD)` Guard。

### ⚠️ 问题 3: 缩略图和安全端点无保护

`MxcadController` 中的 `checkThumbnail(localhost:3001:GET)`, `uploadThumbnail`, `getFile` (GET), 以及 `file-system.controller.ts` 的缩略图端点都是完全公开的或仅依赖内联检查。缩略图本身风险低，但 `getFile` 返回 mxweb 文件内容。

### ⚠️ 问题 4: cache-monitor.controller.ts 无任何 Guard

整个 controller 没有任何认证或权限保护。虽然 cache-monitor 通常只是读取缓存指标，但仍然应该至少有 `JwtAuthGuard`。

### ✅ 良好实践

1. **Roles / Users / RuntimeConfig / Audit / Admin 等后台模块**: 全部使用统一的 `JwtAuthGuard + RolesGuard + PermissionsGuard` + `@RequirePermissions` 模式，一致性高。
2. **FileSystemController**: 22+ 个方法中有 20 个使用一致的 `@RequireProjectPermission` 模式，模式明确。
3. **AuthFacadeService 及认证子服务**: 不包含任何内联权限检查——认证和授权在代码层面是分离的。

---

## 五、统计

| 指标 | 数值 |
|------|------|
| 总 Controller 数 | 17 |
| 总路由方法数 | ~110+ |
| 使用 `@RequireProjectPermission` 的路由 | 32 (file-system 20 + mxcad 4 + version-control 2 + ...) |
| 使用 `@RequirePermissions` 的路由 | 47+ (roles 18 + users 9 + runtime 5 + 其他) |
| 同时使用两种装饰器的路由 | 1 (file-system.controller 创建项目) |
| 仅有 JwtAuthGuard 的路由 | 10 (mxcad controller) |
| 完全无 Guard 的路由 | 10+ (mxcad + file-system 缩略图 + cache-monitor) |
| Service 层内联权限检查点 | 6 处 |
| 双重检查（Guard + Service 都检查） | 2 处 (SearchService, FileDownloadExportService) |

---

## 六、改进建议

### Phase 2 方向

1. **明确分层策略**: 建议采用 "Controller Guard 负责"要不要放行这个请求"，Service 层不再重复检查"的方向。需要将目前 Service 层的内联检查迁移到 Controller Guard。

2. **补全缺失的 Guard**:
   - `MxcadController`: 为所有缺少 Guard 的端点添加 `JwtAuthGuard` + 适当的 `@RequireProjectPermission`
   - `cache-monitor.controller.ts`: 添加 `JwtAuthGuard`
   - `file-system.controller.ts` 缩略图端点: 添加 `JwtAuthGuard` + 适当的权限装饰器

3. **消除双重检查**:
   - 移除 `SearchService` 中的 `checkNodePermission` 调用（已由 Controller Guard 覆盖）
   - 移除 `FileDownloadExportService` 中的 `getNodeAccessRole` 调用（已由 Controller Guard 覆盖）

4. **统一内联检查模式**: 将 `MxcadController` 中的 `buildContextFromRequest` 中的权限检查逻辑提取为独立的 Guard 或中间件。
