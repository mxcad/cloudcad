# CloudCAD 文件系统模块（file-system）

## 概述

文件系统模块是 CloudCAD 的核心业务模块之一，负责**项目 / 文件树 / 回收站 / 下载 / 成员 / 搜索 / 配额**等全部文件管理能力。它与其他模块的分工如下：

- **file-operations**（本模块之外）：文件树节点的增删改、移动、复制、回收站等"变更操作"的业务实现（`ProjectCrudService`、`NodeTrashService`、`NodeCopyMoveService` 等），本模块通过 controller 委托其执行；
- **mxcad**（CAD 引擎模块）：文件上传（mxcad-upload）、格式转换（`IMxcadConversionService`，用于下载时 DWG/DXF/PDF 转换）、缩略图生成（`thumbnail-utils`，缩略图读取）；文件状态的写入统一经本模块的 `NodeStatusTransitioner`（ADR-0035/0037）；
- **storage / storage-management**（存储抽象）：唯一纯存储接口 `IStorageProvider`（token `'IStorageProvider'`，read/write/delete/exists/copy/move 等，无 SVN 能力）；`StorageManager` 提供节点物理目录分配与路径解析。SVN 历史能力经 `version-control/` 的 `IVersionControl`（`VERSION_CONTROL_TOKEN`）获取（#273/#274 合并后单轨）；
- **roles / permission**（权限体系）：`IProjectPermissionService` 提供项目级权限判定与缓存，本模块的守卫与 `FileSystemPermissionService` 均依赖它。

所有 HTTP 响应由全局 `ResponseInterceptor` 统一包装为 `{ code, message, data, timestamp }`，Controller 直接 `return` 业务结果。

## 目录结构

```
src/file-system/
├── file-system.module.ts        # 模块注册（7 个 controller + 10 个子模块）
├── controllers/                 # 7 个控制器（全部路由前缀 /file-system）
│   ├── project.controller.ts    # 项目 CRUD、个人空间、配额
│   ├── node.controller.ts       # 节点 CRUD/移动/复制/批量操作/搜索/路径解析
│   ├── trash.controller.ts      # 统一回收站
│   ├── download.controller.ts   # 缩略图、下载、多格式下载
│   ├── member.controller.ts     # 项目成员、转让、权限查询
│   ├── history.controller.ts    # 文件版本历史
│   └── batch-download.controller.ts # 跨节点批量 ZIP 下载
├── dto/                         # 18 个 DTO（请求校验 + Swagger 响应）
├── file-tree/                   # FileTreeService（树查询）+ TreeWalker（CTE 递归遍历）
├── file-permission/             # FileSystemPermissionService（节点级权限）
├── file-download/               # FileDownloadExportService / Handler / CrossNodeDownloadService
├── file-history/                # FileHistoryService（SVN 历史）
├── file-status/                 # FileStatusStateMachine + NodeStatusTransitioner（状态机）
├── file-validation/             # FileValidationService（类型/大小/魔数/文件名校验）
├── project-member/              # ProjectMemberService（成员 CRUD、转让）
├── search/                      # SearchService + FTS 查询构建 + 搜索语法解析
├── storage-quota/               # StorageInfoService（配额）+ NodeSizeResolverService
├── interfaces/                  # ISEARCH_SERVICE DI token
└── utils/                       # node-type.ts（isRoot/isFolder/toDto 等工具）
```

## 模块注册

`FileSystemModule` 聚合 9 个内部子模块：`FileValidationModule`、`StorageQuotaModule`、`FileTreeModule`、`FilePermissionModule`、`ProjectMemberModule`、`SearchModule`、`FileDownloadModule`，以及外部依赖 `FileOperationsModule`、`StorageModule`、`VersionControlModule`、`AuthModule.forRoot()`、`PermissionModule` 等。

关键导出（供其他模块复用）：`FileTreeService`、`FileTreeModule`、`FileDownloadModule`、`FilePermissionModule`、`FileHistoryService`、`CrossNodeDownloadService`。`NodeStatusTransitioner` 由 `file-operations` 与 `mxcad-upload` 模块纳入 providers 使用（状态写入唯一入口）。

## 核心组件

