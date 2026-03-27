///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
/**
 * 项目管理完整流程引导配置
 * 
 * 前置条件链：
 * 1. 需要在项目管理页面（通过 navigate-to-projects 引导解决）
 * 2. 需要至少有一个项目（通过 create-project 引导解决）
 * 
 * 内容覆盖：
 * 角色管理 → 成员管理 → 创建目录 → 上传文件 → 添加图库 → 打开图纸 → 侧边栏功能
 */

import type { TourGuide } from '../../types/tour';
import { ProjectPermission } from '../../constants/permissions';


/**
 * 检查当前是否在项目管理页面
 */
function isInProjectManagement(): boolean {
  const pathname = window.location.pathname;
  return  pathname === '/projects' || pathname === '/projects/'
}

/**
 * 检查是否有项目（用于前置条件）
 * 通过检查项目列表页面的项目卡片数量来判断
 */
async function checkHasProject(): Promise<boolean> {
  // API 调用失败时，通过 DOM 检查（备用方案）
  const projectItems = document.querySelectorAll('[data-tour="file-item"]');
  return projectItems.length > 0;
}

/**
 * 项目管理完整流程引导
 * 整合所有项目管理相关操作，形成完整的用户引导体验 
 */
export const projectManagementFullGuide: TourGuide = {
  id: 'project-management-full',
  name: '项目管理完整流程',
  description: '从项目设置到使用 CAD 编辑器的完整教程，涵盖角色管理、成员管理、文件管理等功能',
  category: '项目管理',
  estimatedTime: '15 分钟',
  startPage: 'current', 
  visibility: {
    permissions: [ProjectPermission.FILE_CREATE],
  },
  /** 前置条件：需要在项目管理页面，且至少有一个项目 */
  preconditions: [
    /** 前置条件：需要在项目管理页面 */
    {
      description: '需要在项目管理页面',
      check: isInProjectManagement,
      resolve: {
        // 如果不在项目管理页面，跳转到进入项目管理引导
        guideId: 'navigate-to-projects',
      },
    },
    {
      description: '需要至少有一个项目',
      check: checkHasProject,
      resolve: {
        // 启动 create-project 引导
        guideId: 'create-project',
      },
    },
  ],
  steps: [
    // ==================== 项目列表功能介绍 ====================
    {
      target: 'view-toggle-list',
      title: '视图切换',
      content: '可以切换卡片模式和列表模式查看项目。',
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      waitForElement: 2000,
      fallbackContent: '视图切换按钮可以在卡片视图和列表视图之间切换。',
    },
    // ==================== 角色管理 ====================
    {
      target: 'menu-show-roles',
      title: '角色管理',
      content: '点击"角色管理"选项进入角色管理页面。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击菜单中的"角色管理"选项',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '请在菜单中点击"角色管理"选项，进入项目角色管理页面。',
    },
    {
      target: 'create-role-btn',
      title: '创建角色',
      content: '点击"创建角色"按钮创建自定义角色。',
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      waitForElement: 3000,
      fallbackContent: '创建角色功能：在角色管理弹窗中点击"创建角色"按钮，然后配置角色名称和权限。',
    },
    {
      target: 'role-name-input',
      title: '角色名称',
      content: '输入角色名称。',
      placement: 'bottom',
      mode: 'display',
      waitForElement: 5000,
      fallbackContent: '在角色创建表单中输入角色名称。',
    },
    {
      target: 'role-permissions',
      title: '权限配置',
      content: '后续你可以为角色配置具体的权限，请点击下一步',
      placement: 'left',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '权限配置区域可以为角色分配特定的权限组合。',
    },
    {
      target: 'role-save-btn',
      title: '保存角色',
      content: '点击保存完成创建。',
      placement: 'bottom',
      mode: 'display',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '点击保存按钮完成角色创建。',
    },
    {
      target: 'modal-close-btn',
      title: '关闭弹窗',
      content: '关闭权限配置弹框。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击关闭按钮',
      waitForElement: 3000,
      fallbackContent: '点击弹窗右上角的关闭按钮关闭权限配置弹框。',
    },
    {
      target: 'system-roles-tab-btn',
      title: '系统角色',
      content: '系统预置的角色可以直接修改。',
      placement: 'left',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '系统角色列表显示了预置的管理员、编辑者、查看者等角色。',
    },
    {
      target: 'modal-close-btn',
      title: '关闭弹窗',
      content: '关闭角色管理弹窗。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击关闭按钮',
      waitForElement: 3000,
      fallbackContent: '点击弹窗右上角的关闭按钮关闭角色管理弹窗。',
    },

    // ==================== 成员管理 ====================
    {
      target: 'menu-show-members',
      title: '成员管理',
      content: '点击"成员"选项进入成员管理页面。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击菜单中的"成员"选项',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '请在菜单中点击"成员"选项，进入项目成员管理页面。',
    },
    {
      target: 'invite-member-btn',
      title: '添加成员',
      content: '点击"添加成员"按钮邀请新成员。',
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击"添加成员"按钮',
      waitForElement: 3000,
      fallbackContent: '添加成员功能：在成员管理弹窗中点击"添加成员"按钮，邀请新成员加入项目。',
    },
    {
      target: 'member-search-input',
      title: '搜索用户',
      content: '搜索要添加的用户名, ,在搜索结果列表中点击要添加的用户',
      placement: 'bottom',
      mode: 'display',
      waitForElement: 5000,
      fallbackContent: '在搜索框中输入用户名查找要添加的成员。',
    },
    {
      target: 'member-role-select',
      title: '选择角色',
      content: '为成员选择角色权限。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'select',
      actionHint: '请选择一个角色',
      waitForElement: 3000,
      fallbackContent: '角色选择区域可以为成员分配不同的角色权限。',
    },
    {
      target: 'member-add-btn',
      title: '添加',
      content: '添加按钮完成邀请。',
      placement: 'bottom',
      mode: 'display',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '添加按钮完成成员邀请。',
    },
    {
      target: 'modal-close-btn',
      title: '关闭弹窗',
      content: '关闭成员管理弹窗。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击关闭按钮',
      waitForElement: 3000,
      fallbackContent: '点击弹窗右上角的关闭按钮关闭成员管理弹窗。',
    },

    // ====================  文件管理 ====================
    {
      target: 'file-item',
      title: '进入项目',
      content: '点击项目进入文件管理。',
      placement: 'right',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击项目卡片进入项目',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '点击项目卡片可以进入项目文件列表。',
    },
    {
      target: 'upload-btn',
      title: '上传文件',
      content: '点击"上传文件"按钮上传 CAD 图纸。',
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击"上传文件"按钮',
      waitForElement: 3000,
      fallbackContent: '上传文件按钮可以上传 DWG、DXF 等 CAD 文件。',
    },
    {
      target: 'file-item',
      title: '等待上传',
      content: '等待文件上传完成...',
      placement: 'bottom',
      mode: 'display',
      waitForElement: 5000,
      fallbackContent: '上传完成后，文件会显示在列表中。',
    },

    // ==================== 图库管理 ====================
    {
      target: 'context-menu-add-gallery',
      title: '添加到图库',
      content: '选择"添加到图库"选项。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击"添加到图库"选项',
      highlight: true,
      waitForElement: 3000, 
      fallbackContent: '在右键菜单中选择"添加到图库"选项。',
    },
    {
      target: 'category-select-btn-level-0',
      title: '选择分类',
      content: '选择图纸分类。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请选择一个分类',
      waitForElement: 3000,
      fallbackContent: '分类选择区域可以选择或创建图纸分类。',
    },
    {
      target: 'create-category-btn',
      title: '创建分类',
      content: '点击"创建新分类"。',
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击"创建新分类"按钮',
      waitForElement: 3000,
      fallbackContent: '创建新分类按钮可以创建新的图纸分类。',
    },
    {
      target: 'category-name-input',
      title: '分类名称',
      content: '输入分类名称。',
      placement: 'bottom',
      mode: 'display',
      actionHint: '请输入分类名称',
      waitForElement: 5000,
      fallbackContent: '在弹窗中输入新分类的名称并点击保存完成',
    },
    {
      target: 'gallery-submit-btn',
      title: '确认添加',
      content: '点击添加到图库。',
      placement: 'bottom',
      mode: 'display',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '点击添加按钮将图纸添加到图库。',
    },
    {
      target: 'modal-close-btn',
      title: '关闭弹窗',
      content: '关闭添加到图库弹窗。',
      placement: 'left',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击关闭按钮',
      waitForElement: 3000,
      fallbackContent: '点击弹窗右上角的关闭按钮关闭添加到图库弹窗。',  
    },

    // ====================  CAD 编辑器 ====================
    {
      target: 'file-item',
      title: '打开图纸',
      content: '点击打开 CAD 图纸文件。',
      placement: 'right',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击图纸文件打开',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '点击 DWG 或 DXF 文件可以在编辑器中打开。',
    },
    {
      target: 'cad-sidebar-trigger',
      title: '侧边栏',
      content: '侧边栏包含图纸库、图块库等功能。点击图标可以展开对应面板。',
      placement: 'left',
      mode: 'display',
      waitForElement: 3000,
      fallbackContent: '侧边栏窄条在页面左侧，点击图标可以展开对应面板。',
    },
    {
      target: 'trigger-drawings-gallery',
      title: '图纸库功能',
      content: '可以浏览和插入已添加的图纸。',
      placement: 'left',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '图纸库面板可以浏览和管理已添加的图纸。',
    },
    {
      target: 'trigger-blocks-gallery',
      title: '图块库',
      content: '图块库功能类似，用于插入图块。',
      placement: 'right',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '图块库可以浏览和插入图块。',
    },
    {
      target: 'trigger-my-project',
      title: '我的项目',
      content: '可以快速访问项目中的图纸。',
      placement: 'right',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '我的项目按钮可以快速访问当前项目的图纸。',
    },
    {
      target: 'trigger-my-drawings',
      title: '我的图纸',
      content: '可以访问私人空间的图纸。',
      placement: 'right',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '我的图纸按钮可以访问私人空间的图纸。',
    },

    // ====================  协同功能 ====================
    {
      target: 'trigger-collaborate',
      title: '协同功能',
      content: '点击协同按钮进入协同功能。',
      placement: 'right',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击协同按钮',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '协同按钮在侧边栏窄条中。',
    },
    {
      target: 'create-collaborate-btn',
      title: '创建协同',
      content: '点击创建协同，为当前图纸创建一个协同会话。',
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击创建协同按钮',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '创建协同按钮在协同面板顶部。',
    },
    {
      target: 'collaborate-list',
      title: '加入协同',
      content: '创建成功后，协同会话会显示在列表中。点击加入按钮即可加入协同。其他人加入同一个协同会话后，大家就可以实时协同编辑同一张图纸了。',
      placement: 'left',
      mode: 'display',
      waitForElement: 2000,
      fallbackContent: '协同列表中显示所有可用的协同会话，点击加入即可参与协同编辑。',
    },
  ],
};

export default projectManagementFullGuide;
