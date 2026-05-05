///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
// @deprecated Use @/api-sdk instead.

import { getApiClient } from './apiClient';

export const healthApi = {
  /** 获取系统健康状态 */
  getHealth: () => getApiClient().HealthController_check(),

  /** 检查数据库健康状态 */
  checkDatabase: () => getApiClient().HealthController_checkDatabase(),

  /** 检查存储服务健康状态 */
  checkStorage: () => getApiClient().HealthController_checkStorage(),
};
