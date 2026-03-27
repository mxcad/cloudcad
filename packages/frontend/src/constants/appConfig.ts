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
 * 获取协同服务 URL
 * - 如果环境变量以 http://localhost 开头，动态替换为当前访问的域名
 * - 否则使用环境变量配置的值
 */
function getCooperateUrl(): string {
  const envUrl =
    import.meta.env.VITE_APP_COOPERATE_URL || 'http://localhost:3091';

  // 如果是 localhost 地址，在生产环境动态替换域名
  if (envUrl.startsWith('http://localhost')) {
    const protocol = window.location.protocol; // http: 或 https:
    const hostname = window.location.hostname;
    // 提取端口号（如 3091）
    const port = envUrl.split(':')[2] || '3091';
    return `${protocol}//${hostname}:${port}`;
  }

  return envUrl;
}

/** 协同 URL */
export const APP_COOPERATE_URL = getCooperateUrl();

/**
 * 图库配置
 */
export const GALLERY_CONFIG = {
  /** 分类最大层级（支持三级分类） */
  MAX_TYPE_LEVEL: 3,
  /** 默认分页大小 */
  DEFAULT_PAGE_SIZE: 20,
} as const;

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
