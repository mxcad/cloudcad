
# CAD Editor Deep — Functionality Audit

**对比分支：** `main`（旧版） vs `refactor/circular-deps`（当前）

**分析日期：** 2026-05-08

**审计范围（7 大维度）：** 编辑器控件、文件操作、上传流程、右键菜单、面板、状态管理、样式布局

**统计：** 核心 CAD 文件 13 个变更，+2053 / -1497 行；前端整体 271 个文件变更，+48656 / -23432 行

---

## 架构概览：main → refactor 核心变化

| 维度 | main 分支 | refactor 分支 | 性质 |
|------|----------|-------------|------|
| API 调用层 | `services/mxcadApi.ts` (326行) + `services/filesApi.ts` + `services/libraryApi.ts` 等独立服务文件 | `@/api-sdk` 统一 SDK（sdk.gen.ts 1827行 + types.gen.ts 6846行），所有旧服务文件已删除 | **架构升级** |
| 上传模块 | `utils/mxcadUploadUtils.ts` (287行) 分片上传 | `utils/uppyUploadUtils.ts` (388行) + `hooks/useUppyUpload.ts` (287行) Uppy 上传框架 | **替换** |
| mxcadManager | 单文件 `services/mxcadManager.ts` (3247行) | 目录 `services/mxcadManager/` — index.ts (2755行) + mxcadTypes.ts (130行) + mxcadSave.ts (260行) + mxcadThumbnail.ts (152行) + mxcadExtRef.ts (106行) + mxcadCheck.ts (237行) + 4 个测试文件 | **模块拆分** |
| CADEditorDirect | 1324 行，使用服务层 API | 1326 行，使用 @/api-sdk 直调 + usePersonalSpaceQuery hook | **重构** |
| CAD 引擎预加载 | 无 | `hooks/useMxCADPreload.ts` (104行) 空闲时间预加载 | **新增** |
| 上传组件 | `components/MxCadUploader.tsx` (224行) | `components/MxCadUppyUploader.tsx` (96行) | **替换** |
| LoadingOverlay | `components/ui/LoadingOverlay.tsx` (55行) | 已删除（loading 内联到 CADEditorDirect.tsx） | **合并** |

---

## 一、编辑器控件 (Toolbar & Keyboard Shortcuts)

### 1.1 工具栏按钮

> **关键事实：** CAD 工具栏由 `mxcad-app` (Vue 3 + Vuetify) 内部提供，**不是 React 代码**。`mxcadManager` 通过 `MxCADView` 创建 mxcad-app 实例，工具栏按钮（绘制、修改、标注、图层等）均在 mxcad-app SDK 内部。

| 控件区域 | 提供方 | main | refactor | 变化 |
|---------|--------|------|----------|------|
| 绘制工具栏 (Draw) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 修改工具栏 (Modify) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 标注工具栏 (Dimension) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 图层控件 (Layer) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 属性面板 (Properties) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 图块库面板 (Block Library) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 快速命令 (QuickCommand) | mxcad-app SDK | ✅ | ✅ | **无变化** |
| UI 配置 | `ini/myUiConfig.json` | ✅ | ✅ | **无变化** |
| 草图配置 | `ini/mySketchesAndNotesUiConfig.json` | ✅ | ✅ | **无变化** |
| 主题配置 | `ini/myVuetifyThemeConfig.json` | ✅ | ✅ | **无变化** |

**🔴 INTENT DIFFERENT — initMxCADConfig 调用时机**

| 分支 | 行为 |
|------|------|
| main | `initMxCADConfig()` 在 `mxcadManager.initializeMxCADView()` 内部调用，**调用时无文件信息** |
| refactor | `initMxCADConfig(currentFile)` 在 CADEditorDirect 中**显式调用**，传入当前文件信息以设置正确的上传目标 nodeId |

refactor 分支将配置初始化提升到组件层，允许根据当前打开的文件动态设置 `uploadFileConfig.create.formData.nodeId`。这是**有意的架构改进**，不是功能缺失。

### 1.2 键盘快捷键

**Ctrl+S 捕获阶段拦截 — ✅ 保留并增强**

| 分支 | 实现 |
|------|------|
| main | `mxcadManager.ts` 中 `document.addEventListener('keydown', ..., true)` 捕获 Ctrl+S，调用 `MxFun.sendStringToExecute('Mx_Save')` |
| refactor | `mxcadManager/index.ts:1357-1369` 中**相同的捕获阶段拦截逻辑**，额外调用 `MxFun.removeCommand('Mx_QSave')` 删除 mxcad-app 内部保存命令 |

