# frontend_mobile CAD 编辑器补齐规划

> **目标：** 将 `packages/frontend`（React 桌面版）CAD 编辑器的所有行为（文件打开、保存、外部参照、权限、缩略图、版本历史、协作）移植到 `packages/frontend_mobile`（Vue 3 移动版）。

---

## 场景定义

```
桌面 React App（port 5173）             frontend_mobile（Vue 3）
┌────────────────────────┐            ┌──────────────────────────┐
│ 项目列表 / 文件管理     │ 跳转       │ 全屏 CAD 编辑器           │
│ （已兼容移动端）        │ ──────►   │                          │
│                        │ fileId +   │ 打开 → 编辑 → 保存 → 返回 │
│ 用户点击 CAD 文件       │ cookie     │                          │
│                        │ ◄──────   │ 返回按钮                  │
└────────────────────────┘            └──────────────────────────┘
```

### 关键约束

- **入口：** 两种都支持（从桌面 App 跳转 / 直接访问 URL）
- **登录态：** 同域名共享 Cookie（`credentials: 'include'`）
- **侧边栏：** 不需要（不切换图纸，专注编辑当前文件）
- **路由：** 单页面 + 独立全屏编辑器
- **状态管理：** Composables-only（不用 Pinia）
- **协作：** Phase 7 最后做

---

## 各阶段规划

### Phase 0 — 工程基础 ⏱ 1-2天

激活路由、配置 API 客户端、建立基础状态管理。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 0.1 | 激活路由 | 启用 `route.ts`，注册 `/editor?fileId=xxx` | 现有未用代码 |
| 0.2 | 入口改造 | `App.vue` 从直接渲染 Home 改为 `<router-view>` | — |
| 0.3 | API 客户端配置 | SDK baseURL + `credentials: 'include'` | `api-sdk/client.gen.ts` |
| 0.4 | 编辑器状态 composable | `useEditorState()` — fileId/loading/error/fileInfo/permissions | desktop `useCADEditorStore.ts` |
| 0.5 | 用户信息 composable | `useUser()` — 登录态判断、用户 ID 获取 | desktop `AuthContext.tsx` |
| 0.6 | 返回按钮 | 返回桌面 App（优先 `history.back()`，降级到配置 URL） | desktop 历史栈修复逻辑 |

**交付：** frontend_mobile 能接收 fileId 参数，API SDK 可正常调用后端。

---

### Phase 1 — 核心：从服务器打开文件 ⏱ 2-3天

按 fileId 从后端加载图纸到编辑器。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 1.1 | 按 fileId 获取节点 | `fileSystemControllerGetNode` → filePath/fileType/projectId | desktop `CADEditorDirect.tsx:300-400` |
| 1.2 | 获取根节点/项目信息 | `fileSystemControllerGetRootNode` → 判断项目库 vs 个人空间 | desktop `mxcadManager.openUploadedFile` |
| 1.3 | 获取私人空间 ID | `fileSystemControllerGetPersonalSpace` | desktop `usePersonalSpaceQuery` |
| 1.4 | 构建 mxweb URL | `/api/v1/mxcad/filesData/{filePath}?t={timestamp}` | desktop `UrlHelper.buildMxCadFileUrl` |
| 1.5 | 打开文件 | `mxcad.openWebFile(url)` | 现有 `openMxWeb.ts` |
| 1.6 | 处理库文件 | `libraryControllerGetDrawingNode / GetBlockNode` 区分图库类型 | desktop `mxcadManager.openLibraryDrawing/Block` |
| 1.7 | 处理公开文件 | 未登录用户通过 hash 访问 `/api/v1/public-file/access/{hash}/{fileName}` | desktop `mxcadManager.handlePublicUpload` |
| 1.8 | 文件打开 loading | 加载中遮罩 + 错误提示 | desktop `loadingUtils.ts` |
| 1.9 | 插件上下文注入 | 设置 `window.mxcadAppContext`（userId/projectId/parentId） | desktop `CADEditorDirect.tsx` |

**交付：** 用户可打开服务器上的图纸，看到 CAD 内容，支持项目文件/图库文件/公开文件三种来源。

```
URL fileId
  │
  ▼
fileSystemControllerGetNode(fileId) → { filePath, projectId, parentId }
  │
  ▼
识别文件类型:
├─ project/my-drawings → fileSystemControllerGetRootNode
├─ library/drawing    → libraryControllerGetDrawingNode
├─ library/block      → libraryControllerGetBlockNode
└─ public             → publicFileControllerGetPreloadingData
  │
  ▼
构建 mxweb URL: /api/v1/mxcad/filesData/{path}?t={timestamp}
  │
  ▼
mxcad.openWebFile(url)
  │
  ▼
监听 openFileComplete → 加载完成
```

