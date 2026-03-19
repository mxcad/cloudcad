# CAD编辑器侧边栏重构设计

## 概述

重构CAD编辑器侧边栏，实现统一的侧边栏容器组件，支持Tab切换、多种显示模式和项目图纸快速访问功能。

## 目标

1. 新增"项目图纸"Tab，方便用户快速访问当前项目的图纸文件
2. 整合现有侧边栏（图库、协同）为统一的Tab切换模式
3. 支持三种显示模式：手动控制、自动隐藏、可收起
4. 支持三种图纸打开方式：直接切换、确认后切换、新标签打开
5. 检测图纸修改状态，提供智能提示

## 架构设计

### 组件结构

```
SidebarContainer (新组件)
├── SidebarTabBar (新组件)
│   └── Tab列表（项目图纸 | 图库 | 协同）
├── SidebarTrigger (新组件)
│   └── 收起状态触发条
├── SidebarContent
│   ├── ProjectDrawingsPanel (新组件 - 项目图纸)
│   ├── CADEditorSidebar (现有 - 图库)
│   └── CollaborateSidebar (现有 - 协同)
└── SidebarSettingsModal (新组件 - 设置弹窗)
```

### 状态管理

```typescript
// 类型定义
type SidebarTab = 'project' | 'gallery' | 'collaborate';
type SidebarDisplayMode = 'manual' | 'auto-hide' | 'collapse';
type DrawingOpenMode = 'direct' | 'confirm' | 'new-tab';

interface SidebarSettings {
  displayMode: SidebarDisplayMode;
  openMode: DrawingOpenMode;
  defaultTab: SidebarTab;
  width: number;
  rememberState: boolean;
  lastActiveTab: SidebarTab | null;
  isVisible: boolean;
}
```

### 存储方案

使用 `localStorage` 持久化用户设置：

```typescript
const STORAGE_KEY = 'cad-editor-sidebar-settings';
```

## 功能详情

### 1. 项目图纸面板 (ProjectDrawingsPanel)

**数据获取**：
- 复用现有 `useFileSystem` hook 获取当前项目文件列表
- 过滤图纸文件类型（.dwg, .dxf 等）
- 支持搜索和排序

**功能清单**：
- 搜索框：快速筛选图纸名称
- 排序选项：名称/修改时间/大小
- 图纸列表：
  - 缩略图预览
  - 文件名显示
  - 修改时间
  - 当前打开/已修改状态指示
- 快速操作：右键菜单

**缩略图方案**：
复用现有 `FileItem` 组件的缩略图逻辑，通过后端API获取图纸预览图。

**右键菜单项**：
| 菜单项 | 权限要求 | 说明 |
|--------|----------|------|
| 打开 | 无 | 在当前编辑器中打开图纸 |
| 重命名 | `canUpdate` | 重命名图纸文件 |
| 移动 | `canUpdate` | 移动到其他文件夹 |
| 复制 | `canCreate` | 复制图纸文件 |
| 删除 | `canDelete` | 删除图纸文件 |
| 查看版本历史 | `canRead` | 查看SVN版本历史 |
| 下载 | `canDownload` | 下载图纸文件 |

### 2. Tab切换

三个Tab并列显示：
- **项目图纸**：当前项目的图纸文件列表
- **图库**：现有的图纸库/图块库功能
- **协同**：现有的协同会话管理功能

Tab栏同时显示设置按钮（齿轮图标）和关闭按钮。

### 3. 显示模式

#### 手动控制 (manual)
- 用户手动点击Tab或关闭按钮切换
- 侧边栏保持当前状态不变
- 默认行为

#### 自动隐藏 (auto-hide)
- 侧边栏默认收起为边缘触发条（宽度约40px）
- 鼠标悬停触发条时展开完整侧边栏
- 鼠标移出侧边栏区域后延迟300ms自动收起
- 展开状态下有明确的收起按钮

#### 可收起 (collapse)
- 侧边栏收起为边缘垂直触发条
- 触发条显示所有Tab的图标
- 点击触发条展开侧边栏
- 点击关闭按钮收起

### 4. 图纸打开方式

#### 直接切换 (direct)
- 直接关闭当前图纸，打开新选择的图纸

#### 确认后切换 (confirm)
- 检测当前图纸是否有未保存修改
- 如有修改，弹出确认对话框
- 用户确认后再切换

#### 新标签打开 (new-tab)
- 支持多图纸同时打开
- 类似浏览器标签页模式
- 当前设计阶段暂不实现完整多标签，预留接口

### 5. 图纸修改状态检测

