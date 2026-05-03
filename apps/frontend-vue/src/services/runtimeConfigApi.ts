import { getApiClient } from './apiClient';

export interface RuntimeConfigItem {
  key: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean';
  description?: string;
  isPublic?: boolean;
  category?: string;
}

export const runtimeConfigApi = {
  getPublicConfigs: () =>
    getApiClient().get('/api/runtime-configs/public'),

  getAllConfigs: () =>
    getApiClient().get('/api/runtime-configs'),

  getDefinitions: () =>
    getApiClient().get('/api/runtime-configs/definitions'),

  getConfig: (key: string) =>
    getApiClient().get(`/api/runtime-configs/${key}`),

  updateConfig: (key: string, value: string | number | boolean) =>
    getApiClient().patch(`/api/runtime-configs/${key}`, { value }),

  resetConfig: (key: string) =>
    getApiClient().post(`/api/runtime-configs/${key}/reset`),
};