---

### Phase 2 — 核心：保存到服务器 ⏱ 3-4天

保存修改到服务器，支持保存到原位置和另存为。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 2.1 | 保存按钮接入 | 修改 header 保存按钮 → 触发保存流程 | 现有 `index.vue` header `baocun` |
| 2.2 | 获取 mxweb 数据 | `mxcad.getMxFile()` → ArrayBuffer | desktop `mxcadManager:1304-1429` |
| 2.3 | 文件哈希 | `calculateFileHash(arrayBuffer)` → SHA-256 | desktop `hashUtils.ts` |
| 2.4 | POST 保存 | `POST /api/v1/mxcad/savemxweb/{fileId}` FormData(hash, file, commitMessage) | desktop `mxcadSave.ts` |
| 2.5 | 保存权限检查 | 保存前调用 `fileSystemControllerCheckProjectPermission` | desktop `CADEditorDirect.tsx:293-340` |
| 2.6 | 另存为 UI | Vant Popup：选择保存到「个人空间 / 项目 / 图库」 | desktop `SaveAsModal.tsx` |
| 2.7 | 另存为逻辑 | `saveControllerSaveMxwebAs` + `libraryControllerSaveDrawing/BlockAs` | desktop `SaveAsModal` + `mxcadSave.ts` |
| 2.8 | 库文件保存 | `libraryControllerSaveDrawingNode / SaveBlockNode` | desktop `mxcadManager.saveLibraryFile` |
| 2.9 | 新建图纸 | `mxcad.newFile()` 清空画布 | desktop `mxcadManager Mx_NewFile` |
| 2.10 | 未保存确认 | `documentModified` 标记 + 返回/新建前确认弹窗 | desktop `mxcadManager.checkAndConfirmUnsavedChanges` |

**交付：** 用户可保存修改到服务器，支持保存到原位置和另存为。

```
用户点保存
  │
  ▼
检查权限: fileSystemControllerCheckProjectPermission
  │
  ▼
mxcad.getMxFile() → ArrayBuffer
  │
  ▼
calculateFileHash(buffer) → SHA-256 hash
  │
  ▼
确定保存目标:
├─ 已关联文件 → POST /api/v1/mxcad/savemxweb/{fileId}
├─ 库文件     → libraryControllerSaveDrawingNode / SaveBlockNode
└─ 另存为新文件 → saveControllerSaveMxwebAs / libraryControllerSaveXxxAs
  │
  ▼
上传缩略图: thumbnailControllerUploadThumbnail(nodeId, blob)
```

---

### Phase 3 — 下载 / 导出 ⏱ 1-2天

选择格式下载或导出当前图纸。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 3.1 | 导出格式选择 UI | Vant ActionSheet：dwg/dxf/mxweb/pdf | desktop `DownloadFormatModal.tsx` |
| 3.2 | 格式下载 | `fileSystemControllerDownloadNodeWithFormat(nodeId, format)` | desktop `handleDownloadWithFormat` |
| 3.3 | PDF 导出增强 | 现有 `Mx_exportPDF` + PDF 选项（页面大小/方向） | 已有命令 + desktop `PdfOptions` |
| 3.4 | 公开文件导出 | 未登录用户 → `publicFileControllerConvertAndDownload` | desktop `CADEditorDirect.tsx` |
| 3.5 | 公共上传入口 | 上传本地 DWG/DXF → 转换 → 编辑 → 导出 | desktop `handlePublicUpload` |

**交付：** 用户可选择格式下载当前图纸。

---

### Phase 4 — 外部参照 ⏱ 2-3天

检查并处理文件中的外部参照。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 4.1 | 预加载数据 | `mxCadControllerGetPreloadingData(nodeId)` → 获取文件的外部参照信息 | desktop `useExternalReferenceUpload.ts` |
| 4.2 | 检查外部参照 | `mxCadControllerCheckExternalReference(nodeId)` → 缺失列表 | desktop `useExternalReferenceUpload.ts` |
| 4.3 | 外部参照弹窗 UI | Vant Popup：展示缺失参照 + 逐个上传 | desktop `ExternalReferenceModal.tsx` |
| 4.4 | 上传参照图像 | `mxCadControllerUploadExtReferenceImage` + 队列上传 | desktop `mxcadExtRef.ts` |
| 4.5 | 上传参照 DWG | `mxCadControllerUploadExtReferenceDwg(nodeId)` | desktop `useExternalReferenceUpload.ts` |
| 4.6 | 参照图片地址解析 | `resolveExtReferenceUrl(filePath)` → 可访问 URL | desktop `mxcadExtRef.ts` |
| 4.7 | 公开文件外部参照 | `publicFileControllerCheckExtReference / UploadExtReference` | desktop `useExternalReferenceUpload.ts` |
| 4.8 | 待处理图片（保存时上传） | `processPendingImages()` — 用户在编辑中插入的图片，保存时上传 | desktop `mxcadManager.ts` |

