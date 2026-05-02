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

// 扩展 globalThis 类型
declare global {
  // eslint-disable-next-line no-var
  var __VITE_API_BASE_URL__: string | undefined;
}

/**
 * 获取 API 基础 URL
 * 优先使用环境变量，否则使用默认值
 */
export const getApiBaseUrl = (): string => {
  // 优先使用 import.meta.env（Vite）
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // 其次使用全局变量（兼容旧代码）
  if (globalThis.__VITE_API_BASE_URL__) {
    return globalThis.__VITE_API_BASE_URL__;
  }

  // 默认值
  return 'http://localhost:3001/api';
};

/**
 * API 基础 URL
 */
export const API_BASE_URL = getApiBaseUrl();

/**
 * API 超时时间（毫秒）
 */
export const API_TIMEOUT = 10000;

/**
 * 上传配置
 */
export const UPLOAD_CONFIG = {
  /** 分片大小（字节） */
  CHUNK_SIZE: 5 * 1024 * 1024, // 5MB
  /** 最大文件大小（字节） */
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  /** 最大重试次数 */
  MAX_RETRIES: 10,
  /** 重试延迟（毫秒） */
  RETRY_DELAY: 2000,
} as const;

/**
 * 文件类型配置
 */
export const FILE_TYPE_CONFIG = {
  /** CAD 文件扩展名 */
  CAD_EXTENSIONS: ['.dwg', '.dxf'],
  /** 图片文件扩展名 */
  IMAGE_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'],
  /** PDF 扩展名 */
  PDF_EXTENSION: '.pdf',
} as const;

// 注意：PAGINATION_CONFIG 已移至 constants/appConfig.ts 统一管理
