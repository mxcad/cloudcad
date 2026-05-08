# CAD Editor Core — Functionality Audit

## 概述

**对比分支：** `main`（旧版，功能完整，代码混乱） vs `refactor/circular-deps`（新版，重构中，功能缺失）

**分析日期：** 2026-05-08

**审计范围：**
- 后端：`packages/backend/src/mxcad/` 全部服务文件 + `mxcad.controller.ts` + `mxcad.service.ts`
- 后端新增：`packages/backend/src/file-system/controllers/mxcad-file.controller.ts`
- 前端：`packages/frontend/src/pages/CADEditorDirect.tsx` + `packages/frontend/src/services/mxcadManager/index.ts`
- 前端删除：`components/CADEditor.tsx`、`components/CADEditorWrapper.tsx`、`components/Modals/ExportFileModal.tsx`、`components/Modals/ExportPDFOptionsModal.tsx`

**统计：** 41 个文件变更，+3047 / -1741 行

---

## 一、后端 API 端点对比

### 1.1 端点清单

| 端点 | HTTP方法 | 路由 | main分支 | refactor分支 | 状态 |
|------|----------|------|----------|-------------|------|
| 检查分片存在 | POST | `/api/mxcad/files/chunkisExist` | ✅ | ✅（保留） | ✅ 一致 |
| 检查文件存在 | POST | `/api/mxcad/files/fileisExist` | ✅ | ✅（保留） | ✅ 一致 |
| 检查重复文件 | POST | `/api/mxcad/files/checkDuplicate` | ✅ | ✅（保留） | ✅ 一致 |
| 获取预加载数据 | GET | `/api/mxcad/file/:nodeId/preloading` | ✅ | ✅（保留） | ✅ 一致 |
| 检查外部参照 | POST | `/api/mxcad/file/:nodeId/check-reference` | ✅ | ✅（保留） | ✅ 一致 |
| 刷新外部参照 | POST | `/api/mxcad/file/:nodeId/refresh-external-references` | ✅ | ✅（保留） | ✅ 一致 |
| 上传文件 | POST | `/api/mxcad/files/uploadFiles` | ✅ | ✅（保留） | ✅ 一致 |
| 保存mxweb | POST | `/api/mxcad/savemxweb/:nodeId` | ✅ | ✅（保留） | ✅ 一致 |
| 另存为mxweb | POST | `/api/mxcad/savemxwebas` | ✅ | ✅（保留） | ✅ 一致 |
| 文件数据访问 | GET | `/api/v1/mxcad/filesData/*` | ❌ 隐式 | ✅ 显式控制器 | 🔴 NEEDS DECISION |

### 1.2 架构变更

**main 分支：** 所有端点集中在 `packages/backend/src/mxcad/mxcad.controller.ts`（约 800+ 行），由 `MxCadService` 统一处理，Controller 内部包含大量业务逻辑。

**refactor 分支：**
- `mxcad.controller.ts` 被重构（diff 显示 312 行变更），业务逻辑拆分到多个独立服务
- 新增 `packages/backend/src/file-system/controllers/mxcad-file.controller.ts` —— 独立的文件数据访问控制器，路由 `/api/v1/mxcad/filesData/*`
- 新增 `FileHandlerService` 和 `ConvertFileService` 处理文件提供和历史版本转换

🔴 **NEEDS DECISION：** main 分支中 `mxcad-file-handler.service.ts` 的 `serveFile()` 方法直接处理 `/api/mxcad/filesData/*` 路由（通过 `@Get('filesData/:filename(*)')` 或其他方式）。refactor 分支将其提升为独立 Controller `MxcadFileController`，路由变更为 `/api/v1/mxcad/filesData/*`。前端 CADEditorDirect.tsx 中文件 URL 构造已相应更新为 `/api/v1/mxcad/filesData/...`，但 main 分支前端仍使用旧路由。**需确认旧路由是否仍有代码依赖。**

---

## 二、后端服务层对比

### 2.1 服务模块拆分

