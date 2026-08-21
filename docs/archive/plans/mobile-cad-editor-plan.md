# frontend_mobile CAD 编辑器补齐规划

> **目标：** 将 `packages/frontend`（React 桌面版）CAD 编辑器的所有行为（文件打开、保存、外部参照、权限、缩略图、版本历史、协作）移植到 `packages/frontend_mobile`（Vue 3 移动版）。

---

## 当前进度 (2026-05-29)

```
Phase 0 工程基础    ████████████████████ 100%  (确定不需要路由)
Phase 1 打开文件    ████████████████████  95%  (✓ 递归循环+loadFromUrl+token headers 修复)
Phase 2 保存        ████████████████████  98%  (✓ 新建图纸已补齐 ; ✓ isModified 修改追踪已接入)
Phase 3 下载/导出   ████████████████████  98%  (✓ 公共上传入口已补齐 ; ✓ PDF 配置弹窗已添加)
Phase 4 外部参照    ████████████████████  95%  (✓ URL解析+公开文件+保存图片均已补齐 ; 浮窗按钮 UI 已恢复)
Phase 5 版本历史    ████████████████████  98%  (✓ 刚刚补齐 ; ✓ isModified 修改追踪已接入)
Phase 6 权限+登录   ████████████████████  98%  (✓ UI禁用+缓存+登录恢复已补齐 ; ✓ 缓存 TTL 已添加)
Phase 7 协作        ████████████████████  98%  (✓ 完整移植自 desktop ; ✓ 协同 URL 改为环境变量)
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
| 1.7 | 处理公开文件 | ✅ `publicFileService.ts` — hash检测、预加载、外部参照、公开文件URL构建 | `src/services/publicFileService.ts` |
| 1.8 | 文件打开 loading | ✅ 加载遮罩 + 错误提示 | `src/pages/home/index.vue:322-334` |
| 1.9 | 插件上下文注入 | 🔘 **不适用** — mobile 无需 `mxcad-app`，cookies 自动处理认证，上传走平台 API 不经过引擎内部 |

**交付：** ✅ 用户可打开项目文件、库文件、公开文件（递归循环+token headers+loadFromUrl 已修复）。公开文件 extRef 解析待验证。

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
| 2.9 | 新建图纸 | ✅ `Mx_NewFile` 命令 → `mxcad.newFile()` + 清空状态 | `src/pages/home/index.vue:224-255`, `src/pages/home/hooks/useMenu.ts:17-19` |
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
| 3.3 | PDF 导出增强 | ✅ 配置弹窗（宽/高/颜色策略），参照桌面端 `DownloadFormatModal` | `src/pages/home/components/PdfOptionsPopup.vue`, `src/services/exportService.ts:74` |
| 3.4 | 公开文件导出 | ✅ `publicFileControllerConvertAndDownload` + hash 上传 | `src/services/exportService.ts:37` |
| 3.5 | 公共上传入口 | ✅ `uploadPublicFile(file)` — 秒传检测+上传+返回URL；编辑器头部按钮触发文件选择+上传+打开 | `src/services/uploadService.ts:28-67`, `src/pages/home/index.vue` |

**交付：** ✅ 用户可选择格式下载当前图纸，PDF 支持配置宽/高/颜色策略。

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
| 4.6 | 参照图片地址解析 | ✅ `parseExtRefFileNames()` — 从路径提取纯文件名,过滤http/https | `src/services/extRefService.ts:82` |
| 4.7 | 公开文件外部参照 | ✅ `checkPublicFileExternalRefs()` 重构(移除动态import)、`resolvePublicExtRefUrl()` | `src/services/publicFileService.ts:58`, `src/composables/useFileLoader.ts:222` |
| 4.8 | 待处理图片（保存时上传） | ✅ `pendingImageService.ts` + `Mx_InsertImageWithUpload` + 保存时自动上传 | `src/services/pendingImageService.ts`, `src/command/m_mx_img.ts:94`, `src/composables/useSave.ts:30/42/50` |

**交付：** ✅ 打开文件时自动检查外部参照并弹窗上传。参照图片路径正确解析。保存时自动上传待处理图片。

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
| 6.2 | 权限禁用 UI | ✅ 保存按钮 `:disabled` + `onSaveClick` 检查 `canSave`；导出菜单 `showExportDialog` 检查 `canExport`；外部参照弹窗无权限时不显示上传按钮 | `src/pages/home/index.vue:175/347`, `src/pages/home/hooks/useMenu.ts:83-97`, `src/composables/useFileLoader.ts:205-218` |
| 6.3 | 权限缓存 | ✅ `permissionCache` Map + 5min TTL 过期 | `src/services/permissionService.ts:14-100` |
| 6.4 | 登录提示 | ✅ Vant Dialog：未登录用户点击保存/版本历史 → 弹出登录引导 | `src/pages/home/components/LoginPromptPopup.vue` |
| 6.5 | 登录后恢复操作 | ✅ `sessionStorage.pendingAction` 保存意图，登录返回后自动重试 | `src/pages/home/index.vue:229-237/312-321` |

**交付：** ✅ 权限加载 + 登录引导已实现。UI 禁用和登录后恢复操作已补齐。

---

### Phase 7 — 实时协作 ⏱ 2-3天

多人实时协同编辑（最后阶段实现）。

| # | 任务 | 关键要点 | 参考源 |
|---|------|----------|--------|
| 7.1 | WebSocket 连接 | ✅ `cooperate.init({ server_addres })` — 通过 `VITE_APP_COOPERATE_URL` 环境变量配置 | `src/composables/useCooperate.ts:5` |
| 7.2 | 协作初始化 | ✅ `getCooperate()` → `mxCAD.getCooperate()` + `init()`，每次调用时初始化（与 desktop 一致） | `src/composables/useCooperate.ts:13-21` |
| 7.3 | 协同创建/加入/退出 | ✅ `createWrok`/`joinWork`/`exitWrok` callback-based API，匹配 desktop | `src/composables/useCooperate.ts:52-95` |
| 7.4 | 协同列表 | ✅ `getWorks(callback)` 获取可用协同列表 | `src/composables/useCooperate.ts:39-49` |
| 7.5 | CAD 就绪轮询 | ✅ `setInterval` 500ms 轮询 `MxCpp.getCurrentMxCAD()` | `src/composables/useCooperate.ts:31-37` |
| 7.6 | 协同弹窗 UI | ✅ `CooperatePopup.vue` — Vant Popup，创建/刷新/加入/退出 | `src/pages/home/components/CooperatePopup.vue` |
| 7.7 | 菜单命令 | ✅ `Mx_ShowCollaborate` → 触发弹窗 | `src/pages/home/hooks/useMenu.ts:25-27` |

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
│   └── useVersionHistory.ts      # 版本历史查询 + 跳转 ✅
├── services/
│   ├── fileService.ts            # 文件节点查询 + URL 构建 ✅
│   ├── saveService.ts            # 保存 API ✅
│   ├── extRefService.ts          # 外部参照 API ✅
│   ├── thumbnailService.ts       # 缩略图生成 + 上传 ✅
│   ├── permissionService.ts      # 权限查询(含5min缓存TTL) ✅
│   ├── exportService.ts          # 导出/下载(含PDF配置弹窗) ✅
│   └── uploadService.ts          # 文件上传 ✅
├── pages/home/
│   ├── index.vue                 # 编辑器主页面(954行) ✅
│   ├── hooks/
│   │   ├── useMenu.ts            # 菜单 + 命令注册 ✅
│   │   ├── useFooterToolbar.ts   # 底栏工具栏 ✅
│   │   └── useFloatingRightBtnList.ts # 右侧浮窗按钮 ✅
│   └── components/
│       ├── CommitMessageDialog.vue   # 保存提交信息弹窗 ✅
│       ├── SaveAsSheet.vue           # 另存为弹窗 ✅
│       ├── VersionHistoryPopup.vue   # 版本历史弹窗 ✅
│       ├── LoginPromptPopup.vue      # 登录引导弹窗 ✅
│       ├── CooperatePopup.vue        # 协同弹窗 ✅
│       └── PdfOptionsPopup.vue       # PDF 导出参数弹窗 ✅ (新)
└── utils/
    ├── hashUtils.ts               # 文件哈希 (MD5) ✅
    ├── apiConfig.ts               # API 客户端单例 ✅
    └── isAndroidOrIOS.ts          # 平台检测 ✅ (新)
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
| 0 | 工程基础 | 1-2天 | 100% | ✅ 全部完成 |
| 1 | 从服务器打开文件 | 2-3天 | 95% | 公开文件 extRef 解析待验证 |
| 2 | 保存到服务器 | 3-4天 | 98% | ✅ isModified 修改追踪已接入 |
| 3 | 下载/导出 | 1-2天 | 98% | ✅ PDF 配置弹窗已添加 |
| 4 | 外部参照 | 2-3天 | 95% | ✅ 浮窗按钮 UI 已恢复 |
| 5 | 缩略图+版本历史 | 1-2天 | 98% | ✅ isModified 修改追踪已接入 |
| 6 | 权限+登录提示 | 1天 | 98% | ✅ 缓存 TTL 已添加 |
| 7 | 实时协作 | 2-3天 | 98% | ✅ 协同 URL 改为环境变量 |
| **合计** | | **13-20天** | **~98%** | **仅剩公开文件 extRef 解析待验证** |

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
