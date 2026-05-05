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

import {
  auditLogControllerFindAll,
  auditLogControllerFindOne,
  auditLogControllerGetStatistics,
  auditLogControllerCleanupOldLogs,
} from '@/api-sdk';

export const auditApi = {
  getLogs: (params?: { page?: number; limit?: number; userId?: string; action?: string; startDate?: string; endDate?: string }) =>
    auditLogControllerFindAll(
      params
        ? { query: { ...params, page: params.page != null ? String(params.page) : undefined, limit: params.limit != null ? String(params.limit) : undefined } }
        : undefined,
    ),

  getLogById: (id: string) => auditLogControllerFindOne({ path: { id } }),

  getStatistics: () => auditLogControllerGetStatistics(),

  // daysToKeep parameter no longer supported by the API — removed
  cleanup: (_daysToKeep?: number) =>
    auditLogControllerCleanupOldLogs(),
};