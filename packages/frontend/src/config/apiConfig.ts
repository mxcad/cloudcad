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

/**
 * API 配置
 * 统一管理 API 相关的配置和常量
 */

/**
 * 获取 API 基础 URL
 * 优先使用环境变量，否则使用默认值
 */
export const getApiBaseUrl = (): string => {
  // 优先使用 import.meta.env（Vite）
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 默认值必须是同源相对路径：离线部署由 :8000 的静态服务代理 /api 到后端，
  // 绝对 http://localhost:3001/api 会变成跨域直连、浏览器扣住 auth_token cookie，
  // 协同接口恒 401。该默认值同时是「打包机上漏了 .env.local」时的兜底
  // （.env.local 被 gitignore、不进部署包），与移动端 utils/apiConfig.ts 保持一致；
  // 出包门禁见 pack-assertions.findHardcodedBackendBase。
  return '/api';
};

/**
 * API 基础 URL
 */
export const API_BASE_URL = getApiBaseUrl();

// 注意：PAGINATION_CONFIG 已移至 constants/appConfig.ts 统一管理
