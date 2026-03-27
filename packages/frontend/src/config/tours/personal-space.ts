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
 * 我的图纸引导配置
 * 
 * 教用户如何在"我的图纸"中上传文件、创建文件夹
 */

import type { TourGuide } from '../../types/tour';
import { ProjectPermission } from '../../constants/permissions';

/**
 * 我的图纸引导
 * 
 * 步骤流程：
 * 1. 点击"我的图纸"入口进入
 * 2. 介绍上传文件功能
 * 3. 介绍新建文件夹功能
 */
export const personalSpaceGuide: TourGuide = {
  id: 'personal-space',
  name: '我的图纸',
  description: '学习如何在个人空间中上传 CAD 文件、创建文件夹来管理您的图纸',
  category: '我的图纸',
  estimatedTime: '3 分钟',
  startPage: 'dashboard',
  visibility: {
    permissions: [ProjectPermission.FILE_UPLOAD],
  },
  steps: [
    {
      target: 'sidebar-personal-space',
      title: '进入我的图纸',
      content: '点击侧边栏的"我的图纸"，这是您的个人图纸空间，可以上传和管理您的 CAD 文件。',
      placement: 'right',
      mode: 'interactive',
      actionType: 'click',
      actionHint: '请点击侧边栏中的"我的图纸"',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '请点击左侧侧边栏中的"我的图纸"入口。',
    },
    {
      target: 'upload-btn',
      title: '上传文件',
      content: '点击"上传文件"按钮可以上传 DWG、DXF 等 CAD 格式文件。支持批量上传和拖拽上传。',
      placement: 'bottom',
      mode: 'display',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '上传文件功能在工具栏中。点击可以上传 DWG、DXF 等 CAD 格式文件。',
    },
    {
      target: 'create-folder-btn',
      title: '创建文件夹',
      content: '点击"新建文件夹"按钮可以在当前位置创建文件夹，方便组织和管理您的图纸文件。',
      placement: 'bottom',
      mode: 'display',
      highlight: true,
      waitForElement: 3000,
      fallbackContent: '新建文件夹功能在工具栏中。点击可以创建文件夹来组织图纸文件。',
    },
  ],
};

export default personalSpaceGuide;