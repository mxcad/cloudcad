# FileSystem CRUD — 逻辑意图审计报告

> **对比基线:** `main` 分支 (旧版，功能完整) vs `refactor/circular-deps` (新版，重构中)
> **审计日期:** 2026-05-08
> **范围:** 项目/文件/文件夹 CRUD、回收站、下载、缩略图、权限检查、搜索

---

## 1. API 端点对比

### 1.1 项目 CRUD

| 端点 | main | current | 状态 |
|---|---|---|---|
| `POST projects` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `GET projects` | ✓ | ✓ | SAME |
| `GET personal-space` | ✓ | ✓ | SAME |
| `GET personal-space/by-user/:userId` | ✓ (admin) | ✗ | 🔴 MISSING |
| `GET projects/trash` | ✓ | ✗ | 🔴 MISSING |
| `GET projects/:projectId` | ✓ | ✓ | SAME |
| `PATCH projects/:projectId` | ✓ | ✗ | 🔴 MISSING |
| `DELETE projects/:projectId` | ✓ | ✗ | 🔴 MISSING |

### 1.2 回收站管理

| 端点 | main | current | 状态 |
|---|---|---|---|
| `GET trash` | ✓ | ✓ | SAME |
| `POST trash/restore` | ✓ | ✓ (+ userId param) | SAME |
| `DELETE trash/items` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `DELETE trash` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `GET projects/:projectId/trash` | ✓ | ✓ | SAME |
| `POST nodes/:nodeId/restore` | ✓ | ✓ (+ userId param, `@CsrfProtected`) | SAME |
| `DELETE projects/:projectId/trash` | ✓ | ✗ | 🔴 MISSING |

### 1.3 节点操作

| 端点 | main | current | 状态 |
|---|---|---|---|
| `POST nodes` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `POST nodes/:parentId/folders` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `GET nodes/:nodeId` | ✓ | ✓ | SAME |
| `GET nodes/:nodeId/root` | ✓ | ✓ | SAME |
| `GET nodes/:nodeId/children` | ✓ | ✓ | SAME |
| `PATCH nodes/:nodeId` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `DELETE nodes/:nodeId` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `POST nodes/:nodeId/move` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `POST nodes/:nodeId/copy` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |

### 1.4 文件上传下载

| 端点 | main | current | 状态 |
|---|---|---|---|
| `POST files/upload` | ✓ | ✗ | 🔴 MISSING |
| `OPTIONS nodes/:nodeId/download` | ✓ | ✓ | SAME |
| `GET nodes/:nodeId/download` | ✓ | ✓ | SAME |
| `GET nodes/:nodeId/download-with-format` | ✓ | ✓ | SAME |
| `GET nodes/:nodeId/thumbnail` | ✓ | ✓ (简化权限逻辑) | ⚠️ CHANGED |

### 1.5 配额管理

| 端点 | main | current | 状态 |
|---|---|---|---|
| `GET quota` | ✓ | ✓ (+ `userId` query param) | SAME |
| `POST quota/update` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |

### 1.6 成员管理

| 端点 | main | current | 状态 |
|---|---|---|---|
| `GET projects/:projectId/members` | ✓ (FILE_OPEN) | ✓ (PROJECT_MEMBER_MANAGE) | ⚠️ PERMISSION CHANGED |
| `POST projects/:projectId/members` | ✓ | ✓ (+ `@CsrfProtected`, `AddProjectMemberDto`) | SAME |
| `PATCH projects/:projectId/members/:userId` | ✓ | ✓ (+ `@CsrfProtected`, `@ApiBody`) | SAME |
| `DELETE projects/:projectId/members/:userId` | ✓ | ✓ (+ `@CsrfProtected`) | SAME |
| `POST projects/:projectId/transfer` | ✓ | ✗ | 🔴 MISSING |
| `POST projects/:projectId/members/batch` | ✓ | ✗ | 🔴 MISSING |
| `PATCH projects/:projectId/members/batch` | ✓ | ✗ | 🔴 MISSING |

### 1.7 权限与搜索

| 端点 | main | current | 状态 |
|---|---|---|---|
| `GET projects/:projectId/permissions` | ✓ | ✓ | SAME |
| `GET projects/:projectId/permissions/check` | ✓ | ✓ (+ `@ApiQuery` enum) | SAME |
| `GET projects/:projectId/role` | ✓ | ✓ | SAME |
| `GET search` | ✓ | ✓ | SAME |

