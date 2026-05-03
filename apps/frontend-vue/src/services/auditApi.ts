import { getApiClient } from './apiClient';

export interface AuditLogDto {
  id: string;
  userId?: string;
  username?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
  createdAt: string;
}

export interface AuditStatisticsDto {
  totalCount: number;
  successCount: number;
  failureCount: number;
  actionStats: Record<string, number>;
  dailyStats: { date: string; count: number }[];
}

export interface GetLogsParams {
  search?: string;
  action?: string;
  resource?: string;
  status?: 'SUCCESS' | 'FAILURE';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const auditApi = {
  getLogs: (params?: GetLogsParams) =>
    getApiClient().get('/api/audit-logs', { params }),

  getLogById: (id: string) =>
    getApiClient().get(`/api/audit-logs/${id}`),

  getStatistics: () =>
    getApiClient().get('/api/audit-logs/statistics'),

  cleanup: (daysToKeep: number) =>
    getApiClient().post('/api/audit-logs/cleanup', { daysToKeep }),
};