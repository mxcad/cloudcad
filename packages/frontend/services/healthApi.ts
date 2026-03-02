import { apiClient } from './apiClient';

/** 健康状态 */
interface HealthStatus {
  status: 'up' | 'down';
  message: string;
}

/** 系统健康信息 */
export interface SystemHealth {
  info: {
    database: HealthStatus;
    storage: HealthStatus;
  };
}

export const healthApi = {
  /** 获取系统健康状态 */
  getHealth: () => apiClient.get<SystemHealth>('/health'),
};
