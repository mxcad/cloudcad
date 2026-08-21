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

import { useCallback } from 'react';
import { loadProjectPermissionData } from '../utils/permissionUtils';
import { globalPermissionCache } from '../utils/projectPermissionCache';

/**
 * 项目权限查询 Hook（兼容壳，仅保留现存消费者：MembersModal）
 *
 * @deprecated 新代码请使用 useProjectPermissions（唯一 hook 入口，含 loading
 * 门控与悲观 check）；本 hook 仅为成员管理弹窗保留 checkPermission /
 * refreshProjectPermissions 两个方法。
 *
 * 所有权限判断走 globalPermissionCache 共享缓存（与 useProjectPermissions /
 * permissionUtils 同一份数据），不发额外的 API 请求。
 */
export const useProjectPermission = () => {
  /**
   * 检查用户在项目中是否具有指定权限（本地判断，读共享缓存）
   */
  const checkPermission = useCallback(
    async (projectId: string, permission: string): Promise<boolean> => {
      const data = await loadProjectPermissionData(projectId);
      return data.permissions.includes(permission);
    },
    []
  );

  /**
   * 刷新项目权限缓存（清缓存 + 重新加载，本地判断）
   */
  const refreshProjectPermissions = useCallback(
    async (projectId: string): Promise<void> => {
      globalPermissionCache.clearProject(projectId);
      await loadProjectPermissionData(projectId);
    },
    []
  );

  return {
    checkPermission,
    refreshProjectPermissions,
  };
};
