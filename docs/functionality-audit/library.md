# Library Manager — 功能审计报告

**对比范围**: main 分支 vs 当前 refactor/circular-deps 分支
**审查日期**: 2026-05-08
**涉及文件**:
- `packages/backend/src/library/library.controller.ts` (main: 1214 行, 当前: 682 行)
- `packages/backend/src/library/library.service.ts` (两分支一致, 149 行)
- `packages/frontend/src/pages/LibraryManager.tsx` (main: 1196 行, 当前: 1050 行)

---

## 一、总体结论

当前重构分支的 **核心逻辑意图** 与 main 分支一致：公共资源库提供图纸库和图块库两个子库，读操作公开访问，写操作需要管理员权限，无版本管理/无回收站。

但存在 **2 个 🔴 NEEDS DECISION** 的差异（有意删除 vs 重构遗漏），和 **3 个重构改进点**。

---

## 二、后端 Controller 端点对比

### 2.1 图纸库 (Drawing Library)

| 端点 | main 分支 | 当前分支 | 状态 |
|------|----------|---------|------|
| `GET drawing` | ✅ `libraryService.getLibrary('drawing')` | ✅ `drawingLibraryProvider.getRootNode()` | 🔄 重构 (依赖注入替代直接调用) |
| `GET drawing/categories` | ❌ 不存在 | ✅ `fileSystemService.getCategoryTree()` | 🆕 **新增功能** |
| `GET drawing/children/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET drawing/all-files/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET drawing/filesData/*path` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET drawing/nodes/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET drawing/nodes/:nodeId/download` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET drawing/nodes/:nodeId/thumbnail` | ✅ | ✅ | ✅ 逻辑一致 |
| `POST drawing/folders` | ✅ + `isLibrary()` 校验 | ✅ + provider fallback | 🔄 验证逻辑不同 |
| `POST drawing/upload` | ✅ 完整文件上传 | ❌ 不存在 | 🔴 **NEEDS DECISION** |
| `POST drawing/files/upload-chunk` | ✅ 分片上传 | ❌ 不存在 | 🔴 **NEEDS DECISION** |
| `POST drawing/save/:nodeId` | ✅ (覆盖保存) | ✅ (覆盖保存) | 🔄 校验逻辑不同 |
| `POST drawing/save-as` | ✅ (另存为新文件) | ❌ 不存在 | 🔴 **NEEDS DECISION** |
| `DELETE drawing/nodes/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `PATCH drawing/nodes/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `POST drawing/nodes/:nodeId/move` | ✅ + `isLibrary()` 校验 | ✅ | 🔄 缺目标校验 |
| `POST drawing/nodes/:nodeId/copy` | ✅ + `isLibrary()` 校验 | ✅ | 🔄 缺目标校验 (使用 CopyNodeDto) |

### 2.2 图块库 (Block Library)

| 端点 | main 分支 | 当前分支 | 状态 |
|------|----------|---------|------|
| `GET block` | ✅ | ✅ | 🔄 重构 |
| `GET block/categories` | ❌ 不存在 | ✅ | 🆕 **新增功能** |
| `GET block/children/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET block/all-files/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET block/filesData/*path` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET block/nodes/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET block/nodes/:nodeId/download` | ✅ | ✅ | ✅ 逻辑一致 |
| `GET block/nodes/:nodeId/thumbnail` | ✅ | ✅ | ✅ 逻辑一致 |
| `POST block/folders` | ✅ + `isLibrary()` 校验 | ✅ + provider fallback | 🔄 验证逻辑不同 |
| `POST block/upload` | ✅ 完整文件上传 | ❌ 不存在 | 🔴 **NEEDS DECISION** |
| `POST block/files/upload-chunk` | ✅ 分片上传 | ❌ 不存在 | 🔴 **NEEDS DECISION** |
| `POST block/save/:nodeId` | ✅ (覆盖保存) | ✅ (覆盖保存) | 🔄 校验逻辑不同 |
| `POST block/save-as` | ✅ (另存为新文件) | ❌ 不存在 | 🔴 **NEEDS DECISION** |
| `DELETE block/nodes/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `PATCH block/nodes/:nodeId` | ✅ | ✅ | ✅ 逻辑一致 |
| `POST block/nodes/:nodeId/move` | ✅ + `isLibrary()` 校验 | ✅ | 🔄 缺目标校验 |
| `POST block/nodes/:nodeId/copy` | ✅ + `isLibrary()` 校验 | ✅ | 🔄 缺目标校验 |

