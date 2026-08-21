# 方案 B：内核即无头 hook 组合

> Issue #230 Step 2 design-it-twice 候选 B。哲学：**内核是纯逻辑 hooks，零 JSX、零 DOM 结构感知；外壳自由组合 hooks 并自带全部布局与弹窗渲染。**

## 1. 现状测绘（Step 1 后）

| 层 | 全屏页 `pages/FileSystemManager` | 侧边栏 `components/ProjectDrawingsPanel` |
|---|---|---|
| 数据加载 | `useFileSystem`(440 行，组合) + `useFileSystemData`(443) + `useFileSystemNavigation`(240) | `useLoadNodes`(353) + `useLibraryCategories`(167) + `useProjectProjects`(109)，包在 `useProjectDrawingsData`(297) |
| 剪贴板 | `useClipboardActions`(221) | `useProjectDrawingsClipboard`(149) |
| CRUD | `useFileSystemCRUD`(715) ✅ 已共享 | 同左（`useProjectDrawingsActions` 内复用） |
| 移动/复制 | `useMoveCopy`(125) + `useMoveCopyOrchestrator`(295 ✅ 已共享) | `useProjectDrawingsMoveCopy`(89) |
| 拖拽 | `useFileSystemManagerEffects` 内 | `useProjectDrawingsDragDrop`(216) |
| 弹窗实例化 | `FileSystemModals`(354) | `ProjectPanelModals`(205) |
| 列表渲染 | `FileSystemContent`(812，含右键菜单) + `FileListGrid`/`FileItem` ✅ 已共享 | `ProjectPanelView`(192) + `useFileItemRenderer`(269) + `buildResourceItems`(106) |

共享底座已存在：`useMultiSelectSelection`、`useFileSystemCRUD`、`useMoveCopyOrchestrator`、`useFileSystemUI`、`useFileSystemShortcuts`、`useVersionHistory`、`useProjectManagement`、`FileListGrid`/`FileItem`/`RenameModal`/`SelectFolderModal` 等。真正的重复面：**数据加载骨架、剪贴板、拖拽、SelectFolder 弹窗状态、右键菜单动作构建、两套弹窗 props 搬运（合计 60+70 字段的散弹 props）**。

## 2. 内核公开 API（无头 hooks，全部 `.ts` 无 JSX）

新建 `src/hooks/file-browser/`，导出 **4 个原子 hook + 1 个聚合 + 纯函数**（Façade 出口，ADR-0029）：

```ts
// A. 数据 + 导航（吸收 useFileSystemData/useLoadNodes 公共骨架）
const data = useFileBrowserData({
  navigation: 'url' | 'controlled',   // 全屏=URL 驱动；侧边栏=受控
  externalProjectId?, externalNodeId?, // 受控驱动来源
  source?: FileBrowserSource,          // 数据源适配器（库模式/普通节点二选一注入）
  pagination?: { pageSize: number },
});
// → nodes, loading, error, breadcrumbs, currentNode, total, totalPages,
//   load(nodeId), refresh, goBack, navigateTo, searchQuery, setSearchQuery,
//   handlePageChange, handlePageSizeChange

// B. 选择模型（包 useMultiSelectSelection + 批量模式开关）
const selection = useFileBrowserSelection({
  nodes, multiple: 'always' | 'batch-only' | false, batchEnabled?: boolean,
});
// → selectedNodes, isBatchMode, setBatchMode, handleSelect(id, ctrl),
//   selectAll, clear, selectMany(ids)

// C. 动作（CRUD + 打开导航 + 剪贴板 + 拖拽；纯数据回调，不碰 DOM）
const actions = useFileBrowserActions({
  data, selection, permissions,
  onOpen?(node),          // 外壳注入：页面跳转 vs 侧边栏回调
  enableClipboard?,       // 子域开关
  enableTrash?,           // 回收站子域（全屏启用，侧边栏关闭）
});
// → handleCreateFolder/Drawing/Rename/Delete/BatchDelete/Restore/ClearTrash、
//   clipboard: { items, mode, cut, copy, paste, clear }、
//   dragDrop: { onDragStart, onDragOver, onDragLeave, onDrop }（DragEvent 数据契约）

// D. 弹窗状态机（单一枚举身份 + 表单值 + 打开/关闭动作）
const modals = useFileBrowserModals({ actions, trash, extra });
// → open('rename'|'create-folder'|'create-drawing'|'download-format'
//      |'select-folder'|'batch-select-folder'|'project'|'members'|'roles'
//      |'version-history'|'share'|'batch-download', payload?),
//   close(), state: { activeId, payload, forms }, setForm(name, value)

// 纯函数（收敛右键菜单动作构建）
const groups = buildNodeActions(node, permissionProps); // → { main, destructive }
```

