# file-operations 模块说明

## 概述

`file-operations` 是文件系统写操作的**服务层子模块**（无 Controller，不直接暴露 HTTP 路由），统一承载文件树节点的变更不变量：**权限 → 配额 → 缓存失效**三步检查由 `NodeMutationGuard` 收敛（ADR-0037），其上是移动/复制、删除/回收站、重命名、项目/文件夹 CRUD 等业务服务。所有写路径共享同一校验入口，避免各 Controller/Service 各自实现导致的不一致。

主要消费者为 `file-system` 模块的控制器（node/project/trash）与 `library`、`mxcad/upload` 等业务模块。

## 目录结构

```
src/file-operations/
├── file-operations.module.ts   # 模块注册（无 controller，纯服务导出）
├── file-operations.service.ts  # NodeUpdateService（节点重命名/描述更新）
├── node-mutation.guard.ts      # NodeMutationGuard（变更守卫：权限+配额+缓存失效）
├── node-name.service.ts        # NodeNameService（重名检查/唯一名生成）
├── node-trash.service.ts       # NodeTrashService（删除/回收站/恢复，最大最复杂）
├── node-copy-move.service.ts   # NodeCopyMoveService（复制/移动/批量操作）
├── project-crud.service.ts     # ProjectCrudService（项目/文件夹 CRUD、查询）
└── *.spec.ts                   # 各服务单元测试（另见 src/test/unit/file-delete-recycle.unit.spec.ts）
```

## 模块注册（file-operations.module.ts）

- **imports**：Database、Common、Permission、StorageManagement、VersionControl、Storage、PersonalSpace、Roles、Ownership、FileTree、StorageQuota、AuditLog 共 12 个模块。
- **providers / exports**（两者一致，7 个）：`NodeUpdateService`、`NodeTrashService`、`NodeCopyMoveService`、`NodeNameService`、`ProjectCrudService`、`NodeMutationGuard`，以及**外部注册**的 `NodeStatusTransitioner`（实现位于 `file-system/file-status/`，本模块将其纳入 providers 以便事务内复用文件状态机）。

## 核心组件详解

### 1. NodeMutationGuard（node-mutation.guard.ts）— 变更守卫（ADR-0037）

「修改 FileSystemNode」的不变量序列统一入口，**所有 file-operations 写操作必须先经 `assertMutationAllowed`，变更后经 `invalidateQuotaAfterMutation` 失效配额缓存**。

| 公开方法 | 职责 |
|---|---|
| `resolveProjectContext(node)` | 沿祖先链解析节点归属上下文（TreeWalker 纯 CTE，不依赖 projectId 字段短路） |
| `assertMutationAllowed(userId, action, ctx)` | 前置断言：权限 + 配额一步完成 |
| `assertProjectQuota(userId, predictedAdditional=1)` | 项目数量配额（MAX_PROJECTS），建/恢复项目用 |
| `assertByteQuota(ctx, ownerId)` | 字节配额单独断言（restoreNode 等权限断言之后使用） |
| `invalidateQuotaAfterMutation(userId, node, extraProjectId?)` | 变更后配额缓存失效（含跨项目时的第二 projectId） |

核心语义（`MutationContext = { node: {id}, target?, incrementBytes? }`）：

- **归属分派**：`OwnershipPermissionFactory` 按 `node.nodeType` 将动作（create/update/move/copy/delete/restore/trash/project-*）分派至项目 / 个人空间 / 资源库三策略（见 `ownership` 模块），动作粒度断言。
- **配额语义**：`PROJECT_SIZE` 为基，仅当变更目标位于该用户个人空间时才追加 `PERSONAL_STORAGE`（避免项目间操作被个人空间配额误拦）；`incrementBytes` 为正时才检查。
- **资源库豁免**：公共资源库（图纸库/图块库，含库内子节点）为系统内部库，源或目标任一侧属库即跳过字节配额。

### 2. NodeTrashService（node-trash.service.ts）— 回收站机制

删除与恢复的完整闭环，物理文件删除带引用计数与路径安全校验。