**交付：** 打开带外部参照的图纸时自动检查，缺失时弹出上传界面；编辑中插入的图片在保存时一起上传。

```
文件打开完成后
  │
  ▼
mxCadControllerGetPreloadingData(nodeId) → { extRefs, preloadUrl }
  │
  ▼
mxCadControllerCheckExternalReference(nodeId)
  │
  ├─ 无缺失 → 直接加载 preloadUrl
  │
  └─ 有缺失 → 弹窗显示缺失列表
                │
                ├─ 用户上传参照 → mxCadControllerUploadExtReferenceImage/Dwg
                │
                └─ 用户跳过 → 加载文件（缺少外部参照）
```

---

### Phase 5 — 缩略图 + 版本历史 ⏱ 1-2天

保存时自动生成缩略图，支持查看和恢复历史版本。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 5.1 | 检查缩略图 | `thumbnailControllerCheckThumbnail(nodeId)` | desktop `mxcadThumbnail.ts` |
| 5.2 | 生成缩略图 | 保存时截图 `mxcad.getCanvas().toBlob()` → 缩放 | desktop `generateThumbnail()` |
| 5.3 | 上传缩略图 | `thumbnailControllerUploadThumbnail(nodeId, blob)` | desktop `mxcadThumbnail.ts` |
| 5.4 | 版本历史弹窗 | Vant Popup 展示版本列表 + 点击恢复 | desktop `VersionHistoryModal.tsx` |
| 5.5 | 打开历史版本 | URL 附加 `?v=timestamp` → 后端返回历史 mxweb | desktop `CADEditorDirect.tsx versionParam` |

**交付：** 自动生成缩略图，用户可查看/恢复历史版本。

---

### Phase 6 — 权限 + 登录提示 ⏱ 1天

根据用户角色控制功能可用性。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 6.1 | 加载 CAD 权限 | `fileSystemControllerCheckProjectPermission` → canSave/canExport/canManageExtRef | desktop `CADEditorDirect.tsx:293-340` |
| 6.2 | 权限禁用 UI | 无权限时保存/导出按钮置灰 + 提示 | desktop `useCADEditorStore` |
| 6.3 | 权限缓存 | 项目 ID 不变时不重复请求 | desktop `mxcadManager.ts cachedPermissions` |
| 6.4 | 登录提示 | 未登录用户点击保存/导出/外部参照 → 弹出登录引导 | desktop `LoginPrompt.tsx` |
| 6.5 | 登录后恢复操作 | 登录成功 → 继续之前被中断的操作 | desktop `CADEditorDirect.tsx loginPromptActionRef` |

**交付：** 权限控制到位，未登录用户有清晰引导。

---

### Phase 7 — 实时协作 ⏱ 2-3天

多人实时协同编辑（最后阶段实现）。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 7.1 | WebSocket 连接 | 接入 `APP_COOPERATE_URL`，建立连接 | desktop `CollaborateSidebar.tsx` |
| 7.2 | 协作初始化 | `mxcad.getCooperate()` → 协同编辑实例 | desktop `mxcadManager.ts` |
| 7.3 | 协作用户信息 | 展示在线用户列表（头像/名字） | desktop `CollaborateSidebar.tsx` |
| 7.4 | 协作状态指示 | 工具栏上显示协作连接状态 | desktop 同 |
| 7.5 | 断线重连 | WebSocket 断开时自动重连 + 提示 | desktop 同 |

**交付：** 多人实时协同编辑。

---

## 文件变更清单

### 修改已有文件

| 文件 | 变更 |
|------|------|
| `src/main.ts` | 启用 `app.use(router)` |
| `src/App.vue` | `<router-view>` 替换直接渲染 Home |
| `src/route.ts` | 添加 `/editor?fileId=xxx` 路由 |
| `src/pages/home/index.vue` | 保存按钮接入真实保存流程 |
| `src/pages/home/hooks/useMenu.ts` | 菜单项接入真实保存/导出 |
| `src/plugins/mxcad/index.ts` | 新增 `openFileByNodeId(nodeId)` 入口 |
| `src/plugins/mxcad/openMxWeb.ts` | 增强以支持服务器 URL |
| `src/api-sdk/client.gen.ts` | 配置 baseURL + credentials |

### 新增文件