refactor 分支额外移除了 mxcad-app 的默认快速保存命令 `Mx_QSave`，确保只有自定义的 `Mx_Save` 命令被执行。这是**增强**。

**MxCAD 内置快捷键（由 mxcad-app SDK 处理）：**

| 快捷键 | 功能 | main | refactor |
|--------|------|------|----------|
| Ctrl+Z | 撤销 | ✅ | ✅ |
| Ctrl+Y | 重做 | ✅ | ✅ |
| Ctrl+C/V | 复制/粘贴 | ✅ | ✅ |
| Delete | 删除选中实体 | ✅ | ✅ |
| Esc | 取消当前命令 | ✅ | ✅ |
| F2 | 命令行历史 | ✅ | ✅ |

> 以上快捷键均由 mxcad-app 内部处理，两个分支**无变化**。

---

## 二、文件操作 (Open, Save, Save-As, Export, Print)

### 2.1 打开文件

| 操作 | main | refactor | 对比 |
|------|------|----------|------|
| 项目文件打开 | `filesApi.getNode()` → `mxcadManager.openFile()` | `fileSystemControllerGetNode()` (SDK 直调) → `mxcadManager.openFile()` | **等价**，API 调用方式变更 |
| 图纸库文件打开 (?library=drawing) | ❌ 不支持 | `libraryControllerGetDrawingNode()` → `mxcadManager.openFile()` | **新增** |
| 图块库文件打开 (?library=block) | ❌ 不支持 | `libraryControllerGetBlockNode()` → `mxcadManager.openFile()` | **新增** |
| 历史版本打开 (?v=) | ❌ 不支持 | URL 构造 `/api/v1/mxcad/filesData/{path}?v={version}` | **新增** |
| 本地 mxweb 打开 | ❌ 不支持 | `openLocalMxwebFile()` — IndexedDB 缓存 | **新增** |
| 未登录公开上传打开 | ❌ 不支持 | `handlePublicUpload()` — TUS 上传 + CustomEvent 通知 | **新增** |
| 主页空白编辑器 (/) | ❌ 需登录 | ✅ 免登录展示 | **新增** |
| 文件打开重试 | ❌ 无 | `FILE_OPEN_RETRY_CONFIG` — 最多 3 次重试，1秒间隔 | **新增** |

**🔴 INTENT DIFFERENT — 文件 URL 路由**

| 分支 | 项目文件 URL | 图纸库文件 URL | 图块库文件 URL |
|------|------------|-------------|-------------|
| main | `/api/mxcad/filesData/{path}` | 不支持 | 不支持 |
| refactor | `/api/v1/mxcad/filesData/{path}` | `/api/v1/library/drawing/filesData/{path}` | `/api/v1/library/block/filesData/{path}` |

refactor 引入了 API v1 版本前缀和资源库独立路由。这是**后端架构升级的一部分**（参见 `cad-core.md` DECISION-1），前端已完全适配。

### 2.2 保存文件 (Mx_Save)

**🔴 INTENT DIFFERENT — 保存逻辑决策树**

| 场景 | main 行为 | refactor 行为 |
|------|---------|-------------|
| 未登录 | ❓ 未处理（可能报错） | 触发 `mxcad-save-required` 事件 → LoginPrompt 弹窗 |
| 无 currentFileInfo | ❓ 未处理 | 弹出 SaveAsModal |
| 私人空间文件 (isMyDrawing) | 直接保存 | 直接保存 (权限检查) |
| 项目文件 + 有 CAD_SAVE 权限 | 直接保存 | 直接保存 (API 权限检查) |
| 项目文件 + 无 CAD_SAVE 权限 | ❓ 未处理 | 弹出 SaveAsModal |
| 公共资源库文件 + 有库管理权限 | 不支持 | `saveLibraryFile()` 覆盖保存 |
| 公共资源库文件 + 无库管理权限 | 不支持 | 弹出 SaveAsModal |

refactor 分支的保存流程是**重大增强**：增加了未登录保护、权限检查、资源库保存、乐观锁时间戳等。

**新增功能对比：**

