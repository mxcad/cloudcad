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

import type {
  RuntimeConfigResponseDto,
  RuntimeConfigDefinitionDto,
  UpdateRuntimeConfigDto,
} from '@/api-sdk';
import {
  runtimeConfigControllerGetPublicConfigs,
  runtimeConfigControllerGetAllConfigs,
  runtimeConfigControllerGetDefinitions,
  runtimeConfigControllerGetConfig,
  runtimeConfigControllerUpdateConfig,
  runtimeConfigControllerResetConfig,
} from '@/api-sdk';

export type RuntimeConfigItem = RuntimeConfigResponseDto;

export type RuntimeConfigDefinition = RuntimeConfigDefinitionDto;

export const runtimeConfigApi = {
  getPublicConfigs: () =>
    runtimeConfigControllerGetPublicConfigs().then((r) => r.data),

  getAllConfigs: () =>
    runtimeConfigControllerGetAllConfigs().then((r) => r.data),

  getDefinitions: () =>
    runtimeConfigControllerGetDefinitions().then((r) => r.data),

  getConfig: (key: string) =>
    runtimeConfigControllerGetConfig({ path: { key } }).then((r) => r.data),

  updateConfig: (key: string, value: string | number | boolean) =>
    runtimeConfigControllerUpdateConfig({
      path: { key },
      body: { value } as UpdateRuntimeConfigDto,
    }).then((r) => r.data),

  resetConfig: (key: string) =>
    runtimeConfigControllerResetConfig({ path: { key } }).then((r) => r.data),
};