```
src/
├── composables/
│   ├── useEditorState.ts         # 编辑器全局状态
│   ├── useFileLoader.ts          # 文件加载流程
│   ├── useSave.ts                # 保存流程
│   ├── usePermission.ts          # 权限检查
│   └── useBackNavigation.ts      # 返回导航
├── services/
│   ├── fileService.ts            # 文件 CRUD API 封装
│   ├── saveService.ts            # 保存 API 封装
│   ├── extRefService.ts          # 外部参照 API 封装
│   ├── thumbnailService.ts       # 缩略图 API 封装
│   └── permissionService.ts      # 权限 API 封装
├── pages/editor/
│   ├── index.vue                 # 编辑器路由页
│   └── components/
│       ├── SaveAsPopup.vue        # 另存为弹窗
│       ├── ExportPopup.vue        # 导出格式选择
│       ├── ExtRefPopup.vue        # 外部参照处理
│       └── VersionHistoryPopup.vue # 版本历史
└── utils/
    ├── hashUtils.ts               # SHA-256 文件哈希
    └── apiConfig.ts               # API 客户端单例
```

---

## 代码复用策略

| 类型 | 复用方式 |
|------|----------|
| **API SDK** (`api-sdk/`) | 直接复用 — 已存在于 frontend_mobile，只需配置 client |
| **SDK 类型** (`types.gen.ts`) | 直接复用 — 自动生成，两端一致 |
| **绘图命令** (`command/`) | 保留现有 — 前端移动版已有 30+ 命令，继续增强 |
| **mxcad 引擎集成** (`plugins/mxcad/`) | 保留现有 — 比 desktop 的 `mxcad-app` 集成更轻量灵活 |
| **业务逻辑** (`desktop services/mxcadManager/`) | 参考移植 — 2726 行 JS，逻辑相同但 React 依赖需替换为 Vue |
| **API 调用逻辑** | 参考移植 — 接口一致，用 SDK 适配即可 |

---

## 工作量估算

| Phase | 内容 | 估算天数 |
|-------|------|----------|
| 0 | 工程基础 | 1-2天 |
| 1 | 从服务器打开文件 | 2-3天 |
| 2 | 保存到服务器 | 3-4天 |
| 3 | 下载/导出 | 1-2天 |
| 4 | 外部参照 | 2-3天 |
| 5 | 缩略图+版本历史 | 1-2天 |
| 6 | 权限+登录提示 | 1天 |
| 7 | 实时协作 | 2-3天 |
| **合计** | | **13-20天** |

**投入顺序建议：** Phase 0 → 1 → 2 → 3+6(并行) → 4 → 5 → 7

---

## 依赖的外部 API 汇总

以下是从 desktop 端提取的、移植所需的全部后端接口：

| 接口 | 用途 | 使用阶段 |
|------|------|----------|
| `fileSystemControllerGetNode` | 获取文件节点信息 | P1 |
| `fileSystemControllerGetRootNode` | 获取根节点/项目信息 | P1 |
| `fileSystemControllerGetPersonalSpace` | 获取私人空间 ID | P1 |
| `fileSystemControllerCheckProjectPermission` | 检查项目权限 | P2, P6 |
| `fileSystemControllerDownloadNodeWithFormat` | 下载/导出文件 | P3 |
| `libraryControllerGetDrawingNode` | 获取库图节点 | P1 |
| `libraryControllerGetBlockNode` | 获取图块节点 | P1 |
| `libraryControllerSaveDrawingNode` | 保存库图 | P2 |
| `libraryControllerSaveDrawingAs` | 库图另存为 | P2 |
| `libraryControllerSaveBlockNode` | 保存图块 | P2 |
| `libraryControllerSaveBlockAs` | 图块另存为 | P2 |
| `saveControllerSaveMxwebToNode` | 保存 mxweb 到节点 | P2 |
| `saveControllerSaveMxwebAs` | mxweb 另存为 | P2 |
| `mxCadControllerGetPreloadingData` | 获取文件预加载数据 | P4 |
| `mxCadControllerCheckExternalReference` | 检查外部参照 | P4 |
| `mxCadControllerUploadExtReferenceImage` | 上传外部参照图片 | P4 |
| `mxCadControllerUploadExtReferenceDwg` | 上传外部参照 DWG | P4 |
| `mxCadControllerCheckFileExist` | 检查文件是否存在 | P2 |
| `mxCadControllerCheckChunkExist` | 检查分片是否存在 | P2 |
| `mxCadControllerUploadFile` | 上传文件 | P2 |
| `thumbnailControllerCheckThumbnail` | 检查缩略图 | P5 |
| `thumbnailControllerUploadThumbnail` | 上传缩略图 | P5 |
| `publicFileControllerConvertAndDownload` | 公开文件转换下载 | P3 |
| `publicFileControllerGetPreloadingData` | 公开文件预加载 | P4 |
| `publicFileControllerCheckExtReference` | 公开文件外部参照检查 | P4 |
| `publicFileControllerUploadExtReference` | 公开文件外部参照上传 | P4 |