### 1. FileTreeService（file-tree/file-tree.service.ts）

文件树查询中枢，主要方法：

- `getNodeTree(nodeId)`：节点详情 + 直接子节点 + **祖先链**（一次递归 CTE 返回面包屑，替代前端 N 次请求）；
- `getChildren(nodeId, userId, query)`：子节点分页列表，支持关键词（FTS + ILIKE 合并）、nodeType/extension/fileStatus/时间/大小过滤，排序字段白名单校验；
- `getTrashItems(userId, options)`：统一回收站（跨全部有权限项目）与项目内回收站两种模式，过滤 `deletedByCascade` 排除级联删除，注入 `ancestorPath` 与 `childrenCountTrash`；
- `resolvePath(projectId, pathStr, userId)`：面包屑字符串（`项目A > 文件夹1 > 子文件夹`）解析为目标节点；
- `getParentContext(nodeId)`：目标节点在父目录中的分页位置（搜索结果高亮定位，SQL 直接计算 count）；
- `getAllFilesUnderNode(nodeId)`：子树全部文件（分页下推给 TreeWalker 的 `getSubtreeFilesPaginated`，消除 JS 递归 N+1）；
- `createFileNode(options)`：创建文件节点（同名自动追加 `(1)`、物理目录分配、事务内拷贝源文件）；
- `createDrawingFromTemplate({parentId, name, ownerId})`：从 `assets/templates/blank.mxweb` 模板创建空白图纸。

### 2. TreeWalker（file-tree/tree-walker.service.ts）

树遍历深模块：`resolveProjectId`（沿祖先链找第一个非 FILE/FOLDER 节点，个人空间根解析为自身）、`getSubtreeIds`、`getSubtreeFiles`、`getSubtreeFileIds`、`getSubtreeFilesPaginated`，全部走 `WITH RECURSIVE` SQL CTE，深度保护 50，排序列名经白名单映射防注入。

### 3. FileSystemPermissionService（file-permission/file-system-permission.service.ts）

节点级权限判定：`checkNodePermission`（经 TreeWalker 解析 projectId → `IProjectPermissionService.checkPermission`）、`getNodeAccessRole`（公共资源库返回 VIEWER / 项目所有者 OWNER / 成员角色）、`isLibraryNode`（LIBRARY_DRAWING / LIBRARY_BLOCK）、`clearNodeCache` / `clearUserCache`（成员变更后失效权限缓存）。

### 4. ProjectMemberService（project-member/project-member.service.ts）

成员管理业务：`addProjectMember` / `updateProjectMember` / `removeProjectMember`（管理员角色的增删改仅限项目所有者，`ensureNotAdmin`）、`transferProjectOwnership`（事务内：新所有者升级为 PROJECT_OWNER、原所有者降级为 PROJECT_ADMIN（缺失则 PROJECT_MEMBER）、ownerId 转移）、`batchAddProjectMembers` / `batchUpdateProjectMembers`（部分失败聚合返回）。所有操作写审计日志（AuditAction.ADD_MEMBER / UPDATE_MEMBER / REMOVE_MEMBER / TRANSFER_OWNERSHIP）并清理权限缓存。

### 5. FileDownloadExportService / Handler / CrossNodeDownloadService（file-download/）

- `FileDownloadExportService.downloadNode`：文件直传（`.dwg/.dxf` 自动追加 `.mxweb` 后缀）、目录递归 ZIP（archiver 流式压缩，限制：总大小/文件数/深度/单文件大小，均来自 `fileLimits` 配置，超标抛 400）；
- `downloadNodeWithFormat(nodeId, userId, format, pdfParams)`：CAD 文件（.dwg/.dxf/.mxweb）多格式下载 —— MXWEB 直传；DWG/DXF/PDF 经 `MXCAD_CONVERSION_SERVICE.convertServerFile` 服务端转换，转换前 `RestrictionEngine.reserveConversionCountOrThrow` 扣减 VIP 转换次数，成功后流式回传并删除临时转换文件；
- `FileDownloadHandlerService.handleDownload`：统一下载响应处理（Content-Type / 中文文件名 `filename*=UTF-8''` / ETag 304 缓存 / 流错误处理 / 审计 FILE_DOWNLOAD）；
- `CrossNodeDownloadService.createBatchZip`：逐节点校验 `FILE_DOWNLOAD` 权限后经 `IStorageProvider.read` 拉流打包 ZIP，失败节点写入 `errors/{nodeId}.txt` 不中断整体。

