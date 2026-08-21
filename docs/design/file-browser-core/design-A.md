# FileBrowserCore 方案 A：内核即状态机

> issue #230 Step 2 design-it-twice 候选 A。只读设计，未改任何源码。

## 1. 设计哲学

内核 = 一棵完整的**领域状态机**：路径导航、选择、剪贴板、拖拽、弹窗、右键动作解析全部由内核持有并演化；外壳退化为两片薄 adapter——「数据源注入」+「布局渲染」。外壳只做三件事：注入数据源与打开语义（options）、把 DOM 事件转发成内核命令、把内核 state 快照渲染成布局。

## 2. 内核接口

### 2.1 选项（外壳注入策略）

```ts
interface FileBrowserCoreOptions {
  dataSource: FileBrowserDataSource;   // 加载/CRUD（两外壳各自实现）
  permissions: PermissionSnapshot;     // 权限位快照（沿用两处现有派生）
  onOpenNode: (node: FileSystemNode, ctx: OpenContext) => void; // 打开语义注入
  onPathChange?: (path: BreadcrumbItem[]) => void;  // 全屏页写回 URL
  gates?: { selection?: boolean; contextMenu?: boolean; drag?: boolean }; // 能力门控
}

interface FileBrowserDataSource {
  loadChildren(nodeId: string, p: { page?: number; search?: string;
    direction?: 'down' | 'prepend' | 'jump' }): Promise<{ nodes; total; totalPages }>;
  buildBreadcrumb?(nodeId: string): Promise<BreadcrumbItem[]>;
  createFolder(name): Promise<FileSystemNode>;
  createDrawing(name): Promise<FileSystemNode>;
  rename(node, name): Promise<void>;
  delete(nodes: FileSystemNode[], opts?): Promise<void>;
  restore(nodes: FileSystemNode[]): Promise<void>;
}
```

- **全屏页 dataSource**：包 `useFileSystem` 系 + trash 子域（`displayNodes`/`loadData` 换源），实现内部做回收站换源，trash 概念不进内核；导航 URL 回写走 `onPathChange`（替代 `useFileSystemUrlEffects` 的导航部分）。
- **侧边栏 dataSource**：包 `useLoadNodes` + `useLibraryOperations`，用 `resolveLoadNodeId()`（`getCategoryNodeId` 现成逻辑）把分类路径解析成 nodeId 注入 `loadChildren`。

### 2.2 状态模型

```ts
state: {
  path: BreadcrumbItem[];            // 唯一导航栈（两侧同构：项目根→项目→文件夹 / 库根→分类）
  nodes: FileSystemNode[]; loading; error;
  selected: Set<string>;             // 唯一选择集（复用 useMultiSelectSelection）
  clipboard: { items; mode };        // 共享 store 快照
  pagination: { page; pageSize; total; totalPages; direction: 'up'|'down'|'jump'|null };
  dropTargetId: string | null; draggedNodes: FileSystemNode[];
}
modals: {                            // 共享弹窗状态机
  rename; createFolder; createDrawing; selectFolder;
  downloadFormat; versionHistory; members; roles; project;
}
```

归属划分：**内核** = path/selection/clipboard/pagination/drag/drop + 7 个共享弹窗状态 + 右键状态与动作解析 + 批量命令（全部走已共享的 `useMoveCopyOrchestrator` / `moveCopyActions` / undo store）。**留外壳** = 数据源、渲染容器（FileListGrid vs ResourceList）、顶栏/工具栏面包屑 UI、grid/list 视图模式、上传（MxCadUploader/文件拖放 overlay）、专属弹窗（全屏页：share/删除项目确认/KeyboardShortcuts；侧边栏：libraryRename/LibrarySelectFolderModal/批量下载）、库分类树 UI、搜索 UI、回收站切换。

### 2.3 命令 API（命令式，外壳直接转发）

```ts
commands: {
  enterFolder(node) | navigateTo(path) | goBack() | refresh(): Promise<void>;
  select(nodeId, { ctrl?, shift? }) | selectAll() | clearSelection();
  copy(nodes) | cut(nodes) | paste(): Promise<void> | clearClipboard();
  createFolder(name) | createDrawing(name) | rename(node, name) | delete(nodes) | restore(nodes);
  batchMove() | batchCopy() | batchDelete() | batchRestore() | batchDownload();
  openRename(node) | openCreateFolder() | openSelectFolder(source) | confirmSelectFolder(targetId) | closeAll();
  onDragStart/onDragOver/onDragLeave/onDrop(e, node);   // 统一接线 orchestrator
  getNodeActions(node): AvailableActions;               // 权限+动作解析，右键/渲染共用
}
```

### 2.4 事件模型

无 pub/sub，三个回调足够：`onOpenNode`（打开语义）、`onPathChange`（URL 回写）、内部 onError → toast。状态变化由内部 useState/useReducer 驱动重渲染，外壳直接消费快照。

## 3. 两外壳差异 → 同一内核