---

## 三、🔴 NEEDS DECISION — 需决策项

### 3.1 上传端点缺失 (`upload`, `upload-chunk`)

**main 分支存在但当前分支缺失:**

- `POST /api/library/drawing/upload` — 完整文件上传到图纸库
- `POST /api/library/drawing/files/upload-chunk` — 分片上传到图纸库
- `POST /api/library/block/upload` — 完整文件上传到图块库
- `POST /api/library/block/files/upload-chunk` — 分片上传到图块库

**逻辑意图**: 允许管理员向资源库上传 **新文件**（不同于 `save/:nodeId` 的覆盖现有文件）。
这些端点使用了 `MxCadService.uploadAndConvertFileWithPermission()` 和 `MxCadService.uploadChunkWithPermission()`，
支持 `conflictStrategy` (skip/overwrite/rename) 和分片上传。

**影响**: 当前分支的 `MxCadUppyUploader` 前端组件如果通过 `POST drawing/save/:nodeId` 来上传新文件，
则语义不正确（save 是覆盖语义，upload 是新建语义）。如果 `MxCadUppyUploader` 直接调用了其他端点，
需要确认前端上传流是否完整连通。

**决策选项**:
- A) 有意删除 — 新文件通过 `save-as` 端点创建（但 save-as 也缺失了）
- B) 重构遗漏 — 需要恢复上传端点
- C) 用 `saveLibraryNode` 私有方法替代 — 但该方法只覆盖保存现有节点

### 3.2 另存为端点缺失 (`save-as`)

**main 分支存在但当前分支缺失:**

- `POST /api/library/drawing/save-as` — 另存为新文件到图纸库
- `POST /api/library/block/save-as` — 另存为新文件到图块库

**逻辑意图**: 从 CAD 编辑器将当前图纸/图块另存为新文件到公共资源库。
它创建新的 `fileSystemNode` 记录并复制文件，而非覆盖已有节点。

**影响**: CAD 编辑器中的"另存为到资源库"功能将不可用。

**决策选项**:
- A) 有意删除 — CAD 编辑器改为用其他方式保存
- B) 重构遗漏 — 需要恢复 save-as 端点

---

## 四、🆕 新增功能

### 4.1 分类树端点 (`categories`)

当前分支新增了 `GET /api/library/drawing/categories` 和 `GET /api/library/block/categories`，
使用递归 CTE 在数据库层面一次查询完整的三级分类树。

**逻辑意图**: 减少前端 API 调用次数，优化分类加载体验（原本需要多次逐层加载）。

### 4.2 IPublicLibraryProvider 依赖注入模式

当前分支引入了 `PUBLIC_LIBRARY_PROVIDER_DRAWING` 和 `PUBLIC_LIBRARY_PROVIDER_BLOCK` 接口注入，
替代了 main 分支中直接调用 `libraryService.getLibrary()` / `libraryService.getLibraryId()` 的模式。
这是一个设计层面的改进（更好的扩展性和可测试性），逻辑意图相同。

---

## 五、Backend Service 对比

`library.service.ts` 在两个分支中**完全一致**，无需对比。

提供的方法:
- `getLibraryId(libraryType)` — 根据 libraryKey 查询根节点 ID
- `getLibrary(libraryType)` — 查询库详情及子节点
- `isLibrary(nodeId)` — 检查节点是否属于公共资源库
- `getLibraryType(nodeId)` — 获取库类型
- `hasLibraryManagePermission(userId, libraryType)` — 检查管理权限

---

## 六、前端对比

### 6.1 功能特性矩阵

