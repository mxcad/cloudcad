import { getApiClient } from './apiClient';

export interface HealthStatus {
  status: 'up' | 'down';
  message: string;
  timestamp: string;
}

export interface SystemHealth {
  database: HealthStatus;
  storage: HealthStatus;
}

export const healthApi = {
  getHealth: () =>
    getApiClient().get('/api/health-check'),

  checkDatabase: () =>
    getApiClient().get('/api/health-check/database'),

  checkStorage: () =>
    getApiClient().get('/api/health-check/storage'),
};