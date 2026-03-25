# 项目管理引导前置条件与完整流程设计

> 版本: 1.0.0
> 日期: 2026-03-24
> 状态: 设计中

## 1. 需求概述

### 1.1 问题背景

当前项目引导存在以下问题：
1. **引导流程分散**：项目管理相关的引导拆分成多个独立引导（project-create、project-members、project-roles），用户需要手动启动多个引导
2. **打开图纸方式**：CAD 文件默认在新标签页打开，引导模式下无法在同一流程中继续
3. **侧边栏状态**：CAD 编辑器侧边栏默认可能打开，干扰引导流程

### 1.2 目标

将项目管理完整流程整合为一个引导，实现：
- 从项目管理入口开始
- 完整覆盖：创建项目 → 角色管理 → 成员管理 → 创建目录 → 上传文件 → 添加图库 → 打开图纸 → 侧边栏功能

## 2. 完整引导流程设计

### 2.1 流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        项目管理完整引导流程                               │
└─────────────────────────────────────────────────────────────────────────┘

[首页仪表盘]
    │
    ▼
[步骤1] 点击侧边栏"项目管理" ─────────────────────────────────────────────►
    │
    ▼
[项目列表页]
    │
    ├─► [步骤2] 点击"新建项目"按钮
    │       │
    │       ▼
    │   [步骤3] 填写项目名称（交互模式）
    │       │
    │       ▼
    │   [步骤4] 填写项目描述（可选）
    │       │
    │       ▼
    │   [步骤5] 点击"创建"按钮（交互模式）
    │       │
    │       ▼
    │   [项目创建成功，自动进入项目]
    │
    ├─► [步骤6] 介绍列表/卡片模式切换
    │       │
    │       ▼
    │   [步骤7] 介绍项目编辑按钮
    │
    └─► [已有项目，继续以下流程]

    │
    ▼
[步骤8] 点击项目菜单按钮（三个点）────────────────────────────────────────►
    │
    ▼
[步骤9] 点击"角色管理"选项
    │
    ▼
[角色管理弹窗]
    │
    ├─► [步骤10] 点击"创建角色"按钮
    │       │
    │       ▼
    │   [步骤11] 填写角色名称（交互模式）
    │       │
    │       ▼
    │   [步骤12] 介绍权限配置
    │       │
    │       ▼
    │   [步骤13] 点击保存（交互模式）
    │
    └─► [步骤14] 介绍系统角色
            │
            ▼
        [步骤15] 关闭角色管理弹窗（交互模式）
    │
    ▼
[步骤16] 再次点击项目菜单按钮
    │
    ▼
[步骤17] 点击"成员管理"选项
    │
    ▼
[成员管理弹窗]
    │
    ├─► [步骤18] 点击"添加成员"按钮
    │       │
    │       ▼
    │   [步骤19] 输入成员用户名（交互模式，预填测试账号）
    │       │
    │       ▼
    │   [步骤20] 选择用户名
    │       │
    │       ▼
    │   [步骤21] 选择项目角色（交互模式）
    │       │
    │       ▼
    │   [步骤22] 点击添加按钮（交互模式）
    │
    └─► [步骤23] 关闭成员管理弹窗（交互模式）
    │
    ▼
[步骤24] 点击"进入项目"按钮（或点击项目卡片）
    │
    ▼
[项目文件列表页]
    │
    ├─► [步骤25] 点击"创建目录"按钮
    │       │
    │       ▼
    │   [步骤26] 输入目录名称（交互模式）
    │       │
    │       ▼
    │   [步骤27] 点击创建（交互模式）
    │       │
    │       ▼
    │   [步骤28] 双击进入目录（交互模式）
    │
    └─► [已在目录中，继续]
    │
    ▼
[步骤29] 点击"上传文件"按钮
    │
    ▼
[步骤30] 等待文件上传完成（轮询检测文件存在）
    │
    ▼
