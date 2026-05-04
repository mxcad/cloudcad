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

import { getApiClient } from './apiClient';
import type {
  RuntimeConfigResponseDto,
  RuntimeConfigDefinitionDto,
  UpdateRuntimeConfigDto,
} from '../types/api-client';

/**
 * 运行时配置项类型
 */
export type RuntimeConfigItem = RuntimeConfigResponseDto;

/**
 * 运行时配置定义类型
 */
export type RuntimeConfigDefinition = RuntimeConfigDefinitionDto;

/**
 * 运行时配置 API
 */
export const runtimeConfigApi = {
  /**
   * 获取公开配置（无需登录）
   */
  getPublicConfigs: () =>
    getApiClient().RuntimeConfigController_getPublicConfigs(),

  /**
   * 获取所有配置项
   */
  getAllConfigs: () =>
    getApiClient().RuntimeConfigController_getAllConfigs(),

  /**
   * 获取配置定义列表
   */
  getDefinitions: () =>
    getApiClient().RuntimeConfigController_getDefinitions(),

  /**
   * 获取单个配置项
   */
  getConfig: (key: string) =>
    getApiClient().RuntimeConfigController_getConfig({ key }),

  /**
   * 更新配置项
   */
  updateConfig: (key: string, value: string | number | boolean) =>
    getApiClient().RuntimeConfigController_updateConfig(
      { key },
      { value } as unknown as UpdateRuntimeConfigDto,
    ),

  /**
   * 重置配置为默认值
   */
  resetConfig: (key: string) =>
    getApiClient().RuntimeConfigController_resetConfig({ key }),
};