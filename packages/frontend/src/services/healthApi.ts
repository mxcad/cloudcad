import { getApiClient } from './apiClient';

export const healthApi = {
  /** 获取系统健康状态 */
  getHealth: () => getApiClient().HealthController_check(),

  /** 检查数据库健康状态 */
  checkDatabase: () => getApiClient().HealthController_checkDatabase(),

  /** 检查存储服务健康状态 */
  checkStorage: () => getApiClient().HealthController_checkStorage(),
};
