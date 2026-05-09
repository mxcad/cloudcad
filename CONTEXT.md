# CloudCAD

在线 CAD 协同编辑平台。

## Language

**图纸（Drawing）**:
用户编辑的核心业务实体，即一个 CAD 文件。图纸以 mxweb 格式存在——内存中、保存上传时、以及后端存储的都是 mxweb 二进制数据。
_避免_: 文档、file（在有歧义的上下文中）

**文件节点（FileNode）**:
图纸在文件树中的组织单元，包含父子关系、权限归属、存储路径等元数据。每个文件节点对应一张图纸。
_避免_: 文件夹（folder 是另一种节点类型）

**mxweb 文件**:
图纸的运行时格式。CAD 引擎（MxCADView）操作的是 mxweb 数据，保存时也是将 mxweb 二进制上传到后端。.dwg/.dxf 上传后由后端转换为 .mxweb。

## 关系

- 一张 **图纸** 存储为一个或多个 **文件节点**（版本管理）
- 一个 **文件节点** 引用一条 mxweb 文件路径
- CAD 引擎通过 mxweb URL 加载图纸数据

## 图纸归属

一张图纸有且仅有一种归属：

- **项目（Project）**：文件组织的基本单位。项目包含文件树、成员（按角色控制权限）、元数据。保存需检查 CAD\_SAVE 权限。
- **私人空间（Personal Space）**：一种特殊的项目。创建用户时自动创建，不可删除，没有项目成员（只有所有者一人）。其他行为与项目完全一致。
  - 保存时直接原位覆盖（因为是个人专属，不需要权限检查的兜底逻辑）
  - 路由和交互表现与项目相同
- **资源库（Library）**：公共图纸库（drawing）或图块库（block）。保存需库管理权限，无权限时弹出"另存为"。
  - 无版本管理（不提交 SVN）
  - 保存时直接覆盖 mxweb，不做 dwg/dxf 转换（转换仅在下载/导出时按需执行）
  - 资源库的所有写操作（save、save-as、CRUD）走 `LibraryController` 独立端点

## 用户工作流

1. **打开编辑器**（首页始终是编辑器，不登录也能访问）
2. **打开图纸**（未登录→公共文件服务→哈希访问；已登录→上传/秒传→文件树节点→打开）
3. **编辑图纸**（由 mxcad-app CAD 引擎处理，前端不干预）
4. **保存图纸**（未登录不可保存；已登录判断归属→原位覆盖或另存为）
5. **导出图纸**（未登录不可导出；已登录选择格式→后端生成→下载）
6. **关闭/切换图纸**（检查未保存修改→提示→确认后操作）
7. **直达图纸**（URL 带 `?nodeId=xxx` 或 `?nodeId=xxx&library=drawing` 时跳过欢迎面板，初始化后直接打开指定文件。用于分享和导航）

## 架构分层

CloudCAD 和 mxcad-app 的关系：

