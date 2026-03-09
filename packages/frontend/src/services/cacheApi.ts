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
