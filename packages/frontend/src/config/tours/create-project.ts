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
 * 创建项目引导配置
 * 
 * 前置条件：需要在项目管理页面
 * 如果不在项目管理页面，会自动引导用户先进入项目管理
 */

import { t } from '@/languages';
import type { TourGuide } from '../../types/tour';
import { ProjectPermission } from '../../constants/permissions';

/**
 * 检查当前是否在项目管理页面
 */
function isInProjectManagement(): boolean {
  const pathname = window.location.pathname;
  // 项目管理页面的路径：首页、/projects 或 /projects/xxx（项目详情）
  return pathname === '/' || pathname === '/projects' || pathname.startsWith('/projects/');
}

/**
 * 创建项目引导
 * 引导用户完成项目的创建流程
 */
export function getCreateProjectGuide(): TourGuide {
  return {
  isHide: true, // 先隐藏，作为其他项目管理相关引导的前置条件引导
  id: 'create-project',
  name: t('创建项目'),
  description: t('学习如何创建一个新项目，这是使用 CloudCAD 的第一步'),
  category: t('项目管理'),
  estimatedTime: t('2 分钟'),
  startPage: 'current',
  visibility: {
    permissions: [ProjectPermission.FILE_CREATE],
  },
  /** 前置条件：需要在项目管理页面 */
  preconditions: [
    {
      description: t('需要在项目管理页面'),
      check: isInProjectManagement,
      resolve: {
        // 如果不在项目管理页面，跳转到进入项目管理引导
        guideId: 'navigate-to-projects',
      },
    },
  ],
  steps: [
    {
      target: 'create-project-btn',
      title: t('新建项目'),
      content: t('点击"新建项目"按钮创建项目。'),
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      actionHint: t('请点击"新建项目"按钮'),
      highlight: true,
      waitForElement: 3000,
      fallbackContent: t('创建项目按钮在项目列表页面的顶部工具栏中。点击可以创建新项目。'),
    },
    {
      target: 'project-name-input',
      title: t('项目名称'),
      content: t('输入项目名称，如"我的第一个项目"。'),
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'input',
      actionHint: t('请输入项目名称'),
      waitForElement: 5000,
      fallbackContent: t('在项目创建弹窗中输入项目名称。'),
    },
    {
      target: 'project-desc-input',
      title: t('项目描述'),
      content: t('填写项目描述（可选）。'),
      placement: 'bottom',
      mode: 'display',
      waitForElement: 3000,
      fallbackContent: t('项目描述可以帮助团队成员了解项目用途。'),
    },
    {
      target: 'project-create-submit',
      title: t('创建项目'),
      content: t('点击"创建"按钮完成创建。'),
      placement: 'bottom',
      mode: 'interactive',
      actionType: 'click',
      actionHint: t('请点击"创建"按钮'),
      highlight: true,
      waitForElement: 3000,
      fallbackContent: t('点击创建按钮完成项目创建。'),
    },
    {
      target: 'file-item',
      title: t('项目创建成功'),
      content: t('恭喜！项目已创建成功。点击项目卡片可以进入项目进行文件管理。'),
      placement: 'right',
      mode: 'display',
      waitForElement: 3000,
      fallbackContent: t('项目创建成功后，可以在项目列表中看到新创建的项目。'),
    },
  ],
  };
}

export default getCreateProjectGuide;