| 公开方法 | 职责 |
|---|---|
| `deleteNode(nodeId, permanently=false, userId?)` | 软删：置 `deletedAt`，根类型转 `projectStatus=DELETED`、普通节点经状态机转 `fileStatus=DELETED`，子节点级联 `deletedByCascade=true`；硬删：事务删除 DB 行 + 物理文件删除 |
| `deleteProject(projectId, permanently, userId)` | 仅项目 owner 可删（Forbidden），个人空间禁止删除 |
| `restoreNode(nodeId, userId)` | 权限 + 配额（恢复体积计入目标配额）断言；父节点已删则拒绝；资源库恢复需 `LIBRARY_*_MANAGE` 系统权限，普通项目需 `FILE_OPEN`；级联恢复子节点并转 `COMPLETED`；重名自动 `(N)` 改名 |
| `restoreProject(projectId)` | 重名处理 + 委托 `restoreNode` |
| `restoreTrashItems(itemIds, userId)` | 批量恢复：先按 owner 聚合做 MAX_PROJECTS 配额预检，再逐项权限断言与恢复 |
| `permanentlyDeleteProject / permanentlyDeleteNode(projectId/nodeId, commitMx)` | 彻底删除：事务删除子树 DB 行 → 物理文件删除 → 可选 MX `commitWorkingCopy` |
| `permanentlyDeleteTrashItems(itemIds, userId)` | 批量彻底删除 + 一次 MX 提交 |
| `clearTrash(userId)` / `clearProjectTrash(projectId, userId)` | 清空用户可访问（owner/成员/个人空间）回收站 / 项目内回收站 |
| `batchDeleteNodes(nodeIds, permanently, userId)` | 批量删除，返回 success/failed 统计 |
| `softDeleteDescendants(tx, nodeId)` | 事务内递归软删子节点；PROCESSING 状态不可直达 DELETED，先 FAILED 再 DELETED 保证流程不中断 |
| `deleteDescendantsWithFiles(tx, nodeId)` / `deleteFileIfNotReferenced(...)` | 事务内递归删子节点及物理文件；按 `fileHash` 引用计数跳过仍被引用的文件 |
| `deleteFileFromStorage(nodePath, fileHash, commitMx)` | 单文件物理删除（含 MX 标记删除） |

**物理删除安全措施**：目录名必须以节点 id 结尾（防路径穿越，失败即拒删）；`fileHash` 被其他未删节点引用时跳过物理删除；MX 版本控制就绪时先 `deleteNodeDirectory` 再提交。

### 3. NodeCopyMoveService（node-copy-move.service.ts）— 复制/移动

| 公开方法 | 职责 |
|---|---|
| `moveNode(nodeId, targetParentId, userId?)` | 目标父节点类型校验（FOLDER/PROJECT/PERSONAL_SPACE/LIBRARY_*），禁移自身，目标父校验，重名自动改名，`projectId` 沿目标上溯重算；配额增量**仅跨项目**时按子树体积计入（同项目为 0，防重复计数） |
| `copyNode(nodeId, targetParentId, userId?)` | 复制前按复制总大小校验目标配额；委托 `copyNodeRecursive` 递归复制 |
| `copyNodeRecursive(sourceNodeId, targetParentId, newName, ownerId)` | 递归复制子树：文件物理复制走 `StorageManager.copyNodeDirectory`，子节点逐个重名去重 |
| `batchMoveNodes / batchCopyNodes(nodeIds, targetParentId, userId?)` | 批量操作：先 `filterDescendantNodes` 剔除含父子关系的冗余 id，逐个执行，返回 `{successCount, failedCount, successIds, failedIds, errors}` |

子树体积聚合：仅统计未删除且 COMPLETED 的文件，`size` 为 null 的节点按物理文件大小兜底（防配额增量被算成 0，#215）。

### 4. NodeNameService（node-name.service.ts）— 名称唯一性

| 公开方法 | 职责 |
|---|---|
| `checkNameUniqueness(name, userId, parentId, excludeNodeId?)` | parentId 为空时查用户项目级（ownerId + PROJECT + insensitive）；非空查同级节点；冲突抛 BadRequest |
| `generateUniqueName(parentId, baseName, isFolder)` | 生成 `name (N)` 唯一名：文件保留扩展名，正则解析已有计数取最大值 +1 |

### 5. NodeUpdateService（file-operations.service.ts）— 重命名/描述

- `updateNode(nodeId, dto, userId?)`：权限断言（update 动作）→ **扩展名保护**（禁止修改扩展名；改名漏写扩展名时自动补回）→ 同级重名检查 → 更新 name/description。`fileStatus` 的流转已收敛至 `NodeStatusTransitioner`，此处不再直写（ADR-0035）。

### 6. ProjectCrudService（project-crud.service.ts）— 项目/文件夹 CRUD

