# 0052 — 前端列表交互机制统一架构（List Interaction Unification）
**Status**: accepted

# 背景

文件系统、字体库、分享管理等列表页面陆续实现"多选 + 框选 + 快捷键 + 滚动分页"后，机制出现**多实现并存**，
用户明确要求：这套机制将来出问题必须**一处修复全站生效**，禁止"每个页面重写一份实现"。审查发现三处债务 + 一个 bug：

1. **选择内核两代并存**：新内核 `useFileBrowserSelection`（泛型 `{id}`，FontLibrary/ShareManagePage/ProjectDrawingsPanel 在用）
   与旧内核 `useMultiSelectSelection`（硬编码 `FileSystemNode`，FileSystem 全屏页 + LibraryManager 在用）——旧内核唯一的"优势"是自带 Ctrl+A
   监听，而新内核刻意把快捷键外置，FileSystem 页因 `useFileSystemShortcuts` 缺 select-all 键被拖住无法迁移。
2. **快捷键两套分裂**：`useSelectionShortcuts`（通用三键 ESC/Ctrl+A/Delete）与 `useFileSystemShortcuts`（八键 +
   containerRef 焦点限定 + can\* 守卫），连 `isInputFocused`/`isAnyModalOpen` 守卫都复制了两份。
3. **表格接线每页手写**：ShareTable/FontListView 各自实现 checkbox 列、行点击选中、框选接线、"框选刚结束 click 误触发"守卫——
   用户管理/IP 黑名单/审计日志均为原生 table 形态，照抄将再产生 3 份复制。
4. **框选拖动 bug**：`useRubberBandSelection.handleMouseDown` 未 `preventDefault()`，框选拖拽时浏览器原生文本选择/元素拖拽未被阻止
   （FontLibrary 字体卡片框选会拖动其他元素）；FileItem 靠各页面手写 `draggable={!isRubberBanding}` 防护，覆盖面不全。

# Decision

## 1. 单一选择内核：`useFileBrowserSelection`（消灭旧内核）

- 全站唯一选择状态机：`selectedNodes/handleNodeSelect(ctrl,shift)/handleSelectAll/clearSelection/selectMany/deselectNode`，
  支持 `multiple: 'always' | 'batch-only' | false`。
- FileSystem 全屏页 + LibraryManager 从 `useMultiSelectSelection` 迁移（Ctrl+A 由快捷键超集的 select-all 键承接）；
  **删除** `useMultiSelectSelection` 与透传壳 `useLibrarySelection`。

## 2. 单一快捷键：`useSelectionShortcuts` 超集（消灭两套）

- 吸收 `useFileSystemShortcuts` 全部能力为可选参数：`containerRef`（焦点限定）、undo/redo/copy/cut/paste/rename（F2）、
  各自 `can*` 守卫、**select-all 键（新增）**；两套 `isInputFocused`/`isAnyModalOpen` 守卫收敛为一份。
- **删除** `useFileSystemShortcuts`；FileSystemManager/LibraryManager/ProjectDrawingsPanel 改 import，行为不变
  （`enabledKeys` + `containerRef` 用法保持）。

## 3. 单一框选 + preventDefault 协议：`useRubberBandSelection`

- `handleMouseDown` 启动框选时 `e.preventDefault()`（阻止文本选择 + 原生元素/图片拖拽，统一根治"框选拖动其他元素"）；
- 新增守卫：`input/textarea/select/[contenteditable]` 上不启动（checkbox 列、输入框可正常交互）；
  滚动条区域不启动（preventDefault 不破坏滚动条拖动）；既有守卫保留（非左键/Ctrl/Shift/Meta/data-drag-handle/菜单）。
- 各页面手写的 `draggable={!isRubberBanding}` 保留为双保险，但**不再作为必选防护**。
- `data-node-id` 行协议 + `rubberBandJustEndedRef` 框选后 click 防误触为全站统一约定（行组件/容器内置）。

## 4. 滚动分页：`useScrollPagination` + `useAccumulatedPagination`（泛型化）

- 延续 ADR-0050：`useScrollPagination` 为唯一滚动分页控制器；`useAccumulatedPagination` 泛型化 `<T extends {id: string}>`，
  供所有"翻页查询 + 滚动合并"页面（FileSystem/LibraryManager/用户管理/IP 黑名单/审计日志）共用 append/prepend/replace + resetKey 竞态防护。

## 5. 表格形态唯一入口：`SelectableTable` + `BatchActionBar`（components/common/）

- **机制内置 + 业务外置**（FileListGrid 模式的表格版，而非 columns 配置数组——列布局各页差异大，配置化会退化为面条式 render）：
  - 内置：滚动容器 + 框选（handlers/overlay/边缘滚动）、滚动分页（顶/底 loader、"已经是最后一页"、页脚 Pagination 显示 visiblePage）、
    表头全选 Checkbox 列、行 Checkbox 列（拦截冒泡）、行点击选中（ctrl/shift 区间 + rubberBandJustEndedRef 守卫）、
    `data-node-id` + 选中行样式、加载/空态。
  - 外置：`renderHeader()` / `renderRow(row, ctx)`（列布局自由）；分页模式可选（滚动 / 按钮 / 不分页）；
    选择状态受控（状态由页面 `useFileBrowserSelection` 持有）。
- `BatchActionBar`：选中计数徽标 + 批量按钮组 + 清空（`selectedCount > 0` 显示），批量动作一律**循环调用现有 SDK 单条接口**
  （同 ShareManagePage 批量撤销模式，统计成功/失败 Toast 汇总；不为此新增后端批量接口）。
- ShareTable / FontListView 迁移收敛（ShareTable 保留按钮分页行为，FontListView 无分页模式）。