[文件已存在]
    │
    ├─► [步骤31] 右键点击文件
    │       │
    │       ▼
    │   [步骤32] 点击"添加到图库"
    │       │
    │       ▼
    │   [添加到图库弹窗]
    │       │
    │       ├─► [步骤33] 选择分类
    │       │       │
    │       │       ▼
    │       │   [步骤34] 点击"创建新分类"
    │       │       │
    │       │       ▼
    │       │   [步骤35] 输入分类名称（交互模式）
    │       │       │
    │       │       ▼
    │       │   [步骤36] 点击保存（交互模式）
    │       │       │
    │       │       ▼
    │       │   [步骤37] 选择刚创建的分类（交互模式）
    │       │       │
    │       │       ▼
    │       │   [步骤38] 点击添加按钮（交互模式）
    │
    └─► [步骤39] 介绍复制和移动功能
    │
    ▼
[步骤40] 点击打开图纸（引导模式下不新标签页打开）
    │
    ▼
[CAD 编辑器页面]
    │
    ├─► [步骤41] 介绍侧边栏（引导模式下侧边栏关闭）
    │       │
    │       ▼
    │   [步骤42] 点击侧边栏窄条中的"图纸库"按钮
    │       │
    │       ▼
    │   [步骤43] 介绍图纸库功能
    │       │
    │       ▼
    │   [步骤44] 介绍图块库功能（类似图纸库）
    │
    └─► [步骤45] 介绍"我的项目"
            │
            ▼
        [步骤46] 介绍"我的图纸"
    │
    ▼