**聚合**：`useFileBrowser(options)` = A+B+C+D 一键组合，输出全量。原子 hook 与聚合并存——外壳按需组装，测试可单点命中。

## 3. 归属划分

| 归属 | 内容 |
|---|---|
| **内核** | 数据加载骨架、分页、搜索、面包屑派生、导航动作、选择状态机、批量模式、CRUD、剪贴板、移动/复制编排、拖拽数据回调、弹窗状态机、右键动作构建纯函数、回收站子域 |
| **外壳** | 全部 DOM：布局、FileListGrid/ResourceList 渲染、右键菜单 UI、面包屑渲染位置（顶栏 vs 面板顶）、拖拽 drop 效果层、上传拖放层、弹窗 JSX 实例化、库分类树、项目列表视图、URL 解析/跳转、快捷键 UI 绑定 |

## 4. 用同一组 hooks 表达两外壳差异

| 差异 | 方案 B 表达 |
|---|---|
| 导航位置（顶栏 vs 树形/面板内） | 内核只输出 `breadcrumbs + navigateTo/goBack`；全屏渲染进 Header，侧边栏渲染进 ProjectPanelView，零内核差异 |
| 全屏 URL 驱动 vs 侧边栏受控 | `navigation: 'url' \| 'controlled'` + `externalProjectId/externalNodeId`（`useFileSystem` 已有此选项，方案 B 将其显式化为一等公民） |
| 选择模式（全屏常驻多选 vs 侧边栏仅库管理员批量） | `multiple: 'always'` vs `'batch-only'` + `batchEnabled`（由 `canManageLibrary` 注入）；批量动作从内核 `actions.batch` 取，渲染差异在外壳（SelectionBar vs BatchActionBar） |
| 回收站视图（全屏专属） | `enableTrash` 子域开关；侧边栏不开即零成本，`useTrashView` 逻辑全部进内核 |
| 拖拽（全屏还带文件上传层） | 内核只出节点 move/copy 拖拽回调；上传拖放是外壳 DOM 层叠加（`fileDropHandlers` 留在外壳） |
| 库模式（分类树/资源列表，侧边栏专属） | `source` 适配器注入：外壳提供 `useLibraryLoader`（薄包 useLibraryQuery/useFileSystemChildren，~60 行），内核只见 `load(nodeId, page, search)` 契约；分类 UI 全在外壳 |
| 打开行为 | `onOpen(node)` 注入：全屏跳 URL，侧边栏调 `onDrawingOpen` 回调 |

## 5. 文件落点

**新建 `src/hooks/file-browser/`**（9 个源码 + 5 个 spec）：`useFileBrowserData.ts`、`useFileBrowserSelection.ts`、`useFileBrowserActions.ts`、`useFileBrowserModals.ts`、`useFileBrowserDragDrop.ts`、`useFileBrowser.ts`（聚合）、`buildNodeActions.ts`、`fileBrowserTypes.ts`、`index.ts`。

**迁移/删除**：

