// @ts-nocheck  
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
// @deprecated Use @/api-sdk instead.

import { getApiClient } from './apiClient';

export const projectTrashApi = {
  // ========== 项目内回收站 ==========

  /**
   * 获取项目内回收站内容
   */
  getProjectTrash: (projectId: string, params?: { page?: number; limit?: number }) =>
    getApiClient().FileSystemController_getProjectTrash({
      projectId,
      page: params?.page,
      limit: params?.limit,
    }),

  /**
   * 清空项目回收站
   */
  clearProjectTrash: (projectId: string) =>
    getApiClient().FileSystemController_clearProjectTrash({ projectId }),
};