使用 MxCAD API 检测图纸修改状态：

```typescript
// useDrawingModifyState.ts
export function useDrawingModifyState() {
  const isModified = useRef(false);

  useEffect(() => {
    const mxcad = mxcadManager.getCurrentMxCAD();
    if (!mxcad) return;

    const handler = () => {
      isModified.current = true;
    };

    mxcad.on("databaseModify", handler);

    // 组件卸载时清理事件监听，防止内存泄漏
    return () => {
      mxcad.off("databaseModify", handler);
    };
  }, []);

  const resetModified = useCallback(() => {
    isModified.current = false;
  }, []);

  return { isModified, resetModified };
}
```

**事件特点**：
- 每打开一个新图纸，第一次修改会触发事件
- 后续修改不再触发
- 打开新图纸后重置检测状态
- 组件卸载时必须清理事件监听，防止内存泄漏

### 6. 设置弹窗

配置项：
- 显示模式：手动控制 | 自动隐藏 | 可收起
- 图纸打开方式：直接切换 | 确认后切换 | 新标签打开
- 默认Tab：项目图纸 | 图库 | 协同
- 侧边栏宽度：滑块调整（200px - 600px）
- 记住状态：记住上次打开的Tab和显示状态
- 重置按钮：恢复默认设置

**UI布局**：
```
┌─────────────────────────────────────┐
│ 侧边栏设置                      ✕   │
├─────────────────────────────────────┤
│ 显示模式                            │
│ ○ 手动控制  ○ 自动隐藏  ○ 可收起    │
│                                     │
│ 图纸打开方式                        │
│ ○ 直接切换  ○ 确认后切换  ○ 新标签  │
│                                     │
│ 默认Tab                             │
│ [项目图纸 ▼]                        │
│                                     │
│ 侧边栏宽度                          │
│ [━━━━━━━━●━━━━━━━] 300px           │
│                                     │
│ ☑ 记住上次状态                      │
│                                     │
│      [恢复默认]  [确定]  [取消]      │
└─────────────────────────────────────┘
```

### 7. 确认对话框

"确认后切换"模式下，检测到图纸已修改时显示：

**UI布局**：
```
┌─────────────────────────────────────┐
│ 提示                            ✕   │
├─────────────────────────────────────┤
│                                     │
│   ⚠ 当前图纸已修改，是否保存？       │
│                                     │
│      [不保存]  [保存]  [取消]        │
└─────────────────────────────────────┘
```

**按钮行为**：
- 不保存：直接切换到新图纸，丢弃修改
- 保存：保存当前图纸后切换到新图纸
- 取消：取消操作，继续编辑当前图纸

## UI设计

### 收起状态触发条

```
┌──┐
│项│ ← 项目图纸图标
│目│
│图│
│纸│
│──│
│图│ ← 图库图标
│库│
│──│
│协│ ← 协同图标
│同│
│──│
│⚙│ ← 设置图标
└──┘
```

### 展开状态侧边栏

```
┌─────────────────────────────┐
│ [项目图纸] [图库] [协同]  ⚙ ✕ │
├─────────────────────────────┤
│ 🔍 搜索图纸...               │
├─────────────────────────────┤
│ ┌───┐ drawing1.dwg          │
│ │缩 │ 2024-03-19 10:30      │
│ │略 │ ● 已修改               │
│ │图 │                       │
│ └───┘                       │
│ ┌───┐ drawing2.dwg          │
│ │   │ 2024-03-18 15:20      │
│ └───┘                       │
└─────────────────────────────┘
```

### 动画效果

- 展开/收起：平滑过渡 200ms
- Tab切换：内容淡入淡出 150ms
- 悬停反馈：背景色变化

## 文件变更清单

### 新增文件

```
packages/frontend/src/
├── components/
│   ├── sidebar/
│   │   ├── SidebarContainer.tsx      # 统一侧边栏容器
│   │   ├── SidebarTabBar.tsx         # Tab切换栏
│   │   ├── SidebarSettingsModal.tsx  # 设置弹窗
│   │   ├── SidebarTrigger.tsx        # 收起状态触发条
│   │   └── sidebar.module.css        # 侧边栏样式
│   └── ProjectDrawingsPanel.tsx      # 项目图纸面板
├── hooks/
│   ├── useSidebarSettings.ts         # 侧边栏设置管理
│   └── useDrawingModifyState.ts      # 图纸修改状态检测
└── types/
    └── sidebar.ts                    # 侧边栏相关类型定义
```

### 修改文件

