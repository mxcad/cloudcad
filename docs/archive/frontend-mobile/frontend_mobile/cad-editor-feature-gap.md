# CAD 编辑器功能对照 — frontend (React) vs frontend_mobile (Vue)

> 纯功能维度对照，排除 UI/交互差异。基于 `packages/frontend/src/pages/CADEditorDirect.tsx` vs `packages/frontend_mobile/src/pages/home/index.vue` 及其依赖的 service/hook 层。

## 对照表

| # | 功能类别 | 功能 | frontend | frontend_mobile | 备注 |
|---|---------|------|----------|----------------|------|
| 1 | **核心引擎** | MxCAD 引擎集成 | ✅ MxCADManager 单例 | ✅ createMxCAD() 插件 | 集成方式不同，功能等价 |
| 2 | | WebGL 上下文保持 | ✅ visibility + z-index 全局覆盖层 | ✅ 单页全屏，无需保持 | 架构差异，等价 |
| 3 | **文件打开** | 按 fileId 打开 | ✅ `/cad-editor/:fileId` | ✅ `getFileIdFromUrl()` → `loadByNodeId()` | |
| 4 | | 按 hash (公开文件) 打开 | ✅ handlePublicUpload | ✅ `getHashFromUrl()` → `loadByHash()` | |
| 5 | | 历史版本 (?v=) | ✅ | ✅ `getVersionFromUrl()` | |
| 6 | | 库文件 (?library=) | ✅ | ✅ `getLibraryDrawingNode / getLibraryBlockNode` | |
| 7 | | 新建空白文件 | ✅ Mx_NewFile 命令 | ✅ mxcad.newFile() + state reset | |
| 8 | | 打开本地文件 (上传) | ✅ useMxCadUploadNative (多文件选择) | ✅ `handleOpenFile()` (单文件 input) | mobile 只支持单文件 |
| 9 | | 文件拖放打开 | ✅ useFileDropToOpen | ❌ — | 触屏设备不适用 |
| 10 | | CAD 引擎空闲预加载 | ✅ useMxCADPreload | ❌ — | |
| 11 | **保存** | 提交信息 | ✅ SaveAsModal 含 commit message | ✅ CommitMessageDialog | |
| 12 | | 保存到原位置 | ✅ | ✅ saveToNode() | |
| 13 | | 另存为 (目标选择) | ✅ 我的图纸/项目/公共库+文件夹选择 | ✅ SaveAsSheet 简单选择 | mobile 无文件夹选择器 |
| 14 | | 保存格式选择 (另存为) | ✅ DWG/DXF/PDF/MXWEB | ❌ — | mobile 另存为只存 mxweb |
| 15 | | 乐观锁 (expectedTimestamp) | ✅ 防覆盖 | ❌ — | |
| 16 | | 未保存更改提示 | ✅ beforeunload + 导航拦截 | ✅ goBack() 确认弹窗 | 等价 |
| 17 | **导出/下载** | 导出格式选择 | ✅ DownloadFormatModal | ✅ 导出 ActionSheet | |
| 18 | | PDF 配置 (宽/高/色彩策略) | ✅ PdfExportModal | ✅ PdfOptionsPopup | |
| 19 | | DWG/DXF 版本选择 | ✅ DwgExportModal (2000~2018) | ❌ — | mobile 使用格式选择，无版本细分 |
| 20 | | 公开文件导出 | ✅ | ✅ publicFileControllerConvertAndDownload | |
| 21 | **外部参照** | 检查缺失参照 | ✅ checkExternalReferences | ✅ checkFileExternalRefs / checkPublicFileExternalRefs | |
| 22 | | 上传参照图片 | ✅ ExternalReferenceModal 弹框 + 文件选择 | ✅ showDialog 弹框 + 文件选择 | desktop 有专用弹框组件，mobile 用 Vant showDialog |
| 23 | | 上传参照 DWG | ✅ | ✅ | |
| 24 | | 参照上传进度追踪 | ✅ 每个文件独立进度 | ❌ — | |
| 25 | | 参照状态显示 (存在/上传中/失败) | ✅ | ❌ — | |
| 26 | | 预加载数据重试 | ✅ 10 次重试, 2s 间隔 | ❌ — | |
| 27 | | 请求去重 + 缓存 | ✅ 5s TTL | ❌ — | |
| 28 | **待处理图片** | 图片插入 + 延迟上传 | ✅ Mx_InsertImageWithUpload | ✅ pendingImageService | |
| 29 | | 保存时自动上传图片 | ✅ | ✅ | |
| 30 | **缩略图** | 生成缩略图 | ✅ generateThumbnail (canvas.toBlob) | ✅ | |
| 31 | | 上传缩略图 | ✅ 保存时自动触发 | ✅ | |
| 32 | | 缩略图存在性检查 | ✅ | ✅ | |
| 33 | **版本历史** | 查看版本列表 | ❌ (桌面端无此 UI) | ✅ VersionHistoryPopup | mobile 独有功能 |
| 34 | | 跳转历史版本 | ✅ ?v= 参数 | ✅ | |
| 35 | **权限** | canSave | ✅ | ✅ | |
| 36 | | canExport | ✅ | ✅ | |
| 37 | | canManageExternalRef | ✅ | ✅ | |
| 38 | | 权限缓存 TTL | ✅ 5min | ✅ 5min | |
| 39 | | 库权限检查 | ✅ checkLibraryPermissions | ✅ | |
| 40 | **登录** | 登录提示 | ✅ LoginPrompt | ✅ LoginPromptPopup | |
| 41 | | 登录后恢复操作 | ✅ pending action | ✅ sessionStorage | |
| 42 | | 登录重定向 | ✅ 返回编辑器 | ✅ | |
| 43 | **协作** | WebSocket 连接 | ✅ CollaborateSidebar | ✅ useCooperate | |
| 44 | | 创建协作 | ✅ | ✅ | |
| 45 | | 加入协作 | ✅ | ✅ | |
| 46 | | 退出协作 | ✅ | ✅ | |
| 47 | | 协作列表 | ✅ | ✅ | |
| 48 | | CAD 就绪轮询 | ✅ | ✅ | |
| 49 | **主题** | 亮/暗模式 | ✅ 双向同步 React ↔ Vuetify | ❌ — | mobile 无主题切换 |
| 50 | **缓存** | IndexedDB 缓存 mxweb | ✅ 打开/保存时缓存+失效 | ❌ — | mobile 无文件缓存 |
| 51 | **重复文件** | 重复文件检测 | ✅ mxcadCheck (秒传) | ❌ — | |
| 52 | **打印/裁剪** | 打印/裁剪回调 | ✅ 服务端转换 PDF/DWG | ❌ — | |
| 53 | **错误处理** | 分类错误 (401/404/network) | ✅ 区分处理 | ✅ 基本错误提示 | desktop 更精细 |
| 54 | **图库/块库** | 浏览图库/块库 | ✅ 侧边栏 tabs | ❌ — | mobile 无此功能 |
| 55 | **触控专属** | 触控模拟鼠标 | ❌ — | ✅ useSimulatedMouse | mobile 独有 |
| 56 | | 颜色选择器 | ❌ (依赖 mxcad-app 内建) | ✅ useColorPicker + iro.js | mobile 独有 |
| 57 | | 命令操作提示行 | ❌ — | ✅ useRunCmdOperationBtnList | mobile 独有 |
| 58 | | 图元编辑工具栏 | ❌ (依赖 mxcad-app 内建) | ✅ useEditObjectToolbar | mobile 独有 |
| 59 | | 气泡菜单 | ❌ — | ✅ useMenu + van-popover | mobile 独有 |
| 60 | | 底部工具栏 | ❌ — | ✅ MxToolbar | mobile 独有 |
| 61 | | 浮动右侧按钮 | ❌ — | ✅ useFloatingRightBtnList | mobile 独有 |
| 62 | | 历史操作面板 | ❌ — | ✅ history_box | mobile 独有 |

## 统计

| 维度 | 数量 |
|------|------|
| 两端都有的功能 | 39 |
| desktop 有 / mobile 无 | 15 |
| mobile 有 / desktop 无 | 8 |

## desktop 有而 mobile 无的功能（按实现成本排序）

| 优先级 | 功能 | 依赖 |
|--------|------|------|
| P0 | 保存格式选择 (另存为时选 DWG/DXF/PDF) | 后端已有，纯前端 |
| P0 | DWG/DXF 版本选择 (导出时) | 后端已有，纯前端 |
| P1 | 外部参照上传进度追踪 + 状态显示 | 纯前端 |
| P1 | 重复文件检测 (秒传) | 后端已有，纯前端 |
| P1 | IndexedDB 缓存 mxweb | 纯前端 |
| P2 | 错误分类处理 (401/404/network) | 纯前端 |
| P2 | 图库/块库浏览 | 后端已有，UI 重 |
| P3 | 乐观锁 | 后端+前端 |
| P3 | CAD 引擎空闲预加载 | 纯前端优化 |
| P3 | 主题亮/暗模式 | 纯前端 |
| — | 文件拖放打开 | 触屏设备不适用 |
| — | 打印/裁剪回调 | 移动端无此需求 |
