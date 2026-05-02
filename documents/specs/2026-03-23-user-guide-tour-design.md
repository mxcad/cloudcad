# 用户引导功能设计文档

> 版本: 1.4.0
> 日期: 2026-03-23
> 状态: 开发中

### 实现进度

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础框架（类型定义、TourContext、useTour Hook） | ✅ 已完成 |
| Phase 2 | 核心组件（TourOverlay、TourTooltip） | ✅ 已完成 |
| Phase 3 | 引导中心（TourCenter、TourStartModal、入口按钮） | ✅ 已完成 |
| Phase 4 | 流程配置（tourGuides.ts） | ✅ 已完成 |
| Phase 5 | 元素标记（data-tour 属性） | ✅ 已完成 |
| Phase 6 | 单元测试 | ✅ 已完成 |
| Phase 7 | 跨页面引导 + 交互模式改进 | ✅ 已完成 |
| Phase 8 | 交互模式修复 + 起始页面配置 + UI 条件分支 | ✅ 已完成 |

### Phase 8 改进说明

**问题修复：**

| 问题 | 解决方案 |
|------|----------|
| 交互模式点击无反应 | 修改遮罩层 pointer-events，使用捕获阶段事件监听 |
| 引导跳过必要步骤 | 添加侧边栏导航步骤，每个操作步骤不可省略 |
| 起始页面不灵活 | 新增 startPage 参数，支持 'dashboard'/'current'/自定义路由 |
| UI 多状态定位不准 | 新增 UI 条件分支，支持 view-mode 检测和 alternatives |

**新增功能：**

1. **起始页面配置 (startPage)**
   - `'dashboard'`: 从首页仪表盘开始（默认值）
   - `'current'`: 保持当前页面（适用于 CAD 编辑器等新标签场景）
   - `string`: 自定义路由路径

2. **UI 条件分支 (uiCondition + alternatives)**
   - `uiCondition`: 检测当前 UI 状态
   - `alternatives`: 条件不满足时使用的替代步骤配置
   - 支持视图模式检测 (`view-mode`: 'grid' | 'list')

3. **视图模式指示器**
   - 在文件列表容器添加 `data-view-mode` 属性
   - 用于 UI 条件检测判断当前视图模式

4. **交互模式事件改进**
   - 使用捕获阶段在 document 上监听事件
   - 检测点击是否在目标元素或其子元素上
   - 遮罩层和高亮边框 pointer-events 设为 none

**类型定义更新：**

```typescript
// 新增类型
export type TourStartPage = 'dashboard' | 'current' | string;

export type UIConditionType = 'element-exists' | 'view-mode' | 'custom';

export interface UICondition {
  type: UIConditionType;
  selector?: string;
  viewMode?: 'grid' | 'list';
  customCheck?: () => boolean;
}

export interface TourStepAlternative {
  condition: UICondition;
  step: Partial<TourStep>;
}

// TourStep 新增属性
interface TourStep {
  // ... 原有属性
  uiCondition?: UICondition;
  alternatives?: TourStepAlternative[];
}

// TourGuide 新增属性
interface TourGuide {
  // ... 原有属性
  startPage?: TourStartPage;
}
```

**新增 data-tour 属性：**

| 文件 | data-tour 值 | 说明 |
|------|--------------|------|
| Layout.tsx | `sidebar-projects` | 侧边栏项目管理入口 |
| FileItem.tsx | `file-item-menu-btn` | 网格视图菜单按钮 |
| FileItem.tsx | `file-item-actions` | 列表视图操作按钮区域 |
| FileSystemManager.tsx | `data-view-mode` | 视图模式指示器（grid/list） |

### Phase 7 改进说明

**问题修复：**

| 问题 | 解决方案 |
|------|----------|
| 不在目标页面时卡在"正在定位目标元素" | 添加路由匹配检查，先跳转后激活引导 |
| 引导流程不完整 | 在 startTour 和 nextStep 时检查路由，自动跳转 |
| 引导区域无法点击元素 | 实现交互模式，高亮区域可点击 |
| 缺少展示/操作模式区分 | 添加 mode 属性区分 display/interactive 模式 |

**新增功能：**

1. **步骤模式 (StepMode)**
   - `display`: 展示模式，用户点击"下一步"按钮继续
   - `interactive`: 交互模式，用户需完成指定操作才能继续

2. **交互操作类型 (actionType)**
   - `click`: 点击目标元素
   - `right-click`: 右键点击
   - `input`: 输入内容
   - `select`: 选择选项

3. **路由跳转机制**
   - `initialRoute`: 引导流程的初始路由
   - `route`: 步骤级别的路由跳转
   - 动态路由参数支持

4. **高亮强调**
   - `highlight`: 布尔值，为目标元素添加脉冲动画效果

**类型定义更新：**

```typescript
// 新增类型
export type StepMode = 'display' | 'interactive';

// TourStep 新增属性
interface TourStep {
  // ... 原有属性
  mode?: StepMode;
  actionType?: 'click' | 'input' | 'select' | 'right-click';
  actionHint?: string;
  highlight?: boolean;
}

// TourGuide 新增属性
interface TourGuide {
  // ... 原有属性
  initialRoute?: string;
}
```

### Phase 5 实现说明

**已添加的 data-tour 属性（22个）：**

| 文件 | data-tour 值 | 说明 |
|------|--------------|------|
| FileSystemManager.tsx | `create-project-btn` | 新建项目按钮 |
| FileSystemManager.tsx | `create-folder-btn` | 新建文件夹按钮 |
| FileSystemManager.tsx | `upload-btn` | 上传文件按钮 |
| FileSystemManager.tsx | `search-input` | 搜索输入框 |
| FileSystemManager.tsx | `view-toggle` | 视图切换按钮 |
| FileItem.tsx | `file-item` | 文件/项目卡片（网格+列表视图） |
| MembersModal.tsx | `invite-member-btn` | 添加成员按钮 |
| MembersModal.tsx | `member-role-select` | 成员角色选择 |
| ProjectRolesModal.tsx | `create-role-btn` | 新建角色按钮 |
| Gallery.tsx | `gallery-search` | 图库搜索框 |
| Gallery.tsx | `gallery-categories` | 图库分类选择器 |
| Gallery.tsx | `gallery-item-actions` | 图库项目操作按钮 |
| AddToGalleryModal.tsx | `gallery-category-select` | 添加到图库分类选择 |
| AddToGalleryModal.tsx | `gallery-submit-btn` | 添加到图库提交按钮 |
| ExternalReferenceModal.tsx | `xref-list` | 外部参照列表 |
| ExternalReferenceModal.tsx | `xref-actions` | 外部参照操作按钮 |
| CollaborateSidebar.tsx | `collaborators-panel` | 协作者面板 |
| SidebarContainer.tsx | `sidebar-gallery` | 侧边栏图库入口 |
| Layout.tsx | `sidebar-roles` | 侧边栏角色权限入口 |
| RoleManagement.tsx | `role-list` | 角色列表 |

