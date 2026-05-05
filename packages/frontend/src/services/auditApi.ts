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
    auditLogControllerFindAll(params ? { query: params } : undefined),

  getLogById: (id: string) => auditLogControllerFindOne({ path: { id } }),

  getStatistics: () => auditLogControllerGetStatistics(),

  cleanup: (daysToKeep: number) =>
    auditLogControllerCleanupOldLogs({ query: { daysToKeep } }),
};