[引导完成]
```

### 2.2 步骤详细配置

| 步骤编号 | 目标元素 | 标题 | 内容 | 模式 | 路由 |
|---------|---------|------|------|------|------|
| 1 | sidebar-projects | 进入项目管理 | 点击侧边栏的"项目管理"进入项目列表 | interactive | / |
| 2 | create-project-btn | 新建项目 | 点击"新建项目"按钮创建项目 | display | /projects |
| 3 | project-name-input | 项目名称 | 输入项目名称，如"我的第一个项目" | interactive | - |
| 4 | project-desc-input | 项目描述 | 填写项目描述（可选） | display | - |
| 5 | project-create-submit | 创建项目 | 点击"创建"按钮完成创建 | interactive | - |
| 6 | view-toggle | 视图切换 | 可以切换卡片模式和列表模式查看项目 | display | /projects |
| 7 | file-item-menu-btn | 项目操作 | 点击项目卡片的菜单按钮可进行编辑、归档等操作 | display | - |
| 8 | file-item-menu-btn | 打开菜单 | 点击项目菜单按钮 | interactive | - |
| 9 | menu-show-roles | 角色管理 | 点击"角色管理"选项 | interactive | - |
| 10 | create-role-btn | 创建角色 | 点击"创建角色"按钮创建自定义角色 | display | - |
| 11 | role-name-input | 角色名称 | 输入角色名称 | interactive | - |
| 12 | role-permissions | 权限配置 | 为角色配置具体的权限 | display | - |
| 13 | role-save-btn | 保存角色 | 点击保存完成创建 | interactive | - |
| 14 | system-roles-list | 系统角色 | 系统预置的角色可以直接使用 | display | - |
| 15 | modal-close-btn | 关闭弹窗 | 关闭角色管理弹窗 | interactive | - |
| 16 | file-item-menu-btn | 打开菜单 | 再次点击项目菜单按钮 | interactive | /projects |
| 17 | menu-show-members | 成员管理 | 点击"成员"选项 | interactive | - |
| 18 | invite-member-btn | 添加成员 | 点击"添加成员"按钮邀请新成员 | display | - |
| 19 | member-search-input | 搜索用户 | 输入要添加的用户名 | interactive | - |
| 20 | member-search-result | 选择用户 | 从搜索结果中选择用户 | interactive | - |
| 21 | member-role-select | 选择角色 | 为成员选择角色权限 | interactive | - |
| 22 | member-add-btn | 确认添加 | 点击添加按钮完成邀请 | interactive | - |
| 23 | modal-close-btn | 关闭弹窗 | 关闭成员管理弹窗 | interactive | - |
| 24 | file-item | 进入项目 | 点击项目进入文件管理 | interactive | - |
| 25 | create-folder-btn | 创建目录 | 点击"新建文件夹"按钮 | display | - |
| 26 | folder-name-input | 目录名称 | 输入文件夹名称 | interactive | - |
| 27 | folder-create-btn | 创建 | 点击创建按钮 | interactive | - |
| 28 | file-item-folder | 进入目录 | 双击进入刚创建的文件夹 | interactive | - |
| 29 | upload-btn | 上传文件 | 点击"上传文件"按钮上传 CAD 图纸 | display | - |
| 30 | file-item | 等待上传 | 等待文件上传完成... | display | - |
| 31 | file-item | 右键菜单 | 右键点击文件打开菜单 | interactive | - |
| 32 | context-menu-add-gallery | 添加到图库 | 选择"添加到图库"选项 | interactive | - |
| 33 | gallery-category-select | 选择分类 | 选择图纸分类 | display | - |
| 34 | create-category-btn | 创建分类 | 点击"创建新分类" | display | - |
| 35 | category-name-input | 分类名称 | 输入分类名称 | interactive | - |
| 36 | category-save-btn | 保存分类 | 点击保存 | interactive | - |
| 37 | category-item | 选择分类 | 选择刚创建的分类 | interactive | - |
| 38 | gallery-submit-btn | 确认添加 | 点击添加到图库 | interactive | - |
| 39 | file-item-menu-btn | 更多操作 | 右键菜单还支持复制和移动功能 | display | - |
| 40 | file-item | 打开图纸 | 点击打开 CAD 图纸文件 | interactive | - |
| 41 | cad-sidebar-trigger | 侧边栏 | 侧边栏包含图纸库、图块库等功能 | display | /cad-editor/:fileId |
| 42 | sidebar-gallery-btn | 图纸库 | 点击图纸库按钮 | interactive | - |
| 43 | gallery-panel | 图纸库功能 | 可以浏览和插入已添加的图纸 | display | - |
| 44 | sidebar-blocks-btn | 图块库 | 图块库功能类似，用于插入图块 | display | - |
| 45 | my-project-tab | 我的项目 | 可以快速访问项目中的图纸 | display | - |
| 46 | my-drawings-tab | 我的图纸 | 可以访问私人空间的图纸 | display | - |

## 3. 技术实现方案

### 3.1 引导模式全局状态

在 `TourContext` 中增加 `isTourMode` 状态，用于标识当前是否处于引导模式：

```typescript
// types/tour.ts
interface TourContextValue {
  // ... 现有属性
  /** 是否处于引导模式 */
  isTourMode: boolean;
}
```

### 3.2 文件打开逻辑修改

修改 `useFileSystemNavigation.ts` 中的 `handleFileOpen`：

```typescript
// hooks/file-system/useFileSystemNavigation.ts
const handleFileOpen = useCallback(
  (node: FileSystemNode) => {
    // ... 现有检查逻辑

    if (node.isFolder) {
      // 文件夹处理...
    } else {
      const cadExtensions = ['.dwg', '.dxf'];
      if (node.extension && cadExtensions.includes(node.extension.toLowerCase())) {
        // 检查是否处于引导模式
        const isTourMode = localStorage.getItem('cloudcad_tour_mode') === 'true';
        
        if (isTourMode) {
          // 引导模式：使用 navigate 在当前页面跳转
          const queryParams = new URLSearchParams();
          queryParams.set('nodeId', node.parentId || '');
          navigate(`/cad-editor/${node.id}?${queryParams.toString()}`);
        } else {
          // 正常模式：新标签页打开
          const queryParams = new URLSearchParams();
          queryParams.set('nodeId', node.parentId || '');
          const url = `/cad-editor/${node.id}?${queryParams.toString()}`;
          window.open(url, '_blank');
        }
      }
    }
  },
  [navigate, /* ... */]
);
```

### 3.3 CAD 编辑器侧边栏控制

修改 `useSidebarSettings.ts` 或 `SidebarContainer.tsx`：

```typescript
// components/sidebar/SidebarContainer.tsx
import { useTour } from '../../contexts/TourContext';

