import { apiClient } from './apiClient';

export interface AuditLogQueryParams {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditStatistics {
  totalLogs: number;
  todayLogs: number;
  actionCounts: Record<string, number>;
  userActivity: Array<{
    userId: string;
    username: string;
    count: number;
  }>;
}

export const auditApi = {
  getLogs: (params?: AuditLogQueryParams) =>
    apiClient.get('/audit/logs', { params }),

  getLogById: (id: string) => apiClient.get(`/audit/logs/${id}`),

  getStatistics: () => apiClient.get('/audit/statistics'),

  cleanup: (days: number) => apiClient.post('/audit/cleanup', { days }),
};