**无法添加 data-tour 的元素及原因：**

| 元素 | 原因 | 处理建议 |
|------|------|----------|
| `cad-editor-toolbar` | MxCAD 库渲染，非 React 组件 | 使用 fallbackContent 居中显示提示 |
| `annotation-btn` | MxCAD 库渲染 | 使用 fallbackContent |
| `xref-panel-btn` | MxCAD 库渲染 | 使用 fallbackContent |
| `project-settings-btn` | 实际是右键菜单项，非独立按钮 | 使用 file-item + fallbackContent |
| `file-context-menu` | 动态生成的右键菜单 | 引导步骤指向 file-item |
| `context-menu-add-gallery` | 右键菜单项 | 引导步骤指向 file-item + 说明操作 |
| `context-menu-version` | 右键菜单项 | 引导步骤指向 file-item + 说明操作 |
| `gallery-tags-input` | 功能未实现 | 步骤中移除或使用 fallbackContent |
| `gallery-description` | 功能未实现 | 步骤中移除或使用 fallbackContent |
| `role-permissions` | 权限配置弹窗需动态触发 | 使用 fallbackContent 或跳过 |

## 1. 概述

### 1.1 目标

为 CloudCAD 实现自研的用户引导系统，帮助用户学习和掌握系统中的复杂业务流程。

### 1.2 核心需求

| 项目 | 决策 |
|------|------|
| 引导类型 | 新手引导（复杂业务流程教程） |
| 触发场景 | 首次登录提示 + 引导中心按需触发 |
| 存储方式 | localStorage |
| 展示形式 | 高亮遮罩 + 提示气泡 |
| 内容组织 | 引导中心模式（集中入口） |
| 实现方式 | 自研轻量组件 |

## 2. 功能范围

### 2.1 引导流程列表（10个）

| 优先级 | ID | 名称 | 步骤数 | 类别 |
|--------|-----|------|--------|------|
| P0 | file-upload | 文件上传与管理 | 5 | 项目管理 |
| P0 | project-members | 项目成员管理 | 4 | 项目管理 |
| P1 | add-to-gallery | 添加图纸到图库 | 6 | 图库管理 |
| P1 | project-roles | 项目角色管理 | 4 | 项目管理 |
| P2 | collaboration | 协作功能 | 3 | 协作功能 |
| P2 | external-reference | 外部参照管理 | 4 | 项目管理 |
| P2 | gallery-manage | 图库浏览与管理 | 4 | 图库管理 |
| P3 | version-history | 版本历史查看 | 3 | 项目管理 |
| P3 | system-roles | 系统角色管理 | 4 | 系统管理 |
| P3 | project-create | 项目管理 | 3 | 项目管理 |

### 2.2 排除范围

以下内容不在本次引导范围内：
- 用户注册/登录流程（常识性操作）
- 密码重置流程
- 邮箱绑定流程
- 基础 UI 操作（如侧边栏展开/收起）

## 3. 架构设计

### 3.1 文件结构

```
src/
├── components/
│   ├── tour/                          # 引导模块（新增）
│   │   ├── TourOverlay.tsx            # 高亮遮罩组件
│   │   ├── TourTooltip.tsx            # 引导提示气泡
│   │   ├── TourCenter.tsx             # 引导中心弹窗
│   │   ├── TourStartModal.tsx         # 首次登录引导提示
│   │   └── index.ts                   # 导出
│   └── Layout.tsx                     # 添加引导入口（修改）
├── contexts/
│   └── TourContext.tsx                # 引导状态管理（新增）
├── hooks/
│   └── useTour.ts                     # 引导 Hook（新增）
├── config/
│   └── tourGuides.ts                  # 引导流程配置（新增）
└── types/
    └── tour.ts                        # 引导类型定义（新增）
```

### 3.2 组件职责

| 组件 | 职责 |
|------|------|
| TourOverlay | 全屏遮罩层，高亮目标元素，处理点击事件 |
| TourTooltip | 引导提示气泡，显示步骤信息和操作按钮 |
| TourCenter | 引导中心弹窗，展示所有引导流程列表 |
| TourStartModal | 首次登录时的引导提示弹窗 |
| TourContext | 引导状态管理（当前引导、步骤、完成状态） |
| useTour | 提供引导操作的 Hook |

### 3.3 Context 提供层级

TourProvider 应放置在 App.tsx 中，与 RuntimeConfigProvider 同级：

```tsx
// App.tsx
import { TourProvider } from './contexts/TourContext';

function App() {
  return (
    <Router>
      <RuntimeConfigProvider>
        <TourProvider>
          <AppContent />
        </TourProvider>
      </RuntimeConfigProvider>
    </Router>
  );
}
```

这样可以确保：
- 引导状态在所有页面可用
- 引导遮罩层在所有组件之上（包括 Layout）
- 可在 CAD 编辑器中恢复引导状态

## 4. 数据结构

### 4.1 类型定义

```typescript
// types/tour.ts

/** 跳过条件类型（声明式配置，支持序列化） */
interface SkipCondition {
  /** 条件类型 */
  type: 'element-not-exists' | 'element-count-zero' | 'feature-disabled' | 'custom';
  /** 
   * 目标选择器
   * - type=element-not-exists: 检查元素是否存在
   * - type=element-count-zero: 检查元素数量是否为 0
   */
  selector?: string;
  /** 功能开关名称（type=feature-disabled 时使用） */
  featureFlag?: string;
  /** 自定义条件函数（仅运行时使用，不参与序列化） */
  customCheck?: () => boolean;
}

/** 引导步骤 */
interface TourStep {
  /** 目标元素选择器（data-tour 属性值） */
  target: string;
  /** 步骤标题 */
  title: string;
  /** 步骤描述 */
  content: string;
  /** 气泡位置 */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** 跨页面时跳转的路由（支持动态参数，如 /cad-editor/:fileId） */
  route?: string;
  /** 
   * 元素等待策略
   * - number: 超时时间（ms），超时后执行 skipCondition 或跳过
   * - 'auto': 使用 MutationObserver 自动检测，最长等待 5 秒
   */
  waitForElement?: number | 'auto';
  /** 
   * 跳过条件（声明式配置）
   * 当条件满足时自动跳过此步骤
   */
  skipCondition?: SkipCondition;
  /** 
   * 当目标元素不存在时显示的替代内容
   * 设置后，即使元素不存在也会显示提示气泡（居中显示）
   */
  fallbackContent?: string;
}

/** 引导流程 */
interface TourGuide {
  /** 唯一标识 */
  id: string;
  /** 流程名称 */
  name: string;
  /** 流程描述 */
  description: string;
  /** 分类 */
  category: '项目管理' | '图库管理' | '协作功能' | '系统管理';
  /** 步骤列表 */
  steps: TourStep[];
  /** 预计时长 */
  estimatedTime: string;
  /** 
   * 动态路由参数（用于跨页面引导）
   * 如 { fileId: 'xxx' }，用于替换 route 中的 :fileId 占位符
   */
  routeParams?: Record<string, string>;
}

/** 引导存储状态 */
interface TourStorage {
  /** 已完成的引导 ID 列表 */
  completedGuides: string[];
  /** 当前进行中的引导 ID */
  currentGuide: string | null;
  /** 当前步骤索引 */
  currentStep: number;
  /** 是否关闭了首次登录提示 */
  dismissed: boolean;
}

/** 引导上下文状态 */
interface TourState {
  /** 是否正在引导中 */
  isActive: boolean;
  /** 当前引导流程 */
  currentGuide: TourGuide | null;
  /** 当前步骤索引 */
  currentStep: number;
  /** 所有引导流程 */
  guides: TourGuide[];
  /** 已完成的引导 ID 列表 */
  completedGuides: string[];
}
```

