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
import { OperationMethods } from '../types/api-client';
export const auditApi = {
  getLogs: (
    params?: Parameters<OperationMethods['AuditLogController_findAll']>[0]
  ) => getApiClient().AuditLogController_findAll(params),

  getLogById: (id: string) => getApiClient().AuditLogController_findOne({ id }),

  getStatistics: () => getApiClient().AuditLogController_getStatistics(),

  cleanup: (daysToKeep: number) =>
    getApiClient().AuditLogController_cleanupOldLogs(null, { daysToKeep }),
};
