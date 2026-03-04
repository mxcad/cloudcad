import { getApiClient } from './apiClient';

export const adminApi = {
  getStats: () => getApiClient().AdminController_getAdminStats(),

  getCacheStats: () => getApiClient().AdminController_getCacheStats(),

  cleanupCache: () => getApiClient().AdminController_cleanupCache(),

  clearUserCache: (userId: string) =>
    getApiClient().AdminController_clearUserCache({ userId }),

  getUserPermissions: (userId: string) =>
    getApiClient().AdminController_getUserPermissions({ userId }),
};