```
┌─────────────────────────────────┐
│         CloudCAD（React SPA）    │  
│  ┌───────────────────────────┐  │
│  │  CAD 引擎（mxcad-app）      │  │  ← 作为 npm 依赖导入的黑盒
│  │  MxCADView, MxFun, MxCpp  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

<br />

- **mxcad-app 是 npm 依赖包**，对外暴露了它内部使用的 vue/vuetify/pinia/axios 等库，CloudCAD 正常 import 即可（Vite 插件代理）。
- **CAD 引擎核心** 通过三个包暴露：
  | 包           | 用途                                                                                          |
  | ----------- | ------------------------------------------------------------------------------------------- |
  | `mxcad-app` | MxCADView 视图容器 + 引擎生命周期管理                                                                   |
  | `mxdraw`    | MxFun——注册 CAD 命令的核心系统。命令可通过用户在 mxcad-app 输入框内键入触发，也可通过 `MxFun.sendStringToExecute()` 代码调用触发 |
  | `mxcad`     | 操作图纸内部一切的低层 API（获取文件名、监听修改事件、等）                                                             |

<br />

## 保存流程

平台只有 mxweb 是核心流通格式。dwg/dxf 仅在下载/导出时按需转换。

| 场景 | 后端路由 | 行为 |
|------|---------|------|
| 覆盖保存（个人/项目） | `POST /mxcad/savemxweb/:nodeId` | 写 mxweb → SVN 提交 → 生成 bin |
| 覆盖保存（资源库） | `POST /library/drawing/save/:nodeId` | 写 mxweb → 跳过 SVN → 跳过 bin |
| 另存为（个人/项目） | `POST /mxcad/save-as` (targetType=personal/project) | 创建节点 → 拷贝 mxweb → SVN 提交（不转换格式） |
| 另存为（资源库） | `POST /mxcad/save-as` (targetType=library) | 创建节点 → 拷贝 mxweb → 跳过 SVN（不转换格式） |

## Flagged ambiguities

- **"文档"（document）**：曾用来指 CAD 引擎内存中的数据，但这个概念不存在。引擎内存中的就是 mxweb 数据，保存后上传的也是 mxweb 二进制。此词应避免使用。
- **"文档标题"（document title）**：`useDocumentTitle` 这个 composable 名称有歧义。它可能不是指浏览器标签页标题，而是 CAD 编辑器内显示当前文件名的头部区域。待确认后重命名。

## 限界上下文（Bounded Contexts）

> 见 [docs/ddd/context-map.md](docs/ddd/context-map.md) — DDD 战略设计产出。

| 限界上下文 | 聚合根 | 包含模块 | 职责 |
|-----------|--------|---------|------|
| **图纸内容上下文** | DrawingSession | mxcad, storage, conversion | 图纸的编辑、格式转换、二进制存储 |
| **图纸组织上下文** | FileNode | file-system, version-control | 文件树结构、权限归属、版本历史 |

**通信方式（当前阶段）：** 直接服务调用（NestJS DI 注入）。后续重构为领域事件驱动。

**聚合关键不变:**
- Drawing 是 FileNode 聚合内的**值对象**，不独立存在
- 一个 FileNode 有且仅有一种归属（Project / Personal Space / Library）
- 非 CAD 文件（外部引用中的图片）属于外部引用专项，不纳入 FileNode 体系
- 支持的图纸格式：DWG、DXF、mxweb（后续可能扩展更多 CAD 格式，但不会是通用文档格式）

## 参考

- [DDD 限界上下文映射图](docs/ddd/context-map.md)
- [SDD 规格文档](docs/sdd/)
- [ADR 0001 - 转换引擎合并](docs/adr/0001-merge-conversion-engine-into-backend.md)
- [ADR 0002 - 解耦 file-operations 模块](docs/adr/0002-decouple-file-operations-module.md)
- [ADR 0003 - IPermissionStore 策略模式解耦权限检查](docs/adr/0003-permission-store-strategy-pattern.md)
- [ADR 0004 - 前端 CSS Z-Index 层级体系](docs/adr/0004-frontend-css-layer-system.md)
- [AI E2E 测试指南](packages/frontend/e2e/guide/AI_E2E_GUIDE.md) — AI 自动生成 Playwright E2E 测试的 prompt 指南，按业务域组织（身份权限/图纸内容/图纸组织/资源库/系统管理）

## 图纸打开流程对齐验证（2026-05-09）

`refactor/circular-deps` 分支与 `main` 分支逐项对比，用户交互层全部一致：

| # | 验证项 | 结论 |
|---|--------|------|
| 1 | 路由跳转（`/cad-editor/:fileId`、`?library=drawing/block`、`?v=`） | ✅ 一致 |
| 2 | 文件获取与错误提示（401/404/网络错误/deletedAt/!fileHash/`!updatedAt`新增保护） | ✅ 一致 |
| 3 | 权限校验（CAD_SAVE/FILE_DOWNLOAD/CAD_EXTERNAL_REFERENCE） | ✅ 一致 |
| 4 | mxcad 初始化（`initializeMxCADView`/`openFile`/`openFile_noCache`/`openUploadedFile`） | ✅ 一致 |
| 5 | mxweb URL 构造（`/api/v1/mxcad/filesData/...` 路径前缀同步） | ✅ 一致 |
| 6 | 加载状态（加载/错误/空/成功，Strict Mode 白屏修复，canvas 渲染后隐藏 loading） | ✅ 增强 |
| 7 | 后端 mxcad 模块（重构为 core/save/upload/infra/conversion 子模块，API 端点未变） | ✅ 一致 |
| 8 | 外部参照（检查缺失参照 → 上传 → 打开文件） | ✅ 一致 |

**关键发现：** `openFile` 的 `noCache` 参数当前分支已保留（类方法 `MxCADManager.openFile(fileUrl, noCache?)`），`openFile_noCache` 命令正常注册。后端重构无 API 契约变更。

## 移动/复制功能对齐验证（2026-05-09）

`refactor/circular-deps` 分支与 `main` 分支逐项对比，move/copy 文件、文件夹功能全部一致：

| # | 验证项 | 结论 |
|---|--------|------|
| 1 | API 路由（`POST nodes/:nodeId/move`、`POST nodes/:nodeId/copy`） | ✅ 一致 |
| 2 | 请求体参数（`{ targetParentId }`） | ✅ 一致 |
| 3 | 后端 moveNode 逻辑（校验→去重命名→更新 parentId/projectId→清除配额缓存） | ✅ 一致 |
| 4 | 后端 copyNode 逻辑（校验→去重命名→copyNodeRecursive→清除配额缓存） | ✅ 一致 |
| 5 | 后端 copyNodeRecursive（创建节点→复制存储文件→递归复制子节点→子节点去重命名） | ✅ 一致 |
| 6 | 权限控制（`FILE_MOVE`/`FILE_COPY` 枚举值及角色分配） | ✅ 一致 |
| 7 | 前端资源库 move/copy（`useLibraryMutations` hook，react-query mutation，相同 API 参数） | ✅ 一致 |
| 8 | 前端项目文件 move/copy（`useMoveCopy` hook，支持单选和批量） | ✅ 一致 |
| 9 | CSRF 保护 | 🟡 新增（安全增强，不影响功能） |

**关键发现：** 后端 moveNode/copyNode/copyNodeRecursive 逻辑逐行一致。变更仅为文件位置移动（`file-system/services/` → `file-operations/`）、Controller 直调子 Service（跳过 Facade）、前端重构为独立 hook + react-query、存储抽象层 `IStorageProvider` 替换直接 `fs` 调用。无 API 契约变更。

## 前端架构重构（2026-05-09）

`refactor/circular-deps` 分支前端重构要点：

- **API 层**：手写 `services/*Api.ts` 替换为自动生成 `@/api-sdk`（基于 OpenAPI 规范）
- **资源库 hooks**：`useLibrary.ts` 单体 hook 拆分为 `useLibraryQuery`、`useLibraryMutations`、`useLibraryPagination`、`useLibraryQuota`、`useLibraryDownload`、`useLibraryModals`
- **项目管理**：`FileSystemManager.tsx` 单体页面拆分为 `FileSystemManager/` 子组件 + hooks（`useDragAndDrop`、`useMoveCopy`、`useVersionHistory`）
- **mxcad 管理**：`mxcadManager.ts` 单体服务拆分为 `mxcadManager/` 子模块（check、extRef、save、thumbnail、types）

## 项目成员角色管理对齐验证（2026-05-09）

`refactor/circular-deps` 分支与 `main` 分支逐项对比，成员角色管理功能完全一致：

| # | 验证项 | 结论 |
|---|--------|------|
| 1 | 添加成员（DTO `roleId`→`projectRoleId`，语义不变） | ✅ 一致 |
| 2 | 移除成员（新增软删除用户校验 + 错误日志） | ✅ 一致 |
| 3 | 更新成员角色（逻辑不变，拒绝直接设置 OWNER） | ✅ 一致 |
| 4 | 获取成员列表（返回字段含 `projectRoleId`/`projectRoleName`/`permissions`） | ✅ 一致 |
| 5 | 项目角色 CRUD（返回类型从 `any`→强 Prisma include 类型） | ✅ 一致 |
| 6 | 所有权转让（修复：前端误调用 `updateProjectMember`，改为 `POST .../transfer` 端点，事务内降级前所有者） | ✅ 已修复 |
| 7 | 成员弹窗 UI（SDK 生成层替换手写 service 层，交互不变） | ✅ 一致 |
| 8 | 权限检查（`IPermissionStore` 策略模式，`PrismaPermissionStore` 100% 等价原 Prisma 逻辑） | ✅ 增强 |

**关键发现：** 所有权转让发现 bug — 前端 `MembersModal.tsx` 错误调用 `updateProjectMember({ roleName: 'PROJECT_OWNER' })`，后端 DTO 无此字段且服务端显式拒绝。已修复为 `client.post()` 直调正确端点 `POST /api/v1/file-system/projects/:projectId/transfer`。详见 ADR 0003。

**已删除端点（无影响）：** `GET /roles/category/:category`、`GET /roles/project-roles/:id` — 无前端调用，文档已标记"待删除"。

## 批量导入与上传协议对齐验证（2026-05-09）

`refactor/circular-deps` 分支上传协议从手动分片上传迁移至 Tus 协议：

### API 端点变化

| 端点 | main | refactor/circular-deps | 结论 |
|------|------|------------------------|------|
| `POST /api/mxcad/files/chunkisExist` | ✅ | ❌ 删除 | Tus 替代 |
| `POST /api/mxcad/files/uploadFiles` | ✅ | ❌ 删除 | Tus 替代 |
| `POST /api/v1/files` (Tus) | ❌ | ✅ 新增 | `TusService` + `TusEventHandler` |
| `PATCH /api/v1/files/:id` (Tus) | ❌ | ✅ 新增 | 分片上传 |
| `HEAD /api/v1/files/:id` (Tus) | ❌ | ✅ 新增 | 断点续传检查 |
| `POST /api/mxcad/files/fileisExist` | ✅ | ✅ | 秒传检查保留 |

### 前端上传链路

- main：`MxCadUploader` → `uploadMxCadFile()` → 手动分片 `POST uploadFiles`
- 当前分支：`MxCadUppyUploader` → `uploadFileWithUppy()` → 秒传检查 `fileisExist` → Tus `POST /api/v1/files`
- 冲突策略 `skip/overwrite/rename` 前后端一致，通过 `Upload-Metadata` header 传递

### 后端上传处理

- main：`mxcad.controller.ts` 直接处理分片合并和转换
- 当前分支：`TusService`（`@tus/server`）接收分片 → `TusEventHandler.handleUploadFinish()` → `FileMergeService.mergeChunksWithPermission()` → 转换 + 节点创建
- 支持登录用户（创建文件节点）和匿名用户（仅存储+转换）
- 权限检查：`FILE_CREATE` 项目权限 + 冲突策略（`skip`/`overwrite`/`rename`）

### 本地批量导入脚本

`scripts/batch-import-library.js` 已从旧分片上传端点改造为 Tus 协议：
- 删除 `checkChunkExist()` → `POST /api/mxcad/files/chunkisExist`
- 删除 `uploadChunk()` → 手动 multipart `POST /api/mxcad/files/uploadFiles`
- 新增 `tusCreateSession()` / `tusPatchChunk()` / `tusHeadUpload()` → Tus `POST/PATCH/HEAD /api/v1/files`
- 保留：秒传检查、登录、文件夹创建、子节点查询、缩略图复制、断点续传进度文件

**关键发现：** main 分支的 `scripts/batch-import-library.js` 在当前分支无法运行——依赖的 `chunkisExist` 和 `uploadFiles` 端点已删除，需用 Tus 协议替代。

## 图纸库/图块库分页加载对齐验证（2026-05-09）

`refactor/circular-deps` 分支图纸库和图块库分页加载完全一致，共用统一代码路径：

| # | 验证项 | 结论 |
|---|--------|------|
| 1 | 核心组件（`ProjectDrawingsPanelMain`，`libraryType` 区分） | ✅ 统一 |
| 2 | 分页 hook（`useLoadNodes` → `useLibraryQuery`） | ✅ 共用 |
| 3 | PAGE_SIZE（20条/页） | ✅ 一致 |
| 4 | 向下预加载阈值（距底部 500px） | ✅ 一致 |
| 5 | 向上预加载阈值（距顶部 200px） | ✅ 一致 |
| 6 | 滚动位置恢复（向上翻页补偿 heightDiff，向下不调整） | ✅ 一致 |
| 7 | 分页控件（首页/上一页/跳转/下一页/末页） | ✅ 共用 |

**关键差异：** 仅 `libraryType` 参数区分 API 端点（`/library/drawing/` vs `/library/block/`）和权限检查（`LIBRARY_DRAWING_MANAGE` vs `LIBRARY_BLOCK_MANAGE`），分页逻辑零差异。

## 用户管理对齐验证（2026-05-09）

`refactor/circular-deps` 分支与 `main` 分支逐项对比，用户管理核心功能完全一致：

### 后端 Controller（`users.controller.ts`）

| # | 验证项 | 结论 |
|---|--------|------|
| 1 | 创建用户 `POST /users` | ✅ 一致 |
| 2 | 用户列表 `GET /users`（搜索/筛选/排序/分页） | ✅ 一致 |
| 3 | 邮箱搜索 `GET /users/search/by-email` | ✅ 一致 |
| 4 | 成员搜索 `GET /users/search` | ✅ 一致 |
| 5 | 当前用户信息 `GET /users/profile/me` | ✅ 一致 |
| 6 | 仪表盘统计 `GET /users/stats/me` | ✅ 一致 |
| 7 | 更新个人信息 `PATCH /users/profile/me`（含用户名修改限制） | ✅ 一致 |
| 8 | 单用户查询 `GET /users/:id` | ✅ 一致 |
| 9 | 更新用户 `PATCH /users/:id` | ✅ 一致 |
| 10 | 软删除用户 `DELETE /users/:id` | ✅ 一致 |
| 11 | 立即注销 `POST /users/:id/delete-immediately` | ✅ 一致 |
| 12 | 更新用户状态 `PATCH /users/:id/status` | ✅ 一致（独立 DTO 替代内联参数） |
| 13 | 自助注销 `POST /users/deactivate-account` | ✅ 一致（方法名 `deactivateAccount`→`deactivate`） |
| 14 | 自助恢复 `POST /users/me/restore` | ✅ 一致 |
| 15 | 修改密码 `POST /users/change-password` | ✅ 一致 |
| 16 | 管理员恢复 `POST /users/:id/restore` | ✅ 新增（main 分支后端缺失此端点，前端已调用但后端无实现） |

### 后端 Service（`users.service.ts`）

| 方面 | main | 当前分支 | 结论 |
|------|------|---------|------|
| 密码哈希 | `bcrypt.hash()` 硬编码 | `IPasswordHasher` 接口注入 | 等价增强 |
| 注销验证 | 内联 if-else 链（4种验证硬编码） | 策略模式 `IAccountVerificationStrategy[]` | 等价增强 |
| 恢复验证 | 内联 if-else 链 | 复用策略模式 | 等价增强 |
| Service 接口 | 无 `implements` | `implements IUserService` | 等价增强 |
| 生命周期事件 | 无 | `EventEmitter2` 发射 `user.created/restored/deactivated` | 新增能力 |
| 唯一性校验 | `findFirst` 精确匹配 | `findFirst` 精确匹配（格式化差异） | ✅ 一致 |
| 软删除逻辑 | `deletedAt` + 清除 phone/微信 | 相同 | ✅ 一致 |
| ADMIN 账户保护 | 拒绝删除/注销 ADMIN 角色用户 | 相同 | ✅ 一致 |

### 前端 UserManagement

| 方面 | main | 当前分支 | 结论 |
|------|------|---------|------|
| 文件结构 | `UserManagement.tsx` 单文件 2416行 | `UserManagement/` 目录 16 文件 | 等价拆分 |
| API 调用 | `getApiClient().UsersController_*`（手写） | `@/api-sdk` 自动生成（OpenAPI） | 等价迁移 |
| 状态管理 | 内联 `useState`（全部在组件内） | `useUserCRUD` / `useUserSearch` / `useUserForm` hooks | 等价拆分 |
| 表单校验 | 内联 `validateForm()` | `userFormSchema.ts` + `useUserForm.ts` | 等价拆分 |
| 样式 | 内联 `<style>` 标签 | `UserManagementStyles.ts` 独立文件 | 等价拆分 |
| 测试 | 无 | 4 个 `.spec.ts` 文件 | 新增 |
| 运行时配置 | `runtimeConfigApi.getPublicConfigs()` 动态读取 | `useUserCRUD` 中写死 `mailEnabled: false` | ⚠️ 待关注 |
| 用户列表/搜索/筛选/排序/分页 | ✅ | ✅ | 功能一致 |
| 创建/编辑/删除用户 | ✅ | ✅ | 功能一致 |
| 存储配额管理 | ✅（内联） | ✅（`UserQuotaModal` 独立组件） | 功能一致 |
| 已注销用户清理 | ✅ | ✅ | 功能一致 |
| 活跃/已注销 Tab 切换 | ✅ | ✅ | 功能一致 |
| 管理员恢复 | ⚠️ 前端调用但后端端点缺失 | ✅ 前后端均已实现 | 已修复 |

### 关键发现

1. **main 分支前后端不一致已修复：** main 分支前端 `usersApi.ts` 调用了 `UsersController_restore`，但后端 controller 无此端点。当前分支已补全，前端通过 `useUserCRUD.restoreMutation` → `usersControllerRestore` 正常调用。
2. **`mailEnabled`/`smsEnabled` 写死为 false：** 当前分支 `useUserCRUD` 中硬编码为 `false`，main 分支通过 `runtimeConfigApi.getPublicConfigs()` 动态读取。此差异不影响用户管理核心流程（仅影响创建用户表单中邮箱/手机字段的必填校验）。
3. **后端架构增强：** 验证策略模式（`IAccountVerificationStrategy`）和密码哈希接口（`IPasswordHasher`）为纯架构重构，不改变业务行为。

## Auth 认证体系架构（2026-05-09）

`refactor/circular-deps` 分支引入 `IAuthProvider` 策略模式重构认证模块。

### 服务职责

| 服务 | 职责 | 所属层 |
|---|---|---|
| **AuthFacadeService** | 认证门面，对外暴露统一 API。**只做委托，不编排业务逻辑。** | 门面 |
| **IAuthProvider** (`AUTH_PROVIDER`) | 认证提供者接口 — 将认证方式抽象为可替换策略。 | 接口 |
| **LocalAuthProvider** | IAuthProvider 默认实现 — 封装所有本地认证：邮箱/密码登录、手机验证码登录/注册、微信登录、Token 刷新。 | Provider |
| **RegistrationService** | 邮箱注册流程 — Redis 暂存待验证信息 + 邮箱验证码激活。 | 子服务 |
| **LoginService** | 账号密码登录 — 邮箱/用户名/手机号三合一登录，含强制验证检查。 | 子服务 |
| **AuthTokenService** | JWT Token 全生命周期 — 签发、刷新、吊销、黑名单。 | 子服务 |
| **AccountBindingService** | 账号绑定 — 邮箱/手机号/微信的绑定、解绑、换绑。 | 子服务 |
| **PasswordService** | 密码管理 — 验证、忘记/重置密码流程。 | 子服务 |

### JWT Cookie

除 Authorization header 外，注册/登录/刷新/验证邮箱时同步设置 `auth_token` httpOnly Cookie，供 `<img>` 等无法携带 header 的请求使用。通过 `AuthController.setAuthCookie()` 私有方法统一设置。

### 配置约定

| 配置键 | 来源 | 用途 |
|---|---|---|
| `jwt.secret` | `JWT_SECRET` 环境变量 → `ConfigService.get('jwt.secret')` | JWT 签名密钥。**禁止**直接用 `'JWT_SECRET'` 作为 config key（代码中已全部统一为 `jwt.secret`）。 |
| `allowRegister` | RuntimeConfig | 全局注册开关 |
| `requireEmailVerification` | RuntimeConfig | 强制邮箱验证 |
| `requirePhoneVerification` | RuntimeConfig | 强制手机号验证 |
| `allowAutoRegisterOnPhoneLogin` | RuntimeConfig | 手机验证码登录时自动创建用户 |

### 架构约束

- `AuthFacadeService` 只做委托，不编排业务逻辑。业务逻辑归属 IAuthProvider 实现或子 Service。
- 类注入使用 Token（`USER_SERVICE`、`AUTH_PROVIDER`），不用具体类，以打破循环依赖。
- `forwardRef` 已在 AuthModule 中移除，模块依赖为单向：AuthModule → UsersModule, CommonModule。
- `session.controller.ts` 已移除 — 前后端均无调用方，功能由 JWT + Cookie 替代。

### 已知差异（vs main）

| 差异 | 影响 | 状态 |
|---|---|---|
| `loginByPhone` 错误响应格式变更（`code`/`phone` 字段丢失，412→400） | 前端 `PHONE_NOT_REGISTERED` 判断失效，需恢复结构化错误 | ⏸️ 暂缓修复 |
| `registerByPhone` 业务逻辑留在 `AuthFacadeService` | 仍依赖 `prisma`/`smsVerificationService`/`runtimeConfigService`，未完全委托给 Provider | 后续迭代 |

