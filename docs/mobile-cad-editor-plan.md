# frontend_mobile CAD 编辑器补齐规划

> **目标：** 将 `packages/frontend`（React 桌面版）CAD 编辑器的所有行为（文件打开、保存、外部参照、权限、缩略图、版本历史、协作）移植到 `packages/frontend_mobile`（Vue 3 移动版）。

---

## 当前进度 (2026-05-28)

```
Phase 0 工程基础    ████████████████░░░░  80%  (确定不需要路由)
Phase 1 打开文件    ████████████████░░░░  80%  (公开文件+上下文注入未做)
Phase 2 保存        ████████████████░░░░  80%  (新建图纸未做)
Phase 3 下载/导出   ████████████████░░░░  80%  (公共上传入口未做)
Phase 4 外部参照    ██████████████░░░░░░  70%  (URL解析/公开文件/保存图片未做)
Phase 5 版本历史    ██████████████████░░  90%  (✓ 刚刚补齐)
Phase 6 权限+登录   ██████████████████░░  85%  (UI禁用+缓存未完善)
Phase 7 协作        ████░░░░░░░░░░░░░░░░  20%  (骨架)
```

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
- **路由：** 不需要 Vue Router — 单页全屏编辑器，URL 参数直接用 `URLSearchParams`
- **状态管理：** Composables-only（不用 Pinia）
- **协作：** Phase 7 最后做

---

## 各阶段规划

### Phase 0 — 工程基础 ⏱ 1-2天 · 80%

API 客户端、基础状态管理、返回导航。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 0.1 | 激活路由 | ❌ **不需要** — 单页编辑器，无页面切换 |
| 0.2 | 入口改造 | ❌ **不需要** — `App.vue` 直接渲染 Home |
| 0.3 | API 客户端配置 | ✅ `setupApiClient()` — baseURL + `credentials: 'include'` + 403 拦截器 | `src/utils/apiConfig.ts` |
| 0.4 | 编辑器状态 composable | ✅ `useEditorState()` — fileId/loading/error/fileInfo/permissions | `src/composables/useEditorState.ts` |
| 0.5 | 用户信息 composable | ✅ `useUser()` — localStorage token 检测 | `src/composables/useUser.ts` |
| 0.6 | 返回按钮 | ✅ `history.back()` + `back` URL 参数降级 | `src/pages/home/index.vue:73-97` |

**交付：** ✅ frontend_mobile 能接收 fileId 参数，API SDK 可正常调用后端。

---

### Phase 1 — 核心：从服务器打开文件 ⏱ 2-3天 · 80%

按 fileId 从后端加载图纸到编辑器。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 1.1 | 按 fileId 获取节点 | ✅ `getNodeInfo(nodeId)` | `src/services/fileService.ts:34` |
| 1.2 | 获取根节点/项目信息 | ✅ `getRootNode(nodeId)` | `src/services/fileService.ts:42` |
| 1.3 | 获取私人空间 ID | ✅ `getPersonalSpace()` | `src/services/fileService.ts:51` |
| 1.4 | 构建 mxweb URL | ✅ `buildMxwebUrl(path, revision?)` — 支持 `&v=` 历史版本 | `src/services/fileService.ts:16` |
| 1.5 | 打开文件 | ✅ `openMxWeb(url)` | `src/plugins/mxcad/openMxWeb.ts` |
| 1.6 | 处理库文件 | ✅ `getLibraryDrawingNode / getLibraryBlockNode` | `src/services/fileService.ts:60-74` |
| 1.7 | 处理公开文件 | ❌ 未实现 |
| 1.8 | 文件打开 loading | ✅ 加载遮罩 + 错误提示 | `src/pages/home/index.vue:322-334` |
| 1.9 | 插件上下文注入 | ❌ 未实现 |

**交付：** 用户可打开项目文件和库文件（公开文件未支持）。

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

### Phase 2 — 核心：保存到服务器 ⏱ 3-4天 · 80%

