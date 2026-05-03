import { getApiClient } from './apiClient';

export interface CleanupStats {
  total: number;
  expiryDate: string;
  delayDays: number;
}

export interface CleanupResult {
  deletedNodes: number;
  deletedDirectories: number;
  freedSpace: number;
  errors: string[];
}

export const adminApi = {
  getStats: () =>
    getApiClient().get('/api/admin/stats'),

  getCleanupStats: () =>
    getApiClient().get('/api/admin/cleanup-stats'),

  cleanupStorage: (delayDays?: number) =>
    getApiClient().post('/api/admin/cleanup-storage', { delayDays }),
};