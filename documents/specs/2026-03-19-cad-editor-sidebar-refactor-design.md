# CAD编辑器侧边栏重构设计

## 概述

重构CAD编辑器侧边栏，实现统一的侧边栏容器组件，支持Tab切换和项目图纸快速访问功能。

## 目标

1. 新增"项目图纸"Tab，方便用户快速访问当前项目的图纸文件
2. 整合现有侧边栏（图库、协同）为统一的Tab切换模式
3. 简化交互设计，用户手动控制侧边栏的显示和隐藏

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
type SidebarTab = 'drawings' | 'gallery' | 'collaborate';
type DrawingsSubTab = 'my-project' | 'my-drawings';

interface SidebarSettings {
  defaultTab: SidebarTab;
  defaultDrawingsSubTab: DrawingsSubTab;
  width: number;
  rememberState: boolean;
  lastActiveTab: SidebarTab | null;
  lastDrawingsSubTab: DrawingsSubTab | null;
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

Tab栏显示关闭按钮。

## UI设计

### 收起状态触发条

```
┌──┐
│图│ ← 图纸图标
│纸│
│──│
│图│ ← 图库图标
│库│
│──│
│协│ ← 协同图标
│同│
└──┘
```

### 展开状态侧边栏

```
┌─────────────────────────────┐
│ [图纸] [图库] [协同]     ✕  │
├─────────────────────────────┤
│ 🔍 搜索图纸...               │
├─────────────────────────────┤
│ ┌───┐ drawing1.dwg          │
│ │缩 │ 2024-03-19 10:30      │
│ │略 │                       │
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
│   │   ├── SidebarTrigger.tsx        # 收起状态触发条
│   │   └── sidebar.module.css        # 侧边栏样式
│   └── ProjectDrawingsPanel.tsx      # 项目图纸面板
├── hooks/
│   └── useSidebarSettings.ts         # 侧边栏设置管理
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
| sidebar.tab.drawings | 图纸 | Drawings |
| sidebar.tab.gallery | 图库 | Gallery |
| sidebar.tab.collaborate | 协同 | Collaborate |

## 测试策略

### 单元测试
- `useSidebarSettings` hook：设置读写、默认值、持久化

### 集成测试
- Tab切换功能
- 设置保存与恢复

### E2E测试
- 完整的图纸打开流程

## 实现步骤

1. 创建类型定义 `types/sidebar.ts`
2. 创建设置管理 hook `useSidebarSettings.ts`
3. 创建 `SidebarContainer` 核心容器组件
4. 创建 `SidebarTabBar` Tab切换组件
5. 创建 `SidebarTrigger` 触发条组件
6. 创建 `ProjectDrawingsPanel` 项目图纸面板
7. 重构 `CADEditorSidebar` 为Tab内容组件
8. 重构 `CollaborateSidebar` 为Tab内容组件
9. 扩展 `SidebarContext` 添加设置管理
10. 集成到 `CADEditorDirect`
11. 测试Tab切换功能
12. 测试图纸打开流程

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有侧边栏逻辑复杂 | 重构可能引入bug | 保持现有组件核心逻辑，仅调整显示控制 |
| 状态同步不一致 | Context与localStorage不同步 | 使用单一数据源，Context从localStorage初始化 |
| 大量图纸渲染性能 | 文件数量多时卡顿 | 使用虚拟列表、防抖搜索 |
