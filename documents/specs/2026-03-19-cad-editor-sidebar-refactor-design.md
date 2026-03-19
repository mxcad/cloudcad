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
- 快速操作：右键菜单（打开、重命名、删除等）

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
const isModified = useRef(false);

// 在图纸加载后注册事件
mxcad.on("databaseModify", () => {
  isModified.current = true;
});

// 切换图纸后重置状态
isModified.current = false;
```

**事件特点**：
- 每打开一个新图纸，第一次修改会触发事件
- 后续修改不再触发
- 打开新图纸后重置检测状态

### 6. 设置弹窗

配置项：
- 显示模式：手动控制 | 自动隐藏 | 可收起
- 图纸打开方式：直接切换 | 确认后切换 | 新标签打开
- 默认Tab：项目图纸 | 图库 | 协同
- 侧边栏宽度：滑块调整（200px - 600px）
- 记住状态：记住上次打开的Tab和显示状态
- 重置按钮：恢复默认设置

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
│   │   └── SidebarTrigger.tsx        # 收起状态触发条
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
│   └── SidebarContext.tsx            # 扩展设置管理功能
├── pages/
│   └── CADEditorDirect.tsx           # 集成新的侧边栏容器
└── components/
    ├── CADEditorSidebar.tsx          # 调整为Tab内容组件
    └── CollaborateSidebar.tsx        # 调整为Tab内容组件
```

## 兼容性

- 保持 `mxcad-open-sidebar` 事件兼容，MxCAD命令触发仍可工作
- 现有的 `useSidebar` 和 `useSidebarManager` hook 保持兼容
- 设置通过 localStorage 存储，升级不影响用户偏好

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