| 公开方法 | 职责 |
|---|---|
| `createNode(userId, name, options?)` | 无 parentId 为**建项目**：PROJECT_CREATE 系统权限 + `assertProjectQuota` + 查找系统 `PROJECT_OWNER` 角色 + 创建 projectMembers 记录；有 parentId 为**建文件夹**：父节点必须非 FILE，create 权限断言，重名检查后创建并回填 projectId |
| `createProject(userId, dto)` | 委托 createNode |
| `createFolder(userId, parentId, dto)` | 支持 `skipIfExists`（同名已存在直接返回现有文件夹） |
| `getUserProjects(userId, query)` | 项目列表：filter（owned/joined/all）、搜索（FTS）、projectStatus、白名单排序（name/createdAt/updatedAt/size）、分页，附带 children/member 计数 |
| `getUserDeletedProjects(userId, query)` | 回收站中的项目列表（搜索限定 `deletedAt IS NOT NULL`） |
| `getProject(projectId, includeDeleted=false)` | 项目详情：成员（含角色）+ 未删子节点 |
| `updateProject(projectId, dto, userId?)` | project-update 权限断言 + 重名检查，更新 name/description/status |
| `getPersonalSpace(userId)` / `getStoragePath(node)` / `getFullPath(nodePath)` / `getStorageManager()` | 个人空间查询与存储路径工具 |

**职责边界**：项目/文件夹的**查询与创建/更新**在此服务；**删除/恢复**在 NodeTrashService；文件上传、状态转换、配额统计不在本模块（分别在 mxcad、file-system/file-status、storage-quota）。

## 数据模型

- 主表：`fileSystemNode`（FileSystemNode，见 `packages/db/prisma/schema.prisma`），删除语义字段：`deletedAt`（软删标记）、`deletedByCascade`（级联删除标记，回收站过滤条件）、`deletedFromStorage`（物理文件已删）、`projectStatus`（PROJECT 根类型状态）、`fileStatus`（文件状态，经状态机流转）、`fileHash`（物理文件引用计数去重）。
- 涉及枚举：`NodeType`（FILE/FOLDER/PROJECT/PERSONAL_SPACE/LIBRARY_DRAWING/LIBRARY_BLOCK 等）、`ProjectStatus`（ACTIVE/DELETED）、`FileStatus`（COMPLETED/PROCESSING/DELETED 等）。

## 安全措施

1. **统一变更守卫**：所有写操作经 `NodeMutationGuard.assertMutationAllowed`，权限按归属分派、配额按策略键组合，杜绝绕过。
2. **配额防误拦**：同项目移动增量 0；资源库豁免；个人空间配额仅统计个人空间内文件。
3. **物理删除保护**：路径必须以节点 id 结尾才允许删目录；`fileHash` 引用计数防误删共享文件；MX 删除失败只记日志不阻断。
4. **扩展名不可变**：updateNode 禁止改扩展名，防类型伪装。
5. **删除状态机**：PROCESSING 不可直达 DELETED，经 FAILED 过渡，保证删除流程不中断。
6. **事务一致性**：子树删除/级联软删均在 `$transaction`（30s 超时）内完成。

## 调用方

- `file-system/controllers/node.controller.ts`：ProjectCrudService、NodeTrashService、NodeCopyMoveService、NodeUpdateService
- `file-system/controllers/project.controller.ts`：ProjectCrudService、NodeTrashService
- `file-system/controllers/trash.controller.ts`：NodeTrashService
- `library/library.service.ts`、`library/services/public-library.service.ts`、`library/library.module.ts`（factory）：NodeTrashService、NodeCopyMoveService、NodeUpdateService、ProjectCrudService、NodeMutationGuard
- `mxcad/upload/drawing-ingest.service.ts`：NodeTrashService（上传失败清理）；`mxcad/upload/upload-utility.service.ts`：NodeNameService

## 测试

- 单测：`node-mutation.guard.spec.ts`、`node-name.service.spec.ts`、`node-copy-move.service.spec.ts`、`node-trash.service.spec.ts`、`file-operations.service.spec.ts`、`project-crud.service.spec.ts`。
- 集成：`test/integration/workflow-3-delete-recycle-permanent.integration.spec.ts`（删除-回收站-永久删除链路）；`src/test/unit/file-delete-recycle.unit.spec.ts`（mock 单测，删除-回收站-恢复链路，验证配额缓存失效与 fileStatus 流转收敛）。
