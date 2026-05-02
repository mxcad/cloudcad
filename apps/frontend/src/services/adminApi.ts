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

export const adminApi = {
  getStats: () => getApiClient().AdminController_getAdminStats(),

  getCacheStats: () => getApiClient().AdminController_getCacheStats(),

  cleanupCache: () => getApiClient().AdminController_cleanupCache(),

  clearUserCache: (userId: string) =>
    getApiClient().AdminController_clearUserCache({ userId }),

  getUserPermissions: (userId: string) =>
    getApiClient().AdminController_getUserPermissions({ userId }),

  getCleanupStats: () => getApiClient().AdminController_getCleanupStats(),

  cleanupStorage: (delayDays?: number) => getApiClient().AdminController_cleanupStorage({ delayDays }),
};