### 4.2 localStorage 存储

- 键名：`cloudcad_tour_state`
- 初始值：
  ```json
  {
    "completedGuides": [],
    "currentGuide": null,
    "currentStep": 0,
    "dismissed": false
  }
  ```

## 5. 组件设计

### 5.1 TourOverlay

**职责**：全屏遮罩层，高亮当前步骤的目标元素。

**实现要点**：
1. 使用 `box-shadow` 实现高亮效果（比 clip-path 兼容性更好）
2. 监听 `resize` 和 `scroll` 事件，实时更新高亮位置
3. 目标元素自动滚动到视口内
4. 点击遮罩层不关闭引导（需点击"跳过"按钮）
5. ESC 键可退出引导
6. 支持自定义滚动容器（非 window 滚动）
7. 处理目标元素隐藏状态

**获取滚动容器**：
```typescript
/**
 * 获取元素的最近滚动容器
 * @param element 目标元素
 * @returns 滚动容器元素，如果没有则返回 document.body
 */
function getScrollParent(element: HTMLElement): HTMLElement | Document {
  const style = getComputedStyle(element);
  const excludeStaticParent = style.position === 'absolute';
  const overflowRegex = /(auto|scroll)/;

  let parent = element.parentElement;

  while (parent) {
    const parentStyle = getComputedStyle(parent);
    
    // 跳过静态定位的父元素（当目标元素为 absolute 时）
    if (excludeStaticParent && parentStyle.position === 'static') {
      parent = parent.parentElement;
      continue;
    }

    // 检查 overflow 属性
    if (overflowRegex.test(parentStyle.overflow + parentStyle.overflowY + parentStyle.overflowX)) {
      return parent;
    }

    parent = parent.parentElement;
  }

  return document.body;
}
```

**元素可见性检查**：
```typescript
/**
 * 检查元素是否可见
 * @param element 目标元素
 * @returns 是否可见
 */
function isElementVisible(element: HTMLElement): boolean {
  // 检查 display 和 visibility
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // 检查 opacity
  if (parseFloat(style.opacity) === 0) {
    return false;
  }

  // 检查元素是否在视口内（至少部分可见）
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  // 检查是否被祖先元素的 overflow:hidden 裁剪
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const parentStyle = getComputedStyle(parent);
    if (parentStyle.overflow === 'hidden') {
      const parentRect = parent.getBoundingClientRect();
      // 检查元素是否完全在父元素外部
      if (
        rect.bottom < parentRect.top ||
        rect.top > parentRect.bottom ||
        rect.right < parentRect.left ||
        rect.left > parentRect.right
      ) {
        return false;
      }
    }
    parent = parent.parentElement;
  }

  return true;
}
```

**滚动到目标元素**：
```typescript
function scrollIntoView(element: HTMLElement): void {
  // 先检查可见性
  if (!isElementVisible(element)) {
    // 元素不可见，可能需要展开父容器等操作
    console.warn('[Tour] Target element is not visible');
    return;
  }

  // 检查元素是否在自定义滚动容器内
  const scrollParent = getScrollParent(element);
  
  if (scrollParent === document.body || scrollParent === document.documentElement) {
    // window 滚动
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    // 自定义滚动容器
    const container = scrollParent as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = elementRect.top - containerRect.top + container.scrollTop - containerRect.height / 2;
    container.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }
}
```

**高亮实现方式**：
```css
.tour-highlight {
  position: relative;
  z-index: 10003;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
}
```

**z-index 层级规划**：
- 项目现有层级：Modal(50)、Drawer(900)、Toast(1100)
- CAD 编辑器层级：CADEditorDirect(9999)
- 引导层级：Overlay(10002)、Tooltip(10003)
- 确保引导组件在所有现有组件之上（包括 CAD 编辑器）

### 5.2 TourTooltip

**职责**：显示当前步骤的提示信息和操作按钮。

**实现要点**：
1. 使用 `getBoundingClientRect()` 计算目标元素位置
2. 根据 `placement` 属性定位气泡
3. 自动调整位置避免超出视口
4. 显示内容：步骤标题、描述、进度（如 2/5）

**Props**：
```typescript
interface TourTooltipProps {
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  targetRect: DOMRect;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}
```

### 5.3 TourCenter

**职责**：引导中心弹窗，展示所有引导流程。

**实现要点**：
1. 分类展示引导流程
2. 显示每个流程的完成状态（已完成/未开始）
3. 支持搜索筛选
4. 点击流程卡片开始引导

**布局**：
```
┌─────────────────────────────────────────┐
│  引导中心                    [搜索框]    │
├─────────────────────────────────────────┤
│  项目管理 (3)                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │文件上传  │ │成员管理  │ │角色管理  │   │
│  │✓ 已完成  │ │○ 未开始  │ │○ 未开始  │   │
│  └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────┤
│  图库管理 (2)                           │
│  ...                                    │
└─────────────────────────────────────────┘
```

**组件复用**：
TourCenter 复用现有的 Modal 组件，设置 size="full" 实现大尺寸弹窗：

```tsx
import Modal from '@/components/ui/Modal';

<TourCenter>
  <Modal 
    isOpen={isOpen} 
    onClose={onClose} 
    title="引导中心" 
    size="full" 
    zIndex={10002}
  >
    {/* 引导流程列表内容 */}
  </Modal>
</TourCenter>
```

