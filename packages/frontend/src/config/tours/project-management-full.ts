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
 * 视图切换 → 角色管理（项目角色自治）→ 成员管理 → 操作历史 → 进入项目 → 上传文件 → 打开图纸
 */

import { t } from '@/languages';
import type { TourGuide } from '../../types/tour';
import { ProjectPermission } from '../../constants/permissions';

/**
 * 检查当前是否在项目管理页面
 */
function isInProjectManagement(): boolean {
  const pathname = window.location.pathname;
  return pathname === '/projects' || pathname === '/projects/';
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
export function getProjectManagementFullGuide(): TourGuide {
  return {
    id: 'project-management-full',
    name: t('项目管理完整流程'),
    description: t(
      '从项目设置到使用 CAD 编辑器的完整教程，涵盖角色管理、成员管理、文件管理等功能'
    ),
    category: t('项目管理'),
    estimatedTime: t('15 分钟'),
    startPage: 'current',
    visibility: {
      permissions: [ProjectPermission.FILE_CREATE],
    },
    /** 前置条件：需要在项目管理页面，且至少有一个项目 */
    preconditions: [
      /** 前置条件：需要在项目管理页面 */
      {
        description: t('需要在项目管理页面'),
        check: isInProjectManagement,
        resolve: {
          // 如果不在项目管理页面，跳转到进入项目管理引导
          guideId: 'navigate-to-projects',
        },
      },
      {
        description: t('需要至少有一个项目'),
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
        title: t('视图切换'),
        content: t('可以切换卡片模式和列表模式查看项目。'),
        placement: 'bottom',
        mode: 'interactive',
        actionType: 'click',
        waitForElement: 2000,
        fallbackContent: t('视图切换按钮可以在卡片视图和列表视图之间切换。'),
      },
      // ==================== 角色管理 ====================
      {
        target: 'file-item-menu-btn',
        title: t('更多操作'),
        content: t('点击项目卡片右上角的"更多"按钮，展开项目管理操作菜单。'),
        placement: 'bottom',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击项目卡片右上角的"更多"按钮'),
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t(
          '列表视图下操作按钮会直接显示在项目行中；卡片视图下"更多"按钮位于项目卡片右上角。仍找不到时，可点击"跳过引导"继续。'
        ),
        // 列表视图宽屏下操作按钮直接展开（无"更多"菜单按钮），跳过本步骤
        skipCondition: {
          type: 'custom',
          customCheck: () =>
            !!document.querySelector('[data-tour="file-item-actions"]') &&
            !document.querySelector('[data-tour="file-item-menu-btn"]'),
        },
      },
      {
        target: 'menu-show-roles',
        title: t('角色管理'),
        content: t('点击"角色管理"选项，打开项目角色管理弹窗。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击菜单中的"角色管理"选项'),
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t(
          '请在操作菜单中选择"角色管理"，打开项目角色管理弹窗。'
        ),
      },
      {
        target: 'create-role-btn',
        title: t('创建角色'),
        content: t('点击"创建角色"按钮创建自定义角色。'),
        placement: 'bottom',
        mode: 'interactive',
        actionType: 'click',
        waitForElement: 3000,
        fallbackContent: t(
          '创建角色功能：在角色管理弹窗中点击"创建角色"按钮，然后配置角色名称和权限。'
        ),
      },
      {
        target: 'role-name-input',
        title: t('角色名称'),
        content: t('输入角色名称。'),
        placement: 'bottom',
        mode: 'display',
        waitForElement: 5000,
        fallbackContent: t('在角色创建表单中输入角色名称。'),
      },
      {
        target: 'role-permissions',
        title: t('权限配置'),
        content: t('后续你可以为角色配置具体的权限，请点击下一步'),
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: t('权限配置区域可以为角色分配特定的权限组合。'),
      },
      {
        target: 'role-save-btn',
        title: t('保存角色'),
        content: t('点击保存完成创建。'),
        placement: 'bottom',
        mode: 'display',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t('点击保存按钮完成角色创建。'),
      },
      {
        target: 'modal-close-btn',
        title: t('关闭弹窗'),
        content: t('关闭权限配置弹框。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击关闭按钮'),
        waitForElement: 3000,
        fallbackContent: t('点击弹窗右上角的关闭按钮关闭权限配置弹框。'),
      },
      {
        target: 'project-role-hint',
        title: t('项目角色自治'),
        content: t(
          '项目角色属于本项目，可自由编辑；删除角色时成员自动降级，若项目已无可用角色会自动创建默认成员角色。'
        ),
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: t(
          '项目角色属于本项目，可自由编辑；删除角色时成员自动降级，若项目已无可用角色会自动创建默认成员角色。'
        ),
      },
      {
        target: 'project-role-list',
        title: t('默认角色'),
        content: t(
          '默认角色来自项目模板，可直接修改名称和权限；项目所有者使用的角色不可删除。'
        ),
        placement: 'left',
        mode: 'display',
        waitForElement: 2000,
        fallbackContent: t(
          '角色列表中的默认角色可直接修改，带"项目所有者"标记的角色不可删除。'
        ),
      },
      {
        target: 'modal-close-btn',
        title: t('关闭弹窗'),
        content: t('关闭角色管理弹窗。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击关闭按钮'),
        waitForElement: 3000,
        fallbackContent: t('点击弹窗右上角的关闭按钮关闭角色管理弹窗。'),
      },

      // ==================== 成员管理 ====================
      {
        target: 'file-item-menu-btn',
        title: t('更多操作'),
        content: t('再次点击"更多"按钮，展开项目管理操作菜单。'),
        placement: 'bottom',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请再次点击项目卡片右上角的"更多"按钮'),
        waitForElement: 3000,
        fallbackContent: t(
          '列表视图下操作按钮会直接显示在项目行中；卡片视图下"更多"按钮位于项目卡片右上角。仍找不到时，可点击"跳过引导"继续。'
        ),
        // 列表视图宽屏下操作按钮直接展开（无"更多"菜单按钮），跳过本步骤
        skipCondition: {
          type: 'custom',
          customCheck: () =>
            !!document.querySelector('[data-tour="file-item-actions"]') &&
            !document.querySelector('[data-tour="file-item-menu-btn"]'),
        },
      },
      {
        target: 'menu-show-members',
        title: t('成员管理'),
        content: t('点击"成员"选项，打开成员管理弹窗。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击菜单中的"成员"选项'),
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t('请在操作菜单中选择"成员"，打开项目成员管理弹窗。'),
      },
      {
        target: 'invite-member-btn',
        title: t('添加成员'),
        content: t('点击"添加成员"按钮邀请新成员。'),
        placement: 'bottom',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击"添加成员"按钮'),
        waitForElement: 3000,
        fallbackContent: t(
          '添加成员功能：在成员管理弹窗中点击"添加成员"按钮，邀请新成员加入项目。'
        ),
      },
      {
        target: 'member-search-input',
        title: t('搜索用户'),
        content: t('搜索要添加的用户名，在搜索结果列表中点击要添加的用户'),
        placement: 'bottom',
        mode: 'display',
        waitForElement: 5000,
        fallbackContent: t('在搜索框中输入用户名查找要添加的成员。'),
      },
      {
        target: 'member-role-select',
        title: t('选择角色'),
        content: t('为成员选择角色权限。'),
        placement: 'left',
        mode: 'display',
        actionHint: t('请选择一个角色'),
        waitForElement: 3000,
        fallbackContent: t('角色选择区域可以为成员分配不同的角色权限。'),
      },
      {
        target: 'member-add-btn',
        title: t('添加'),
        content: t('添加按钮完成邀请。'),
        placement: 'bottom',
        mode: 'display',
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t('添加按钮完成成员邀请。'),
      },
      {
        target: 'modal-close-btn',
        title: t('关闭弹窗'),
        content: t('关闭成员管理弹窗。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击关闭按钮'),
        waitForElement: 3000,
        fallbackContent: t('点击弹窗右上角的关闭按钮关闭成员管理弹窗。'),
      },

      // ==================== 操作历史 ====================
      {
        target: 'file-item-menu-btn',
        title: t('更多操作'),
        content: t('再次点击"更多"按钮，展开项目管理操作菜单。'),
        placement: 'bottom',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请再次点击项目卡片右上角的"更多"按钮'),
        waitForElement: 3000,
        fallbackContent: t(
          '列表视图下操作按钮会直接显示在项目行中；卡片视图下"更多"按钮位于项目卡片右上角。仍找不到时，可点击"跳过引导"继续。'
        ),
        // 列表视图宽屏下操作按钮直接展开（无"更多"菜单按钮），跳过本步骤
        skipCondition: {
          type: 'custom',
          customCheck: () =>
            !!document.querySelector('[data-tour="file-item-actions"]') &&
            !document.querySelector('[data-tour="file-item-menu-btn"]'),
        },
      },
      {
        target: 'menu-show-operation-history',
        title: t('操作历史'),
        content: t('点击"操作历史"选项，查看项目内的操作记录。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击菜单中的"操作历史"选项'),
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t(
          '请在操作菜单中选择"操作历史"，打开项目操作历史弹窗。'
        ),
      },
      {
        target: 'operation-history-filter',
        title: t('记录筛选'),
        content: t('可以按操作类型、成员、日期或图纸名称筛选项目操作记录。'),
        placement: 'left',
        mode: 'display',
        waitForElement: 3000,
        fallbackContent: t(
          '操作历史支持按操作类型、成员、日期和图纸名称筛选记录。'
        ),
      },
      {
        target: 'operation-history-list',
        title: t('时间分组与定位'),
        content: t(
          '操作记录按今天、昨天、更早分组展示；点击记录可定位到对应图纸或文件夹，打开图纸可直接跳转编辑器。'
        ),
        placement: 'left',
        mode: 'display',
        waitForElement: 5000,
        fallbackContent: t(
          '操作记录会按时间分组展示，支持定位到图纸或文件夹所在位置。'
        ),
        // 项目暂无操作记录时列表不渲染，跳过该步骤
        skipCondition: {
          type: 'custom',
          customCheck: () =>
            !document.querySelector('[data-tour="operation-history-list"]'),
        },
      },
      {
        target: 'modal-close-btn',
        title: t('关闭弹窗'),
        content: t('关闭操作历史弹窗。'),
        placement: 'left',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击关闭按钮'),
        waitForElement: 3000,
        fallbackContent: t('点击弹窗右上角的关闭按钮关闭操作历史弹窗。'),
      },

      // ====================  文件管理 ====================
      {
        target: 'file-item',
        title: t('进入项目'),
        content: t('点击项目进入文件管理。'),
        placement: 'right',
        mode: 'interactive',
        actionType: 'click',
        actionHint: t('请点击项目卡片进入项目'),
        highlight: true,
        waitForElement: 3000,
        fallbackContent: t('点击项目卡片可以进入项目文件列表。'),
      },
      {
        target: 'upload-btn',
        title: t('上传文件'),
        content: t(
          '这里可以上传 DWG、DXF 等 CAD 文件。已存在的图纸可以直接使用。'
        ),
        placement: 'bottom',
        mode: 'display',
        waitForElement: 3000,
        fallbackContent: t('上传文件功能可以上传 DWG、DXF 等 CAD 文件。'),
      },
      {
        target: 'file-item',
        title: t('等待上传'),
        content: t('等待文件上传完成...'),
        placement: 'bottom',
        mode: 'display',
        waitForElement: 60000,
        fallbackContent: t('上传完成后，文件会显示在列表中。'),
        // 已有图纸时跳过等待
        skipCondition: {
          type: 'custom',
          customCheck: () =>
            document.querySelectorAll('[data-tour="file-item"]').length > 0,
        },
      },
      // ====================  后续操作 ====================
      {
        target: 'file-item',
        title: t('打开图纸'),
        content: t('图纸上传完成后，点击图纸文件即可在 CAD 编辑器中打开。'),
        placement: 'right',
        mode: 'display',
        waitForElement: 3000,
        fallbackContent: t('点击 DWG 或 DXF 文件可以在编辑器中打开。'),
        skipCondition: {
          type: 'custom',
          customCheck: () =>
            document.querySelectorAll('[data-tour="file-item"]').length === 0,
        },
      },
    ],
  };
}

export default getProjectManagementFullGuide;
