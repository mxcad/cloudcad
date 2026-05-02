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

export const cacheApi = {
  getStats: () => getApiClient().CacheMonitorController_getStats(),

  clear: () => getApiClient().CacheMonitorController_clearAll(),

  warmup: () => getApiClient().CacheMonitorController_manualWarmup(),

  warmupUser: (userId: string) =>
    getApiClient().CacheMonitorController_warmupUser({ userId }),

  warmupProject: (projectId: string) =>
    getApiClient().CacheMonitorController_warmupProject({ projectId }),
};
