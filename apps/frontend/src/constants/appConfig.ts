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
 * 应用配置常量
 * 从环境变量读取配置
 */

const BRAND_CONFIG_URL = '/brand/config.json';

export const DEFAULT_APP_NAME = import.meta.env.VITE_APP_NAME || 'CloudCAD';
export const DEFAULT_APP_LOGO = import.meta.env.VITE_APP_LOGO || '/logo.png';

export interface BrandConfig {
  title: string;
  logo: string;
}

let cachedBrandConfig: BrandConfig | null = null;

export async function fetchBrandConfig(): Promise<BrandConfig> {
  if (cachedBrandConfig) return cachedBrandConfig;

  try {
    const res = await fetch(BRAND_CONFIG_URL);
    if (res.ok) {
      const config = (await res.json()) as BrandConfig;
      cachedBrandConfig = config;
      return config;
    }
  } catch (e) {
    console.warn('Failed to fetch brand config, using defaults');
  }

  const defaultConfig: BrandConfig = {
    title: DEFAULT_APP_NAME,
    logo: DEFAULT_APP_LOGO,
  };
  cachedBrandConfig = defaultConfig;
  return defaultConfig;
}

export function getAppName(): string {
  return cachedBrandConfig?.title || DEFAULT_APP_NAME;
}

export function getAppLogo(): string {
  return cachedBrandConfig?.logo || DEFAULT_APP_LOGO;
}

export { cachedBrandConfig };

/** API 基础路径 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * 协同服务 URL
 * 通过后端 /api/cooperate 代理到协同服务，无需直接访问 3091 端口
 */
export const APP_COOPERATE_URL = '/api/cooperate';

/**
 * 分页配置
 */
export const PAGINATION_CONFIG = {
  /** 默认分页大小 */
  DEFAULT_PAGE_SIZE: 20,
  /** 每页数量选项 */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
  /** 默认分页信息 */
  DEFAULT_PAGINATION: {
    index: 0,
    size: 20,
    count: 0,
    max: 0,
    up: false,
    down: false,
  },
} as const;