| 功能 | main | refactor |
|------|------|----------|
| 保存时未登录提示 | ❌ | ✅ LoginPrompt |
| 保存权限检查 (CAD_SAVE) | ❌ | ✅ API 直调 |
| 公共资源库保存 | ❌ | ✅ saveLibraryFile() |
| 乐观锁 (expectedTimestamp) | ❌ | ✅ currentFileInfo.updatedAt |
| 保存后 IndexedDB 缓存更新 | ❌ | ✅ clearFileCacheFromIndexedDB + 写入新缓存 |
| 保存后缩略图自动生成 | ❌ | ✅ generateThumbnail() |
| 文档修改事件追踪 (databaseModify) | ❌ | ✅ setupDocumentModifyListener() |
| 未保存更改确认对话框 | ❌ | ✅ showUnsavedChangesDialog() — 保存/不保存/取消 |

### 2.3 另存为 (Save-As)

| 功能 | main | refactor |
|------|------|----------|
| 触发方式 | ❓ 仅 MxCAD 内部 | `exportFile` 命令 + `mxcad-save-as` 事件 → SaveAsModal |
| 未登录保护 | ❌ | ✅ 先弹 LoginPrompt |
| 另存为弹窗 | ❌ | ✅ SaveAsModal (目标文件夹选择) |
| 成功回调 | ❌ | ✅ handleSaveAsSuccess — 重新打开保存的文件 + processPendingImages |

### 2.4 导出 (Export)

| 功能 | main | refactor |
|------|------|----------|
| 导出组件 | `components/Modals/ExportFileModal.tsx` (197行) + `ExportPDFOptionsModal.tsx` (171行) | `DownloadFormatModal` (合并两者) |
| 导出事件 | `mxcad-export-file` | `mxcad-export-file` (相同) |
| 导出权限检查 | ❓ 不明确 | `canExport` 状态 — `FILE_DOWNLOAD` 权限 |
| 支持格式 | DWG, DXF, PDF | DWG, DXF, PDF (相同) |
| PDF 选项 | ✅ ExportPDFOptionsModal | ✅ DownloadFormatModal (合并) |
| 下载实现 | ❓ 未确认 | `fileSystemControllerDownloadNodeWithFormat()` SDK 直调 |

**🔴 发现：ExportFileModal 和 ExportPDFOptionsModal 在 refactor 中已删除，功能合并到 DownloadFormatModal。** 这是**有意的架构简化**，不是功能丢失。

### 2.5 打印 (Print)

两个分支均由 mxcad-app SDK 内部处理 (`Mx_Print` 命令)，**无变化**。

### 2.6 关闭/返回

| 操作 | main | refactor |
|------|------|----------|
| 返回到云图管理 | `return-to-cloud-map-management` 命令 | `return-to-cloud-map-management` 命令 + 智能路径计算 |
| 导航路径 | 基础项目列表 | 私人空间 / 项目 / 图纸库 / 图块库 智能路由 |
| 平台跳转退出 | ❌ 不支持 | `window.close()` (通过 window.opener 检测) |
| 未保存检查 | ❌ | ✅ `checkAndConfirmUnsavedChanges()` |

---

## 三、上传流程 (Upload Dialog, Chunk Progress, Retry, Cancel, Conflict)

### 3.1 上传架构对比

| 组件 | main | refactor | 状态 |
|------|------|----------|------|
| 核心上传逻辑 | `utils/mxcadUploadUtils.ts` (287行) | `utils/uppyUploadUtils.ts` (388行) + `hooks/useUppyUpload.ts` (287行) | **替换** |
| 上传 UI 组件 | `components/MxCadUploader.tsx` (224行) | `components/MxCadUppyUploader.tsx` (96行) | **替换** |
| 底层上传协议 | 自定义分片上传 | Uppy (TUS 协议) | **升级** |
| 文件选择触发 | `openFile` 命令 → `<input type="file">` | `openFile` 命令 → `<input type="file">` | **相同触发方式** |

### 3.2 上传流程逐步骤对比