### 6. SearchService（search/search.service.ts）

统一搜索入口 `search(userId, dto, signal)`，按 `SearchScope` 分发 6 种范围：

| scope | 说明 |
|---|---|
| `project` | 项目列表（filter: all/owned/joined） |
| `project_files` | 指定项目内文件（必须带 projectId，校验 FILE_OPEN） |
| `all_projects` | 所有有权限项目中的文件（relation filter JOIN） |
| `library` | 公共资源库（libraryKey: drawing/block） |
| `global` | 项目 + 跨项目文件合并分页（sourceType: project/file） |
| `personal_space` | 个人空间内文件 |

支持搜索语法（`search-query.parser.ts`）：`ext:.dwg`、`type:file`、`status:...`、`modified:>2024-01-01`、`size:>10MB`、`sort:updatedAt-desc`、`"精确短语"`、`-排除词`，以及中文相对日期（今天/昨天/本周/上周/本月/上月）。关键词匹配 = PostgreSQL FTS（`searchVector` GIN 索引预匹配，`FtsQueryBuilder`）+ ILIKE 子串兜底；支持 `AbortSignal` 取消；结果注入 `ancestorPath`。实现 `ISearchService` 接口（`interfaces/search.interface.ts`）。

### 7. FileValidationService（file-validation/file-validation.service.ts）

上传校验链：`validateFile`（文件名 → 类型 → 大小）；`validateFileWithMagicNumber` 追加**魔数验证**（DWG 头部 `AC1xxx` 版本标记、DXF `0\r\nSEC` 结构、PDF `%PDF`），DWG/DXF 额外做文件结构深度校验；`sanitizeFilename`（去除路径分隔符/控制字符、255 字节截断、拒绝 `.`/`..` 隐藏文件）。大小上限从运行时配置 `maxFileSize`（MB）读取，类型白名单/黑名单来自静态配置 `upload`。

### 8. 文件状态机（file-status/）

`FileStatusStateMachine` 定义合法转换：`UPLOADING → PROCESSING|DELETED`、`PROCESSING → COMPLETED|FAILED`、`COMPLETED → DELETED`、`FAILED → PROCESSING|DELETED`、`DELETED → COMPLETED`（`null` 视为 COMPLETED 向后兼容）。`NodeStatusTransitioner.transition(nodeId, from, to, tx?)` 将「校验 + 写入」原子化，是 `fileStatus` 写入的唯一合法入口，支持在既有事务内执行。

### 9. StorageInfoService / NodeSizeResolverService（storage-quota/）

- `getStorageQuota(userId)`：个人空间配额（`StorageUsageService.usageSize` 实际用量 vs `MembershipService.getQuota(PERSONAL_STORAGE)` 限额），5 分钟内存缓存，`invalidateQuotaCache` 在节点创建/删除后调用；
- `getProjectQuota(projectId, userId)`：项目上传上限（PROJECT_SIZE）；
- `deleteMxCadFilesFromUploads(fileHash)`：按哈希清理 mxcad 上传暂存目录（含外部参照子目录）；
- `NodeSizeResolverService.resolveFileSize`：DB size 优先、null 时读物理文件兜底，防止 null size 绕过配额检查（#215）。

### 10. FileHistoryService / utils

- `FileHistoryService`：注入 `IVersionControl`（`VERSION_CONTROL_TOKEN`，经 `getFileHistory(path)`）返回 `HistoryEntry[]`（revision/message/author/timestamp），跨存储节点透明；
- `utils/node-type.ts`：`isRootNode` / `isFolderNode` / `isLibraryNode` / `getLibraryKeyFromNodeType` / `toDto`（服务层统一推导 isFolder/isRoot/libraryKey）。

## API 端点总表