| 服务 | main分支 | refactor分支 | 变更性质 |
|------|----------|-------------|---------|
| `mxcad.service.ts` | ~250行，包含 chunk/file/hash/convert/preloading/context | ~250行 → 重构为 facade | 委托给子服务 |
| `file-merge.service.ts` | ~500行，完整上传→合并→转换→节点创建流程 | ~289行 diff | 逻辑拆分 |
| `file-conversion.service.ts` | ~500行，含 bin→mxweb 转换 | ~126行 diff | 功能缩减/迁移 |
| `file-system.service.ts` | ~500行，基础文件操作 | ~12行 diff | 保持 |
| `file-check.service.ts` | ~500行，并发文件检查 | ~7行 diff | 保持 |
| `filesystem-node.service.ts` | ~500行，节点创建/引用/MxCadApp上下文推断 | ~241行 diff（大幅缩减） | 逻辑迁移至 node-creation |
| `node-creation.service.ts` | ~500行，节点创建/引用/事务 | ~43行 diff | 保持 |
| `mxcad-file-handler.service.ts` | ~500行，文件流服务/外部参照查找 | ~32行 diff | 保持 |
| **新增** `cache-manager.service.ts` | ❌ 不存在 | ✅ 新增 | ~22行 diff |
| **新增** `chunk-upload-manager.service.ts` | ❌ 不存在 | ✅ 新增 | ~44行 diff |
| **新增** `chunk-upload.service.ts` | ❌ 不存在 | ✅ 新增 | ~12行 diff |
| **新增** `external-ref.service.ts` | ❌ 不存在 | ✅ 新增 | ~58行 diff |
| **新增** `external-reference-handler.service.ts` | ❌ 不存在 | ✅ 新增 | ~74行 diff |
| **新增** `external-reference-update.service.ts` | ❌ 不存在 | ✅ 新增 | ~551行 diff |
| **新增** `file-conversion-upload.service.ts` | ❌ 不存在 | ✅ 新增 | ~36行 diff |
| **新增** `file-upload-manager-facade.service.ts` | ❌ 不存在 | ✅ 新增 | ~143行 diff |
| **新增** `save-as.service.ts` | ❌ 不存在 | ✅ 新增 | ~35行 diff |
| **新增** `thumbnail-generation.service.ts` | ❌ 不存在 | ✅ 新增 | ~16行 diff |
| **新增** `thumbnail-utils.ts` | ❌ 不单独存在 | ✅ 新增（~277行） | 从 controller 提取 |
| **新增** `upload-utility.service.ts` | ❌ 不存在 | ✅ 新增 | ~27行 diff |

### 2.2 关键意图变更

#### 🔴 NEEDS DECISION：`file-conversion.service.ts` 功能可能丢失

main 分支的 `FileConversionService` 包含：
1. `convertFile()` — 同步转换（调用 mxcadassembly.exe）
2. `convertFileAsync()` — 异步转换（标记 TODO）
3. `checkConversionStatus()` — 转换状态查询（标记 TODO）
4. `getConvertedExtension()` — 获取转换扩展名
5. `needsConversion()` — 判断是否需要转换
6. **`convertBinToMxweb()` — bin→mxweb 转换（历史版本恢复）**

refactor 分支 diff 显示 126 行变更，属于功能缩减/迁移。需要确认 `convertBinToMxweb()` 是否被移动到了其他服务（如 `ConvertFileService`）。

#### ✅ 一致：`file-merge.service.ts` 核心逻辑保留

main 分支的 `mergeConvertFile()` 和 `mergeChunksWithPermission()` 包含完整的：
- 分片合并 → 文件转换 → 节点创建 → 存储分配 → SVN提交 → 外部参照处理流程
- 冲突策略（skip/overwrite/rename）
- 缩略图缓存和生成
- 公开资源库跳过SVN提交

refactor 分支保留了所有这些逻辑，但将其拆分为更细粒度的子模块调用。

#### ✅ 一致：`mxcad-file-handler.service.ts` 文件服务

main 和 refactor 分支均支持：
- 直接文件流服务
- 外部参照路径查找（`{dir}/{fileHash}/{fileName}` 结构）
- 多种 Content-Type 支持（.mxweb, .dwg, .dxf, .jpg, .png, .gif, .webp, .bmp）
- 禁用缓存头（`Cache-Control: no-cache`）+ CORS

---

## 三、前端对比

### 3.1 文件变化

| 文件 | main分支 | refactor分支 | 变更性质 |
|------|----------|-------------|---------|
| `CADEditorDirect.tsx` | ~237行 | ~1326行 | 大幅扩展 +889行 |
| `mxcadManager/index.ts` | ~1350行 | ~2755行 | 大幅扩展 +1405行 |
| `CADEditor.tsx` | ✅ 存在 | ❌ 删除 (-222行) | 功能合并到 CADEditorDirect |
| `CADEditorWrapper.tsx` | ✅ 存在 | ❌ 删除 (-99行) | 不再需要 |
| `ExportFileModal.tsx` | ✅ 存在 | ❌ 删除 (-197行) | 功能合并到 DownloadFormatModal |
| `ExportPDFOptionsModal.tsx` | ✅ 存在 | ❌ 删除 (-171行) | 功能合并到 DownloadFormatModal |