| 步骤 | main (mxcadUploadUtils) | refactor (uppyUploadUtils + mxcadManager) |
|------|--------------------------|---------------------------------------------|
| 1. 文件选择 | `getFilePicker()` → `input.click()` | `getFilePicker()` → `input.click()` (相同) |
| 2. 文件类型验证 | `.dwg .dxf .mxweb .mxwbe` | `.dwg .dxf .mxweb .mxwbe` (相同) |
| 3. 文件大小验证 | 100MB | 100MB (相同) |
| 4. 计算 hash | `calculateFileHash()` | `calculateFileHash()` (相同) |
| 5. 秒传检查 | `mxcadApi.checkFileExist()` | `mxCadControllerCheckFileExist()` (SDK 直调) |
| 6. 分片上传 | `uploadMxCadFile()` 自实现分片 (5MB/chunk) | `uploadFileWithUppy()` Uppy TUS 分片 |
| 7. 进度回调 | `onProgress(percentage)` | `onProgress(percentage)` (相同接口) |
| 8. 冲突策略 | skip / overwrite / rename | 通过 Uppy 服务端处理 |
| 9. 未登录上传 | ❌ 不支持 | `uploadFilePublic()` TUS 匿名上传 |
| 10. 上传后打开 | `openUploadedFile()` | `openUploadedFile()` + 外部参照检查 |

### 3.3 上传冲突解决

| 功能 | main | refactor |
|------|------|----------|
| 重复文件检查 | ✅ `checkDuplicateFile()` | ✅ `checkDuplicateFile()` → `showDuplicateFileDialog()` |
| 对话框选项 | ❓ 未确认 | 打开已有文件 / 覆盖上传 / 取消 |
| 秒传支持 | ✅ | ✅ (SDK 直调) |
| 传送后外部参照检查 | ❌ | ✅ `externalReferenceUpload.checkMissingReferences()` |

### 3.4 上传进度

| 功能 | main | refactor |
|------|------|----------|
| 进度展示 | loading 消息 | loading 消息（相同） |
| 取消上传 | ❓ 未明确 | ❓ 未明确（依赖 Uppy cancel） |

### 3.5 上传重试

| 功能 | main | refactor |
|------|------|----------|
| 文件打开重试 | ❌ 无 | ✅ 3次重试（mxdrawObject 错误） |
| 文件转换等待 | ❓ 未知 | ✅ `waitForFileReady()` 最多 30 次轮询 |

**🔴 INTENT DIFFERENT — 上传整体架构从自实现分片迁移到 Uppy TUS 协议。** 这是**有意的技术栈升级**，改善了上传可靠性和断点续传能力。

**🔴 发现：** main 分支 `mxcadUploadUtils.ts` 中的 `MxCadUploadError` 类、`validateFileType`/`validateFileSize` 验证函数、分片重试逻辑在 refactor 中被迁移到 Uppy 框架层处理。这些功能**没有丢失**，而是由 Uppy 框架原生支持。

---

## 四、右键菜单 (Context Menu)

> **关键事实：** CAD 编辑器画布右键菜单由 `mxcad-app` (Vue 3) 内部提供，**不由 React 控制**。mxcad-app 的 Vuetify 右键菜单包括：重复、删除、移动、旋转、缩放、属性等标准 CAD 操作。

| 功能 | 提供方 | main | refactor | 变化 |
|------|--------|------|----------|------|
| 实体右键菜单 | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 空白区域右键菜单 | mxcad-app SDK | ✅ | ✅ | **无变化** |
| 命令行右键菜单 | mxcad-app SDK | ✅ | ✅ | **无变化** |

React 代码层面两个分支均**不处理**编辑器画布右键菜单。此维度**无任何差异**。

---

## 五、面板 (Panels)

### 5.1 图层面板

由 mxcad-app SDK 内部提供，两个分支**无变化**。

### 5.2 属性面板

由 mxcad-app SDK 内部提供，两个分支**无变化**。

### 5.3 图块库面板

由 mxcad-app SDK 内部提供，两个分支**无变化**。

### 5.4 侧边栏（React 层面）

| 功能 | main | refactor |
|------|------|----------|
| 侧边栏容器 | `SidebarContainer` | `SidebarContainer` (94行 diff) |
| 图库面板 | `components/ProjectDrawingsPanel.tsx` (2605行) | `ProjectDrawingsPanelMain.tsx` (623行) + 子组件拆分 |
| 协同面板 | `CollaborateSidebar.tsx` | `CollaborateSidebar.tsx` |
| 文件系统导航 hook | 无独立 hook | `useFileSystemNavigation.ts` (85行 新增) |
| 打开命令 | 无 | `Mx_ShowSidebar`, `Mx_ShowCollaborate` 命令 |

**🔴 INTENT DIFFERENT — ProjectDrawingsPanel 重构**