| 差异 | 表达方式（适配层每项 <30 行） |
|---|---|
| 选择模式：全屏页全局选择 vs 侧边栏仅库管理员多选 | `gates.selection` 门控；侧边栏非库模式传 false，FileItem 不渲染选择态 |
| 导航位置：顶栏（全屏页）vs 面板 toolbar（侧边栏） | 纯布局；两侧各渲染面包屑，事件转发 `navigateTo`/`goBack` |
| URL 驱动 vs 内部 state | `onPathChange` 回调 vs 内部 `path`；`loadChildren` 的 nodeId 解析各归各的 dataSource |
| 树形分类导航（侧边栏独有） | `resolveLoadNodeId()` 注入 `loadChildren`；分类 UI 留外壳 |
| 拖拽（两侧均收敛 orchestrator 后） | 内核统一接线；库模式 `gates.drag=false` |
| 右键菜单（全屏页独有） | 内核实现动作解析 + 批量/空区分支；侧边栏 `gates.contextMenu=false`（现状无右键，行为等价） |
| 打开语义（图纸/图块插入/新标签页） | `onOpenNode` 闭包注入，差异全在注入函数里 |
| 回收站（全屏页独有） | dataSource 内部换源，内核无感知 |

## 4. 文件落点

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/components/file-browser-core/index.ts` | 新建 | Façade 出口（ADR-0029） |
| `src/components/file-browser-core/types.ts` | 新建 | 状态/命令/DataSource 类型 |
| `src/components/file-browser-core/useFileBrowserCore.ts` | 新建 | 主状态机组合（~250 行） |
| `.../useFileBrowserNavigation.ts` `useFileBrowserSelection.ts` `useFileBrowserModals.ts` `useFileBrowserContextMenu.ts` `useFileBrowserBatch.ts` | 新建 | 子状态机（各 ≤200 行，ADR-0033） |
| `.../useFileBrowserCore.spec.ts` | 新建 | 内核 spec |
| `FileSystemContent.tsx` | 836 → ~350 | 右键(~300)/长按/高亮/renderItem 权限解析归内核 |
| `useFileSystemUrlEffects.ts` | 273 → ~150 | 导航回写改 `onPathChange` 订阅 |
| `useFileSystemManagerActions.ts` | 234 → ~150 | 命令转发内核 |
| `FileSystemModals.tsx` | 369 → ~250 | 共享 7 弹窗从内核快照取 |
| `useProjectDrawingsActions.ts` | 338 → ~250 | 弹窗状态归内核 |
| `useProjectDrawingsInteractions.ts` | 335 → ~250 | 导航命令转发内核 |
| `useFileItemRenderer.tsx` | 283 → ~150 | 动作可用性改 `getNodeActions` |
| `useProjectDrawingsData.tsx` | 321 → ~260 | 选择/拖拽状态归内核 |
| `useProjectDrawingsClipboard.ts` | 162 → ~100 | 命令转发 |
| `ProjectDrawingsPanel/index.tsx` | 405 → ~300 | 布局组装 |

**删除的重复**：两套导航命令(~300)、两套弹窗状态与实例化(~350)、两套 renderItem 权限/动作组装(~300)、两套剪贴板/拖拽接线(~250)、两套批量命令(~100)。**净收益约 -700±200 行**（不含测试）：删 ~1400 行重复、新增 ~700 行内核。如实保留不可合并项：FileListGrid 与 ResourceList 渲染容器、两处面包屑 UI 位置。

## 5. 测试策略

1. **内核 spec**：`renderHook` + mock dataSource，覆盖：导航（enterFolder/面包屑/back 的 path 演化与 loadChildren 调用参数）、选择（ctrl/shift/全选）、剪贴板（copy/cut/paste 编排 + undo 注册）、弹窗状态机（open/confirm/close 全流程）、`getNodeActions` 权限门控、批量命令 undo 注册。不再挂载整棵页面树。
2. **两外壳 smoke**：保留 `ProjectDrawingsPanel.spec.tsx`（4 模式）与 `FileSystemManager.spec.tsx`，验证 props 零改动与行为等价。
3. **迁移双跑**：接内核后跑前端全量用例回归（当前 554）+ `pnpm type-check` / `lint` / `depcruise`；`FileSystemManager.spec` 的整树挂载逐步替换为「外壳 + mock 内核」。

## 6. 风险与红线

- **行为等价红线**：`FileSystemManagerView` 与 `SidebarContainer` 对外 props 零改动；重构仅发生在两组件内部接线层，页面入口文件不动。
- **风险**：dataSource 接口过宽 → 收敛为 6+1 方法并给默认实现；trash / URL 语义为全屏页独享，不做强行抽象（ADR-0031 默认不抽象）。
- **死代码风险**：右键/批量状态机对侧边栏为门控关闭而非删除——按 ADR-0033 以内核统一能力存在，两外壳 gates 文档化。

## 7. 与方案 B 的差异（候选对比要点）

- A 主张**状态全部内聚于内核**、外壳零业务状态（B 若采用「渲染子组件 + 最小共享 hook」则为反向：状态分散在渲染组件）。
- A 的打开/导航差异靠**回调注入**收敛；B 若靠渲染 props 传递则适配层更厚。
- A 牺牲「侧边栏不用的右键/批量」一小部分死代码换取单一事实源；文件落点集中，删除量更大。