### 5.4 TourStartModal

**职责**：首次登录时提示用户有引导功能可用。

**触发条件**：
- 用户登录成功后进入 Layout 组件
- localStorage 中 `dismissed` 为 false
- 判定逻辑：纯前端实现，不依赖后端

**实现说明**：
```typescript
// 在 TourProvider 中
useEffect(() => {
  const state = loadTourState();
  if (!state.dismissed && state.completedGuides.length === 0) {
    // 首次使用，显示引导提示
    setShowStartModal(true);
  }
}, []);
```

**交互**：
- "立即查看"：打开引导中心，设置 `dismissed: true`
- "稍后再说"：关闭弹窗，设置 `dismissed: true`

## 6. 入口位置

在 `Layout.tsx` 的侧边栏底部，用户信息区域上方添加引导入口：

```
侧边栏布局：
┌─────────────────────────┐
│      Logo 区域           │
├─────────────────────────┤
│      导航菜单            │
│         ...             │
├─────────────────────────┤
│      存储空间            │
├─────────────────────────┤
│  [?] 帮助引导（新增）     │  ← 新增入口按钮
├─────────────────────────┤
│      用户信息            │
└─────────────────────────┘
```

**入口按钮样式**：
- 图标：HelpCircle（直接导入：`import HelpCircle from 'lucide-react/dist/esm/icons/help-circle'`）
- 文字："帮助引导"
- 点击打开引导中心弹窗

**引导状态指示器**：
- 当有引导进行中时，入口按钮显示小圆点指示器
- 鼠标悬停显示提示："当前有引导进行中"

```tsx
import HelpCircle from 'lucide-react/dist/esm/icons/help-circle';

// ...

<button className="flex items-center gap-2 ...">
  <div className="relative">
    <HelpCircle size={18} />
    {isActive && (
      <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
    )}
  </div>
  <span>帮助引导</span>
</button>
```

## 7. 元素标记规范

在需要引导的元素上添加 `data-tour` 属性：

```tsx
// 示例
<Button data-tour="upload-btn">上传文件</Button>
<div data-tour="file-item">...</div>
<MenuItem data-tour="context-menu-add-gallery">添加到图库</MenuItem>
```

**命名规范**：
- 使用 kebab-case
- 语义化命名，如：`upload-btn`、`file-item`、`member-add-btn`
- 全局唯一

## 8. 跨页面流程处理

部分引导流程涉及页面跳转，处理策略：

### 8.1 路由跳转机制

1. **步骤中指定 `route` 属性**：引导系统在进入该步骤前自动跳转
2. **动态路由支持**：`route` 支持参数占位符，如 `/cad-editor/:fileId`
3. **路由参数传递**：引导上下文中保存必要的路由参数

**动态路由参数处理流程**：

```typescript
// 1. 参数来源优先级
type RouteParamSource = 
  | 'guide-config'   // 优先级最高：TourGuide.routeParams
  | 'current-route'  // 次优先级：当前路由中已存在的参数
  | 'user-action';   // 最低优先级：用户操作过程中动态获取

// 2. 参数解析器
interface RouteParamResolver {
  /** 从引导配置获取参数 */
  fromGuideConfig(guide: TourGuide): Record<string, string>;
  /** 从当前路由获取参数 */
  fromCurrentRoute(): Record<string, string>;
  /** 合并参数（优先级高的覆盖低的） */
  merge(...sources: Record<string, string>[]): Record<string, string>;
}

// 3. 参数解析实现
function resolveRouteParams(
  guide: TourGuide,
  route: string
): Record<string, string> {
  const result: Record<string, string> = {};
  
  // 提取路由中的占位符
  const placeholders = route.match(/:(\w+)/g)?.map(s => s.slice(1)) || [];
  
  // 从当前路由获取已存在的参数
  const currentParams = extractCurrentRouteParams(placeholders);
  Object.assign(result, currentParams);
  
  // 从引导配置获取参数（覆盖当前路由参数）
  if (guide.routeParams) {
    Object.assign(result, guide.routeParams);
  }
  
  // 验证所有占位符都有对应值
  const missingParams = placeholders.filter(p => !result[p]);
  if (missingParams.length > 0) {
    console.warn(`[Tour] Missing route params: ${missingParams.join(', ')}`);
  }
  
  return result;
}

// 4. 替换路由占位符
function buildRoute(route: string, params: Record<string, string>): string {
  let result = route;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}

// 5. 从当前路由提取参数
function extractCurrentRouteParams(placeholders: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const currentPath = window.location.pathname;
  
  // 匹配常见路由模式
  // 例如：/projects/:projectId/files/:fileId
  const commonPatterns = [
    /\/projects\/([^/]+)/,       // projectId
    /\/files\/([^/]+)/,          // fileId
    /\/cad-editor\/([^/]+)/,     // fileId
    /\/gallery\/([^/]+)/,        // galleryId
  ];
  
  // 根据占位符名称映射提取
  if (placeholders.includes('projectId')) {
    const match = currentPath.match(/\/projects\/([^/]+)/);
    if (match) result.projectId = match[1];
  }
  
  if (placeholders.includes('fileId')) {
    const match = currentPath.match(/\/(files|cad-editor)\/([^/]+)/);
    if (match) result.fileId = match[2];
  }
  
  return result;
}
```

**使用示例**：

```typescript
// 引导配置
const guide: TourGuide = {
  id: 'cad-editor-basics',
  routeParams: { projectId: 'default-project' },
  steps: [
    {
      target: 'file-list',
      route: '/projects/:projectId/files',
      // 最终跳转: /projects/default-project/files
    },
    {
      target: 'cad-toolbar',
      route: '/cad-editor/:fileId',
      // fileId 需要在步骤执行时动态获取
    },
  ],
};

// 步骤执行时动态设置参数
function executeStep(step: TourStep, guide: TourGuide) {
  if (step.route) {
    let params = resolveRouteParams(guide, step.route);
    
    // 如果是 cad-editor 步骤，需要动态获取 fileId
    if (step.route.includes(':fileId') && !params.fileId) {
      // 从用户选择或上下文获取
      params.fileId = getSelectedFileId() || getLastOpenedFileId();
    }
    
    const finalRoute = buildRoute(step.route, params);
    navigate(finalRoute);
  }
}
```

### 8.2 元素等待策略

**完整实现（包含可见性检查）**：