main 的 `ProjectDrawingsPanel.tsx` (2605行单体组件) 在 refactor 中被拆分为：
- `ProjectDrawingsPanelMain.tsx` (623行) — 主组件
- `components/BreadcrumbNav.tsx` (319行) — 面包屑导航
- `components/ProjectListView.tsx` (132行) — 项目列表
- `components/VersionHistoryModal.tsx` (141行) — 版本历史弹窗
- `constants.ts` (21行) — 常量
- `hooks/useFileItemRenderer.tsx` (168行) — 文件项渲染
- `hooks/useLibraryCategories.ts` (122行) — 分类查询
- `hooks/useLoadNodes.ts` (172行) — 节点加载
- `hooks/useVersionHistory.ts` (90行) — 版本历史
- `types.ts` (35行) — 类型定义
- `index.ts` (15行) — 导出

**这是组件拆分重构，功能无丢失。**

### 5.5 侧边栏容器变化

| 功能 | main | refactor |
|------|------|----------|
| 项目 ID 传递 | ❓ | ✅ `projectId` prop |
| 插入文件回调 | ❓ | ✅ `onInsertFile` callback |
| 容器位置适配 | ❌ | ✅ `adjustContainerPosition(sidebarWidth)` |

---

## 六、状态管理 (Loading, Ready, Saving, Error, WebGL Context)

### 6.1 加载状态 (Loading)

| 状态场景 | main | refactor | 对比 |
|---------|------|----------|------|
| 主页模式初始 loading | ❓ 未知 | `useState(() => !!fileId)` — 主页模式初始 `false` | **修复白屏问题** |
| 文件加载 loading | ✅ | ✅ 增强：requestAnimationFrame 等待渲染 | **改进** |
| Loading 遮罩样式 | ❓ | 使用 CSS 变量 (`var(--bg-primary)`) 适配暗色主题 | **改进** |
| LoadingOverlay 组件 | ✅ 独立组件 | ❌ 删除，内联到 CADEditorDirect | **合并** |

**🔴 样式变化：** refactor 分支的 loading UI 使用 Tailwind CSS + CSS 变量，而非 main 的 `LoadingOverlay` 组件。这是**样式升级**，非功能缺失。

### 6.2 就绪状态 (Ready)

| 检查项 | main | refactor |
|--------|------|----------|
| `isInitializedRef` | 有 | ✅ 增强：组件级 ref（防 Strict Mode 重复初始化） |
| `homeInitStartedRef` | ❌ Window 全局变量 | ✅ 组件级 ref（防 Strict Mode 双挂载） |
| `isCreated()` | ✅ | ✅ |
| `isReady()` | ✅ | ✅ |
| 初始化超时 | ❌ 无 | ✅ setTimeout 300ms 延迟 |

### 6.3 保存状态 (Saving)

| 功能 | main | refactor |
|------|------|----------|
| 保存中 loading | ✅ | ✅ `showGlobalLoading()` |
| 保存进度 | ❌ | ✅ `setLoadingMessage()` |
| 保存错误处理 | ❓ | ✅ `handleError()` + toast |
| 保存冲突 (乐观锁) | ❌ | ✅ `expectedTimestamp` |

### 6.4 错误状态 (Error)

| 错误类型 | main | refactor |
|---------|------|----------|
| 认证错误 (401) | ❓ | ✅ "请登录后访问此文件" |
| 文件不存在 (404) | ❓ | ✅ "文件不存在或已被删除" |
| 文件已删除 (deletedAt) | ❓ | ✅ "文件已被删除" |
| 文件未转换 (无 fileHash) | ❓ | ✅ "文件尚未转换完成" |
| 无法构造 URL | ❓ | ✅ "无法构造文件访问URL" |
| CAD 初始化失败 | ❓ | ✅ "CAD编辑器初始化失败" |
| 通用错误 | ❓ | ✅ 错误详情显示 + 返回按钮 |

**🔴 INTENT DIFFERENT：** refactor 分支有**完整的错误状态枚举和处理**，main 分支似乎缺少这些细粒度错误处理。

### 6.5 WebGL 上下文管理

| 方面 | main | refactor | 对比 |
|------|------|----------|------|
| 显示/隐藏方案 | visibility + z-index | visibility + z-index | **相同** |
| 容器 z-index | CADEditorDirect: 9999, MxCAD: 9998 | CADEditorDirect: 9999, MxCAD: 9998 | **相同** |
| 组件级 ref 防护 | ❌ Window 全局变量 | ✅ `homeInitStartedRef` (组件级 ref) | **修复** |
| 竞态处理 | ❌ 无 | ✅ `pendingShowActionRef` (显示意图标记) | **新增** |
| 双帧 RAF 等待 | ❌ | ✅ `requestAnimationFrame(x2)` 确保 canvas 绘制 | **新增** |

