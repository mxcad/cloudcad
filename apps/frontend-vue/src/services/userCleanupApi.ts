import { getApiClient } from './apiClient';

export interface UserCleanupStats {
  pendingCleanup: number;
  expiryDate: string;
  delayDays: number;
}

export interface UserCleanupResult {
  processedUsers: number;
  deletedMembers: number;
  deletedProjects: number;
  errors?: string[];
}

export const userCleanupApi = {
  getStats: () =>
    getApiClient().get('/api/user-cleanup/stats'),

  trigger: (data?: { delayDays?: number }) =>
    getApiClient().post('/api/user-cleanup/trigger', data),
};