```
packages/frontend/src/
├── contexts/
│   └── SidebarContext.tsx            # 扩展设置管理功能，新增SidebarTab类型
├── pages/
│   └── CADEditorDirect.tsx           # 集成新的侧边栏容器
└── components/
    ├── CADEditorSidebar.tsx          # 调整为Tab内容组件
    └── CollaborateSidebar.tsx        # 调整为Tab内容组件
```

**详细修改说明**：

| 文件 | 修改内容 |
|------|----------|
| `SidebarContext.tsx` | 1. 扩展 `SidebarType` 为 `'project' \| 'gallery' \| 'collaborate'`<br>2. 新增 `SidebarSettingsState` 接口<br>3. 新增 `useSidebarSettings()` hook |
| `CADEditorSidebar.tsx` | 1. 移除独立的宽度调整逻辑（由 `SidebarContainer` 统一管理）<br>2. 移除独立的显示/隐藏控制<br>3. 移除 `mxcadManager.adjustContainerPosition()` 调用 |
| `CollaborateSidebar.tsx` | 同上 |
| `CADEditorDirect.tsx` | 1. 替换现有侧边栏渲染为 `SidebarContainer`<br>2. 传递项目ID和权限信息 |

**宽度管理职责迁移**：
- 原：各侧边栏组件各自维护 `width` 状态
- 新：`SidebarContainer` 统一管理 `width` 状态，在宽度变化时调用 `mxcadManager.adjustContainerPosition()`

## 兼容性

- 保持 `mxcad-open-sidebar` 事件兼容，MxCAD命令触发仍可工作
- 现有的 `useSidebar` 和 `useSidebarManager` hook 保持兼容
- 设置通过 localStorage 存储，升级不影响用户偏好

## 国际化

新增UI文案复用现有 i18n 方案，主要文案包括：

| Key | 中文 | 英文 |
|-----|------|------|
| sidebar.tab.project | 项目图纸 | Project Drawings |
| sidebar.tab.gallery | 图库 | Gallery |
| sidebar.tab.collaborate | 协同 | Collaborate |
| sidebar.settings.title | 侧边栏设置 | Sidebar Settings |
| sidebar.settings.displayMode | 显示模式 | Display Mode |
| sidebar.settings.openMode | 图纸打开方式 | Drawing Open Mode |
| sidebar.settings.manual | 手动控制 | Manual |
| sidebar.settings.autoHide | 自动隐藏 | Auto Hide |
| sidebar.settings.collapse | 可收起 | Collapsible |
| sidebar.confirm.title | 提示 | Confirm |
| sidebar.confirm.modified | 当前图纸已修改，是否保存？ | Current drawing has been modified. Save? |

## 测试策略

### 单元测试
- `useSidebarSettings` hook：设置读写、默认值、持久化
- `useDrawingModifyState` hook：事件监听、状态检测、清理

### 集成测试
- 侧边栏显示模式切换
- Tab切换功能
- 设置保存与恢复

### E2E测试
- 完整的图纸打开流程
- 修改检测与确认对话框
- 三种显示模式的用户体验

## 实现步骤

1. 创建类型定义 `types/sidebar.ts`
2. 创建设置管理 hook `useSidebarSettings.ts`
3. 创建图纸修改状态检测 hook `useDrawingModifyState.ts`
4. 创建 `SidebarContainer` 核心容器组件
5. 创建 `SidebarTabBar` Tab切换组件
6. 创建 `SidebarTrigger` 触发条组件
7. 创建 `ProjectDrawingsPanel` 项目图纸面板
8. 创建 `SidebarSettingsModal` 设置弹窗
9. 重构 `CADEditorSidebar` 为Tab内容组件
10. 重构 `CollaborateSidebar` 为Tab内容组件
11. 扩展 `SidebarContext` 添加设置管理
12. 集成到 `CADEditorDirect`
13. 测试三种显示模式
14. 测试三种图纸打开方式
15. 测试图纸修改状态检测

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有侧边栏逻辑复杂 | 重构可能引入bug | 保持现有组件核心逻辑，仅调整显示控制 |
| 自动隐藏模式性能 | 频繁触发影响体验 | 添加防抖延迟，优化触发区域检测 |
| 多图纸状态管理 | 状态同步复杂 | 第一版暂不支持完整多标签，预留接口 |
| 状态同步不一致 | Context与localStorage不同步 | 使用单一数据源，Context从localStorage初始化 |
| 大量图纸渲染性能 | 文件数量多时卡顿 | 使用虚拟列表、防抖搜索 |
| 事件监听器泄漏 | 内存占用增加 | useEffect cleanup 确保清理 |