路由前缀统一为 `file-system`；除 `HistoryController` 外所有 controller 挂载 `RequireProjectPermissionGuard` + `PermissionsGuard`（JWT 认证）。写操作（POST/PATCH/DELETE）带 `@CsrfProtected()`。标注"项目级"的端点在 `@RequireProjectPermission` 列写明所需权限，未标注者仅需登录。

### 项目（ProjectController）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/file-system/projects` | 系统级 PROJECT_CREATE | 创建项目 |
| GET | `/file-system/projects` | 登录 | 项目列表（search/status/分页/filter） |
| GET | `/file-system/projects/trash` | 登录 | 已删除项目列表 |
| GET | `/file-system/personal-space` | 登录 | 当前用户私人空间 |
| GET | `/file-system/projects/:projectId` | FILE_OPEN | 项目详情 |
| PATCH | `/file-system/projects/:projectId` | 登录 | 更新项目（name/description/status） |
| DELETE | `/file-system/projects/:projectId` | 登录 | 删除项目（`?permanently=true` 永久删除） |
| GET | `/file-system/quota` | 登录 | 个人空间存储配额 |
| GET | `/file-system/quota/project/:projectId` | FILE_OPEN | 项目上传上限 |

### 节点（NodeController）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/file-system/nodes` | 登录 | 创建节点（parentId 为空=创建项目/文件夹） |
| POST | `/file-system/nodes/:parentId/folders` | 登录 | 创建文件夹（支持 skipIfExists） |
| POST | `/file-system/nodes/create-drawing` | FILE_CREATE | 从空白模板创建图纸 |
| GET | `/file-system/nodes/:nodeId/root` | FILE_OPEN | 获取节点所属根节点 |
| GET | `/file-system/nodes/:nodeId/parent-context` | FILE_OPEN | 父目录分页上下文（搜索定位） |
| GET | `/file-system/nodes/:nodeId` | FILE_OPEN | 节点详情（含子节点+祖先链） |
| GET | `/file-system/nodes/:nodeId/children` | FILE_OPEN | 子节点分页列表（多条件过滤） |
| PATCH | `/file-system/nodes/:nodeId` | 登录 | 更新节点 |
| DELETE | `/file-system/nodes/:nodeId` | 登录 | 删除节点（body/query `permanently`） |
| POST | `/file-system/nodes/:nodeId/move` | 登录 | 移动节点 |
| POST | `/file-system/nodes/:nodeId/copy` | 登录 | 复制节点 |
| POST | `/file-system/nodes/:nodeId/restore` | 登录 | 恢复单个节点 |
| POST | `/file-system/nodes/batch-delete` | 登录 | 批量删除（nodeIds + permanently） |
| POST | `/file-system/nodes/batch-move` | 登录 | 批量移动 |
| POST | `/file-system/nodes/batch-copy` | 登录 | 批量复制 |
| GET | `/file-system/search` | 登录 | 统一搜索（scope: project/project_files/all_projects/library/global/personal_space） |
| GET | `/file-system/resolve-path` | 登录 | 面包屑路径解析（`path` + 可选 `projectId`） |

### 回收站（TrashController）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/file-system/trash` | 登录 | 统一回收站列表（`?projectId=` 限定项目） |
| POST | `/file-system/trash/restore` | 登录 | 批量恢复回收站项（itemIds） |
| DELETE | `/file-system/trash/items` | 登录 | 批量永久删除回收站项（itemIds） |
| DELETE | `/file-system/trash` | 系统级 PROJECT_CREATE | 清空回收站 |
| GET | `/file-system/projects/:projectId/trash` | FILE_OPEN | 项目回收站列表（**已废弃**，改用 `GET /trash?projectId=`） |
| DELETE | `/file-system/projects/:projectId/trash` | 登录 | 清空项目回收站 |

### 下载（DownloadController）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/file-system/nodes/:nodeId/thumbnail` | 可选认证 + LibraryPublicAccess + FILE_OPEN | 缩略图（ETag/304；未登录降级返回默认图；无图 204） |
| OPTIONS | `/file-system/nodes/:nodeId/download` | 登录 | CORS 预检 |
| GET | `/file-system/nodes/:nodeId/download` | FILE_DOWNLOAD | 下载节点（文件直传 / 目录 ZIP） |
| GET | `/file-system/nodes/:nodeId/download-with-format` | FILE_DOWNLOAD | 多格式下载（format: dwg/dxf/mxweb/pdf；PDF 支持 width/height/colorPolicy，DWG/DXF 支持 dwgVersion） |