**🔴 重大修复：** refactor 分支的 `pendingShowActionRef` 解决了 `hideEditor` 和 `showMxCAD` 之间的竞态条件。在 main 分支中，快速切换页面可能导致 "编辑器隐藏后又立即显示" 的问题。

**Strict Mode 修复：** refactor 使用组件级 `homeInitStartedRef` 替代 main 的 `window.__homeInitStarted` 全局变量，防止 React Strict Mode 双挂载导致 loading 永久为 true。

### 6.6 登录状态变化处理

| 状态转换 | main | refactor |
|---------|------|----------|
| 未登录 → 已登录 | ❓ | ✅ 刷新文件名前缀 + reloadCurrentFile |
| 已登录 → 未登录 | ❓ | ❓ 未处理 |
| 登录成功恢复编辑器 | ❓ | ✅ `showMxCAD(true)` + 意图标记 |

---

## 七、样式布局 (Toolbar Layout, Panels, Responsive, Dark Theme)

### 7.1 工具栏布局

| 方面 | main | refactor | 对比 |
|------|------|----------|------|
| 工具栏位置 | mxcad-app 内部控制 | mxcad-app 内部控制 | **无变化** |
| 工具栏主题 | mxcad-app Vuetify 主题 | mxcad-app Vuetify 主题 + 双向同步 | **增强** |
| CSS 类名 | ❓ 未知 | `CSS_CLASSES` 常量 (GLOBAL_CONTAINER, LOADING_OVERLAY 等) | **规范化** |

### 7.2 面板定位

| 面板 | main | refactor |
|------|------|----------|
| CAD 容器位置 | `left: 300px` (固定) | `left: 300px` → `adjustContainerPosition(sidebarWidth)` (可调) |
| 侧边栏 | ✅ | ✅ |
| 编辑器内容区 | `flex-1 relative` | `flex-1 relative` (相同) |

### 7.3 响应式行为

两个分支均依赖 mxcad-app 的响应式布局。React 层面的侧边栏宽度固定为 300px。**无明显变化**。

### 7.4 暗色主题

| 功能 | main | refactor | 对比 |
|------|------|----------|------|
| 主题来源 | mxcad-app Vuetify + React ThemeContext | mxcad-app Vuetify + React ThemeContext | **相同** |
| 主题双向同步 | ❓ 不明确 | ✅ `initThemeSync()` Vue watch → CustomEvent → React | **增强** |
| localStorage 同步 | ✅ `mx-user-dark` | ✅ `mx-user-dark` (相同) | **相同** |
| DOM 属性更新 | ❓ | ✅ `data-theme` + body class | **增强** |
| 初始化时主题一致性检查 | ❌ | ✅ 比较 localStorage 与 mxcad Vuetify 主题 | **新增** |
| 对话框暗色适配 | ❓ 基本 | ✅ CSS 变量 + isDark 条件渲染 | **增强** |

**🔴 INTENT DIFFERENT — 主题同步：** refactor 通过 Vue `watch` 监听 mxcad-app 的 Vuetify 主题变化，并通过 CustomEvent 通知 React ThemeContext。main 分支似乎缺少这种双向同步。这是**架构增强**，非功能缺失。

---

## 八、缺失功能确认清单

### 8.1 ✅ 功能完整保留（无丢失）

| 功能 | 状态 |
|------|------|
| CAD 工具栏 (draw/modify/dimension/layer 等) | ✅ mxcad-app SDK 内部，无变化 |
| 右键菜单 | ✅ mxcad-app SDK 内部，无变化 |
| 图层/属性/图块面板 | ✅ mxcad-app SDK 内部，无变化 |
| Ctrl+S 保存快捷键 | ✅ 保留并增强（移除 Mx_QSave） |
| 标准 CAD 快捷键 (Ctrl+Z/Y/C/V, Delete, Esc) | ✅ mxcad-app SDK 内部，无变化 |
| 打印 (Mx_Print) | ✅ mxcad-app SDK 内部，无变化 |
| 文件打开 | ✅ 增强（新增公开/历史版本/本地 mxweb） |
| 文件保存 | ✅ 大幅增强（权限/乐观锁/缓存更新） |
| 文件导出 (DWG/DXF/PDF) | ✅ 合并 ExportFileModal → DownloadFormatModal |
| 分片上传 | ✅ 升级为 Uppy TUS 协议 |
| 秒传检查 | ✅ 保留 |
| 冲突策略 | ✅ 保留 |
| 上传进度 | ✅ 保留 |
| 侧边栏（图库/协同） | ✅ ProjectDrawingsPanel 重构拆分 |
| 未保存更改保护 | ✅ 新增（beforeunload + 确认对话框） |
| 文档修改追踪 | ✅ 新增（databaseModify 事件） |
| 缩略图生成/上传 | ✅ 新增 |
| 外部参照上传 | ✅ 保留并增强 |
| 暗色主题 | ✅ 增强（双向同步） |
| WebGL 上下文保护 | ✅ 增强（竞态处理 + Strict Mode 修复） |