```typescript
interface WaitForElementOptions {
  /** 超时时间（ms） */
  timeout: number;
  /** 检测策略 */
  strategy: 'polling' | 'observer';
  /** 是否要求元素可见（默认 true） */
  requireVisible?: boolean;
}

interface WaitForElementResult {
  /** 找到的元素 */
  element: HTMLElement | null;
  /** 未找到的原因 */
  reason?: 'timeout' | 'not-visible' | 'not-exists';
}

/**
 * 等待目标元素出现并可见
 * @param selector 元素选择器
 * @param options 配置选项
 */
async function waitForTargetElement(
  selector: string,
  options: WaitForElementOptions
): Promise<WaitForElementResult> {
  const { timeout, strategy, requireVisible = true } = options;
  
  // 检查元素的辅助函数
  const checkElement = (): HTMLElement | null => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return null;
    
    // 如果不要求可见，直接返回
    if (!requireVisible) return el;
    
    // 检查可见性
    return isElementVisible(el) ? el : null;
  };

  if (strategy === 'observer') {
    return new Promise((resolve) => {
      let found = false;
      
      const observer = new MutationObserver(() => {
        const el = checkElement();
        if (el) {
          found = true;
          observer.disconnect();
          resolve({ element: el });
        }
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
      
      // 立即检查一次（元素可能已存在）
      const existingEl = checkElement();
      if (existingEl) {
        found = true;
        observer.disconnect();
        resolve({ element: existingEl });
        return;
      }
      
      // 超时处理
      setTimeout(() => {
        if (!found) {
          observer.disconnect();
          const el = document.querySelector<HTMLElement>(selector);
          resolve({
            element: null,
            reason: el ? 'not-visible' : 'timeout'
          });
        }
      }, timeout);
    });
  } else {
    // 轮询检测
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = checkElement();
      if (el) return { element: el };
      await new Promise(r => setTimeout(r, 100));
    }
    
    // 超时后检查原因
    const el = document.querySelector<HTMLElement>(selector);
    return {
      element: null,
      reason: el ? 'not-visible' : 'timeout'
    };
  }
}

/**
 * 检查元素是否可见（复用 5.1 节实现）
 */
function isElementVisible(element: HTMLElement): boolean {
  // 参见 5.1 节完整实现
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  if (parseFloat(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
```

### 8.3 目标元素不存在时的降级处理

**声明式跳过条件检查**：

```typescript
/**
 * 评估跳过条件
 * @param condition 声明式跳过条件
 * @returns 是否应该跳过
 */
function evaluateSkipCondition(condition: SkipCondition): boolean {
  switch (condition.type) {
    case 'element-not-exists':
      if (!condition.selector) return false;
      return !document.querySelector(condition.selector);
    
    case 'element-count-zero':
      if (!condition.selector) return false;
      return document.querySelectorAll(condition.selector).length === 0;
    
    case 'feature-disabled':
      if (!condition.featureFlag) return false;
      // 检查功能开关状态
      return !isFeatureEnabled(condition.featureFlag);
    
    case 'custom':
      // 自定义检查函数（运行时注入）
      return condition.customCheck?.() ?? false;
    
    default:
      return false;
  }
}

/**
 * 处理步骤执行
 */
async function handleStep(step: TourStep, guide: TourGuide): Promise<void> {
  const timeout = typeof step.waitForElement === 'number' ? step.waitForElement : 5000;
  const strategy = step.waitForElement === 'auto' ? 'observer' : 'polling';
  
  const result = await waitForTargetElement(step.target, { 
    timeout,
    strategy,
    requireVisible: true
  });
  
  if (!result.element) {
    // 1. 检查声明式跳过条件
    if (step.skipCondition && evaluateSkipCondition(step.skipCondition)) {
      console.log(`[Tour] Step skipped by condition: ${step.skipCondition.type}`);
      nextStep();
      return;
    }
    
    // 2. 检查是否有替代内容
    if (step.fallbackContent) {
      // 居中显示替代提示
      showCenteredTooltip(step.title, step.fallbackContent);
      return;
    }
    
    // 3. 根据失败原因提供不同提示
    const reasonMessage = {
      'timeout': '元素加载超时',
      'not-visible': '目标元素当前不可见',
      'not-exists': '目标元素不存在'
    };
    
    showToast(`${reasonMessage[result.reason || 'timeout']}，已自动跳过此步骤`);
    nextStep();
  } else {
    // 元素存在且可见，正常执行步骤
    highlightElement(result.element);
    showTooltip(result.element, step);
  }
}
```
```

### 8.4 状态持久化与恢复

跳转后从 localStorage 恢复引导状态：

```typescript
// 在 App.tsx 或 Layout.tsx 中
useEffect(() => {
  const tourState = loadTourState();
  if (tourState.currentGuide) {
    // 有进行中的引导，延迟 500ms 后恢复
    setTimeout(() => {
      resumeTour(tourState.currentGuide, tourState.currentStep);
    }, 500);
  }
}, []);
```

### 8.5 示例（修正后）

```typescript
{
  target: 'sidebar-gallery-tab',
  title: '图库侧边栏',
  content: '打开图纸后，侧边栏会显示图库内容...',
  route: '/projects',  // 先跳转到项目列表
  waitForElement: 'auto',  // 自动检测元素
  // 使用声明式跳过条件
  skipCondition: {
    type: 'feature-disabled',
    featureFlag: 'gallery'
  },
}
```

**更多示例**：

```typescript
// 示例 1：元素不存在时跳过
{
  target: 'file-item',
  title: '选择文件',
  content: '点击文件进行操作',
  skipCondition: {
    type: 'element-count-zero',
    selector: '[data-tour="file-item"]'
  },
  fallbackContent: '当前项目暂无文件，请先上传文件后再继续引导'
}

// 示例 2：使用自定义检查函数
{
  target: 'advanced-settings',
  title: '高级设置',
  content: '配置高级选项...',
  skipCondition: {
    type: 'custom',
    customCheck: () => {
      // 运行时注入的检查逻辑
      return !window.currentUser?.isPremium;
    }
  },
  fallbackContent: '高级设置仅对高级用户开放'
}
```

### 8.6 CAD 编辑器场景处理

CADEditorDirect 作为独立全局组件存在（z-index: 9999），引导组件需特殊处理：

1. **z-index 调整**：引导组件层级需高于 CAD 编辑器（见 5.1 节 z-index 规划）
2. **元素标记兼容**：CAD 编辑器内的元素由 mxcad-app 渲染，需确认是否支持 `data-tour` 属性
3. **侧边栏引导**：`SidebarContainer` 组件在 CAD 编辑器内渲染，可正常添加 `data-tour` 属性
4. **跨编辑器引导**：若引导步骤需在 CAD 编辑器和主界面间切换，需额外处理状态恢复

**CAD 编辑器内可引导的元素**：

| 元素 | data-tour 值 | 说明 |
|------|-------------|------|
| 侧边栏容器 | `cad-sidebar` | SidebarContainer 组件 |
| 图库标签 | `cad-gallery-tab` | 侧边栏图库标签 |
| 图块标签 | `cad-block-tab` | 侧边栏图块标签 |
| 外部参照面板 | `cad-xref-panel` | 外部参照管理面板 |

**限制说明**：
- CAD 编辑器画布区域由 mxcad-app 控制，无法添加 `data-tour` 属性
- 如需引导画布区域操作，应使用 `fallbackContent` 提供文字说明

## 9. 引导流程配置示例

```typescript
// config/tourGuides.ts

