# 用户引导功能设计文档

> 版本: 1.0.0
> 日期: 2026-03-23
> 状态: 草案

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

## 4. 数据结构

### 4.1 类型定义

```typescript
// types/tour.ts

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
  /** 跨页面时跳转的路由 */
  route?: string;
  /** 
   * 元素等待策略
   * - number: 超时时间（ms），超时后执行 skipCondition 或跳过
   * - 'auto': 使用 MutationObserver 自动检测，最长等待 5 秒
   */
  waitForElement?: number | 'auto';
  /** 
   * 跳过条件：当目标元素不存在或不可见时自动跳过
   * 返回 true 时跳过此步骤
   */
  skipCondition?: () => boolean;
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

**滚动到目标元素**：
```typescript
function scrollIntoView(element: Element): void {
  // 检查元素是否在自定义滚动容器内
  const scrollParent = getScrollParent(element);
  
  if (scrollParent === document.body) {
    // window 滚动
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    // 自定义滚动容器
    const containerRect = scrollParent.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = elementRect.top - containerRect.top + scrollParent.scrollTop - containerRect.height / 2;
    scrollParent.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }
}
```

**高亮实现方式**：
```css
.tour-highlight {
  position: relative;
  z-index: 10001;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
}
```

**z-index 层级规划**：
- 项目现有层级：Modal(1000)、Drawer(900)、Toast(1100)
- 引导层级：Overlay(10000)、Tooltip(10001)
- 确保引导组件在所有现有组件之上

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
- 图标：HelpCircle（lucide-react）
- 文字："帮助引导"
- 点击打开引导中心弹窗

**引导状态指示器**：
- 当有引导进行中时，入口按钮显示小圆点指示器
- 鼠标悬停显示提示："当前有引导进行中"

```tsx
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

### 8.2 元素等待策略

```typescript
// 等待策略实现
async function waitForTargetElement(
  selector: string, 
  options: { timeout: number; strategy: 'polling' | 'observer' }
): Promise<Element | null> {
  if (options.strategy === 'observer') {
    // 使用 MutationObserver 监听 DOM 变化
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      
      // 超时处理
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, options.timeout);
    });
  } else {
    // 轮询检测
    const startTime = Date.now();
    while (Date.now() - startTime < options.timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }
}
```

### 8.3 目标元素不存在时的降级处理

```typescript
async function handleStep(step: TourStep): Promise<void> {
  const element = await waitForTargetElement(step.target, { 
    timeout: typeof step.waitForElement === 'number' ? step.waitForElement : 5000,
    strategy: step.waitForElement === 'auto' ? 'observer' : 'polling'
  });
  
  if (!element) {
    // 检查是否设置了跳过条件
    if (step.skipCondition?.()) {
      nextStep();
      return;
    }
    
    // 检查是否有替代内容
    if (step.fallbackContent) {
      // 居中显示替代提示
      showCenteredTooltip(step.title, step.fallbackContent);
      return;
    }
    
    // 默认：提示用户并跳过
    showToast('当前页面状态不适合此步骤，已自动跳过');
    nextStep();
  }
}
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
  skipCondition: () => {
    // 如果侧边栏被禁用，跳过此步骤
    return !isGalleryFeatureEnabled();
  },
}
```

## 9. 引导流程配置示例

```typescript
// config/tourGuides.ts

export const tourGuides: TourGuide[] = [
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
        // 跳转到项目文件列表页面
        route: '/projects',  
        waitForElement: 'auto',
      },
      {
        target: 'file-item',
        title: '找到图纸文件',
        content: '在文件列表中找到要添加到图库的图纸文件',
        placement: 'right',
        skipCondition: () => {
          // 如果项目为空，提示用户先上传文件
          return document.querySelectorAll('[data-tour="file-item"]').length === 0;
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
  // ...其他 9 个引导流程
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

## 15. 后续扩展

- 支持视频引导
- 支持后端存储引导状态（跨设备同步）
- 支持管理员自定义引导流程
- 引导流程使用统计