### 5.1 批量操作栏统一（2026-08-14 收尾，全站 7 处收敛）

`BatchActionBar` 增强为全站唯一多选操作栏（胶囊形态），收编此前 4 处独立实现：

- **统一形态**：`rounded-full` 胶囊 + `shadow-2xl`，CheckSquare + 数字角标（>99 显示 99+）+ 计数文字 +
  分割线 + 动作按钮组 + 取消选择；移动端（sm 以下）只显示图标，文字隐藏。
- **组件能力**（`BatchActionItem` / `BatchClipboardState`）：
  - `actions[]` 数据驱动（label 可选，省略即 icon-only + tooltip 模式）；`disabled`/`loading`/`variant` 透传；
  - 可选全选 Checkbox（`selectAllChecked`/`onSelectAll`，字体库 grid 视图）；
  - 可选剪贴板区（`clipboard`：粘贴 + 数量角标 + 清空，文件系统/资源库剪贴板模式）；
  - `count === 0` 时隐藏计数区（剪贴板模式只显示粘贴 + 取消）。
- **收敛清单**（删除的独立实现）：`FileSystemManager/SelectionBar.tsx`、`LibraryManager/LibraryManagerBottomBar.tsx`、
  `ProjectDrawingsPanel/components/BatchActionBar.tsx`、FontToolbar 内嵌批量条、ShareToolbar 内嵌撤销按钮。
  既有 3 消费者（用户管理/审计日志/IP 黑名单）保持 actions 用法不变，仅换胶囊形态（居中 wrapper）。
- 计数文案统一「已选 N 项」（原「已选中 N 项」「已选择 N 个字体」收敛）；ShareManagePage 补上取消按钮
  （原仅依赖 ESC 快捷键）。
- **位置与占位约定（2026-08-14 增补）**：批量操作栏**位于列表内部**（滚动容器内 `sticky bottom-0` 吸底）——
  通过 `SelectableTable` / `FileListGrid` 的 `bottomBar` 插槽渲染，**不占布局空间**、出现/消失零跳动、不压缩列表可视区。
  列表/表格容器 `flex-1 min-h-0` **撑满页面剩余空间**（页面恒一屏），滚动容器底部即页面底部区域，
  操作栏吸底位置 ≈ 页面底部，且**不遮挡分页栏**（分页栏在滚动容器外）。
  滚动容器内容包 `min-h-full flex flex-col`（**仅 bottomBar 存在时**，避免撑满容器破坏滚动分页测量）+ 操作栏
  `mt-auto sticky bottom-0`——**内容不足一屏时操作栏贴滚动容器底部（=页面底部），内容超出时吸底**
  （纯 sticky 在内容不足时不吸底，会悬在列表中部）。**不设滚动容器 pb**（pb 会使滚动到底时操作栏不贴底）。
  滚动容器内内容不足时的滚动加载由 useScrollPagination 自动填充承担（内容不足视口自动加载下一页直至填满）。
  `BatchActionBar` 在 `count === 0`（剪贴板模式）时隐藏计数区，只显示粘贴 + 取消。
  CAD 编辑器侧边栏（ProjectDrawingsPanel）同规则：批量条经 ResourceList `bottomBar` 插槽进列表内部
  （滚动容器内 mt-auto sticky），不遮其底部分页操作栏（footer）。禁止页面级 `absolute bottom-0`
  （会遮挡分页栏）与文档流常驻占位（会压缩内容区）。
- **页面恒一屏约定（2026-08-14 增补）**：列表/表格页面统一为字体库样板布局——外层 `h-full flex flex-col overflow-hidden`
  （管理页容器 CSS 同步：AuditLogPage/ShareManagePage `.page`、UserManagement `.user-management-container`、
  IpBlacklist `page-content-theme h-full`），头部/工具栏/统计 `flex-shrink-0`，表格容器 `flex-1 min-h-0`
  （SelectableTable/FileListGrid 内部滚动）。页面恒撑一屏、表格自适应剩余空间，框选与滚动浏览体验统一；
  禁止固定 `max-h-[65vh]`/`calc(100vh-240px)` 截断表格（视口变化时不随页面自适应）。

## 6. 强制规则（code review 门禁）

- 新建列表/表格页面：**必须**复用 `SelectableTable` + `useFileBrowserSelection` + `useSelectionShortcuts` + `useRubberBandSelection`；
  禁止手写 checkbox 列、行点击选中、框选接线、data-node-id 之外的替代行协议。
- 滚动分页页面数据合并**必须**走 `useAccumulatedPagination`（禁止重写 Map 去重/方向状态链）。
- 机制 bug 修复一律在共享层（hook/容器），禁止在页面层打补丁。

# Guidance

- 三页面接入样板（本 ADR 落地实例）：用户管理（批量注销/恢复）、IP 黑名单（批量移除）、审计日志（批量导出 CSV，只读不绑 Delete）。
- 抽象改动一律 TDD 先行：先写契约测试（红）→ 实现（绿）→ 重构；迁移类改动以被迁移页面现有测试全绿为门禁。
- 批量动作确认弹窗复用既有 Modal（DeleteUserConfirm 支持 count 批量模式；RemoveEntryModal 支持批量）。

# Consequences

- **正面**：机制单一实现，修复一处全站生效；新页面接入成本降到"配置 + 业务渲染"；框选拖动 bug 在共享层根治。
- **代价**：FileSystem 全屏页迁移为最高风险点（生产核心页），以现有 spec 全绿 + 手动走查为门禁；ShareTable/FontListView 迁移需回归验证。
- 后端零改动：批量动作全部循环调用现有单条接口，无 SDK 重生成、无三层联动。
