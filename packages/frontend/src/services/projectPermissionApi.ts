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

export const projectPermissionApi = {
  // ========== 项目权限检查 ==========

  /**
   * 获取用户在项目中的所有权限
   */
  getPermissions: (projectId: string) =>
    getApiClient().FileSystemController_getUserProjectPermissions({
      projectId,
    }),

  /**
   * 检查用户是否具有特定权限
   */
  checkPermission: (projectId: string, permission: string) =>
    getApiClient().FileSystemController_checkProjectPermission({
      projectId,
      permission,
    }),

  /**
   * 获取用户在项目中的角色
   */
  getRole: (projectId: string) =>
    getApiClient().FileSystemController_getUserProjectRole({ projectId }),
};