export const tourGuides: TourGuide[] = [
  // ==================== P0 级别 ====================
  
  {
    id: 'file-upload',
    name: '文件上传与管理',
    description: '学习如何上传图纸文件、创建文件夹、移动和删除文件',
    category: '项目管理',
    estimatedTime: '4分钟',
    steps: [
      {
        target: 'projects-nav',
        title: '进入项目管理',
        content: '首先，点击左侧导航栏的"项目管理"进入项目列表页面',
        placement: 'right',
      },
      {
        target: 'project-card',
        title: '选择或创建项目',
        content: '点击已有项目卡片进入，或点击"新建项目"创建一个新项目',
        placement: 'bottom',
        route: '/projects',
        waitForElement: 'auto',
      },
      {
        target: 'upload-btn',
        title: '上传文件',
        content: '点击工具栏的"上传"按钮，可以上传 DWG/DXF 格式的图纸文件。支持拖拽上传和点击选择文件。',
        placement: 'bottom',
        waitForElement: 'auto',
      },
      {
        target: 'new-folder-btn',
        title: '创建文件夹',
        content: '点击"新建文件夹"按钮，可以创建文件夹来组织管理图纸文件',
        placement: 'bottom',
      },
      {
        target: 'file-item',
        title: '文件管理操作',
        content: '右键点击文件，可以进行重命名、移动、删除、下载等操作。也可以拖拽文件到文件夹中进行移动。',
        placement: 'right',
        skipCondition: {
          type: 'element-count-zero',
          selector: '[data-tour="file-item"]'
        },
        fallbackContent: '请先上传一个图纸文件，然后继续学习文件管理功能',
      },
    ],
  },

  {
    id: 'project-members',
    name: '项目成员管理',
    description: '学习如何邀请新成员加入项目、设置成员权限、移除成员',
    category: '项目管理',
    estimatedTime: '3分钟',
    steps: [
      {
        target: 'projects-nav',
        title: '进入项目管理',
        content: '点击左侧导航栏的"项目管理"进入项目列表',
        placement: 'right',
      },
      {
        target: 'project-card',
        title: '选择项目',
        content: '点击要管理成员的项目卡片',
        placement: 'bottom',
        route: '/projects',
        waitForElement: 'auto',
      },
      {
        target: 'project-settings-btn',
        title: '打开项目设置',
        content: '点击项目工具栏的"设置"按钮，打开项目设置面板',
        placement: 'bottom',
      },
      {
        target: 'member-management-tab',
        title: '成员管理',
        content: '在设置面板中选择"成员"标签页，可以查看当前项目所有成员。点击"邀请成员"按钮邀请新成员加入，可以设置成员的角色权限（管理员/编辑者/查看者）。',
        placement: 'left',
      },
    ],
  },

  // ==================== P1 级别 ====================
  
  {
    id: 'add-to-gallery',
    name: '添加图纸到图库',
    description: '学习如何将项目中的图纸添加到图库，方便后续复用',
    category: '图库管理',
    estimatedTime: '3分钟',
    steps: [
      {
        target: 'projects-nav',
        title: '进入项目管理',
        content: '首先，点击左侧导航栏的"项目管理"进入项目列表',
        placement: 'right',
      },
      {
        target: 'project-card',
        title: '选择项目',
        content: '点击要操作的项目卡片，进入项目文件列表',
        placement: 'bottom',
        route: '/projects',  
        waitForElement: 'auto',
      },
      {
        target: 'file-item',
        title: '找到图纸文件',
        content: '在文件列表中找到要添加到图库的图纸文件',
        placement: 'right',
        skipCondition: {
          type: 'element-count-zero',
          selector: '[data-tour="file-item"]'
        },
        fallbackContent: '当前项目暂无文件，请先上传一个图纸文件后再继续引导',
      },
      {
        target: 'file-context-menu',
        title: '打开右键菜单',
        content: '右键点击图纸文件，打开操作菜单',
        placement: 'bottom',
      },
      {
        target: 'context-menu-add-gallery',
        title: '选择添加到图库',
        content: '在菜单中选择"添加到图库"选项',
        placement: 'bottom',
      },
      {
        target: 'gallery-type-select',
        title: '选择图库类型',
        content: '在弹窗中选择"图纸库"或"图块库"，然后选择分类',
        placement: 'left',
      },
    ],
  },
  
  {
    id: 'project-roles',
    name: '项目角色管理',
    description: '学习如何创建和编辑项目角色，自定义权限配置',
    category: '项目管理',
    estimatedTime: '4分钟',
    steps: [
      {
        target: 'projects-nav',
        title: '进入项目管理',
        content: '点击左侧导航栏的"项目管理"',
        placement: 'right',
      },
      {
        target: 'project-card',
        title: '选择项目',
        content: '点击要配置角色的项目卡片',
        placement: 'bottom',
        route: '/projects',
        waitForElement: 'auto',
      },
      {
        target: 'project-settings-btn',
        title: '打开项目设置',
        content: '点击项目工具栏的"设置"按钮',
        placement: 'bottom',
      },
      {
        target: 'role-management-tab',
        title: '角色管理',
        content: '在设置面板中选择"角色"标签页。可以创建自定义角色，为角色分配具体的权限（如查看、编辑、下载、上传、删除等）。',
        placement: 'left',
      },
    ],
  },

  // ==================== P2 级别 ====================
  
  {
    id: 'collaboration',
    name: '协作功能',
    description: '学习如何与他人实时协作编辑图纸',
    category: '协作功能',
    estimatedTime: '2分钟',
    steps: [
      {
        target: 'projects-nav',
        title: '打开图纸',
        content: '进入项目后，双击图纸文件打开编辑器',
        placement: 'right',
        route: '/projects',
        waitForElement: 'auto',
      },
      {
        target: 'collaborators-panel',
        title: '查看协作者',
        content: '右上角显示当前正在编辑此图纸的其他用户头像，点击可以查看详细信息',
        placement: 'bottom',
      },
      {
        target: 'cursor-indicator',
        title: '实时光标',
        content: '其他用户的编辑位置会以不同颜色的光标显示，方便协同工作',
        placement: 'right',
        skipCondition: {
          type: 'element-count-zero',
          selector: '[data-tour="cursor-indicator"]'
        },
        fallbackContent: '当前没有其他用户正在编辑此图纸，邀请成员后可以看到实时协作效果',
      },
    ],
  },

  {
    id: 'external-reference',
    name: '外部参照管理',
    description: '学习如何添加和管理图纸的外部参照',
    category: '项目管理',
    estimatedTime: '3分钟',
    steps: [
      {
        target: 'cad-editor-canvas',
        title: '进入图纸编辑器',
        content: '打开任意图纸文件进入编辑器',
        placement: 'right',
        route: '/projects',
      },
      {
        target: 'xref-panel',
        title: '打开外部参照面板',
        content: '点击右侧工具栏的"外部参照"按钮打开管理面板',
        placement: 'left',
      },
      {
        target: 'xref-add-btn',
        title: '添加外部参照',
        content: '点击"添加参照"按钮，从项目文件或图库中选择要参照的图纸',
        placement: 'bottom',
      },
      {
        target: 'xref-list',
        title: '管理参照',
        content: '在参照列表中可以重新加载、卸载、绑定或移除外部参照',
        placement: 'left',
      },
    ],
  },

  {
    id: 'gallery-manage',
    name: '图库浏览与管理',
    description: '学习如何浏览图库内容、管理分类和删除图块',
    category: '图库管理',
    estimatedTime: '3分钟',
    steps: [
      {
        target: 'gallery-nav',
        title: '进入图库',
        content: '点击左侧导航栏的"图库"进入图库页面',
        placement: 'right',
      },
      {
        target: 'gallery-category-tree',
        title: '分类浏览',
        content: '左侧是分类树，点击分类可以筛选查看对应的图纸或图块',
        placement: 'right',
      },
      {
        target: 'gallery-search',
        title: '搜索功能',
        content: '在搜索框输入关键词，可以快速查找需要的图纸或图块',
        placement: 'bottom',
      },
      {
        target: 'gallery-item',
        title: '管理操作',
        content: '右键点击图库项目，可以移动分类、重命名或删除',
        placement: 'right',
        skipCondition: {
          type: 'element-count-zero',
          selector: '[data-tour="gallery-item"]'
        },
        fallbackContent: '图库暂无内容，请先添加图纸到图库',
      },
    ],
  },

  // ==================== P3 级别 ====================
  
  {
    id: 'version-history',
    name: '版本历史查看',
    description: '学习如何查看图纸的版本历史和恢复历史版本',
    category: '项目管理',
    estimatedTime: '2分钟',
    steps: [
      {
        target: 'file-item',
        title: '选择文件',
        content: '在项目文件列表中找到要查看历史的文件',
        placement: 'right',
        route: '/projects',
        skipCondition: {
          type: 'element-count-zero',
          selector: '[data-tour="file-item"]'
        },
        fallbackContent: '当前项目暂无文件',
      },
      {
        target: 'file-context-menu',
        title: '打开右键菜单',
        content: '右键点击文件，选择"版本历史"',
        placement: 'bottom',
      },
      {
        target: 'version-list',
        title: '查看和恢复',
        content: '在版本历史面板中可以查看所有历史版本，点击"恢复"可以将文件恢复到指定版本',
        placement: 'left',
      },
    ],
  },

  {
    id: 'system-roles',
    name: '系统角色管理',
    description: '学习如何管理系统级角色（需要管理员权限）',
    category: '系统管理',
    estimatedTime: '3分钟',
    steps: [
      {
        target: 'settings-nav',
        title: '进入系统设置',
        content: '点击左侧导航栏底部的"系统设置"（需要管理员权限）',
        placement: 'right',
        skipCondition: {
          type: 'custom',
          customCheck: () => !window.currentUser?.isAdmin
        },
        fallbackContent: '系统角色管理需要管理员权限',
      },
      {
        target: 'system-roles-nav',
        title: '角色管理',
        content: '在设置菜单中选择"角色管理"',
        placement: 'right',
      },
      {
        target: 'role-list',
        title: '角色列表',
        content: '查看所有系统角色，包括内置角色和自定义角色',
        placement: 'right',
      },
      {
        target: 'role-edit-btn',
        title: '编辑角色权限',
        content: '点击角色后的"编辑"按钮，可以修改角色的权限配置',
        placement: 'bottom',
      },
    ],
  },

  {
    id: 'project-create',
    name: '项目管理',
    description: '学习如何创建新项目、配置项目设置',
    category: '项目管理',
    estimatedTime: '2分钟',
    steps: [
      {
        target: 'projects-nav',
        title: '进入项目管理',
        content: '点击左侧导航栏的"项目管理"',
        placement: 'right',
      },
      {
        target: 'new-project-btn',
        title: '创建项目',
        content: '点击"新建项目"按钮，输入项目名称、描述，选择项目模板',
        placement: 'bottom',
        route: '/projects',
        waitForElement: 'auto',
      },
      {
        target: 'project-settings-btn',
        title: '项目设置',
        content: '进入项目后，可以点击设置按钮配置项目信息、成员权限、存储配额等',
        placement: 'bottom',
        skipCondition: {
          type: 'element-not-exists',
          selector: '[data-tour="project-settings-btn"]'
        },
        fallbackContent: '请先创建一个项目',
      },
    ],
  },
];
```

## 10. API 设计

### 10.1 TourContext

```typescript
interface TourContextValue {
  // 状态
  isActive: boolean;
  currentGuide: TourGuide | null;
  currentStep: number;
  guides: TourGuide[];
  completedGuides: string[];
  