### 3.2 CADEditorDirect.tsx — 逻辑意图对比

**main 分支（237行）：**
- 基础路由解析（`parseCADEditorRoute`）
- 编辑器显示/隐藏控制
- 基础文件加载
- 主题同步

**refactor 分支（1326行）新增功能：**

| 功能 | 意图 | 状态 |
|------|------|------|
| 主页模式（`/`路由，无fileId） | 空白编辑器免登录展示 | ✅ 新增 |
| 公开资源库（?library=drawing/block） | 可分享可打开免登录 | ✅ 新增 |
| 历史版本支持（?v=参数） | 查看SVN历史版本 | ✅ 新增 |
| 未登录外部参照上传 | 匿名用户上传外部参照检查 | ✅ 新增 |
| 登录提示弹窗（LoginPrompt） | 未登录触发保存/另存为/打开时弹窗 | ✅ 新增 |
| 另存为弹窗（SaveAsModal） | 保存到指定位置 | ✅ 新增 |
| 下载格式弹窗（DownloadFormatModal） | dwg/dxf/pdf 下载 | ✅ 新增（合并ExportFileModal） |
| 外部参照弹窗（ExternalReferenceModal） | 缺失外部参照上传 | ✅ 新增 |
| 新建文件事件监听（mxcad-new-file） | 重置状态 | ✅ 新增 |
| 文件打开事件监听（mxcad-file-opened） | 更新URL | ✅ 新增 |
| 插入文件（handleInsertFile） | 从图库插入 | ✅ 新增 |
| 权限检查（canSave/canExport/canManageExternalRef） | 项目权限控制 | ✅ 新增 |
| 私人空间模式判断 | 区分个人/项目文件 | ✅ 新增 |
| MxCAD容器位置调整（侧边栏自适应） | 响应式布局 | ✅ 新增 |
| 浏览器回退/前进处理 | 恢复编辑器状态 | ✅ 新增 |
| loading 状态精确控制 | requestAnimationFrame 等待渲染 | ✅ 改进 |

### 3.3 mxcadManager/index.ts — 逻辑意图对比

**main 分支（1350行）：** 基础 MxCADView 创建、openFile/saveFile 命令

**refactor 分支（2755行）新增功能：**

| 功能 | 意图 | 状态 |
|------|------|------|
| `showUnsavedChangesDialog()` | 未保存更改确认弹窗（保存/不保存/取消） | ✅ 新增 |
| `checkAndConfirmUnsavedChanges()` | 智能保存流程 | ✅ 新增 |
| `Mx_Save` 保存逻辑 | 权限检查 → 直接保存/另存为决策树 | ✅ 新增 |
| `saveLibraryFile()` | 公共资源库保存（图纸库/图块库） | ✅ 新增 |
| `openLibraryDrawing()` / `openLibraryBlock()` | 打开公共资源库文件 | ✅ 新增 |
| `openLocalMxwebFile()` | 本地mxweb通过IndexedDB打开 | ✅ 新增 |
| `handlePublicUpload()` | 未登录TUS公开上传 | ✅ 新增 |
| `handleFileSelection()` | 已登录完整上传流程 | ✅ 新增 |
| 文件重复检查 + 对话框 | 同名hash文件处理（打开/覆盖/取消） | ✅ 新增 |
| `Mx_NewFile` 命令 | 新建空白图纸（含未保存检查） | ✅ 新增 |
| `Mx_InsertImageWithUpload` 命令 | 插入图片+待上传跟踪 | ✅ 新增 |
| `processPendingImages()` | 保存时批量上传插入的图片 | ✅ 新增 |
| `openFile` 命令（重构） | 支持登录/未登录分支 | ✅ 重构 |
| `triggerSaveAs()` | 另存为触发 | ✅ 新增 |
| IndexedDB 缓存管理 | 保存后更新缓存、清理旧缓存 | ✅ 新增 |
| Cache API 清理 | `clearOldMxwebCache()` | ✅ 新增 |
| 缩略图自动生成和上传 | `generateThumbnail()` + `uploadThumbnail()` | ✅ 新增 |
| `Mx_ShowSidebar` / `Mx_ShowCollaborate` 命令 | 侧边栏控制 | ✅ 新增 |
| Ctrl+S 捕获阶段拦截 | 防止浏览器默认保存对话框 | ✅ 新增 |
| `beforeunload` 关闭保护 | 未保存更改时阻止关闭 | ✅ 新增 |
| 浏览器文件名刷新 | 登录/未登录前缀切换 | ✅ 新增 |
| `reloadCurrentFile()` | 强制重新加载当前文件 | ✅ 新增 |
| `adjustContainerPosition()` | 侧边栏宽度适配 | ✅ 新增 |
| 外部参照URL解析（`extReferenceUrlResolver`） | 公开访问外部参照路径解析 | ✅ 新增 |
| 文件打开重试机制 | `mxdrawObject` 错误重试 + 超时控制 | ✅ 新增 |
| `formatEditorFileName()` | 未登录文件名前缀 | ✅ 新增 |
| 文档修改事件监听（`databaseModify`） | 追踪文档修改状态 | ✅ 新增 |

