import { apiClient } from './apiClient';

export interface CacheStats {
  l1Cache: {
    size: number;
    hitRate: number;
  };
  l2Cache: {
    size: number;
    hitRate: number;
  };
  l3Cache: {
    size: number;
    hitRate: number;
  };
  totalKeys: number;
  memoryUsage: number;
}

export const cacheApi = {
  getStats: () => apiClient.get('/cache/stats'),

  clear: () => apiClient.post('/cache/clear'),

  warmup: () => apiClient.post('/cache/warmup'),

  warmupUser: (userId: string) =>
    apiClient.post(`/cache/warmup/user/${userId}`),

  warmupProject: (projectId: string) =>
    apiClient.post(`/cache/warmup/project/${projectId}`),
};