export const SidebarContainer: React.FC<SidebarContainerProps> = (props) => {
  const { isActive: isTourActive, currentGuide } = useTour();
  
  // 引导模式下侧边栏默认关闭
  useEffect(() => {
    if (isTourActive && currentGuide?.id === 'project-management-full') {
      setIsVisible(false);
    }
  }, [isTourActive, currentGuide]);
  
  // ... 其余代码
};
```

### 3.4 引导配置文件结构

```
src/config/tours/
├── index.ts                    # 导出入口
├── project-management-full.ts  # 新增：项目管理完整引导
├── project-management.ts       # 保留：独立子引导（可选）
├── gallery.ts
├── collaboration.ts
└── ...
```

## 4. 实现步骤

### Phase 1: 基础设施

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `types/tour.ts` | 添加 `isTourMode` 到 `TourContextValue` |
| 1.2 | `contexts/TourContext.tsx` | 实现 `isTourMode` 状态管理 |

### Phase 2: 文件打开逻辑

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `hooks/file-system/useFileSystemNavigation.ts` | 引导模式下使用 navigate |
| 2.2 | `pages/FileSystemManager.tsx` | 版本历史打开逻辑（如需要） |

### Phase 3: 侧边栏控制

| 任务 | 文件 | 说明 |
|------|------|------|
| 3.1 | `components/sidebar/SidebarContainer.tsx` | 引导模式下默认关闭 |
| 3.2 | `hooks/useSidebarSettings.ts` | 可选：添加强制关闭状态 |

### Phase 4: 引导配置

| 任务 | 文件 | 说明 |
|------|------|------|
| 4.1 | `config/tours/project-management-full.ts` | 创建完整引导配置 |
| 4.2 | `config/tours/index.ts` | 导出新引导 |

### Phase 5: 测试验证

| 任务 | 说明 |
|------|------|
| 5.1 | 使用 Chrome DevTools MCP 测试完整流程 |
| 5.2 | 验证各步骤元素定位正确 |
| 5.3 | 验证交互模式功能正常 |

## 5. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 步骤过多导致用户疲劳 | 高 | 设置合理的预计时间，允许用户跳过非必要步骤 |
| 动态内容定位失败 | 中 | 使用 `waitForElement` 和 `fallbackContent` |
| 用户操作与引导冲突 | 中 | 交互模式确保用户完成必要操作 |
| 测试账号不存在 | 中 | 使用 `skipCondition` 跳过成员管理部分 |

## 6. 后续优化

1. **引导进度保存**：支持中途退出后恢复
2. **步骤分组**：将长流程分为多个阶段
3. **智能跳过**：检测用户已完成的操作，自动跳过
4. **多语言支持**：引导内容国际化

## 7. 附录：前置条件设计

### 7.1 前置条件类型

```typescript
interface TourPrecondition {
  description: string;
  check: () => boolean | Promise<boolean>;
  resolve?: {
    guideId?: string;      // 跳转到其他引导
    steps?: TourStep[];    // 插入步骤
    handler?: () => void;  // 自定义处理
  };
}
```

### 7.2 常用前置条件

| 条件 | 检测逻辑 | 解决方式 |
|------|----------|----------|
| 有项目 | 检查项目列表非空 | 引导创建项目 |
| 有 CAD 文件 | 检查文件列表中有 .dwg/.dxf 文件 | 引导上传文件 |
| 有测试账号 | 检查系统用户列表 | 跳过成员管理步骤 |
| 有图库分类 | 检查图库分类列表 | 引导创建分类 |

### 7.3 使用示例

```typescript
const projectManagementFullGuide: TourGuide = {
  id: 'project-management-full',
  name: '项目管理完整流程',
  description: '从创建项目到使用 CAD 编辑器的完整教程',
  category: '项目管理',
  estimatedTime: '15 分钟',
  startPage: 'dashboard',
  preconditions: [
    {
      description: '有测试账号可用于成员管理演示',
      check: async () => {
        // 检查是否存在测试账号
        const users = await usersApi.list();
        return users.data?.some(u => u.username === 'test_user');
      },
      resolve: {
        // 没有测试账号时跳过成员管理相关步骤
        steps: [
          {
            target: 'member-management-skip-hint',
            title: '跳过成员管理',
            content: '暂无测试账号，将跳过成员管理演示',
            placement: 'bottom',
          }
        ]
      }
    }
  ],
  steps: [
    // ... 完整步骤列表
  ]
};
```