---

## 2. 后端子服务对比

### 2.1 FileSystemController

| 维度 | main | current |
|---|---|---|
| 导入路径 | `./services/` 目录 | 分散到 `../file-operations/`, `./file-tree/`, `./file-download/`, `./search/` |
| CSRF 保护 | 无 | 所有 mutating 端点加 `@CsrfProtected()` |
| DTO | `{ userId, projectRoleId }` 内联 | `AddProjectMemberDto` 专用 DTO |
| 上传端点 | 有 `POST files/upload` | 缺失 |
| 更新项目端点 | 有 `PATCH projects/:projectId` | 缺失 |
| 删除项目端点 | 有 `DELETE projects/:projectId` | 缺失 |
| 已删除项目列表 | 有 `GET projects/trash` | 缺失 |
| 项目转移所有权 | 有 `POST projects/:projectId/transfer` | 缺失 |
| 批量成员操作 | 有 batch add/update | 缺失 |
| 清空项目回收站 | 有 `DELETE projects/:projectId/trash` | 缺失 |
| 管理员获取他人空间 | 有 `GET personal-space/by-user/:userId` | 缺失 |
| 缩略图权限 | 分别检查 library permissions | 统一使用 `checkFileAccess` |

### 2.2 FileSystemService (Facade)

| 维度 | main | current |
|---|---|---|
| 子服务路径 | `./services/project-crud.service.ts` | `../file-operations/project-crud.service.ts` |
| 子服务路径 | `./services/file-tree.service.ts` | `./file-tree/file-tree.service.ts` |
| 子服务路径 | `./services/file-operations.service.ts` | `../file-operations/file-operations.service.ts` |
| 下载子服务 | `./services/file-download-export.service.ts` | `./file-download/file-download-export.service.ts` |
| 成员子服务 | `./services/project-member.service.ts` | `./project-member/project-member.service.ts` |
| 存储子服务 | `./services/storage-info.service.ts` | `./storage-quota/storage-info.service.ts` |
| `uploadFile` | 抛出 `Error('尚未实现到子服务中')` | 抛出 `NotImplementedException` |
| `getTrashItems` | 抛出 `Error('尚未实现')` | 委托给 `projectCrudService.getUserDeletedProjects` |
| `restoreTrashItems` | 不含 userId 参数 | 含 userId 参数 |
| `restoreNode` | 不含 userId 参数 | 含 userId 参数 |
| `batchAddProjectMembers` | 不含 operatorId | 含 operatorId |
| `batchUpdateProjectMembers` | 不含 operatorId | 含 operatorId |
| 新增方法 | 无 | `getCategoryTree(nodeId)` |

### 2.3 FileOperationsService（核心操作）

**逻辑意图: SAME，但实现细节有以下关键差异：**

| 差异项 | main | current | 影响 |
|---|---|---|---|
| 版本控制注入 | 直接注入 `VersionControlService` | `@Inject(VERSION_CONTROL_TOKEN)` + `IVersionControl` 接口 | 解耦更好 |
| 物理删除文件 | `fsPromises.rm(nodeDirectoryPath, ...)` | `storageProvider.deleteAll(nodeDirRelativeKey)` | 抽象层替换 |
| 级联软删除 | `softDeleteDescendants` 递归更新子节点 | 事务内 `collectChildNodes` + `updateMany` | current 更安全 |
| 永久删除事务 | 逐个 `update()` 子节点 | `updateMany()` 批量更新 | current 避免并发记录不存在 |
| fileHash 引用检查 | 无 | `deleteFileIfNotReferenced` 检查其他节点引用 | current 更安全 |
| restoreNode | 无权限检查 | 检查 libraryKey 权限 + project 权限 | current 增加安全性 |
| restoreNode | 无级联恢复 | 恢复项目时级联恢复子节点 | current 修复 bug |
| 新增方法 | 无 | `collectChildNodes()`, `getParentProjectId()` | 辅助方法 |

### 2.4 FileTreeService