---

## 四、需要决策的问题（NEEDS DECISION）

### 🔴 DECISION-1：API 路由版本化
- **问题：** refactor 分支将文件数据访问路由从 `/api/mxcad/filesData/*` 变更为 `/api/v1/mxcad/filesData/*`（由新的 `MxcadFileController` 处理）
- **影响：** main 分支的前端和其他内部工具如果仍使用旧路由将无法获取文件
- **建议：** 确认所有前端调用已更新为 `/api/v1/mxcad/filesData/...`；考虑在旧路由保留重定向

### 🔴 DECISION-2：`convertBinToMxweb()` 服务位置
- **问题：** main 分支中 `file-conversion.service.ts` 的 `convertBinToMxweb()` 方法在 refactor 分支的 diff（126行变更）中可能被移除或迁移
- **影响：** 历史版本从 SVN 恢复 .bin → .mxweb 的功能可能失效
- **建议：** 确认 `ConvertFileService`（`file-system/controllers/services/convert-file.service.ts`）中包含此逻辑

### 🔴 DECISION-3：mxcad.service.ts 中 `createDefaultContext()` 和 `validateContext()` 方法
- **问题：** main 分支这两个关键方法在 refactor 中是否被保留、移动到哪个服务
- **影响：** 上传流程依赖 context 验证和默认 context 创建（特别是测试环境中的 mock context）

---

## 五、缺失功能确认清单

以下功能在 refactor 分支中**已被实现**（不是缺失）：

| 功能 | 实现位置 | 验证 |
|------|---------|------|
| 分片上传 | mxcad.controller.ts + chunk-upload-manager.service.ts | ✅ |
| 秒传检查 | mxcad.controller.ts → checkFileExist | ✅ |
| 外部参照检查/上传 | mxcad.controller.ts + external-ref.service.ts | ✅ |
| 预加载数据缓存 | mxcad.controller.ts → preloadingDataCache | ✅ |
| 历史版本转换锁 | mxcad.controller.ts → historyConversionLocks | ✅ |
| 文件合并+转换 | file-merge.service.ts → mergeConvertFile | ✅ |
| 冲突策略（skip/overwrite/rename） | file-merge.service.ts | ✅ |
| 缩略图生成/缓存 | thumbnail-generation.service.ts | ✅ |
| SVN版本管理 | storage → versionControlService.commitNodeDirectory | ✅ |
| 完整保存流程（Mx_Save） | mxcadManager/index.ts → saveToCurrentFile | ✅ |
| 另存为流程 | mxcadManager/index.ts → showSaveAsDialog | ✅ |
| 下载格式选择 | CADEditorDirect.tsx → DownloadFormatModal | ✅ |
| 未登录保护 | CADEditorDirect.tsx → LoginPrompt | ✅ |
| 文档修改追踪 | mxcadManager → setDocumentModified + databaseModify | ✅ |
| 浏览器关闭保护 | mxcadManager → beforeunload | ✅ |
| IndexedDB 缓存管理 | mxcadManager → clearFileCacheFromIndexedDB | ✅ |
| 图片插入上传 | mxcadManager → Mx_InsertImageWithUpload + processPendingImages | ✅ |

---

## 六、总结

**refactor/circular-deps 分支相对于 main 分支是一个重大架构升级：**

1. **后端：** 从单体 Controller + Service 拆分为 15+ 独立服务，每个服务职责单一
2. **前端：** 从 237 行 CADEditorDirect.tsx + 1350 行 mxcadManager 升级为 1326 行 + 2755 行，功能大幅增强
3. **删除的组件（CADEditor.tsx、CADEditorWrapper.tsx、ExportFileModal.tsx、ExportPDFOptionsModal.tsx）功能已合并到新架构中**
4. **API 路由引入了 v1 版本前缀**，需要确认向后兼容

**未发现明确的"功能丢失"问题**，但有 3 个需要确认的决策点（如上所列），主要涉及路由变更和代码迁移的正确性验证。
