// @deprecated Use @/api-sdk instead.
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

import { getApiClient } from './apiClient';

export const projectMemberApi = {
  // ========== 成员管理 ==========

  /**
   * 获取项目成员列表
   */
  getMembers: (projectId: string) =>
    getApiClient().FileSystemController_getProjectMembers({ projectId }),

  /**
   * 添加成员
   */
  addMember: (
    projectId: string,
    data: { userId: string; projectRoleId: string }
  ) =>
    getApiClient().FileSystemController_addProjectMember({ projectId }, data),

  /**
   * 移除成员
   */
  removeMember: (projectId: string, userId: string) =>
    getApiClient().FileSystemController_removeProjectMember({
      projectId,
      userId,
    }),

  /**
   * 更新成员角色
   */
  updateMember: (
    projectId: string,
    userId: string,
    data: { projectRoleId: string }
  ) =>
    getApiClient().FileSystemController_updateProjectMember(
      { projectId, userId },
      data
    ),

  /**
   * 转移项目所有权
   */
  transferOwnership: (projectId: string, newOwnerId: string) =>
    getApiClient().FileSystemController_transferProjectOwnership(
      { projectId },
      { newOwnerId }
    ),
};