| 动作 | 文件 | 说明 |
|---|---|---|
| 拆薄 | `hooks/file-system/useFileSystem.ts`(440) | 内部改调 file-browser 原子 hooks，对外签名不变 |
| 拆薄 | `FileSystemContent.tsx`(812→~280) | 右键菜单动作构建改 `buildNodeActions`，权限缓存逻辑进内核，保留渲染壳 |
| 拆薄 | `FileSystemModals.tsx`(354→~90)、`ProjectPanelModals.tsx`(205→~110) | 纯渲染 adapter：`<RenameModal {...modals.rename}/>`，散弹 props 消失 |
| 拆薄 | `useProjectDrawingsData.tsx`(297→~150) | 仅保留库适配器、项目列表、资源派生；加载骨架/选择/拖拽状态进内核 |
| 删除 | `useClipboardActions`(221)、`useMoveCopy`(125)、`useProjectDrawingsClipboard`(149)、`useProjectDrawingsDragDrop`(216)、`useProjectDrawingsMoveCopy`(89)、`useLoadNodes` 骨架(353) | 逻辑并入内核；`useLibraryLoader`(新建 ~60 行) 承接库数据源 |
| 保留 | `useProjectDrawingsActions`(316)、`useFileSystemManagerActions`(213) | 改调内核，删重复段，各 ~180 行 |
| 瘦身 | `ProjectDrawingsPanel/index.tsx`(386→~260) | 组合内核 hooks，删弹窗 props 搬运 |
| 保留 | `buildResourceItems`、`ProjectListView`、`ProjectPanelView`、`BatchActionBar`、`FileSystemHeader`、`SelectionBar`、`useFileSystemUrlEffects`、`useProjectProjects` | 外壳专属逻辑 |

**预计净删除 ~1900 行**（两弹窗 ~360 + 五 hook ~800 + FileSystemContent ~530 + 骨架 ~250）。

## 6. 测试策略

- **内核 spec（新增，不挂页面树）**：`useFileBrowserData.spec`（加载/分页/搜索/导航/面包屑）、`useFileBrowserSelection.spec`（多选/批量模式开关）、`useFileBrowserActions.spec`（CRUD 契约复用既有 `moveCopyActions.spec`/`useMoveCopyOrchestrator.spec` 风格 + 剪贴板 cut/copy/paste 权限矩阵）、`useFileBrowserModals.spec`（状态机：open/close/表单/互斥，如 select-folder 打开时 rename 互斥）、`buildNodeActions.spec`（权限 → 动作分组全枚举）。
- **外壳 smoke（保留现有）**：`ProjectDrawingsPanel.spec.tsx` 4 模式渲染 + `FileSystemManager.spec.tsx` 全屏冒烟；新增断言：两外壳对外 props 类型未变（编译期即验证），弹窗打开后渲染正确（轻挂外壳组件，不 mock 内核逻辑）。
- **回归门**：`pnpm type-check` + `pnpm depcruise` + 前端全量测试。

## 7. 风险与对策

- **受控/URL 双导航态复杂度**：`navigation` 二选一枚举，拒绝运行时混合；`useFileSystem` 现有 external 选项已证明可行。
- **库模式适配器逃逸**：`FileBrowserSource` 契约收窄为 `load/buildBreadcrumb/refresh` 三方法，库专属状态（categories/selectedCategoryPath）显式留在外壳，防内核膨胀。
- **弹窗枚举膨胀**：`activeId` 单态 + payload 泛型；外壳未渲染的 modal 由外壳自行过滤，内核不感知。
- **行为等价**：先抽内核、两外壳改调同一内核并保持 props 零改动，分两步提交（内核落地 → 外壳切换），每步跑全量测试。

**方案核心差异点（vs 对照方案）**：内核零 JSX、弹窗渲染归外壳（仅状态进内核）、`navigation` 显式化为一等公民、库模式走 `source` 适配器注入而非内核内置。
