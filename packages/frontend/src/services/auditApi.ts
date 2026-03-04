import { getApiClient } from './apiClient';
import { OperationMethods } from "../types/api-client";
export const auditApi = {
  getLogs: (params?: Parameters<OperationMethods['AuditLogController_findAll']>[0]) =>
    getApiClient().AuditLogController_findAll(params),

  getLogById: (id: string) =>
    getApiClient().AuditLogController_findOne({ id }),

  getStatistics: () => getApiClient().AuditLogController_getStatistics(),

  cleanup: (daysToKeep: number) =>
    getApiClient().AuditLogController_cleanupOldLogs(null, { daysToKeep }),
};