| 功能 | main 分支 | 当前分支 | 状态 |
|------|----------|---------|------|
| 图纸库/图块库切换 | ✅ | ✅ | ✅ 一致 |
| 面包屑导航 | ✅ | ✅ | ✅ 一致 |
| 搜索（关键词过滤） | ✅ | ✅ | ✅ 一致 |
| 网格视图 / 列表视图 | ✅ | ✅ | ✅ 一致 |
| 分页（支持切换 pageSize） | ✅ | ✅ | ✅ 一致 |
| 多选模式 + 批量操作 | ✅ | ✅ | ✅ 一致 |
| 文件夹创建 | ✅ | ✅ | ✅ 一致 |
| 重命名（去除扩展名编辑） | ✅ 去扩展名 | ✅ **未去扩展名** | 🟡 行为差异 |
| 移动/复制节点 | ✅ | ✅ | ✅ 一致 |
| 批量移动/复制 | ✅ | ✅ | ✅ 一致 |
| 下载（多格式: dwg/dxf/mxweb/pdf） | ✅ | ✅ | ✅ 一致 |
| 文件上传 | ✅ MxCadUploader | ✅ MxCadUppyUploader | 🔄 组件重命名 |
| 批量导入（目录导入） | ✅ | ✅ | ✅ 一致 |
| 存储配额管理 | ✅ 内联实现 | ✅ useLibraryQuota hook | 🔄 提取为 hook |
| 缩略图 | ✅ | ✅ | ✅ 一致 |
| CAD 编辑器打开 | ✅ | ✅ | ✅ 一致 |
| 删除确认对话框 | ✅ | ✅ | ✅ 一致 |

### 6.2 Hook 提取（重构改进）

当前分支将以下功能提取为独立 hooks:
- `useLibraryPagination` — 分页状态管理（替代内联 useState）
- `useLibraryModals` — 弹窗状态管理（替代内联 useState 集合）
- `useLibraryQuota` — 存储配额管理（替代内联实现）

逻辑意图完全一致，仅做代码组织层面的重构。

### 6.3 重命名行为差异 🟡

| 场景 | main 分支 | 当前分支 |
|------|----------|---------|
| 重命名文件 `block1.dwg` | 编辑框显示 `block1`（去除扩展名） | 编辑框显示 `block1.dwg`（保留扩展名） |

这是一个 **用户体验差异**，不是功能缺失。main 分支的意图是仅编辑文件名、保留扩展名不变，
当前分支的实现可能允许用户修改或误删扩展名。建议统一为 main 的行为。

---

## 七、API 调用对比

| 调用端 | main 分支 | 当前分支 |
|--------|----------|---------|
| 删除节点 | `libraryApi.deleteDrawingNode()` / `libraryApi.deleteBlockNode()` | `deleteDrawingNode()` / `deleteBlockNode()` (直接导入) |
| 存储配额查询 | `projectsApi.getQuota()` + `runtimeConfigApi.getPublicConfigs()` | 封装在 `useLibraryQuota` hook 中 |
| 存储配额更新 | `projectsApi.updateStorageQuota()` | 封装在 `useLibraryQuota` hook 中 |

逻辑意图一致，仅调用方式不同。

---

## 八、总结与行动建议

| 编号 | 项 | 类型 | 建议 |
|------|----|------|------|
| 🔴-1 | 上传端点缺失 (`upload`/`upload-chunk`)  | 缺失 | 确认是否是前端上传流已改用其他端点，否则需恢复 |
| 🔴-2 | 另存为端点缺失 (`save-as`) | 缺失 | 确认 CAD 编辑器是否仍需要此功能 |
| 🟡-1 | 重命名未去除扩展名 | 行为差异 | 恢复为 main 分支的行为 |
| ✅ | 分类树 (`categories`) | 新增 | 保留，确认前端已对接 |
| ✅ | Hook 提取 | 重构 | 保留，逻辑一致 |
| ✅ | IPublicLibraryProvider | 重构 | 保留，设计改进 |
| ✅ | MxCadUppyUploader | 重命名 | 保留，逻辑一致 |

**下一步**: 对 🔴 标记项，需要产品/技术负责人确认是有意变更还是重构遗漏，然后进行相应的恢复或文档更新。