保存修改到服务器，支持保存到原位置和另存为。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 2.1 | 保存按钮接入 | ✅ header 保存按钮 → 提交信息弹窗 → 保存 | `src/pages/home/index.vue:166-178` |
| 2.2 | 获取 mxweb 数据 | ✅ `getMxwebBlob()` — `mxcad.saveFile()` → Blob | `src/services/saveService.ts:9` |
| 2.3 | 文件哈希 | ✅ `calculateFileHash()` — SparkMD5（非 SHA-256） | `src/utils/hashUtils.ts` |
| 2.4 | POST 保存 | ✅ `saveToNode(nodeId, blob, commitMessage)` | `src/services/saveService.ts:32` |
| 2.5 | 保存权限检查 | ✅ `checkProjectPermission(projectId, 'CAD_SAVE')` | `src/services/permissionService.ts:18` |
| 2.6 | 另存为 UI | ✅ Vant Popup：保存到个人空间/项目/图库 | `src/pages/home/components/SaveAsSheet.vue` |
| 2.7 | 另存为逻辑 | ✅ `saveAs()` + `executeSaveAs()` | `src/composables/useSaveAs.ts` |
| 2.8 | 库文件保存 | ✅ `saveLibraryDrawing / saveLibraryBlock` | `src/services/saveService.ts:67-82` |
| 2.9 | 新建图纸 | ❌ 未实现 |
| 2.10 | 未保存确认 | ✅ `isModified` 标记 + 返回确认弹窗 | `src/pages/home/index.vue:84-97` |

**交付：** ✅ 用户可保存修改到服务器，支持保存到原位置和另存为。

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

### Phase 3 — 下载 / 导出 ⏱ 1-2天 · 80%

选择格式下载或导出当前图纸。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 3.1 | 导出格式选择 UI | ✅ Vant ActionSheet：DWG/DXF/PDF/MXWEB | `src/services/exportService.ts:74` |
| 3.2 | 格式下载 | ✅ `exportDrawing(format, fileName)` — 转换+下载 | `src/services/exportService.ts:16` |
| 3.3 | PDF 导出增强 | ◐ 基础 PDF 导出，无页面大小/方向选项 | `src/services/exportService.ts` |
| 3.4 | 公开文件导出 | ✅ `publicFileControllerConvertAndDownload` + hash 上传 | `src/services/exportService.ts:37` |
| 3.5 | 公共上传入口 | ❌ 未实现 |

**交付：** ✅ 用户可选择格式下载当前图纸（公共上传入口未做）。

---

### Phase 4 — 外部参照 ⏱ 2-3天 · 70%

检查并处理文件中的外部参照。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 4.1 | 预加载数据 | ✅ `getPreloadingData(nodeId)` | `src/services/extRefService.ts:22` |
| 4.2 | 检查外部参照 | ✅ `checkExternalReferences(nodeId)` | `src/services/extRefService.ts:32` |
| 4.3 | 外部参照弹窗 UI | ◐ Vant `showDialog` 展示缺失列表+文件选择器，非专用 Popup | `src/composables/useFileLoader.ts:96-146` |
| 4.4 | 上传参照图像 | ✅ `uploadExtRefImage()` | `src/services/extRefService.ts:46` |
| 4.5 | 上传参照 DWG | ✅ `uploadExtRefDwg()` | `src/services/extRefService.ts:65` |
| 4.6 | 参照图片地址解析 | ❌ 未实现 |
| 4.7 | 公开文件外部参照 | ❌ 未实现 |
| 4.8 | 待处理图片（保存时上传） | ❌ 未实现 |

**交付：** ✅ 打开项目文件时自动检查外部参照，缺失时弹窗提示上传。公开文件、图片地址解析、保存上传未实现。

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

### Phase 5 — 缩略图 + 版本历史 ⏱ 1-2天 · 90%

保存时自动生成缩略图，支持查看和恢复历史版本。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 5.1 | 检查缩略图 | ✅ `thumbnailControllerCheckThumbnail(nodeId)` | `src/services/thumbnailService.ts:25` |
| 5.2 | 生成缩略图 | ✅ `generateThumbnail()` — canvas.toBlob | `src/services/thumbnailService.ts:3` |
| 5.3 | 上传缩略图 | ✅ `uploadThumbnailForNode(nodeId)` — 保存时自动触发 | `src/services/thumbnailService.ts:20` |
| 5.4 | 版本历史弹窗 | ✅ Vant Popup 展示版本列表+点击跳转历史版本 | `src/pages/home/components/VersionHistoryPopup.vue` |
| 5.5 | 打开历史版本 | ✅ `buildMxwebUrl(path, revision)` — URL `?v=revision` | `src/services/fileService.ts:16` → `src/composables/useFileLoader.ts:64` |