| 维度 | main | current |
|---|---|---|
| 文件拷贝方式 | `fsPromises.copyFile(sourcePath, storageInfo.filePath)` | `storageService.copyFromFs(sourcePath, storageInfo.fileRelativePath)` |
| 新增方法 | 无 | `getCategoryTree()` — PostgreSQL 递归 CTE 获取资源库分类树 |
| page/limit 安全转换 | 无 | `Number(page) \|\| 1` 防止 NaN |
| getChildren BUG | 无 | **重复 return 语句 (行 405-419)** |

### 2.5 FileDownloadHandlerService

| 维度 | main | current |
|---|---|---|
| FileSystemService 注入 | 必须注入 (constructor param) | `@Optional()` — 可能为 undefined |

### 2.6 FileValidationService & FileHashService

| 文件 | 状态 |
|---|---|
| `file-validation.service.ts` | **逻辑完全相同** |
| `file-hash.service.ts` | **逻辑完全相同** |

---

## 3. 前端组件对比

> 前端 FileSystemManager 目录在 current 分支不存在，仅存在于 main。
> 前端 `pages/components/` 中的以下文件在 current 分支存在且与 main 相同：
> - `BatchActionsBar.tsx`
> - `FileGrid.tsx`
> - `FileSystemHeader.tsx`
> - `FileSystemToolbar.tsx`
> - `ProjectFilterTabs.tsx`
>
> **注意:** `FileSystemManager.tsx` 主页面及 `FileSystemManager/` 子目录在 current 分支未找到。

---

## 4. 汇总

### 🔴 NEEDS DECISION — 缺失端点（必须决定保留/废弃）

| # | 端点 | 功能 | 建议 |
|---|---|---|---|
| 1 | `GET personal-space/by-user/:userId` | 管理员查看他人私人空间 | 评估需求 |
| 2 | `GET projects/trash` | 已删除项目列表 | **需要恢复** |
| 3 | `PATCH projects/:projectId` | 更新项目名称/描述/状态 | **需要恢复** |
| 4 | `DELETE projects/:projectId` | 删除/恢复项目 | **需要恢复** |
| 5 | `DELETE projects/:projectId/trash` | 清空项目回收站 | **需要恢复** |
| 6 | `POST files/upload` | 文件上传 (Base64) | **需要恢复** |
| 7 | `POST projects/:projectId/transfer` | 转移项目所有权 | 评估需求 |
| 8 | `POST projects/:projectId/members/batch` | 批量添加成员 | 评估需求 |
| 9 | `PATCH projects/:projectId/members/batch` | 批量更新成员角色 | 评估需求 |

### ⚠️ 语义变更（需确认意图）

| # | 变更点 | 说明 |
|---|---|---|
| 1 | 成员列表权限: `FILE_OPEN` → `PROJECT_MEMBER_MANAGE` | 更严格的权限要求，可能影响前端展示 |
| 2 | 缩略图权限: 分别检查 library/system 权限 → 统一 `checkFileAccess` | 逻辑简化但可能改变行为 |
| 3 | `getTrashItems`: 错误抛出 → 委托到 `getUserDeletedProjects` | 语义变化（原实现返回混合列表） |
| 4 | `FileDownloadHandlerService`: 强制注入 → `@Optional()` | 若未注入会导致运行时错误 |

### ✅ 重构改进（current 分支更好）

| # | 改进点 | 说明 |
|---|---|---|
| 1 | 模块拆分 | Controller/Service 按职责拆分为独立子模块 |
| 2 | CSRF 保护 | 所有 mutating 端点添加 `@CsrfProtected()` |
| 3 | 接口抽象 | `IVersionControl`, `IStorageProvider` 替代直接依赖 |
| 4 | 级联软删除 | `collectChildNodes` + `updateMany` 更安全高效 |
| 5 | fileHash 引用检查 | 防止误删被共享引用的物理文件 |
| 6 | 恢复节点权限检查 | `restoreNode` 增加了资源库/项目权限验证 |
| 7 | 项目恢复级联 | 恢复项目根节点时级联恢复子节点 |
| 8 | 资源库分类树 | 新增 `getCategoryTree` CTE 端点 (性能优化) |
| 9 | `updateMany` 批量操作 | 避免事务内并发记录不存在错误 |

### 🐛 当前分支已知 BUG

| # | 文件 | 问题 |
|---|---|---|
| 1 | `file-tree.service.ts` | `getChildren()` 方法中有重复 return 语句 (行 405-419)，第二个永远不会执行 |