  // 操作
  startTour: (guideId: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  openTourCenter: () => void;
  closeTourCenter: () => void;
  
  // 弹窗状态
  isTourCenterOpen: boolean;
  isStartModalOpen: boolean;
  dismissStartModal: () => void;
}
```

### 10.2 useTour Hook

```typescript
function useTour(): TourContextValue;
```

## 11. 主题支持

引导组件需要支持明暗主题切换：

| 元素 | 明亮模式 | 暗黑模式 |
|------|----------|----------|
| 遮罩背景 | rgba(0,0,0,0.5) | rgba(0,0,0,0.7) |
| 提示气泡 | 白色背景 | 深灰色背景 |
| 文字颜色 | 深色文字 | 浅色文字 |
| 按钮样式 | 使用现有 Button 组件 | 使用现有 Button 组件 |

## 12. 实现步骤

### Phase 1：基础框架
1. 创建类型定义 `types/tour.ts`
2. 创建 `TourContext` 和 `useTour` Hook
3. 实现 localStorage 持久化逻辑

### Phase 2：核心组件
4. 实现 `TourOverlay` 组件
5. 实现 `TourTooltip` 组件
6. 组合 Overlay 和 Tooltip

### Phase 3：引导中心
7. 实现 `TourCenter` 弹窗组件
8. 实现 `TourStartModal` 首次登录提示
9. 在 `Layout.tsx` 添加入口按钮

### Phase 4：流程配置
10. 创建 `tourGuides.ts` 配置文件
11. 为 10 个引导流程编写详细步骤

### Phase 5：元素标记
12. 在相关组件添加 `data-tour` 属性

### Phase 6：单元测试
13. 测试工具函数
    - `getScrollParent()` 测试
    - `isElementVisible()` 测试
    - `evaluateSkipCondition()` 测试
    - `resolveRouteParams()` 测试
    - `buildRoute()` 测试
14. 测试 Hook 逻辑
    - `useTour` 状态管理测试
    - localStorage 持久化测试
15. 测试组件渲染
    - `TourOverlay` 渲染测试
    - `TourTooltip` 定位测试
    - `TourCenter` 列表渲染测试

**测试文件结构**：
```
src/
├── components/tour/__tests__/
│   ├── TourOverlay.test.tsx
│   ├── TourTooltip.test.tsx
│   └── TourCenter.test.tsx
├── hooks/__tests__/
│   └── useTour.test.ts
└── utils/__tests__/
    └── tour.test.ts
```

## 13. 错误边界处理

### 13.1 组件级错误边界

引导组件使用 ErrorBoundary 包裹，防止单个引导流程异常影响整体应用：

```tsx
// components/tour/TourProvider.tsx
import { ErrorBoundary } from 'react-error-boundary';

function TourErrorFallback() {
  return null; // 引导失败时静默退出
}

export function TourProvider({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={TourErrorFallback}>
      <TourContext.Provider value={...}>
        {children}
        <TourOverlay />
        <TourCenter />
      </TourContext.Provider>
    </ErrorBoundary>
  );
}
```

### 13.2 引导流程容错

| 异常场景 | 处理方式 |
|----------|----------|
| 目标元素不存在 | 跳过步骤或显示 fallbackContent |
| 路由跳转失败 | 显示错误提示，结束引导 |
| localStorage 读写失败 | 静默失败，使用内存状态 |
| 连续跳过超过 3 步 | 提示用户环境不匹配，结束引导 |

### 13.3 错误日志

引导过程中的错误记录到控制台（开发环境）：

```typescript
function logTourError(error: Error, context: string) {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Tour] ${context}:`, error);
  }
}
```

## 14. 验收标准

1. **功能验收**
   - 引导中心能正确展示所有引导流程
   - 点击流程卡片能开始引导
   - 高亮遮罩正确定位目标元素
   - 提示气泡显示正确的步骤信息
   - 上一步/下一步/跳过功能正常
   - ESC 键可退出引导
   - 跨页面流程能正常工作
   - localStorage 正确存储完成状态

2. **UI 验收**
   - 高亮效果清晰美观
   - 提示气泡定位正确，不超出视口
   - 明暗主题切换正常
   - 响应式布局适配

3. **性能验收**
   - 滚动/resize 时高亮位置实时更新，无卡顿
   - 引导组件对页面性能无显著影响

4. **边界情况测试用例**

| 测试场景 | 预期行为 | 优先级 |
|----------|----------|--------|
| 目标元素 `display: none` | 跳过步骤或显示 fallbackContent | P0 |
| 目标元素 `visibility: hidden` | 跳过步骤或显示 fallbackContent | P0 |
| 目标元素 `opacity: 0` | 跳过步骤或显示 fallbackContent | P1 |
| 目标元素被 `overflow: hidden` 裁剪 | 正确检测并跳过 | P1 |
| 引导过程中浏览器刷新 | 恢复到上次步骤 | P0 |
| 引导过程中关闭标签页 | 下次打开恢复状态 | P1 |
| localStorage 不可用（隐私模式） | 使用内存状态，不崩溃 | P0 |
| 引导步骤数为 0 | 不启动引导，显示提示 | P2 |
| 步骤索引越界（手动修改 localStorage） | 重置到有效范围 | P2 |
| 动态路由参数缺失 | 显示警告，使用空字符串 | P1 |
| 路由跳转失败（网络错误） | 显示错误提示，结束引导 | P1 |
| 连续跳过超过 3 步 | 提示环境不匹配，结束引导 | P1 |
| 用户快速点击下一步 | 防抖处理，不跳过多个步骤 | P2 |
| 窗口 resize 过程中 | 高亮位置实时更新 | P1 |
| 目标元素在 iframe 内 | 跨域时无法高亮，跳过提示 | P2 |
| 多个引导同时启动（并发问题） | 只执行一个，其他排队 | P2 |
| ESC 键与 Modal 冲突 | ESC 优先关闭 Modal，不退出引导 | P1 |
| 移动端触摸事件 | 点击遮罩不关闭引导 | P2 |

**边界测试代码示例**：

```typescript
// 测试用例：元素隐藏状态
describe('TourOverlay - hidden elements', () => {
  it('should skip step when target has display:none', async () => {
    render(<div data-tour="test" style={{ display: 'none' }}>Hidden</div>);
    const result = await waitForTargetElement('[data-tour="test"]', {
      timeout: 1000,
      strategy: 'polling',
      requireVisible: true
    });
    expect(result.element).toBeNull();
    expect(result.reason).toBe('not-visible');
  });

  it('should show fallback content when element is hidden', () => {
    const step = {
      target: 'hidden-element',
      fallbackContent: '元素当前不可见'
    };
    // ... 验证 fallbackContent 显示
  });
});

// 测试用例：localStorage 不可用
describe('TourContext - storage unavailable', () => {
  beforeEach(() => {
    // 模拟 localStorage 不可用
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
  });

  it('should use in-memory state when localStorage fails', () => {
    const { result } = renderHook(() => useTour());
    act(() => {
      result.current.startTour('test-guide');
    });
    expect(result.current.isActive).toBe(true);
  });
});

// 测试用例：连续跳过
describe('Tour - consecutive skips', () => {
  it('should end tour after 3 consecutive skips', async () => {
    const guide = {
      id: 'test',
      steps: [
        { target: 'non-existent-1', skipCondition: { type: 'element-not-exists' } },
        { target: 'non-existent-2', skipCondition: { type: 'element-not-exists' } },
        { target: 'non-existent-3', skipCondition: { type: 'element-not-exists' } },
        { target: 'non-existent-4', skipCondition: { type: 'element-not-exists' } },
      ]
    };
    // ... 验证第 3 次跳过后引导结束
  });
});
```

## 15. 后续扩展

- 支持视频引导
- 支持后端存储引导状态（跨设备同步）
- 支持管理员自定义引导流程
- 引导流程使用统计
