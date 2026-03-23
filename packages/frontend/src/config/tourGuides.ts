/**
 * 用户引导流程配置
 * @version 1.4.0
 * 
 * 注意：此文件中的 target 值对应组件上的 data-tour 属性
 * Phase 5 将在相关组件上添加 data-tour 属性
 * 
 * 步骤模式说明：
 * - display: 展示模式，用户点击"下一步"按钮即可继续
 * - interactive: 交互模式，用户需要完成指定操作才能继续
 * 
 * 起始页面说明：
 * - 'dashboard': 跳转到首页仪表盘（默认值）
 * - 'current': 保持当前页面不变（适用于 CAD 编辑器等新标签打开的场景）
 * - string: 自定义路由路径（如 '/projects'）
 * 
 * UI 条件分支说明：
 * - uiCondition: 检测当前 UI 状态
 * - alternatives: 条件不满足时使用的替代步骤配置
 */

import type { TourGuide } from '../types/tour';

/**
 * 所有引导流程配置
 */
export const tourGuides: TourGuide[] = [
  // ==================== P0 优先级 ====================
  
  /**
   * 文件上传与管理引导
   * 教用户如何在项目中上传文件、创建文件夹、管理文件
   * 注意：此引导需要先进入一个项目才能正常显示
   */
  {
    id: 'file-upload',
    name: '文件上传与管理',
    description: '学习如何在项目中上传 CAD 文件、创建文件夹结构以及管理文件版本',
    category: '项目管理',
    estimatedTime: '5 分钟',
    startPage: 'dashboard', // 从首页仪表盘开始
    steps: [
      {
        target: 'sidebar-projects',
        title: '进入项目管理',
        content: '首先，点击侧边栏的"项目管理"进入项目列表页面。项目是管理图纸文件的基本单位。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"项目管理"',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"项目管理"入口进入项目列表。',
      },
      {
        target: 'create-project-btn',
        title: '创建项目',
        content: '如果您还没有项目，点击此按钮创建新项目。填写项目名称和描述即可完成创建。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 3000,
        skipCondition: {
          type: 'element-not-exists',
          selector: '[data-tour="create-project-btn"]',
        },
        fallbackContent: '创建项目按钮在项目列表页面的顶部工具栏中。点击可以创建新项目。如果您在私人空间或没有创建权限，此按钮可能不显示。',
      },
      {
        target: 'file-item',
        title: '进入项目',
        content: '点击项目卡片可以进入项目，查看和管理其中的文件。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击一个项目卡片进入项目',
        highlight: true,
        waitForElement: 2000,
        fallbackContent: '请在项目列表中点击一个项目卡片进入项目，然后继续引导。',
      },
      {
        target: 'upload-btn',
        title: '上传文件',
        content: '点击此按钮可以上传 DWG、DXF 等 CAD 格式文件。支持批量上传和拖拽上传。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 3000,
        skipCondition: {
          type: 'element-not-exists',
          selector: '[data-tour="upload-btn"]',
        },
        fallbackContent: '上传文件功能需要在项目内部使用。请先从项目列表中点击进入一个项目，然后重新开始此引导。如果在回收站视图，此按钮不会显示。',
      },
      {
        target: 'create-folder-btn',
        title: '创建文件夹',
        content: '点击此按钮可以在当前位置创建新文件夹，方便组织您的图纸文件。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 2000,
        skipCondition: {
          type: 'element-not-exists',
          selector: '[data-tour="create-folder-btn"]',
        },
        fallbackContent: '创建文件夹功能需要在项目内部使用。请先进入一个项目。如果在回收站视图，此按钮不会显示。',
      },
      {
        target: 'file-item',
        title: '文件操作',
        content: '右键点击文件可以查看更多操作选项，包括：重命名、移动、下载、删除、版本历史等。',
        placement: 'right',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '文件列表区域。上传文件后，可以右键点击文件查看更多操作选项。',
      },
    ],
  },

  /**
   * 项目成员管理引导
   * 教用户如何邀请成员、设置权限
   */
  {
    id: 'project-members',
    name: '项目成员管理',
    description: '学习如何邀请团队成员加入项目，并为他们分配合适的权限',
    category: '项目管理',
    estimatedTime: '4 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-projects',
        title: '进入项目管理',
        content: '首先，点击侧边栏的"项目管理"进入项目列表页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"项目管理"',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"项目管理"入口进入项目列表。',
      },
      {
        target: 'file-item',
        title: '选择项目',
        content: '在项目列表中，选择要管理成员的项目。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击一个项目卡片进入项目',
        highlight: true,
        waitForElement: 2000,
        fallbackContent: '请在项目列表中点击一个项目卡片进入项目。',
      },
      {
        target: 'file-item',
        title: '打开项目设置',
        content: '在项目卡片上，点击右上角的"..."按钮打开更多菜单，选择"设置"进入项目设置面板。',
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '在项目列表中，点击项目卡片右上角的三个点（···）可以打开更多菜单，选择"设置"进入项目设置。',
        highlight: true,
        // UI 条件分支：网格视图需要点击菜单按钮
        uiCondition: {
          type: 'view-mode',
          viewMode: 'grid',
        },
        alternatives: [
          {
            condition: {
              type: 'view-mode',
              viewMode: 'list',
            },
            step: {
              content: '在列表视图中，直接点击操作按钮区域的"设置"按钮进入项目设置。',
            },
          },
        ],
      },
      {
        target: 'invite-member-btn',
        title: '邀请成员',
        content: '在项目设置的成员管理页面，点击此按钮邀请新成员加入项目。您可以通过邮箱邀请或分享邀请链接。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '邀请成员功能需要在项目设置 > 成员管理中操作。请先打开一个项目的成员管理面板。',
      },
      {
        target: 'member-role-select',
        title: '设置权限',
        content: '为每个成员设置合适的角色权限：管理员、编辑者或查看者。',
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '成员角色选择功能。在成员列表中可以为每个成员分配不同的角色权限。',
      },
    ],
  },

  // ==================== P1 优先级 ====================

  /**
   * 添加图纸到图库引导
   * 教用户如何将项目中的图纸添加到图库供团队复用
   */
  {
    id: 'add-to-gallery',
    name: '添加图纸到图库',
    description: '学习如何将常用的图纸添加到图库，方便团队成员复用',
    category: '图库管理',
    estimatedTime: '4 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-projects',
        title: '进入项目管理',
        content: '首先，点击侧边栏的"项目管理"进入项目列表页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"项目管理"',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"项目管理"入口进入项目列表。',
      },
      {
        target: 'file-item',
        title: '进入项目',
        content: '点击项目卡片进入项目，找到要添加到图库的图纸文件。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击一个项目卡片进入项目',
        highlight: true,
        waitForElement: 2000,
        fallbackContent: '请在项目列表中点击一个项目卡片进入项目。',
      },
      {
        target: 'file-item',
        title: '选择图纸文件',
        content: '在项目文件列表中，找到要添加到图库的 DWG 或 DXF 图纸文件，右键点击打开上下文菜单。',
        placement: 'left',
        mode: 'interactive',
        actionType: 'right-click',
        actionHint: '请右键点击一个图纸文件',
        highlight: true,
        waitForElement: 2000,
        fallbackContent: '请在项目中选择一个 DWG 或 DXF 图纸文件，右键点击打开菜单。',
      },
      {
        target: 'gallery-category-select',
        title: '选择分类',
        content: '选择或创建图库分类，帮助团队成员快速找到图纸。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '选择图库分类。分类可以帮助团队成员更快找到需要的图纸。',
      },
      {
        target: 'gallery-submit-btn',
        title: '确认添加',
        content: '点击确认按钮将图纸添加到图库。添加后团队成员可在图库中查看和使用。',
        placement: 'top',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '填写完信息后，点击提交按钮将图纸添加到图库。',
      },
    ],
  },

  /**
   * 项目角色管理引导
   * 教用户如何创建和管理项目角色
   */
  {
    id: 'project-roles',
    name: '项目角色管理',
    description: '学习如何创建自定义项目角色，精细化控制成员权限',
    category: '项目管理',
    estimatedTime: '3 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-projects',
        title: '进入项目管理',
        content: '首先，点击侧边栏的"项目管理"进入项目列表页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"项目管理"',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"项目管理"入口进入项目列表。',
      },
      {
        target: 'file-item',
        title: '进入项目',
        content: '点击项目卡片进入项目。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击一个项目卡片进入项目',
        highlight: true,
        waitForElement: 2000,
        fallbackContent: '请在项目列表中点击一个项目卡片进入项目。',
      },
      {
        target: 'file-item',
        title: '打开项目设置',
        content: '在项目卡片上，点击右上角的"..."按钮打开更多菜单，选择"设置"进入项目设置面板，然后选择"角色管理"。',
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '在项目列表中，点击项目卡片右上角的三个点（···）可以打开更多菜单，选择"设置"进入项目设置，然后选择"角色管理"。',
        highlight: true,
      },
      {
        target: 'create-role-btn',
        title: '创建角色',
        content: '点击此按钮创建新的自定义角色，可以为角色分配特定的权限组合。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '创建角色功能需要在项目设置 > 角色管理中操作。',
      },
    ],
  },

  // ==================== P2 优先级 ====================

  /**
   * 协作功能引导
   * 教用户如何使用协同编辑和批注功能
   * 注意：此引导在 CAD 编辑器中使用，保持当前页面
   */
  {
    id: 'collaboration',
    name: '协作功能',
    description: '学习如何与团队成员实时协作，包括协同编辑和图纸批注',
    category: '协作功能',
    estimatedTime: '2 分钟',
    startPage: 'current', // CAD 编辑器是新标签打开，保持当前页面
    steps: [
      {
        target: 'collaborators-panel',
        title: '查看协作者',
        content: '在 CAD 编辑器中，点击侧边栏的协作者按钮可以查看当前正在编辑此图纸的其他成员，他们的光标位置会实时显示。',
        placement: 'left',
        mode: 'display',
        waitForElement: 3000,
        fallbackContent: '协作功能需要在 CAD 编辑器中使用。请先打开一个图纸文件，然后在侧边栏查看协作者面板。',
      },
    ],
  },

  /**
   * 外部参照管理引导
   * 教用户如何管理 CAD 图纸的外部参照
   * 注意：此引导在 CAD 编辑器中使用，保持当前页面
   */
  {
    id: 'external-reference',
    name: '外部参照管理',
    description: '学习如何管理和更新 CAD 图纸中的外部参照文件',
    category: '项目管理',
    estimatedTime: '3 分钟',
    startPage: 'current', // CAD 编辑器是新标签打开，保持当前页面
    steps: [
      {
        target: 'xref-list',
        title: '外部参照列表',
        content: '在 CAD 编辑器中，可以通过外部参照面板查看当前图纸引用的所有外部参照文件及其状态。',
        placement: 'right',
        mode: 'display',
        waitForElement: 3000,
        fallbackContent: '外部参照功能需要在 CAD 编辑器中使用。请先打开一个包含外部参照的图纸文件，然后在工具栏中找到外部参照按钮。',
      },
      {
        target: 'xref-actions',
        title: '管理操作',
        content: '可以对外部参照进行重载、卸载、绑定等操作。',
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '外部参照操作：重载、卸载、绑定等。在外部参照面板中选择参照文件后可以进行这些操作。',
      },
    ],
  },

  /**
   * 图库浏览与管理引导
   * 教用户如何浏览和使用图库中的图纸
   */
  {
    id: 'gallery-manage',
    name: '图库浏览与管理',
    description: '学习如何浏览图库、搜索图纸以及管理图库分类',
    category: '图库管理',
    estimatedTime: '3 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-gallery',
        title: '打开图库',
        content: '在侧边栏点击"图库"进入图库页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"图库"入口',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"图库"入口进入图库页面。',
      },
      {
        target: 'gallery-categories',
        title: '浏览分类',
        content: '左侧显示图库分类，点击分类查看其中的图纸。',
        placement: 'right',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '图库分类区域。点击不同分类可以查看对应的图纸。',
      },
      {
        target: 'gallery-search',
        title: '搜索图纸',
        content: '使用搜索框或标签筛选快速找到需要的图纸。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '搜索框可以快速查找图库中的图纸。',
      },
      {
        target: 'gallery-item-actions',
        title: '图纸操作',
        content: '点击图纸可以预览，右键菜单可以插入到项目或下载。',
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '图库中的图纸支持预览、插入到项目、下载等操作。',
      },
    ],
  },

  // ==================== P3 优先级 ====================

  /**
   * 版本历史查看引导
   * 教用户如何查看和恢复文件的历史版本
   */
  {
    id: 'version-history',
    name: '版本历史查看',
    description: '学习如何查看文件的历史版本，以及恢复到指定版本',
    category: '项目管理',
    estimatedTime: '2 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-projects',
        title: '进入项目管理',
        content: '首先，点击侧边栏的"项目管理"进入项目列表页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"项目管理"',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"项目管理"入口进入项目列表。',
      },
      {
        target: 'file-item',
        title: '进入项目',
        content: '点击项目卡片进入项目，找到要查看版本的图纸文件。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击一个项目卡片进入项目',
        highlight: true,
        waitForElement: 2000,
        fallbackContent: '请在项目列表中点击一个项目卡片进入项目。',
      },
      {
        target: 'file-item',
        title: '查看版本历史',
        content: '在文件列表中，右键点击 DWG 或 DXF 文件，在弹出的菜单中选择"版本历史"可以查看该文件的所有历史版本。',
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '版本历史功能：在项目文件列表中右键点击 DWG/DXF 文件，选择"版本历史"即可查看所有历史版本，并可以恢复到任意版本。',
        highlight: true,
      },
    ],
  },

  /**
   * 系统角色管理引导
   * 教管理员如何管理系统角色（需要权限）
   */
  {
    id: 'system-roles',
    name: '系统角色管理',
    description: '学习如何创建和管理系统角色，为用户分配权限',
    category: '系统管理',
    estimatedTime: '3 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-roles',
        title: '进入角色管理',
        content: '在侧边栏点击"角色权限"进入系统角色管理页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"角色权限"入口',
        highlight: true,
        waitForElement: 3000,
        skipCondition: {
          type: 'element-not-exists',
          selector: '[data-tour="sidebar-roles"]',
        },
        fallbackContent: '请点击左侧侧边栏中的"角色权限"入口进入系统角色管理页面。如果您没有看到此入口，可能是因为您没有系统角色管理权限。',
      },
      {
        target: 'role-list',
        title: '角色列表',
        content: '查看系统中所有角色，包括系统预设角色和自定义角色。',
        placement: 'right',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '角色列表区域。显示系统中所有角色，包括系统预设角色和自定义角色。',
      },
      {
        target: 'create-role-btn',
        title: '创建角色',
        content: '点击此按钮创建新的系统角色。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '创建角色按钮。点击可以创建新的系统角色并配置权限。',
      },
    ],
  },

  /**
   * 项目管理引导
   * 教用户如何创建和管理项目
   */
  {
    id: 'project-create',
    name: '项目管理',
    description: '学习如何创建新项目、设置项目属性以及归档项目',
    category: '项目管理',
    estimatedTime: '2 分钟',
    startPage: 'dashboard',
    steps: [
      {
        target: 'sidebar-projects',
        title: '进入项目管理',
        content: '首先，点击侧边栏的"项目管理"进入项目列表页面。',
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: '请点击侧边栏中的"项目管理"',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: '请点击左侧侧边栏中的"项目管理"入口进入项目列表。',
      },
      {
        target: 'create-project-btn',
        title: '创建项目',
        content: '点击此按钮创建新项目，填写项目名称和描述。',
        placement: 'bottom',
        mode: 'display',
        waitForElement: 3000,
        fallbackContent: '创建项目按钮在项目列表页面的顶部工具栏中。点击可以创建新项目。',
      },
      {
        target: 'file-item',
        title: '项目操作',
        content: '在项目卡片上点击右上角的三个点（···）可以打开更多菜单，包括：编辑、归档、删除等操作。点击设置图标可以进入项目设置。',
        placement: 'right',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: '项目卡片支持右键菜单操作：编辑、归档、删除等。点击设置图标可以进入项目设置配置成员和角色。',
        highlight: true,
      },
    ],
  },
];

/**
 * 根据 ID 获取引导流程
 */
export function getTourGuideById(id: string): TourGuide | undefined {
  return tourGuides.find((guide) => guide.id === id);
}

/**
 * 根据分类获取引导流程列表
 */
export function getTourGuidesByCategory(category: TourGuide['category']): TourGuide[] {
  return tourGuides.filter((guide) => guide.category === category);
}

/**
 * 获取所有引导分类
 */
export function getTourCategories(): TourGuide['category'][] {
  return ['项目管理', '图库管理', '协作功能', '系统管理'];
}

export default tourGuides;