**交付：** ✅ 自动生成缩略图，用户可查看和跳转历史版本。

---

### Phase 6 — 权限 + 登录提示 ⏱ 1天 · 85%

根据用户角色控制功能可用性。

| # | 任务 | 状态 | 实现位置 |
|---|------|------|----------|
| 6.1 | 加载 CAD 权限 | ✅ `loadCADPermissions(projectId)` → canSave/canExport/canManageExtRef | `src/services/permissionService.ts:45` |
| 6.2 | 权限禁用 UI | ◐ 权限已加载到 `editorState.permissions`，但未根据权限禁用按钮 | `src/composables/useEditorState.ts` |
| 6.3 | 权限缓存 | ◐ 每次 `loadByNodeId` 调用时重新加载，无显式缓存 |
| 6.4 | 登录提示 | ✅ Vant Dialog：未登录用户点击保存/版本历史 → 弹出登录引导 | `src/pages/home/components/LoginPromptPopup.vue` |
| 6.5 | 登录后恢复操作 | ❌ 页面跳转登录后状态丢失，未实现恢复 |

**交付：** ✅ 权限加载 + 登录引导已实现。UI 禁用和登录后恢复操作未完成。

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

## 文件清单（实际结构）

### 已有文件

| 文件 | 说明 |
|------|------|
| `src/main.ts` | 入口（无路由） |
| `src/App.vue` | 直接渲染 `<Home />` |
| `src/route.ts` | 定义了路由但未使用（Vue Router 未启用） |

### 新增/修改文件

```
src/
├── composables/
│   ├── useEditorState.ts         # 编辑器全局状态 ✅
│   ├── useFileLoader.ts          # 文件加载流程（含版本号参数） ✅
│   ├── useSave.ts                # 保存流程 ✅
│   ├── useUser.ts                # 用户登录态 ✅
│   ├── useSaveAs.ts              # 另存为逻辑 ✅
│   ├── useCooperate.ts           # 协作骨架 ✅
│   └── useVersionHistory.ts      # 版本历史查询 + 跳转 ✅ (新)
├── services/
│   ├── fileService.ts            # 文件节点查询 + URL 构建 ✅
│   ├── saveService.ts            # 保存 API ✅
│   ├── extRefService.ts          # 外部参照 API ✅
│   ├── thumbnailService.ts       # 缩略图生成 + 上传 ✅
│   ├── permissionService.ts      # 权限查询 ✅
│   ├── exportService.ts          # 导出/下载 ✅
│   └── uploadService.ts          # 文件上传 ✅
├── pages/home/
│   ├── index.vue                 # 编辑器主页面（749→803行）✅
│   ├── hooks/useMenu.ts          # 菜单 + 命令注册 ✅
│   └── components/
│       ├── CommitMessageDialog.vue # 保存提交信息弹窗 ✅
│       ├── SaveAsSheet.vue         # 另存为弹窗 ✅
│       ├── VersionHistoryPopup.vue  # 版本历史弹窗 ✅ (新)
│       └── LoginPromptPopup.vue    # 登录引导弹窗 ✅ (新)
└── utils/
    ├── hashUtils.ts               # 文件哈希 (MD5) ✅
    └── apiConfig.ts               # API 客户端单例 ✅
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

| Phase | 内容 | 估算天数 | 完成度 | 剩余工作 |
|-------|------|----------|--------|----------|
| 0 | 工程基础 | 1-2天 | 80% | 无需路由，基本完成 |
| 1 | 从服务器打开文件 | 2-3天 | 80% | 公开文件 + 上下文注入 |
| 2 | 保存到服务器 | 3-4天 | 80% | 新建图纸 |
| 3 | 下载/导出 | 1-2天 | 80% | 公共上传入口 |
| 4 | 外部参照 | 2-3天 | 70% | 图片URL解析、公开文件、保存图片 |
| 5 | 缩略图+版本历史 | 1-2天 | 90% | ✅ 已完成 |
| 6 | 权限+登录提示 | 1天 | 85% | UI禁用+登录后恢复 |
| 7 | 实时协作 | 2-3天 | 20% | 骨架，需从桌面完整移植 |
| **合计** | | **13-20天** | **~73%** | **剩余约4-6天** |

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