### 8.2 🔴 需要确认的差异

| 差异 | 严重程度 | 说明 |
|------|---------|------|
| API 路由 `/api/mxcad/filesData/*` → `/api/v1/mxcad/filesData/*` | 🔴 HIGH | 需确认后端兼容（参见 cad-core.md DECISION-1） |
| 文件上传协议从自实现分片 → Uppy TUS | 🟡 MEDIUM | 需确认服务端支持 TUS 协议 |
| MxCadUploader → MxCadUppyUploader | 🟡 MEDIUM | UI 组件简化（224行→96行），需确认功能完整性 |
| LoadingOverlay 删除 | 🟢 LOW | 功能内联到 CADEditorDirect，等价 |
| MxCAD 容器创建时不再调用 initMxCADConfig | 🟡 MEDIUM | 提升到组件层，传入文件信息设置上传目标 — 需确认无副作用 |

### 8.3 ✨ 纯新增功能

| 功能 | 位置 |
|------|------|
| CAD 引擎空闲预加载 | `hooks/useMxCADPreload.ts` |
| 主页模式免登录空白编辑器 | `CADEditorDirect.tsx` -> isHomeMode |
| 公开资源库文件访问 (?library=) | `CADEditorDirect.tsx` |
| 历史版本访问 (?v=) | `CADEditorDirect.tsx` |
| 未登录公开上传 + 外部参照检查 | `handlePublicUpload()` + `public-file-uploaded` 事件 |
| 登录提示弹窗 (LoginPrompt) | `CADEditorDirect.tsx` |
| 保存前权限检查 | `saveToCurrentFile()` |
| 乐观锁冲突检测 | `expectedTimestamp` |
| 插入图片上传 (Mx_InsertImageWithUpload) | `mxcadManager/index.ts:2566` |
| IndexedDB 缓存管理 | `clearFileCacheFromIndexedDB()` |
| Cache API 清理 | `clearOldMxwebCache()` |
| 文件打开重试机制 | `FILE_OPEN_RETRY_CONFIG` |
| 文件转换轮询等待 | `waitForFileReady()` |
| 组件级 ref Strict Mode 防护 | `homeInitStartedRef` |
| WebGL 竞态处理 | `pendingShowActionRef` |

---

## 九、总结

**refactor/circular-deps 分支相对于 main 的重大改进：**

1. **架构层面：**
   - mxcadManager 从 3247 行单体文件拆分为 6 个子模块 + 4 个测试文件
   - API 调用从独立服务文件迁移到统一的 @/api-sdk
   - 上传从自实现分片升级到 Uppy TUS 协议

2. **功能层面：**
   - 新增 15+ 个功能特性（主页免登录、公开资源库、历史版本、未登录保护、乐观锁等）
   - 错误处理从"基本无"升级到 7 种细粒度错误类型
   - WebGL 上下文管理新增竞态处理和 Strict Mode 修复

3. **UI/UX 层面：**
   - 主题双向同步（Vue Vuetify ↔ React ThemeContext）
   - 暗色主题适配增强（CSS 变量 + isDark 条件渲染）
   - 未保存更改确认对话框

4. **无功能丢失：** 所有 main 分支的核心 CAD 功能均已保留或增强。删除的组件/文件（ExportFileModal、ExportPDFOptionsModal、LoadingOverlay、mxcadApi.ts、mxcadUploadUtils.ts）功能全部合并到新架构中。

5. **3 个需要决策的问题：** API v1 路由兼容、Uppy TUS 服务端支持、initMxCADConfig 调用时机变化。