### 成员（MemberController）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/file-system/projects/:projectId/members` | FILE_OPEN | 项目成员列表 |
| POST | `/file-system/projects/:projectId/members` | PROJECT_MEMBER_MANAGE | 添加成员（userId + projectRoleId） |
| PATCH | `/file-system/projects/:projectId/members/:userId` | PROJECT_MEMBER_ASSIGN | 更新成员角色（projectRoleId/roleId 兼容） |
| DELETE | `/file-system/projects/:projectId/members/:userId` | PROJECT_MEMBER_MANAGE | 移除成员 |
| POST | `/file-system/projects/:projectId/transfer` | PROJECT_TRANSFER | 转移项目所有权（newOwnerId） |
| POST | `/file-system/projects/:projectId/members/batch` | PROJECT_MEMBER_MANAGE | 批量添加成员 |
| PATCH | `/file-system/projects/:projectId/members/batch` | PROJECT_MEMBER_ASSIGN | 批量更新成员角色 |
| GET | `/file-system/projects/:projectId/permissions` | 登录 | 当前用户的项目角色 + 完整权限列表 |

### 历史 / 批量下载

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/file-system/nodes/:nodeId/history` | 登录（无显式守卫） | 文件版本历史（SVN，跨存储节点透明） |
| POST | `/file-system/download/batch-zip` | FILE_DOWNLOAD | 跨节点批量下载为 ZIP（nodeIds，流式） |

> 共 **47** 个端点。

## 通用约定

- **响应包装**：全局 `ResponseInterceptor` 统一 `{ code, message, data, timestamp }`，Controller 返回的业务对象即 `data`（禁止手动包 `{ message, data }`，否则前端解包后数据为空）；
- **分页**：列表接口统一 `NodeListResponseDto` 形状 `{ nodes, total, page, limit, totalPages }`，`page` 默认 1、`limit` 默认 20~50（最大 100）；
- **软删除**：节点删除不物理删行，置 `deletedAt`；级联删除子节点标记 `deletedByCascade=true`（回收站过滤依据）；恢复 = 清 `deletedAt`；永久删除才物理删除；
- **i18n**：错误信息统一 `I18nContext.current()?.t('error.file.*')`，带默认值兜底，避免 `?? ''` 返回空串；
- **审计**：关键操作（下载、成员变更、转让）用 `AuditLogger`/`AuditLogService` 记录 `{ action, resourceType, resourceId, userId, success, details }`。

## 模块间调用场景（供其他模块参考）

- 上传模块（mxcad-upload）：校验文件（`FileValidationService.validateFileWithMagicNumber`）→ 计算文件哈希（`drawing-ingest` 内联 `crypto.createHash('md5')`）→ 创建节点（`FileTreeService.createFileNode`）→ 状态流转（`NodeStatusTransitioner`）→ 更新配额缓存（`StorageInfoService.invalidateQuotaCache`）；
- 协同/编辑器模块：读取节点详情（`FileTreeService.getNode`）、文件路径解析（`StorageManager.getFullPath`）、历史（`FileHistoryService.getHistory`）；
- 后台任务模块：`FileTreeService.updateNodeTaskId` / `updateNodePath` 回写转换任务结果。

## 数据模型

核心表 `FileSystemNode`（`file_system_nodes`，schema 单一源在 `packages/db`）：

- **节点类型** `NodeType`：FILE / FOLDER / PROJECT / PERSONAL_SPACE / LIBRARY_DRAWING / LIBRARY_BLOCK —— 项目、个人空间、资源库本质是特殊根节点，`TreeWalker.resolveProjectId` 沿祖先链定位"广义根"；
- **关键字段**：`parentId`（树形结构）、`projectId`（子树节点均指向项目根，search 走 relation filter）、`path`（存储相对路径，`filesDataPath/YYYYMM/nodeId/...`）、`fileHash`（MD5，下载 ETag 依据）、`fileStatus`（见状态机）、`size/mimeType/extension`、`deletedAt + deletedByCascade`（软删除，级联删除标记）、`taskId`（转换任务关联）；
- **索引**：`searchVector` tsvector GIN 索引支撑全文搜索。

辅助表：`ProjectMember`（`projectId_userId` 复合唯一键 + 关联 `ProjectRole`，角色权限经 `projectRole.permissions` 关联）、`File`/`FileAccess`（历史遗留模型，当前节点权限走项目角色体系）。

## 安全措施

1. **双层权限**：系统级权限（`@RequirePermissions`，如 PROJECT_CREATE）与项目级权限（`@RequireProjectPermission`，FILE_OPEN / FILE_CREATE / FILE_DOWNLOAD / PROJECT_MEMBER_MANAGE / PROJECT_MEMBER_ASSIGN / PROJECT_TRANSFER）叠加；`RequireProjectPermissionGuard` 解析 `projectId`（path 或 body）后注入；
2. **CSRF 防护**：全部写操作 `@CsrfProtected()`；
3. **公共资源库豁免**：缩略图端点 `@OptionalAuth + @LibraryPublicAccess`，未登录仅返回默认图、不泄露项目文件内容；
4. **下载安全**：目录 ZIP 受 `fileLimits` 配置约束（总大小/文件数/深度/单文件/文件名长度），防 zip 炸弹；批量 ZIP 逐节点校验 `FILE_DOWNLOAD`；文件名校验（`sanitizeFilename` 防路径遍历）+ 魔数验证防伪造扩展名；
5. **状态机约束**：`fileStatus` 所有写入必须经 `NodeStatusTransitioner`，非法转换抛 400；
6. **配额防绕过**：`NodeSizeResolverService` 拒绝 null size 参与配额计算（#215）；
7. **SQL 安全**：所有排序字段白名单映射（`SORTABLE_COLUMNS`），避免动态列名注入；
8. **审计日志**：下载（FILE_DOWNLOAD）、成员变更（ADD/UPDATE/REMOVE_MEMBER、TRANSFER_OWNERSHIP）均记录成功/失败；
9. **敏感信息**：搜索/查询仅返回必要字段，错误信息统一 i18n，不泄露内部路径。

## 与 CAD 引擎（mxcad）协作

- **上传链路**：mxcad-upload 模块完成上传后经 `NodeStatusTransitioner` 推进 `fileStatus`（UPLOADING → PROCESSING → COMPLETED/FAILED），转换由 `async-conversion.service` 完成；
- **下载链路**：`download-with-format` 经 `MXCAD_CONVERSION_SERVICE`（`mxcad/interfaces/mxcad-conversion.interface`，`ConvertServerFileParam`）服务端转换 DWG/DXF/PDF，转换结果按 `{mxwebDir}/{目标文件名}` 落盘后流式返回并删除；
- **缩略图**：读取节点目录下 `thumbnail.jpg`（`mxcad/infra/thumbnail-utils`），缺失时按扩展名返回 `assets/default-thumbnails` 默认图；
- **模板**：空白图纸来自 `assets/templates/blank.mxweb`（MD5 计算为 fileHash）。

## 测试

共 10 个 spec 文件（jest）：

- `file-tree.service.spec.ts`（623 行）、`tree-walker.service.spec.ts`（236 行）—— 树查询/CTE 遍历/回收站/路径解析；
- `search.service.spec.ts`（435 行）、`search-query.parser.spec.ts`、`fts-query-builder.spec.ts` —— 各 scope 搜索与语法解析；
- `file-system-permission.service.spec.ts`（301 行）—— 节点权限/资源库判定；
- `file-validation.service.spec.ts`（314 行）—— 魔数/文件名/大小校验；
- `file-status-state-machine.spec.ts`（228 行）—— 状态转换合法性；
- `cross-node-download.service.spec.ts`（137 行）—— 批量 ZIP 权限与跳过逻辑；
- `node-size-resolver.service.spec.ts`（83 行）—— 配额大小解析。

> 集成级行为（删除/回收/恢复、权限拦截）另有 `test/integration/workflow-3-delete-recycle-permanent.integration.spec.ts` 与 `src/test/unit/file-delete-recycle.unit.spec.ts` 等覆盖。
