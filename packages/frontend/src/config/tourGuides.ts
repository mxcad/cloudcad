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
 * 用户引导流程配置
 * @version 3.0.0
 *
 * 此文件现在只是聚合入口，所有引导配置已拆分到 tours/ 目录下
 * 每个引导单独一个文件，便于维护和管理
 */

import type { TourGuide } from '../types/tour';

// 导入所有拆分后的引导配置
import {
  // 我的图纸
  getPersonalSpaceGuide,
  // 项目管理
  getNavigateToProjectsGuide,
  getCreateProjectGuide,
  getProjectManagementFullGuide,
} from './tours';

export function getTourGuides(): TourGuide[] {
  return [
    // ==================== 我的图纸 ====================
    getPersonalSpaceGuide(),

    // ==================== 项目管理 ====================
    getNavigateToProjectsGuide(),
    getCreateProjectGuide(),
    getProjectManagementFullGuide(),
  ];
}

/**
 * 根据 ID 获取引导流程
 */
export function getTourGuideById(id: string): TourGuide | undefined {
  return getTourGuides().find((guide) => guide.id === id);
}

export default getTourGuides;