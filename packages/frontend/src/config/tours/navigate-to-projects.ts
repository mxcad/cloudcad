/**
 * 进入项目管理引导配置
 * 
 * 最基础的引导，引导用户从侧边栏进入项目管理页面
 * 作为其他项目管理相关引导的前置条件
 */

import type { TourGuide } from '../../types/tour';

/**
 * 检查当前是否在 CAD 编辑器页面
 */
function isInCADEditor(): boolean {
  return window.location.pathname.startsWith('/cad-editor');
}

/**
 * 检查当前是否在项目管理页面
 */
function isInProjectManagement(): boolean {
  const pathname = window.location.pathname;
  // 项目管理页面的路径
  return pathname === '/' || pathname === '/projects' || pathname.startsWith('/projects/');
}

/**
 * 进入项目管理引导
 * 引导用户点击侧边栏的项目管理菜单项
 */
export const navigateToProjectsGuide: TourGuide = {
  isHide: true, // 先隐藏，作为其他引导的前置条件引导
  id: 'navigate-to-projects',
  name: '进入项目管理',
  description: '学习如何从侧边栏进入项目管理页面',
  category: '项目管理',
  estimatedTime: '30 秒',
  startPage: 'current', // 保持当前页面
  preconditions: [
    {
      description: '需要在非 CAD 编辑器页面',
      check: () => !isInCADEditor(),
      resolve: {
        // 如果在 CAD 编辑器，跳转到首页
        handler: () => {
          window.location.href = '/';
        },
      },
    },
  ],
  steps: [
    {
      target: 'sidebar-projects',
      title: '进入项目管理',
      content: '点击侧边栏的"项目管理"进入项目列表页面。',
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
      title: '项目列表页面',
      content: '这里显示您的所有项目。您可以点击"新建项目"创建新项目，或点击项目卡片进入项目。',
      placement: 'bottom',
      mode: 'display',
      waitForElement: 3000,
      fallbackContent: '项目列表页面显示您的所有项目，支持创建、编辑和管理项目。',
    },
  ],
};

export default navigateToProjectsGuide;
